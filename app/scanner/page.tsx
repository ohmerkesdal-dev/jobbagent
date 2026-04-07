"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  getStoredProfile,
  profileForApiRequest,
} from "@/lib/client-storage";
import type { ScannerFunn } from "@/lib/scanner-types";
import {
  funnSisteDager,
  getSistScan,
  loadSelskaper,
  loadScannerFunn,
  mergeScannerFunn,
  saveScannerFunn,
  saveSelskaper,
  setSistScan,
} from "@/lib/scanner-storage";
import { søkeordKjerne } from "@/lib/scanner-queries";
import type { JobbagentProfil } from "@/lib/profile-types";

const SIGNAL_BADGE: Record<
  ScannerFunn["signalType"],
  { bg: string; text: string }
> = {
  "Utlyst stilling": {
    bg: "bg-amber-500/20",
    text: "text-amber-200",
  },
  Nyhet: { bg: "bg-blue-500/20", text: "text-blue-200" },
  LinkedIn: { bg: "bg-sky-500/20", text: "text-sky-200" },
  Selskap: { bg: "bg-emerald-500/20", text: "text-emerald-200" },
};

export default function ScannerPage() {
  const [profil, setProfil] = useState<JobbagentProfil | null>(null);
  const [selskaperTekst, setSelskaperTekst] = useState("");
  const [funn, setFunn] = useState<ScannerFunn[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [sist, setSist] = useState<string | null>(null);
  const [webScanningDisabled, setWebScanningDisabled] = useState(false);

  useEffect(() => {
    setProfil(getStoredProfile());
    setFunn(loadScannerFunn());
    setSist(getSistScan());
    const list = loadSelskaper();
    setSelskaperTekst(list.join("\n"));
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
      const p = getStoredProfile();
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
        const existingBefore = loadScannerFunn();
        const existingUrls = new Set(existingBefore.map((x) => x.url));
        const newCount = incoming.filter((i) => !existingUrls.has(i.url)).length;
        const merged = mergeScannerFunn(existingBefore, incoming);
        saveScannerFunn(merged);
        setFunn(merged);
        const now = new Date().toISOString();
        setSistScan(now);
        setSist(now);
        setWarnings(data.warnings ?? []);
        if (kilde === "manuell") {
          if (incoming.length > 0 && newCount === 0) {
            setScanMsg(
              `Skanning fullført — 0 nye treff (${incoming.length} fra kilder, alle var allerede i listen).`,
            );
          } else {
            setScanMsg(`Skanning fullført — ${newCount} nye treff.`);
          }
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
    if (!getStoredProfile()) return;

    const last = getSistScan();
    const overDøgn =
      !last ||
      Date.now() - new Date(last).getTime() > 24 * 60 * 60 * 1000;
    if (!overDøgn) return;

    const d = new Date().toDateString();
    const lock = `jobbagent_scanner_auto_${d}`;
    if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(lock)) {
      return;
    }
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(lock, "1");
    }
    void doScan("auto", loadSelskaper());
  }, [doScan]);

  const siste7 = funnSisteDager(funn, 7);
  const kjerne = profil
    ? søkeordKjerne({
        name: profil.name,
        seeking: profil.seeking,
        industry: profil.industry,
        geography: profil.geography,
        bio: profil.bio,
      })
    : "";
  return (
    <div className="min-h-screen bg-[#0a0a0f] pb-24 pt-8 text-zinc-100 sm:pt-12">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Din agent scanner for deg
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          Basert på din profil — oppdateres daglig
        </p>

        {webScanningDisabled && (
          <div
            className="mt-6 rounded-xl border border-sky-500/35 bg-sky-950/40 px-4 py-3 text-sm text-sky-100"
            role="status"
          >
            <p className="font-medium text-sky-50">
              Nett-søk (Brave Search) er av
            </p>
            <p className="mt-1 text-sky-200/90">
              Sett{" "}
              <code className="rounded bg-black/40 px-1 text-xs">
                BRAVE_SEARCH_API_KEY
              </code>{" "}
              i miljøvariabler (Vercel / lokal{" "}
              <code className="rounded bg-black/40 px-1 text-xs">.env.local</code>
              ), og fjern evt.{" "}
              <code className="rounded bg-black/40 px-1 text-xs">
                JOBBAGENT_WEB_SCAN_ENABLED=false
              </code>
              .{" "}
              <strong className="font-medium text-sky-100">
                NAV Ledige stillinger
              </strong>{" "}
              skannes uavhengig av dette.
            </p>
          </div>
        )}

        {sist && (
          <p className="mt-1 text-xs text-zinc-500">
            Siste skanning:{" "}
            {new Date(sist).toLocaleString("nb-NO", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </p>
        )}

        {!profil && (
          <div className="mt-8 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            <Link href="/profil" className="font-medium underline">
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
              <p className="mt-2 text-sm text-zinc-400">
                Agenten overvåker disse kildene med dine søkeord og geografi.
              </p>
              <ul className="mt-4 space-y-3 rounded-xl border border-white/[0.08] bg-[#111118] p-4 text-sm text-zinc-300">
                <li>
                  <span className="font-medium text-zinc-100">NAV</span> — Ledige
                  stillinger (API / stillingsfeed) filtrert på «{kjerne || "…"}»
                </li>
                {webScanningDisabled ? (
                  <li className="text-zinc-500">
                    <span className="font-medium text-zinc-400">
                      Brave Search (nyheter, LinkedIn, selskaper)
                    </span>{" "}
                    — av. Legg inn{" "}
                    <code className="rounded bg-black/40 px-1 text-xs">
                      BRAVE_SEARCH_API_KEY
                    </code>{" "}
                    og fjern evt.{" "}
                    <code className="rounded bg-black/40 px-1 text-xs">
                      JOBBAGENT_WEB_SCAN_ENABLED=false
                    </code>
                    .
                  </li>
                ) : (
                  <>
                    <li>
                      <span className="font-medium text-zinc-100">
                        Brave Search (nyheter)
                      </span>{" "}
                      — «{profil.industry} ansetter {profil.seeking}», funding og
                      relaterte treff (filtrert mot Norge)
                    </li>
                    <li>
                      <span className="font-medium text-zinc-100">
                        LinkedIn (via Brave Search)
                      </span>{" "}
                      — søk etter profiler med rolle og Oslo (tilpasset profil)
                    </li>
                    <li>
                      <span className="font-medium text-zinc-100">
                        Selskaper du følger
                      </span>{" "}
                      — opptil 10 navn, ett søk per selskap (nyheter + LinkedIn)
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
                className="mt-4 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {loading ? "Skanner…" : "Kjør skanning nå"}
              </button>
            </section>

            {warnings.length > 0 && (
              <div className="mt-6 rounded-xl border border-white/10 bg-[#111118] p-4 text-sm text-amber-200/90">
                <p className="font-medium text-amber-100">Merknader</p>
                <ul className="mt-2 list-inside list-disc space-y-3 text-zinc-400">
                  {warnings.map((w, i) => (
                    <li key={`${i}-${w.slice(0, 40)}`} className="whitespace-pre-wrap">
                      {w}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {scanMsg && (
              <p className="mt-4 text-sm text-emerald-400/90" role="status">
                {scanMsg}
              </p>
            )}
          </>
        )}

        <section className="mt-12">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
            Siste funn (7 dager)
          </h2>
          {siste7.length === 0 ? (
            <p className="mt-4 rounded-xl border border-dashed border-white/10 bg-[#111118]/50 px-4 py-10 text-center text-sm text-zinc-500">
              Ingen signaler ennå. Når skanning har kjørt, vises treff her.
            </p>
          ) : (
            <ul className="mt-4 flex flex-col gap-3">
              {siste7.map((f) => (
                <li
                  key={f.id}
                  className="rounded-xl border border-white/[0.06] bg-[#111118] p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${SIGNAL_BADGE[f.signalType].bg} ${SIGNAL_BADGE[f.signalType].text}`}
                    >
                      {f.signalType}
                    </span>
                    <span className="text-xs text-zinc-500">{f.kilde}</span>
                  </div>
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 block text-base font-medium text-emerald-400/90 hover:text-emerald-300"
                  >
                    {f.title}
                  </a>
                  {f.company && (
                    <p className="mt-1 text-sm text-zinc-400">{f.company}</p>
                  )}
                  {f.beskrivelse && (
                    <p className="mt-2 line-clamp-3 text-sm text-zinc-500">
                      {f.beskrivelse}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-zinc-600">
                    Registrert{" "}
                    {new Date(f.funnetDato).toLocaleString("nb-NO")}
                    {f.dato && ` · kilde: ${f.dato}`}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {funn.length > siste7.length && (
          <p className="mt-6 text-xs text-zinc-600">
            Eldre treff er lagret lokalt ({funn.length} totalt).
          </p>
        )}
      </div>
    </div>
  );
}
