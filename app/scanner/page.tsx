"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { buttonPrimary } from "@/lib/ui-classes";
import {
  getStoredUserProfile,
  profileForApiRequest,
} from "@/lib/client-storage";
import type { ScannerFunn, ScannerKategori } from "@/lib/scanner-types";
import type { UserProfile } from "@/lib/types";
import type { PipelineKontakt } from "@/lib/pipeline-types";
import {
  getSistScan,
  loadSelskaper,
  loadScannerFunn,
  mergeScannerFunn,
  saveScannerFunn,
  saveSelskaper,
  setSistScan,
} from "@/lib/scanner-storage";
import { søkeordKjerne } from "@/lib/scanner-queries";
import {
  addHoursToIso,
  newId,
  upsertKontakt,
} from "@/lib/pipeline-storage";

function getKategori(f: ScannerFunn): ScannerKategori {
  if (f.kategori) return f.kategori;
  if (f.signalType === "Utlyst stilling") return "stilling";
  if (f.signalType === "LinkedIn") return "person";
  if (f.signalType === "Selskap") return "signal";
  return "nyhet";
}

function signalLabel(f: ScannerFunn): string {
  const text = ((f.title || "") + " " + (f.beskrivelse || "")).toLowerCase();
  if (
    text.includes("funding") ||
    text.includes("millioner") ||
    text.includes("henter")
  )
    return "Funding";
  if (
    text.includes("ny ceo") ||
    text.includes("ny cfo") ||
    text.includes("ny leder")
  )
    return "Ny ledelse";
  if (text.includes("ansetter") || text.includes("ekspanderer"))
    return "Ansetter";
  if (text.includes("vekst")) return "Vekstsignal";
  return "Markedssignal";
}


export default function ScannerPage() {
  const router = useRouter();
  const [profil, setProfil] = useState<UserProfile | null>(null);
  const [selskaperTekst, setSelskaperTekst] = useState("");
  const [funn, setFunn] = useState<ScannerFunn[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [sist, setSist] = useState<string | null>(null);
  const [webScanningDisabled, setWebScanningDisabled] = useState(false);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setProfil(getStoredUserProfile());
    setFunn(loadScannerFunn());
    setSist(getSistScan());
    setSelskaperTekst(loadSelskaper().join("\n"));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/scan/config");
        const data = (await res.json()) as { webScanningDisabled?: boolean };
        if (!cancelled && typeof data.webScanningDisabled === "boolean") {
          setWebScanningDisabled(data.webScanningDisabled);
        }
      } catch {
        /* ignorer */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const doScan = useCallback(
    async (kilde: "auto" | "manuell", selskaperListe: string[]) => {
      const p = getStoredUserProfile();
      if (!p) {
        setScanMsg("Opprett profil først under Profil.");
        return;
      }
      setLoading(true);
      setScanMsg(null);
      setWarnings([]);
      saveSelskaper(selskaperListe);
      try {
        const res = await fetch("/api/scan/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profile: profileForApiRequest(p),
            selskaper: selskaperListe,
          }),
        });
        const data = (await res.json()) as {
          funn?: ScannerFunn[];
          warnings?: string[];
          error?: string;
          webScanningDisabled?: boolean;
        };
        if (!res.ok) {
          setScanMsg(data.error ?? "Skanning feilet.");
          return;
        }
        if (typeof data.webScanningDisabled === "boolean") {
          setWebScanningDisabled(data.webScanningDisabled);
        }
        const incoming = data.funn ?? [];
        // Kast alle gamle stillinger — de kan være utløpte.
        // Behold kun signaler/nyheter/personer fra eksisterende cache.
        const existing = loadScannerFunn().filter(
          (x) => x.kategori !== "stilling" && x.signalType !== "Utlyst stilling",
        );
        const existingUrls = new Set(existing.map((x) => x.url));
        const newCount = incoming.filter((i) => !existingUrls.has(i.url)).length;
        const merged = mergeScannerFunn(existing, incoming);
        saveScannerFunn(merged);
        setFunn(merged);
        const now = new Date().toISOString();
        setSistScan(now);
        setSist(now);
        setWarnings(data.warnings ?? []);
        if (kilde === "manuell") {
          setScanMsg(
            incoming.length > 0 && newCount === 0
              ? `Skanning fullført — 0 nye treff (${incoming.length} fra kilder, alle var allerede i listen).`
              : `Skanning fullført — ${newCount} nye treff.`,
          );
        }
      } catch {
        setScanMsg("Kunne ikke nå serveren.");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!getStoredUserProfile()) return;
    const last = getSistScan();
    const overDøgn =
      !last ||
      Date.now() - new Date(last).getTime() > 24 * 60 * 60 * 1000;
    if (!overDøgn) return;
    const d = new Date().toDateString();
    const lock = `jobbagent_scanner_auto_${d}`;
    if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(lock))
      return;
    if (typeof sessionStorage !== "undefined")
      sessionStorage.setItem(lock, "1");
    void doScan("auto", loadSelskaper());
  }, [doScan]);

  const kjerne = profil
    ? søkeordKjerne({
        name: profil.navn,
        seeking: profil.soker,
        industry: profil.bransje,
        geography: profil.geografi,
        bio: profil.bio,
      })
    : "";

  const now = new Date();
  const cutoff14 = now.getTime() - 14 * 86_400_000;
  const stillinger = funn.filter((f) => {
    if (getKategori(f) !== "stilling") return false;
    if (f.deadline) return new Date(f.deadline) > now;
    // Ingen deadline — vis bare hvis funnet siste 14 dager
    return new Date(f.funnetDato).getTime() >= cutoff14;
  });
  const signaler = funn.filter((f) => getKategori(f) === "signal");
  const personer = funn.filter((f) => getKategori(f) === "person");
  const nyheter = funn.filter((f) => getKategori(f) === "nyhet");

  function velgOgGaPersonifisering(f: ScannerFunn) {
    if (typeof window !== "undefined") {
      localStorage.setItem(
        "valgtStilling",
        JSON.stringify({ id: f.id, title: f.title, company: f.company ?? "" }),
      );
    }
    router.push("/personifisering");
  }

  function addToPipeline(f: ScannerFunn) {
    const now = new Date().toISOString();
    const kontakt: PipelineKontakt = {
      id: newId(),
      navn: f.company ?? f.title.split("—").pop()?.trim() ?? "Ukjent",
      tittel: f.title,
      selskap: f.company ?? "",
      kanal: "linkedin",
      status: "sendt",
      melding: "",
      signal: f.beskrivelse ?? f.title,
      sendtDato: now,
      oppfølgingDato: addHoursToIso(now, 48),
      notat: "",
      historikk: [{ status: "sendt", dato: now }],
      rolle: f.title,
      dato: now,
      kolonne: "Interessant",
    };
    upsertKontakt(kontakt);
    setAddedIds((prev) => new Set([...prev, f.id]));
  }

  return (
    <div className="min-h-screen bg-[#f5f4f0] pb-24 pt-8 text-zinc-950 sm:pt-12">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Din agent scanner for deg
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          Basert på din profil — oppdateres daglig
        </p>

        {webScanningDisabled && (
          <div
            className="mt-6 rounded-[2rem] border border-sky-200 bg-sky-50 px-4 py-4 text-sm text-sky-900 shadow-sm"
            role="status"
          >
            <p className="font-medium text-sky-900">
              Nett-søk (Brave Search) er av
            </p>
            <p className="mt-1 text-sky-700">
              Sett{" "}
              <code className="rounded bg-zinc-200 px-1 text-xs text-zinc-800">
                BRAVE_SEARCH_API_KEY
              </code>{" "}
              i miljøvariabler for å aktivere nyheter, LinkedIn og selskaper.{" "}
              <strong className="font-medium text-sky-800">
                NAV Ledige stillinger
              </strong>{" "}
              skannes uavhengig av dette.
            </p>
          </div>
        )}


        {!profil && (
          <div className="mt-8 rounded-[2rem] border border-amber-200 bg-white px-4 py-4 text-sm text-slate-700 shadow-sm">
            <Link href="/profil" className="font-medium text-emerald-700 underline">
              Legg inn profil
            </Link>{" "}
            for å aktivere automatisk scanning.
          </div>
        )}

        {profil && (
          <>
            <section className="mt-10">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
                Aktive scanninger
              </h2>
              <p className="mt-2 text-sm text-zinc-600">
                Agenten overvåker disse kildene med dine søkeord og geografi.
              </p>
              <ul className="mt-4 space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-800">
                <li>
                  <span className="font-medium text-zinc-950">NAV</span> — Ledige
                  stillinger filtrert på «{kjerne || "…"}»
                </li>
                {webScanningDisabled ? (
                  <li className="text-zinc-500">
                    <span className="font-medium text-zinc-700">
                      Brave Search
                    </span>{" "}
                    — av. Legg inn{" "}
                    <code className="rounded bg-zinc-200 px-1 text-xs text-zinc-700">
                      BRAVE_SEARCH_API_KEY
                    </code>{" "}
                    for å aktivere.
                  </li>
                ) : (
                  <>
                    <li>
                      <span className="font-medium text-zinc-950">
                        Brave Search (nyheter)
                      </span>{" "}
                      — vekst, funding og ansettelser i {profil.bransje}
                    </li>
                    <li>
                      <span className="font-medium text-zinc-950">
                        LinkedIn (via Brave)
                      </span>{" "}
                      — nøkkelpersoner i {profil.soker}-roller
                    </li>
                  </>
                )}
              </ul>

              <label className="mt-6 block">
                <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                  Selskaper å følge (ett per linje, maks 10)
                </span>
                <textarea
                  value={selskaperTekst}
                  onChange={(e) => setSelskaperTekst(e.target.value)}
                  rows={4}
                  className="input-surface mt-2 resize-y"
                  placeholder="Kolonial.no&#10;Otovo&#10;…"
                />
              </label>

              <button
                type="button"
                disabled={loading}
                onClick={() =>
                  void doScan(
                    "manuell",
                    selskaperTekst
                      .split(/[\n,]+/)
                      .map((s) => s.trim())
                      .filter(Boolean),
                  )
                }
                className={buttonPrimary}
              >
                {loading ? "Skanner…" : "Kjør skanning nå"}
              </button>

              {/* AI-innsikt-boks */}
              {funn.length > 0 && (
                <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                    Innsikt
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-emerald-900">
                    Basert på din siste skanning:{" "}
                    <strong>{stillinger.length} stillinger</strong> passer din
                    profil.
                    {signaler.length > 0 && (
                      <>
                        {" "}
                        <strong>{signaler.length} selskaper</strong> viser
                        vekstsignaler denne uken.
                      </>
                    )}
                    {" "}Beste tidspunkt å søke: nå — du er i høysesong for{" "}
                    <strong>{profil.bransje || "din bransje"}</strong>.
                  </p>
                </div>
              )}

              {/* Tidsstempler */}
              {sist && (
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
                  <span>
                    Siste oppdatering:{" "}
                    {new Date(sist).toLocaleString("nb-NO", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </span>
                  <span>Neste automatiske skanning: i morgen kl. 08:00</span>
                </div>
              )}
            </section>

            {warnings.length > 0 && (
              <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
                <p className="font-medium text-amber-800">Merknader</p>
                <ul className="mt-2 list-inside list-disc space-y-1 text-zinc-700">
                  {warnings.map((w, i) => (
                    <li
                      key={`${i}-${w.slice(0, 40)}`}
                      className="whitespace-pre-wrap"
                    >
                      {w}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {scanMsg && (
              <p className="mt-4 text-sm text-emerald-700" role="status">
                {scanMsg}
              </p>
            )}
          </>
        )}

        {/* ---- SEKSJON A: Stillinger ---- */}
        {stillinger.filter((f) => !f.deadline || new Date(f.deadline) > new Date()).length > 0 && (
          <section className="mt-14">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-700">
                Stillinger som matcher deg
              </h2>
            </div>
            <ul className="mt-4 flex flex-col gap-3">
              {stillinger
                .filter((f) => !f.deadline || new Date(f.deadline) > new Date())
                .map((f) => {
                const d = f.deadline
                  ? Math.ceil((new Date(f.deadline).getTime() - Date.now()) / 86400000)
                  : null;
                const fristBadge = d === null ? null
                  : d <= 0
                    ? <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-[10px] font-semibold text-red-700">Utløpt</span>
                  : d === 1
                    ? <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-[10px] font-semibold text-red-700">Siste dag!</span>
                  : d <= 5
                    ? <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-[10px] font-semibold text-orange-700">{d} dager igjen</span>
                  : <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700">Frist: {new Date(f.deadline!).toLocaleDateString("nb-NO")}</span>;

                return (
                  <li
                    key={f.id}
                    className="rounded-xl bg-white p-4"
                    style={{ border: "0.5px solid rgba(0,0,0,0.08)" }}
                  >
                    <a
                      href={f.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-base font-semibold text-emerald-700 hover:text-emerald-600"
                    >
                      {f.title}
                    </a>
                    {(f.company || f.location) && (
                      <p className="mt-0.5 text-sm text-zinc-500">
                        {[f.company, f.location].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    {fristBadge && <div className="mt-1.5">{fristBadge}</div>}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => addToPipeline(f)}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                          addedIds.has(f.id)
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50"
                        }`}
                      >
                        {addedIds.has(f.id) ? "✓ Lagt til pipeline" : "+ Pipeline"}
                      </button>
                      <button
                        type="button"
                        onClick={() => velgOgGaPersonifisering(f)}
                        className="rounded-full border border-[#1D9E75]/30 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100"
                      >
                        Generer søknad
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* ---- SEKSJON B: Signaler ---- */}
        {signaler.length > 0 && (
          <section className="mt-12">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-blue-500" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-700">
                Selskaper å kontakte nå
              </h2>
            </div>
            <p className="mt-2 text-sm text-zinc-500">
              Disse selskapene viser tegn på vekst eller ansettelse — ta kontakt
              før stillingen lyses ut.
            </p>
            <ul className="mt-4 flex flex-col gap-3">
              {signaler.map((f) => (
                <li
                  key={f.id}
                  className="rounded-xl bg-white p-4"
                  style={{ border: "0.5px solid rgba(0,0,0,0.08)" }}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-zinc-950">
                        {f.company ?? f.title}
                      </p>
                      <span className="mt-1 inline-block rounded-full bg-blue-50 px-2.5 py-0.5 text-[10px] font-semibold text-blue-700">
                        {signalLabel(f)}
                      </span>
                      {f.beskrivelse && (
                        <p className="mt-2 line-clamp-2 text-sm text-zinc-600">
                          {f.beskrivelse}
                        </p>
                      )}
                    </div>
                    <a
                      href={f.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50"
                    >
                      Ta kontakt ↗
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ---- SEKSJON C: Nøkkelpersoner (låst) ---- */}
        {personer.length > 0 && (
          <section className="mt-12">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-violet-400" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-700">
                Nøkkelpersoner
              </h2>
              <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-semibold text-zinc-600">
                Pro
              </span>
            </div>
            <ul
              className="pointer-events-none mt-4 flex flex-col gap-3 opacity-40"
              aria-label="Låst innhold — krever Pro"
            >
              {personer.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center justify-between rounded-xl bg-white p-4"
                  style={{ border: "0.5px solid rgba(0,0,0,0.08)" }}
                >
                  <div>
                    <p className="font-semibold text-zinc-950">{f.title}</p>
                    {f.company && (
                      <p className="text-sm text-zinc-500">{f.company}</p>
                    )}
                  </div>
                  <span className="text-xs text-zinc-400">🔒 Direktekontakt krever Pro</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ---- SEKSJON D: Markedsnyheter ---- */}
        {nyheter.length > 0 && (
          <section className="mt-12">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-zinc-400" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-700">
                Markedsnyheter
              </h2>
            </div>
            <ul className="mt-4 flex flex-col gap-2">
              {nyheter.map((f) => (
                <li key={f.id} className="rounded-lg bg-white p-3" style={{ border: "0.5px solid rgba(0,0,0,0.06)" }}>
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-zinc-800 hover:text-zinc-600"
                  >
                    {f.title}
                  </a>
                  {f.kilde && (
                    <p className="mt-0.5 text-xs text-zinc-400">{f.kilde}</p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {funn.length > 0 && (
          <p className="mt-8 text-xs text-zinc-400">
            {funn.length} funn lagret lokalt · {stillinger.length} stillinger ·{" "}
            {signaler.length} signaler · {nyheter.length} nyheter
          </p>
        )}
      </div>
    </div>
  );
}
