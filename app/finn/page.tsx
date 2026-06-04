"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { grupperPerSelskap, beregnMatchScore, getUgrupperteStillinger, getSignalerFlat } from "@/lib/grupperResultater";
import { saveUserProfile } from "@/lib/client-storage";
import { saveSelskaper } from "@/lib/scanner-storage";

type Filter = "alle" | "har-stilling" | "har-signal" | "fulgt";

type MatchAnalyse = {
  matchScore: number;
  matchForklaring?: string;
  gap: Array<{ type: "ok" | "gap" | "missing"; tekst: string }>;
  anbefaling: string;
};

const SIGNAL_META: Record<SignalSubtype, { label: string; timing: string; cls: string }> = {
  funding:       { label: "Funding",          timing: "Ansetter typisk innen 60 dager.",           cls: "bg-orange-100 text-orange-700"  },
  "ny-ledelse":  { label: "Ny ledelse",       timing: "Ny leder bygger team nå.",                  cls: "bg-violet-100 text-violet-700"  },
  vekst:         { label: "Vekst",            timing: "Handle innen 2 uker.",                      cls: "bg-emerald-100 text-emerald-700"},
  bransjenyhet:  { label: "Bransjenyhet",     timing: "Hold øye med markedsutviklingen.",          cls: "bg-blue-100 text-blue-700"      },
  ansetter:      { label: "Ansetter",         timing: "Handle nå — stillingen lyses snart ut.",    cls: "bg-emerald-100 text-emerald-700"},
  historisk:     { label: "Historisk signal", timing: "Ta kontakt proaktivt — behovet kan bestå.", cls: "bg-zinc-100 text-zinc-600"      },
};

// Subtypes som vises i signal-kolonnen på selskapskort (ikke bransjenyhet)
const SIGNAL_SUBTYPES_PÅ_KORT: SignalSubtype[] = ["funding", "ny-ledelse", "vekst", "ansetter", "historisk"];

function KildePill({ kildeNavn, onClick }: { kildeNavn?: string; onClick?: () => void }) {
  if (!kildeNavn || kildeNavn === "Nett" || kildeNavn === "Jobb") return null;
  const style: Record<string, React.CSSProperties> = {
    LinkedIn:      { background: "#E6F1FB", color: "#0C447C" },
    "Finn.no":     { background: "#FAEEDA", color: "#633806" },
    Webcruiter:    { background: "#EEEDFE", color: "#3C3489" },
    NAV:           { background: "#E1F5EE", color: "#085041" },
    Karriereside:  { background: "#FDF4FF", color: "#7C3AED" },
    "Google Jobs": { background: "#F0F7FF", color: "#1D4ED8" },
  };
  const Tag = onClick ? "button" : "span";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className="rounded-full px-2 py-0.5 text-[9px] font-semibold"
      style={{ ...(style[kildeNavn] ?? { background: "#F4F4F5", color: "#52525B" }), cursor: onClick ? "pointer" : "default" }}
    >
      {kildeNavn}
    </Tag>
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
  const [fulgtSelskaper, setFulgtSelskaper] = useState<Set<string>>(new Set());
  const [matchData, setMatchData] = useState<Record<string, MatchAnalyse>>({});
  const [expandert, setExpandert] = useState<Record<string, boolean>>({});
  const [relevansFilter, setRelevansFilter] = useState<"alle" | "høy" | "middels" | "lav">("alle");
  const [kildeFilter, setKildeFilter] = useState<"alle" | "NAV" | "LinkedIn" | "Finn.no" | "Bedriftssider">("alle");
  const [typeFilter, setTypeFilter] = useState<"alle" | "stilling" | "signal" | "fulgt">("alle");
  const [skjulteIds, setSkjulteIds] = useState<Set<string>>(new Set());
  const analyzingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const p = getStoredUserProfile();
    setProfil(p);
    setSist(getSistScan());
    setFunn(loadScannerFunn());
    if (p?.selskaper) {
      setFulgtSelskaper(new Set(p.selskaper.map((s) => s.toLowerCase())));
    }
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
    const overTime = !last || Date.now() - new Date(last).getTime() > 60 * 60 * 1000;
    if (!overTime) return;
    const lock = `jobbagent_finn_auto_${Math.floor(Date.now() / (60 * 60 * 1000))}`;
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

  function toggleFølg(selskapsnavn: string) {
    const p = getStoredUserProfile();
    if (!p) return;
    const key = selskapsnavn.toLowerCase();
    const erFulgt = fulgtSelskaper.has(key);
    const nyListe = erFulgt
      ? p.selskaper.filter((s) => s.toLowerCase() !== key)
      : [...p.selskaper, selskapsnavn];
    p.selskaper = nyListe;
    saveUserProfile(p);
    saveSelskaper(nyListe);
    setFulgtSelskaper(new Set(nyListe.map((s) => s.toLowerCase())));
  }

  function velgOgGa(kort: SelskapKort) {
    const f = kort.stillinger[0];
    if (!f) return;
    localStorage.setItem("valgtStilling", JSON.stringify({ id: f.id, title: f.title, company: kort.navn }));
    router.push("/kjenn");
  }

  const analyserStilling = useCallback(async (kort: SelskapKort) => {
    const s = kort.stillinger[0];
    if (!s || analyzingRef.current.has(kort.id)) return;
    analyzingRef.current.add(kort.id);
    try {
      const p = getStoredUserProfile();
      const pp = JSON.parse(localStorage.getItem("personProfile") ?? "{}") as Record<string, unknown>;
      const res = await fetch("/api/stilling/analyser", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stilling: s, userProfile: p, personProfile: pp }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as MatchAnalyse;
      setMatchData(prev => ({ ...prev, [kort.id]: data }));
    } catch {}
    finally { analyzingRef.current.delete(kort.id); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-analyser topp 5 selskapskort med stilling etter scan eller ved innlasting
  useEffect(() => {
    const top5 = grupperPerSelskap(funn).filter(k => k.stillinger.length > 0).slice(0, 5);
    for (const kort of top5) {
      if (!analyzingRef.current.has(kort.id)) void analyserStilling(kort);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [funn]);

  // ── Gruppering ──────────────────────────────────────────────────────────────
  const alleSelskaper = useMemo(
    () => grupperPerSelskap(funn).map((s) => ({
      ...s,
      erFulgt: fulgtSelskaper.has(s.navn.toLowerCase()),
    })),
    [funn, fulgtSelskaper],
  );

  const filtrerte = useMemo(() => {
    if (filter === "har-stilling") return alleSelskaper.filter((s) => s.stillinger.length > 0);
    if (filter === "har-signal")  return alleSelskaper.filter((s) => s.signaler.length > 0);
    if (filter === "fulgt")       return alleSelskaper.filter((s) => s.erFulgt);
    return alleSelskaper;
  }, [alleSelskaper, filter]);

  const signalSammendrag = useMemo(() => {
    const funding   = funn.filter((f) => f.signalSubtype === "funding").length;
    const nyLedelse = funn.filter((f) => f.signalSubtype === "ny-ledelse").length;
    const vekst     = funn.filter((f) => f.signalSubtype === "vekst").length;
    if (funding   > 0) return `${funding} selskaper i din bransje har hentet kapital — de ansetter snart.`;
    if (nyLedelse > 0) return `${nyLedelse} selskaper har fått ny ledelse — godt tidspunkt for kontakt.`;
    if (vekst     > 0) return `${vekst} vekstsignaler i markedet ditt denne uken.`;
    return null;
  }, [funn]);

  const markedsnyheter = useMemo(
    () => funn.filter((f) => f.signalSubtype === "bransjenyhet"),
    [funn],
  );

  const ugrupperteStillinger = useMemo(() => getUgrupperteStillinger(funn), [funn]);
  const signalFlat = useMemo(() => getSignalerFlat(funn), [funn]);

  // ── Summary stats ───────────────────────────────────────────────────────────
  const totSelskaper  = alleSelskaper.length;
  const totStillinger = alleSelskaper.reduce((n, s) => n + s.stillinger.length, 0) + ugrupperteStillinger.length;
  const totSignaler   = signalFlat.length;

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

  // Kilde- og type-filtrering på toppen av eksisterende `filtrerte`
  const filtratFinal = useMemo(() => {
    let r = filtrerte;
    if (kildeFilter !== "alle") r = r.filter(k =>
      k.stillinger.some(s => s.kildeNavn === kildeFilter) ||
      k.signaler.some(s => s.kilde?.includes(kildeFilter))
    );
    if (typeFilter === "stilling") r = r.filter(k => k.stillinger.length > 0);
    if (typeFilter === "signal")   r = r.filter(k => k.signaler.length > 0);
    if (typeFilter === "fulgt")    r = r.filter(k => k.erFulgt);
    return r;
  }, [filtrerte, kildeFilter, typeFilter]);

  // Filtrer flat-listene med samme kilde/type-filter
  const ugrupperteFiltiert = useMemo(() => {
    let r = ugrupperteStillinger.filter(f => !f.deadline || new Date(f.deadline).getTime() > Date.now());
    if (kildeFilter !== "alle") r = r.filter(f => f.kildeNavn === kildeFilter);
    if (typeFilter === "signal" || typeFilter === "fulgt") r = [];
    return r;
  }, [ugrupperteStillinger, kildeFilter, typeFilter]);

  const signalFlatFiltrert = useMemo(() => {
    let r = signalFlat;
    if (kildeFilter !== "alle") r = r.filter(f => f.kildeNavn === kildeFilter || f.kilde?.includes(kildeFilter));
    if (typeFilter === "stilling" || typeFilter === "fulgt") r = [];
    return r;
  }, [signalFlat, kildeFilter, typeFilter]);

  // Tell per kilde for badge
  const kildeCount = useMemo(() => {
    const alleFunn = [...funn];
    return {
      NAV:         alleFunn.filter(f => f.kildeNavn === "NAV").length,
      LinkedIn:    alleFunn.filter(f => f.kildeNavn === "LinkedIn").length,
      "Finn.no":   alleFunn.filter(f => f.kildeNavn === "Finn.no").length,
      Bedriftssider: alleFunn.filter(f => f.kildeNavn === "Karriereside" || f.kilde === "Google Jobs").length,
    } as Record<string, number>;
  }, [funn]);

  // Seksjonsbasert på matchData
  const høyRelevans     = filtratFinal.filter(k => (matchData[k.id]?.matchScore ?? 0) >= 70);
  const middelsRelevans = filtratFinal.filter(k => { const m = matchData[k.id]?.matchScore ?? 0; return m >= 40 && m < 70; });
  const lavRelevans     = filtratFinal.filter(k => (matchData[k.id]?.matchScore ?? 0) < 40);

  const synligeSeksjoner = relevansFilter === "høy"     ? [høyRelevans]
    : relevansFilter === "middels" ? [middelsRelevans]
    : relevansFilter === "lav"     ? [lavRelevans]
    : [høyRelevans, middelsRelevans, lavRelevans];

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-white pb-24 pt-8">
      {/* Diskret lasteindikator øverst */}
      {loading && (
        <div className="fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-zinc-100">
          <div className="h-full animate-[slide_1.4s_ease-in-out_infinite] bg-zinc-950" style={{ width: "40%" }} />
        </div>
      )}
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

        {/* Del 4 — Profil-sammendrag */}
        {profil && (
          <div className="mt-6 rounded-xl px-4 py-3" style={{ border: "1.5px solid #5DCAA5", background: "#F0FBF7" }}>
            <p className="mb-2 text-[11px] font-semibold text-zinc-600">Din profil — systemet bruker dette til å filtrere stillinger</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Stilling",        verdi: profil.soker },
                { label: "Geografi",        verdi: profil.geografi },
                { label: "Erfaring",        verdi: profil.erfaring },
                { label: "Utdanning",       verdi: (profil as UserProfile & { utdanning?: string }).utdanning },
                { label: "Ferdigheter",     verdi: profil.ferdigheter?.join(", ") },
                { label: "Sertifiseringer", verdi: (profil as UserProfile & { sertifiseringer?: string[] }).sertifiseringer?.join(", ") },
              ].map(felt => (
                <div key={felt.label} className="rounded-lg bg-white px-2.5 py-1.5">
                  <p className="text-[9px] font-semibold uppercase tracking-wide text-zinc-400">{felt.label}</p>
                  {felt.verdi ? (
                    <p className="mt-0.5 truncate text-[11px] font-medium text-zinc-800">{felt.verdi}</p>
                  ) : (
                    <p className="mt-0.5 text-[11px] italic" style={{ color: "#A32D2D" }}>
                      <a href="/profil" style={{ color: "#0F6E56" }}>Legg til</a>
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Del 3 — 3-rad filter */}
        <div className="mt-4 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {([
              { key: "alle" as const,    label: "Alle",                   dot: "" },
              { key: "høy" as const,     label: "Passer deg godt",        dot: "#1D9E75" },
              { key: "middels" as const, label: "Mulig med forberedelse", dot: "#EF9F27" },
              { key: "lav" as const,     label: "Utenfor rekkevidde",     dot: "#E24B4A" },
            ]).map(f => (
              <button key={f.key} type="button" onClick={() => setRelevansFilter(f.key)}
                className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition"
                style={{ border: "0.5px solid", borderColor: relevansFilter === f.key ? "#111" : "rgba(0,0,0,0.12)", background: relevansFilter === f.key ? "#111" : "#fff", color: relevansFilter === f.key ? "#fff" : "#3F3F46" }}>
                {f.dot && <span className="inline-block h-2 w-2 rounded-full" style={{ background: f.dot }} />}
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(["alle","NAV","LinkedIn","Finn.no","Bedriftssider"] as const).map(k => {
              const count = k === "alle" ? null : (kildeCount[k] ?? 0);
              return (
                <button key={k} type="button" onClick={() => setKildeFilter(k)}
                  className="flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition"
                  style={{ border: "0.5px solid", borderColor: kildeFilter === k ? "#111" : "rgba(0,0,0,0.12)", background: kildeFilter === k ? "#111" : "#fff", color: kildeFilter === k ? "#fff" : "#3F3F46" }}>
                  {k === "alle" ? "Alle kilder" : k}
                  {count !== null && count > 0 && (
                    <span className="rounded-full px-1.5 text-[10px]" style={{ background: kildeFilter === k ? "rgba(255,255,255,0.2)" : "#F4F4F5" }}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {([
              { key: "alle" as const, label: "Alle typer" }, { key: "stilling" as const, label: "Stilling ute" },
              { key: "signal" as const, label: "Vekstsignal" }, { key: "fulgt" as const, label: "Følger" },
            ]).map(f => (
              <button key={f.key} type="button" onClick={() => setTypeFilter(f.key)}
                className="rounded-full px-3 py-1 text-xs font-medium transition"
                style={{ border: "0.5px solid", borderColor: typeFilter === f.key ? "#111" : "rgba(0,0,0,0.12)", background: typeFilter === f.key ? "#111" : "#fff", color: typeFilter === f.key ? "#fff" : "#3F3F46" }}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Del 2 — Seksjonsbaserte selskaps-kort */}
        {filtratFinal.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-zinc-200 py-14 text-center">
            <p className="text-sm text-zinc-500">
              {funn.length === 0 ? "Trykk «Oppdater» for å starte skanningen." : "Ingen selskaper i denne kategorien."}
            </p>
          </div>
        ) : (
        <>
        {([
          { liste: høyRelevans,     dot: "#1D9E75", tittel: "Passer deg godt",                sub: "Du er kvalifisert — søk nå",               erLav: false },
          { liste: middelsRelevans, dot: "#EF9F27", tittel: "Mulig med forberedelse",         sub: "Du mangler noe — men det kan kompenseres", erLav: false },
          { liste: lavRelevans,     dot: "#E24B4A", tittel: "Sannsynligvis utenfor rekkevidde", sub: "Vises for innsikt",                       erLav: true  },
        ]).filter(sek =>
          relevansFilter === "alle" ||
          (relevansFilter === "høy" && sek.tittel.includes("godt")) ||
          (relevansFilter === "middels" && sek.tittel.includes("forberedelse")) ||
          (relevansFilter === "lav" && sek.tittel.includes("utenfor"))
        ).map(sek => sek.liste.length === 0 ? null : (
          <div key={sek.tittel} className={`mt-6 ${sek.erLav ? "opacity-65" : ""}`}>
            <div className="mb-3 flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: sek.dot }} />
              <span className="text-xs font-semibold text-zinc-700">{sek.tittel}</span>
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-500">{sek.liste.length}</span>
              <span className="text-[11px] text-zinc-400">{sek.sub}</span>
            </div>
            <div className="flex flex-col gap-4">
              {sek.liste.filter(k => !skjulteIds.has(k.id)).map((kort) => {
            const erLavSeksjon = sek.erLav;
            const score        = beregnMatchScore(kort);
            const isAdded      = addedIds.has(kort.id);
            const isGen        = generererKontakt.has(kort.id);
            const melding      = kontaktmeldinger.get(kort.id);
            const harStilling  = kort.stillinger.length > 0;
            const harSignal    = kort.signaler.length > 0;
            const harPerson    = kort.personer.length > 0;

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
                    {matchData[kort.id] ? (
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{
                        background: matchData[kort.id].matchScore >= 80 ? "#E1F5EE" : matchData[kort.id].matchScore >= 60 ? "#FAEEDA" : "#FEE2E2",
                        color:      matchData[kort.id].matchScore >= 80 ? "#085041" : matchData[kort.id].matchScore >= 60 ? "#633806" : "#A32D2D",
                      }}>
                        {matchData[kort.id].matchScore}% match
                      </span>
                    ) : (
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-600">
                        {score}%
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleFølg(kort.navn)}
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold transition ${
                        kort.erFulgt
                          ? "bg-amber-100 text-amber-700"
                          : "border border-zinc-200 bg-white text-zinc-400 hover:text-zinc-700"
                      }`}
                    >
                      {kort.erFulgt ? "★ Følger" : "☆ Følg"}
                    </button>
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
                              {d !== null && d > 0 && (
                                <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${
                                  d <= 3 ? "bg-red-100 text-red-700"
                                  : d <= 7 ? "bg-amber-100 text-amber-700"
                                  : "bg-emerald-50 text-emerald-700"
                                }`}>
                                  {d === 1 ? "Siste dag!" : `${d}d igjen`}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                    {/* Match-analyse fra AI — inni Kol 1 */}
                    {matchData[kort.id] && (() => {
                      const m = matchData[kort.id];
                      const col = m.matchScore >= 80 ? "#1D9E75" : m.matchScore >= 60 ? "#EF9F27" : "#E24B4A";
                      return (
                        <div className="mt-2 border-t border-zinc-100 pt-2">
                          <div className="mb-1 flex items-center justify-between">
                            <span className="text-[9px] text-zinc-400">Profil-match</span>
                            <span className="text-[11px] font-semibold" style={{ color: col }}>{m.matchScore}%</span>
                          </div>
                          <div className="mb-2 h-1 overflow-hidden rounded-full bg-zinc-100">
                            <div className="h-full rounded-full" style={{ width: `${m.matchScore}%`, background: col }} />
                          </div>
                          {m.gap.slice(0, 3).map((g, i) => (
                            <div key={i} className="mb-0.5 flex items-start gap-1.5">
                              <div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{
                                background: g.type === "ok" ? "#1D9E75" : g.type === "gap" ? "#EF9F27" : "#E24B4A",
                              }} />
                              <span className="text-[10px] leading-tight text-zinc-600">{g.tekst}</span>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Kol 2 — Signal (kun funding/ny-ledelse/vekst/ansetter) */}
                  <div className="px-3 py-3">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-400">
                      Signal
                    </p>
                    {kort.signaler.filter((s) =>
                      !s.signalSubtype || SIGNAL_SUBTYPES_PÅ_KORT.includes(s.signalSubtype)
                    ).length === 0 ? (
                      <p className="text-[11px] italic text-zinc-400">Ingen signaler</p>
                    ) : (
                      kort.signaler
                        .filter((s) => !s.signalSubtype || SIGNAL_SUBTYPES_PÅ_KORT.includes(s.signalSubtype))
                        .slice(0, 2).map((s) => {
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
                  {harStilling && !erLavSeksjon && (
                    <button type="button" onClick={() => velgOgGa(kort)}
                      className="rounded-lg bg-zinc-950 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-zinc-800">
                      Generer søknad
                    </button>
                  )}
                  {erLavSeksjon && (
                    <button type="button" onClick={() => setSkjulteIds(prev => new Set([...prev, kort.id]))}
                      className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-500 transition hover:bg-zinc-50">
                      Skjul denne typen
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
                  {matchData[kort.id] && (
                    <button
                      type="button"
                      onClick={() => setExpandert(prev => ({ ...prev, [kort.id]: !prev[kort.id] }))}
                      className="ml-auto text-[11px] text-zinc-400 hover:text-zinc-600 transition"
                    >
                      {expandert[kort.id] ? "Skjul ↑" : "Vis mer ↓"}
                    </button>
                  )}
                </div>

                {/* ── Vis mer — expanderbar seksjon ── */}
                {expandert[kort.id] && matchData[kort.id] && (() => {
                  const m = matchData[kort.id];
                  return (
                    <div className="grid grid-cols-2 gap-4 border-t border-zinc-100 px-4 py-3">
                      <div>
                        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-400">
                          Hva stillingen krever
                        </p>
                        {m.gap.map((g, i) => (
                          <div key={i} className="mb-1 flex items-start gap-1.5">
                            <div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{
                              background: g.type === "ok" ? "#1D9E75" : g.type === "gap" ? "#EF9F27" : "#E24B4A",
                            }} />
                            <span className="text-[11px] leading-snug text-zinc-700">{g.tekst}</span>
                          </div>
                        ))}
                      </div>
                      <div>
                        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-400">
                          Din profil vs stillingen
                        </p>
                        {m.anbefaling && (
                          <p className="mb-3 text-[11px] leading-relaxed text-zinc-600">{m.anbefaling}</p>
                        )}
                        {harStilling && (
                          <button type="button" onClick={() => velgOgGa(kort)}
                            className="rounded-lg bg-zinc-950 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-zinc-800">
                            Generer tilpasset søknad →
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })}
            </div>
          </div>
        ))}
        </>
        )}
        {/* ── Stillinger uten kjent selskap (flat liste) ─────────────── */}
        {ugrupperteFiltiert.length > 0 && (
          <div className="mt-10">
            <div className="mb-4 flex items-center gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">Ledige stillinger</p>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">{ugrupperteFiltiert.length}</span>
              {kildeFilter !== "alle" && (
                <span className="text-[11px] text-zinc-400">filtrert på {kildeFilter}</span>
              )}
            </div>
            <div className="flex flex-col gap-3">
              {ugrupperteFiltiert.map((f) => {
                const d = f.deadline ? Math.ceil((new Date(f.deadline).getTime() - Date.now()) / 86_400_000) : null;
                return (
                  <div key={f.id} className="flex items-start gap-3 rounded-xl border border-zinc-100 bg-white px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 mb-1">
                        <KildePill kildeNavn={f.kildeNavn} />
                        {d !== null && d > 0 && (
                          <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${
                            d <= 3 ? "bg-red-100 text-red-700"
                            : d <= 7 ? "bg-amber-100 text-amber-700"
                            : "bg-emerald-50 text-emerald-700"
                          }`}>
                            {d === 1 ? "Siste dag!" : `${d}d igjen`}
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-medium text-zinc-900 leading-snug">{f.title.replace(/\s*\|\s*(FINN\.no|NAV|Webcruiter|LinkedIn).*/i, "")}</p>
                      {f.beskrivelse && <p className="mt-0.5 line-clamp-1 text-xs text-zinc-500">{f.beskrivelse}</p>}
                    </div>
                    <a href={f.url} target="_blank" rel="noopener noreferrer"
                      className="shrink-0 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50">
                      Se stilling ↗
                    </a>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Signaler (flat liste) ───────────────────────────────────── */}
        {signalFlatFiltrert.length > 0 && (
          <div className="mt-10">
            <div className="mb-4 flex items-center gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">Markedssignaler</p>
              <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-semibold text-orange-600">{signalFlatFiltrert.length}</span>
            </div>
            <div className="flex flex-col gap-3">
              {signalFlatFiltrert.map((f) => {
                const meta = f.signalSubtype ? SIGNAL_META[f.signalSubtype] : null;
                return (
                  <div key={f.id} className="flex items-start gap-3 rounded-xl border border-zinc-100 bg-white px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 mb-1">
                        {meta && (
                          <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${meta.cls}`}>{meta.label}</span>
                        )}
                      </div>
                      <p className="text-sm font-medium text-zinc-900 leading-snug line-clamp-2">{f.title}</p>
                      {f.beskrivelse && <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500">{f.beskrivelse}</p>}
                      {meta && <p className="mt-1 text-[10px] italic text-zinc-400">{meta.timing}</p>}
                    </div>
                    <a href={f.url} target="_blank" rel="noopener noreferrer"
                      className="shrink-0 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50">
                      Les mer ↗
                    </a>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Markedsnyheter ────────────────────────────────────────────── */}
        {markedsnyheter.length > 0 && (
          <div className="mt-10">
            <div className="mb-4 flex items-center gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                Markedsnyheter
              </p>
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-600">
                {markedsnyheter.length}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {markedsnyheter.map((n) => (
                <a
                  key={n.id}
                  href={n.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-3 rounded-xl border border-zinc-100 bg-white px-4 py-3 transition hover:bg-zinc-50"
                >
                  <svg className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 20H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h10l4 4v10a2 2 0 0 1-2 2z" />
                    <line x1="9" y1="13" x2="15" y2="13" />
                    <line x1="9" y1="17" x2="15" y2="17" />
                  </svg>
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-sm font-medium text-zinc-800">{n.title}</p>
                    {n.beskrivelse && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500">{n.beskrivelse}</p>
                    )}
                    <p className="mt-1 text-[10px] text-zinc-400">
                      {n.kilde} · {new Date(n.funnetDato).toLocaleDateString("nb-NO")}
                    </p>
                  </div>
                  <span className="ml-auto shrink-0 text-xs text-zinc-400">↗</span>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
