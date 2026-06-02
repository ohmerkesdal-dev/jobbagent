"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { KarriereCoach } from "@/components/KarriereCoach";
import { useRouter } from "next/navigation";
import { getStoredUserProfile, profileForApiRequest } from "@/lib/client-storage";
import {
  getSistScan,
  loadScannerFunn,
  loadSelskaper,
  mergeScannerFunn,
  saveScannerFunn,
  setSistScan,
} from "@/lib/scanner-storage";
import { addHoursToIso, newId, upsertKontakt } from "@/lib/pipeline-storage";
import type { ScannerFunn, SignalSubtype } from "@/lib/scanner-types";
import type { PipelineKontakt } from "@/lib/pipeline-types";
import type { SelskapKort, UserProfile } from "@/lib/types";
import { grupperPerSelskap, beregnMatchScore } from "@/lib/grupperResultater";

type Filter = "alle" | "har-stilling" | "har-signal" | "fulgt";

const SIGNAL_META: Record<SignalSubtype, { label: string; timing: string; cls: string }> = {
  funding:      { label: "Funding",      timing: "Ansetter typisk innen 60 dager.",       cls: "bg-orange-100 text-orange-700" },
  "ny-ledelse": { label: "Ny ledelse",   timing: "Ny leder bygger team nå.",              cls: "bg-violet-100 text-violet-700" },
  vekst:        { label: "Vekst",        timing: "Handle innen 2 uker.",                  cls: "bg-emerald-100 text-emerald-700" },
  bransje:      { label: "Bransjenyhet", timing: "Hold øye med utviklingen.",             cls: "bg-blue-100 text-blue-700"     },
  ansetter:     { label: "Ansetter",     timing: "Handle nå — stillingen lyses snart ut.", cls: "bg-emerald-100 text-emerald-700" },
};

function KildePill({ kildeNavn }: { kildeNavn?: string }) {
  if (!kildeNavn || kildeNavn === "Nett") return null;
  const style: Record<string, React.CSSProperties> = {
    LinkedIn:   { background: "#E6F1FB", color: "#0C447C" },
    "Finn.no":  { background: "#FAEEDA", color: "#633806" },
    Webcruiter: { background: "#EEEDFE", color: "#3C3489" },
    NAV:        { background: "#E1F5EE", color: "#085041" },
  };
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[9px] font-semibold"
      style={style[kildeNavn] ?? { background: "#F4F4F5", color: "#52525B" }}
    >
      {kildeNavn}
    </span>
  );
}

function SelskapsLogo({ navn }: { navn: string }) {
  const letters = navn
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-bold text-zinc-600">
      {letters || "?"}
    </div>
  );
}

export default function FinnPage() {
  const router = useRouter();
  const [profil, setProfil] = useState<UserProfile | null>(null);
  const [funn, setFunn] = useState<ScannerFunn[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<Filter>("alle");
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [sist, setSist] = useState<string | null>(null);
  const [webScanningDisabled, setWebScanningDisabled] = useState(false);
  const [kontaktmeldinger, setKontaktmeldinger] = useState<Map<string, string>>(new Map());
  const [generererKontakt, setGenerererKontakt] = useState<Set<string>>(new Set());

  useEffect(() => {
    setProfil(getStoredUserProfile());
    setSist(getSistScan());
    setFunn(loadScannerFunn());
  }, []);

  useEffect(() => {
    fetch("/api/scan/config")
      .then((r) => r.json())
      .then((d: { webScanningDisabled?: boolean }) => {
        if (typeof d.webScanningDisabled === "boolean") setWebScanningDisabled(d.webScanningDisabled);
      })
      .catch(() => {});
  }, []);

  const doScan = useCallback(async () => {
    const p = getStoredUserProfile();
    if (!p) { setScanMsg("Opprett profil først under Profil."); return; }
    setLoading(true); setScanMsg(null); setWarnings([]);
    try {
      const res = await fetch("/api/scan/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: profileForApiRequest(p), selskaper: loadSelskaper() }),
      });
      const data = (await res.json()) as {
        funn?: ScannerFunn[]; warnings?: string[]; error?: string; webScanningDisabled?: boolean;
      };
      if (!res.ok) { setScanMsg(data.error ?? "Skanning feilet."); return; }
      if (typeof data.webScanningDisabled === "boolean") setWebScanningDisabled(data.webScanningDisabled);
      const incoming = data.funn ?? [];
      const existing = loadScannerFunn().filter(
        (x) => x.kategori !== "stilling" && x.signalType !== "Utlyst stilling",
      );
      const merged = mergeScannerFunn(existing, incoming);
      saveScannerFunn(merged);
      setFunn(merged);
      const now = new Date().toISOString();
      setSistScan(now); setSist(now);
      setWarnings(data.warnings ?? []);
      setScanMsg(`Oppdatert — ${incoming.length} funn.`);
    } catch {
      setScanMsg("Kunne ikke nå serveren.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!getStoredUserProfile()) return;
    const last = getSistScan();
    const overDøgn = !last || Date.now() - new Date(last).getTime() > 24 * 3600 * 1000;
    if (!overDøgn) return;
    const d = new Date().toDateString();
    const lock = `jobbagent_finn_auto_${d}`;
    if (sessionStorage.getItem(lock)) return;
    sessionStorage.setItem(lock, "1");
    void doScan();
  }, [doScan]);

  function addToPipeline(kort: SelskapKort) {
    const f = kort.stillinger[0] ?? kort.signaler[0];
    if (!f) return;
    const now = new Date().toISOString();
    const kontakt: PipelineKontakt = {
      id: newId(),
      navn: kort.navn,
      tittel: f.title,
      selskap: kort.navn,
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
    setAddedIds((prev) => new Set([...prev, kort.id]));
  }

  async function genererKontaktmelding(kort: SelskapKort) {
    const p = getStoredUserProfile();
    if (!p) return;
    const signal = kort.signaler[0] ?? kort.stillinger[0];
    if (!signal) return;
    setGenerererKontakt((prev) => new Set([...prev, kort.id]));
    try {
      const pp = JSON.parse(localStorage.getItem("personProfile") ?? "{}") as Record<string, unknown>;
      const res = await fetch("/api/signal/kontaktmelding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signal, userProfile: p, personProfile: pp }),
      });
      const data = (await res.json()) as { melding?: string };
      if (data.melding) setKontaktmeldinger((prev) => new Map([...prev, [kort.id, data.melding!]]));
    } catch {}
    finally {
      setGenerererKontakt((prev) => { const s = new Set(prev); s.delete(kort.id); return s; });
    }
  }

  function velgOgGa(kort: SelskapKort) {
    const f = kort.stillinger[0];
    if (!f) return;
    localStorage.setItem("valgtStilling", JSON.stringify({ id: f.id, title: f.title, company: kort.navn }));
    router.push("/kjenn");
  }

  // ── Gruppering ──────────────────────────────────────────────────────────────
  const alleSelskaper = useMemo(() => grupperPerSelskap(funn), [funn]);

  const filtrerte = useMemo(() => {
    if (filter === "har-stilling") return alleSelskaper.filter((s) => s.stillinger.length > 0);
    if (filter === "har-signal")  return alleSelskaper.filter((s) => s.signaler.length > 0);
    if (filter === "fulgt")       return alleSelskaper.filter((s) => s.erFulgt);
    return alleSelskaper;
  }, [alleSelskaper, filter]);

  // ── Summary stats ────────────────────────────────────────────────────────────
  const totSelskaper  = alleSelskaper.length;
  const totStillinger = useMemo(() => alleSelskaper.reduce((n, s) => n + s.stillinger.length, 0), [alleSelskaper]);
  const totSignaler   = useMemo(() => alleSelskaper.reduce((n, s) => n + s.signaler.length, 0), [alleSelskaper]);

  const signalSammendrag = useMemo(() => {
    const funding   = funn.filter((f) => f.signalSubtype === "funding").length;
    const nyLedelse = funn.filter((f) => f.signalSubtype === "ny-ledelse").length;
    const vekst     = funn.filter((f) => f.signalSubtype === "vekst").length;
    if (funding   > 0) return `${funding} selskaper i din bransje har hentet kapital — de ansetter snart.`;
    if (nyLedelse > 0) return `${nyLedelse} selskaper har fått ny ledelse — godt tidspunkt for kontakt.`;
    if (vekst     > 0) return `${vekst} vekstsignaler i markedet ditt denne uken.`;
    return null;
  }, [funn]);

  const erHøySesong = useMemo(() => [1, 2, 3, 4, 8, 9, 10].includes(new Date().getMonth() + 1), []);

  const dagligInnsikt = useMemo(() => {
    const liste = [
      { tekst: "80% av jobber lyses aldri ut — de fylles gjennom nettverk.", kilde: "LinkedIn Economic Graph" },
      { tekst: "Rekrutterere bruker 7 sekunder på første gjennomlesning.", kilde: "Ladders Inc. studie" },
      { tekst: "Beste tidspunkt å søke: tirsdag og onsdag morgen.", kilde: "Glassdoor Research" },
      { tekst: "En søknad tilpasset stillingen er 3× mer effektiv.", kilde: "CareerBuilder" },
      { tekst: "LinkedIn-nettverk på 500+ gir 2× flere henvendelser.", kilde: "LinkedIn Talent Solutions" },
      { tekst: "Høysesong for regnskap og finans: jan–apr og aug–okt.", kilde: "NAV Arbeidsmarkedsstatistikk" },
      { tekst: "Følg opp søknaden etter 5 dager — det viser initiativ.", kilde: "Karriereveiledning Norge" },
    ];
    return liste[new Date().getDay()];
  }, []);

  const FILTERS: { key: Filter; label: string }[] = [
    { key: "alle",         label: "Alle selskaper" },
    { key: "har-stilling", label: "Har stilling ute" },
    { key: "har-signal",   label: "Vekstsignal" },
    { key: "fulgt",        label: "Jeg følger" },
  ];

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-white pb-24 pt-8">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">

        {/* Header */}
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">Jobbagent</p>
            <h1 className="mt-2 font-semibold text-zinc-950"
              style={{ fontSize: "clamp(28px,5vw,40px)", letterSpacing: "-0.04em", lineHeight: 1.1 }}>
              Din feed.
            </h1>
            <p className="mt-1.5 text-sm text-zinc-500">
              {profil ? `Tilpasset for ${profil.navn}` : "Logg inn eller lag profil"}
            </p>
          </div>
          <button type="button" disabled={loading} onClick={doScan}
            className="flex shrink-0 items-center gap-2 rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-50">
            <i className={`ti ti-radar text-base ${loading ? "animate-spin" : ""}`} />
            {loading ? "Oppdaterer…" : "Oppdater"}
          </button>
        </div>

        {/* Ingen profil */}
        {!profil && (
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <Link href="/profil" className="font-medium underline">Opprett profil</Link> for å aktivere automatisk skanning.
          </div>
        )}

        {webScanningDisabled && (
          <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
            Brave Search er av — sett <code className="rounded bg-white px-1">BRAVE_SEARCH_API_KEY</code> for å aktivere.
          </div>
        )}

        {/* Summary */}
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Selskaper",      value: totSelskaper },
            { label: "Stillinger ute", value: totStillinger },
            { label: "Signaler",       value: totSignaler },
            { label: "Funn totalt",    value: funn.length },
          ].map((c) => (
            <div key={c.label} className="rounded-xl border border-zinc-100 bg-white p-4">
              <p className="font-semibold text-zinc-950"
                style={{ fontSize: "28px", letterSpacing: "-0.04em", lineHeight: 1 }}>
                {c.value}
              </p>
              <p className="mt-2 text-xs text-zinc-500">{c.label}</p>
            </div>
          ))}
        </div>

        {signalSammendrag && (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3">
            <svg className="mt-0.5 h-4 w-4 shrink-0 text-zinc-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 18h6M10 22h4M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z" />
            </svg>
            <p className="text-sm text-zinc-700">{signalSammendrag}</p>
          </div>
        )}

        {erHøySesong && <KarriereCoach kontekst="hoy-sesong" />}

        <div className="mt-4 rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400">Hva sier markedet i dag</p>
          <p className="mt-1.5 text-sm leading-relaxed text-zinc-800">{dagligInnsikt.tekst}</p>
          <p className="mt-1 text-[10px] text-zinc-400">{dagligInnsikt.kilde}</p>
        </div>

        {sist && (
          <p className="mt-3 text-xs text-zinc-400">
            Oppdatert: {new Date(sist).toLocaleString("nb-NO", { dateStyle: "medium", timeStyle: "short" })}
          </p>
        )}
        {scanMsg && <p className="mt-3 text-sm text-emerald-700">{scanMsg}</p>}
        {warnings.length > 0 && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
            <p className="font-medium text-amber-800">Merknader</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5 text-zinc-700">
              {warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>
        )}

        {/* Filter-piller */}
        <div className="mt-6 flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" onClick={() => setFilter(f.key)}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
                filter === f.key
                  ? "bg-zinc-950 text-white"
                  : "border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
              }`}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Selskaps-kort */}
        <div className="mt-4 flex flex-col gap-4">
          {filtrerte.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-200 py-14 text-center">
              <p className="text-sm text-zinc-500">
                {funn.length === 0
                  ? "Trykk «Oppdater» for å starte skanningen."
                  : "Ingen selskaper i denne kategorien."}
              </p>
            </div>
          ) : filtrerte.map((kort) => {
            const score       = beregnMatchScore(kort);
            const isAdded     = addedIds.has(kort.id);
            const isGen       = generererKontakt.has(kort.id);
            const melding     = kontaktmeldinger.get(kort.id);
            const harStilling = kort.stillinger.length > 0;
            const harSignal   = kort.signaler.length > 0;
            const harPerson   = kort.personer.length > 0;

            return (
              <div key={kort.id} className="overflow-hidden rounded-xl bg-white"
                style={{ border: "0.5px solid rgba(0,0,0,0.08)" }}>

                {/* ── Kort-header ── */}
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <SelskapsLogo navn={kort.navn} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-zinc-950">{kort.navn}</p>
                      {(kort.lokasjon || kort.bransje) && (
                        <p className="text-xs text-zinc-400">
                          {[kort.bransje, kort.lokasjon].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {harStilling && (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                        Stilling ute
                      </span>
                    )}
                    {harSignal && (
                      <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-semibold text-orange-600">
                        Signal
                      </span>
                    )}
                    {harPerson && (
                      <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-600">
                        {kort.personer.length} kontakt{kort.personer.length > 1 ? "er" : ""}
                      </span>
                    )}
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-600">
                      {score}%
                    </span>
                  </div>
                </div>

                {/* ── Tre kolonner ── */}
                <div className="grid grid-cols-3 divide-x divide-zinc-100 border-t border-zinc-100">

                  {/* Kol 1 — Stillinger */}
                  <div className="px-3 py-3">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-400">
                      Stillinger
                    </p>
                    {kort.stillinger.length === 0 ? (
                      <p className="text-[11px] italic leading-snug text-emerald-600">
                        Ingen utlyst ennå — ta kontakt proaktivt
                      </p>
                    ) : (
                      kort.stillinger.slice(0, 2).map((s) => {
                        const d = s.deadline
                          ? Math.ceil((new Date(s.deadline).getTime() - Date.now()) / 86_400_000)
                          : null;
                        return (
                          <div key={s.id} className="mb-2 last:mb-0">
                            <p className="line-clamp-2 text-[11px] font-medium leading-snug text-zinc-800">
                              {s.title}
                            </p>
                            <div className="mt-1 flex flex-wrap gap-1">
                              <KildePill kildeNavn={s.kildeNavn} />
                              {d !== null && (
                                <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${
                                  d <= 0 ? "bg-red-100 text-red-700"
                                  : d <= 3 ? "bg-red-50 text-red-600"
                                  : "bg-zinc-100 text-zinc-500"
                                }`}>
                                  {d <= 0 ? "Utløpt" : `${d}d igjen`}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Kol 2 — Signal */}
                  <div className="px-3 py-3">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-400">
                      Signal
                    </p>
                    {kort.signaler.length === 0 ? (
                      <p className="text-[11px] italic text-zinc-400">Ingen signaler</p>
                    ) : (
                      kort.signaler.slice(0, 2).map((s) => {
                        const meta = s.signalSubtype ? SIGNAL_META[s.signalSubtype] : null;
                        return (
                          <div key={s.id} className="mb-2 last:mb-0">
                            {meta && (
                              <span className={`mb-1 inline-block rounded-full px-2 py-0.5 text-[9px] font-semibold ${meta.cls}`}>
                                {meta.label}
                              </span>
                            )}
                            <p className="line-clamp-2 text-[11px] leading-snug text-zinc-700">
                              {s.beskrivelse || s.title}
                            </p>
                            {meta && (
                              <p className="mt-0.5 text-[10px] italic text-zinc-400">{meta.timing}</p>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Kol 3 — Nøkkelpersoner */}
                  <div className="px-3 py-3">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-400">
                      Kontakter
                    </p>
                    {kort.personer.length === 0 ? (
                      <p className="text-[11px] italic text-zinc-400">Ingen funnet</p>
                    ) : (
                      <div className="select-none opacity-40 pointer-events-none">
                        {kort.personer.slice(0, 2).map((p) => (
                          <div key={p.id} className="mb-2 last:mb-0">
                            <p className="line-clamp-1 text-[11px] font-medium text-zinc-800">
                              {p.title}
                            </p>
                            {p.location && (
                              <p className="text-[10px] text-zinc-400">{p.location}</p>
                            )}
                          </div>
                        ))}
                        <p className="text-[10px] font-medium text-violet-500">Lås opp med Pro</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Footer-handlinger ── */}
                <div className="flex flex-wrap items-start gap-2 border-t border-zinc-100 bg-zinc-50 px-4 py-2.5">
                  {harStilling && (
                    <button type="button" onClick={() => velgOgGa(kort)}
                      className="rounded-lg bg-zinc-950 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-zinc-800">
                      Generer søknad
                    </button>
                  )}
                  {!harStilling && harSignal && (
                    <button type="button" onClick={() => genererKontaktmelding(kort)} disabled={isGen}
                      className="rounded-lg bg-zinc-950 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-50">
                      {isGen ? "Genererer…" : "Kontaktmelding"}
                    </button>
                  )}
                  <button type="button" onClick={() => addToPipeline(kort)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                      isAdded
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                    }`}>
                    {isAdded ? "✓ I pipeline" : "+ Pipeline"}
                  </button>
                  {(kort.stillinger[0]?.url || kort.signaler[0]?.url) && (
                    <a href={kort.stillinger[0]?.url ?? kort.signaler[0]?.url}
                      target="_blank" rel="noopener noreferrer"
                      className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50">
                      Se mer ↗
                    </a>
                  )}
                  {melding && (
                    <div className="mt-1 w-full rounded-lg border border-zinc-100 bg-white p-3 text-xs leading-relaxed text-zinc-700">
                      {melding}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
