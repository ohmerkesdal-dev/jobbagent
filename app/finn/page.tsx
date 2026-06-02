"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { KarriereCoach } from "@/components/KarriereCoach";
import { useRouter } from "next/navigation";
import {
  getStoredUserProfile,
  profileForApiRequest,
} from "@/lib/client-storage";
import {
  getSistScan,
  loadScannerFunn,
  loadSelskaper,
  mergeScannerFunn,
  saveScannerFunn,
  saveSelskaper,
  setSistScan,
} from "@/lib/scanner-storage";
import { addHoursToIso, newId, upsertKontakt } from "@/lib/pipeline-storage";
import type { ScannerFunn, ScannerKategori, SignalSubtype } from "@/lib/scanner-types";
import type { PipelineKontakt } from "@/lib/pipeline-types";
import type { UserProfile } from "@/lib/types";

type Filter = "alle" | "stilling" | "signal" | "person";

function getKategori(f: ScannerFunn): ScannerKategori {
  if (f.kategori) return f.kategori;
  if (f.signalType === "Utlyst stilling") return "stilling";
  if (f.signalType === "LinkedIn") return "person";
  if (f.signalType === "Selskap") return "signal";
  return "nyhet";
}

function dagerIgjen(deadline: string | undefined): number | null {
  if (!deadline) return null;
  const t = new Date(deadline).getTime();
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - Date.now()) / 86_400_000);
}

function sortFeed(funn: ScannerFunn[]): ScannerFunn[] {
  const order: Record<ScannerKategori, number> = {
    stilling: 0,
    signal: 1,
    person: 2,
    nyhet: 3,
  };
  return [...funn].sort((a, b) => {
    const diff = (order[getKategori(a)] ?? 3) - (order[getKategori(b)] ?? 3);
    if (diff !== 0) return diff;
    return new Date(b.funnetDato).getTime() - new Date(a.funnetDato).getTime();
  });
}

const SIGNAL_META: Record<SignalSubtype, { bg: string; tekst: string; label: string; timing: string }> = {
  funding:     { bg: "bg-orange-100", tekst: "text-orange-600", label: "Funding", timing: "Handle innen 30 dager — høyest responsrate" },
  "ny-ledelse":{ bg: "bg-violet-100", tekst: "text-violet-600", label: "Ny ledelse", timing: "Handle innen 60 dager — ny leder bygger team nå" },
  vekst:       { bg: "bg-emerald-100", tekst: "text-emerald-600", label: "Vekst", timing: "Handle innen 2 uker — før de lyser ut stilling" },
  bransje:     { bg: "bg-blue-100", tekst: "text-blue-600", label: "Bransjenyhet", timing: "Hold øye med utviklingen" },
  ansetter:    { bg: "bg-emerald-100", tekst: "text-emerald-600", label: "Ansetter", timing: "Handle nå — stillingen lyses snart ut" },
};

function SignalIkon({ subtype }: { subtype?: SignalSubtype }) {
  const meta = subtype ? SIGNAL_META[subtype] : SIGNAL_META.vekst;
  const icons: Record<SignalSubtype, React.ReactNode> = {
    funding: <svg className={`h-5 w-5 ${meta.tekst}`} fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v12M8 10h5.5a2.5 2.5 0 0 1 0 5H8v-5z"/></svg>,
    "ny-ledelse": <svg className={`h-5 w-5 ${meta.tekst}`} fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>,
    vekst: <svg className={`h-5 w-5 ${meta.tekst}`} fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
    bransje: <svg className={`h-5 w-5 ${meta.tekst}`} fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><path d="M12 12v5M9 14h6"/></svg>,
    ansetter: <svg className={`h-5 w-5 ${meta.tekst}`} fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
  };
  return (
    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${meta.bg}`}>
      {icons[subtype ?? "vekst"]}
    </div>
  );
}

function KategoriIkon({ kategori, subtype }: { kategori: ScannerKategori; subtype?: SignalSubtype }) {
  if (kategori === "signal" && subtype) return <SignalIkon subtype={subtype} />;
  if (kategori === "stilling") {
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100">
        <svg className="h-5 w-5 text-emerald-600" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
          <rect x="2" y="7" width="20" height="14" rx="2" />
          <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
          <line x1="12" y1="12" x2="12" y2="17" />
          <line x1="9.5" y1="14.5" x2="14.5" y2="14.5" />
        </svg>
      </div>
    );
  }
  if (kategori === "signal") {
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-100">
        <svg className="h-5 w-5 text-orange-600" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
          <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
          <polyline points="17 6 23 6 23 12" />
        </svg>
      </div>
    );
  }
  if (kategori === "person") {
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100">
        <svg className="h-5 w-5 text-violet-600" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      </div>
    );
  }
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100">
      <svg className="h-5 w-5 text-zinc-500" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
        <path d="M19 20H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h10l4 4v10a2 2 0 0 1-2 2z" />
        <line x1="9" y1="13" x2="15" y2="13" />
        <line x1="9" y1="17" x2="15" y2="17" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
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
    const stored = loadScannerFunn();
    setFunn(stored);
  }, []);

  useEffect(() => {
    fetch("/api/scan/config")
      .then((r) => r.json())
      .then((d: { webScanningDisabled?: boolean }) => {
        if (typeof d.webScanningDisabled === "boolean") {
          setWebScanningDisabled(d.webScanningDisabled);
        }
      })
      .catch(() => {});
  }, []);

  const doScan = useCallback(async () => {
    const p = getStoredUserProfile();
    if (!p) {
      setScanMsg("Opprett profil først under Profil.");
      return;
    }
    setLoading(true);
    setScanMsg(null);
    setWarnings([]);
    try {
      const res = await fetch("/api/scan/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile: profileForApiRequest(p),
          selskaper: loadSelskaper(),
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
      const existing = loadScannerFunn().filter(
        (x) => x.kategori !== "stilling" && x.signalType !== "Utlyst stilling",
      );
      const merged = mergeScannerFunn(existing, incoming);
      saveScannerFunn(merged);
      setFunn(merged);
      const now = new Date().toISOString();
      setSistScan(now);
      setSist(now);
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
    const overDøgn = !last || Date.now() - new Date(last).getTime() > 24 * 60 * 60 * 1000;
    if (!overDøgn) return;
    const d = new Date().toDateString();
    const lock = `jobbagent_finn_auto_${d}`;
    if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(lock)) return;
    if (typeof sessionStorage !== "undefined") sessionStorage.setItem(lock, "1");
    void doScan();
  }, [doScan]);

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

  async function genererKontaktmelding(f: ScannerFunn) {
    const p = getStoredUserProfile();
    if (!p) return;
    setGenerererKontakt((prev) => new Set([...prev, f.id]));
    try {
      const pp = typeof window !== "undefined" ? JSON.parse(localStorage.getItem("personProfile") ?? "{}") : {};
      const res = await fetch("/api/signal/kontaktmelding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signal: f, userProfile: p, personProfile: pp }),
      });
      const data = (await res.json()) as { melding?: string };
      if (data.melding) {
        setKontaktmeldinger((prev) => new Map([...prev, [f.id, data.melding!]]));
      }
    } catch {}
    finally {
      setGenerererKontakt((prev) => { const s = new Set(prev); s.delete(f.id); return s; });
    }
  }

  function velgOgGa(f: ScannerFunn) {
    if (typeof window !== "undefined") {
      localStorage.setItem("valgtStilling", JSON.stringify({ id: f.id, title: f.title, company: f.company ?? "" }));
    }
    router.push("/kjenn");
  }

  const now = new Date();
  const cutoff14 = now.getTime() - 14 * 86_400_000;
  const stillinger = funn.filter((f) => {
    if (getKategori(f) !== "stilling") return false;
    if (f.deadline) return new Date(f.deadline) > now;
    return new Date(f.funnetDato).getTime() >= cutoff14;
  });
  const signaler = funn.filter((f) => getKategori(f) === "signal");
  const personer = funn.filter((f) => getKategori(f) === "person");
  const matchScore = funn.length === 0 ? 0 : Math.min(96, 50 + stillinger.length * 6);

  const sorted = sortFeed(funn.filter((f) => {
    const k = getKategori(f);
    if (k === "stilling") {
      if (f.deadline && new Date(f.deadline) <= now) return false;
      if (!f.deadline && new Date(f.funnetDato).getTime() < cutoff14) return false;
    }
    if (filter === "alle") return k !== "nyhet" || funn.filter(x => getKategori(x) !== "nyhet").length === 0;
    return k === filter;
  }));

  const signalSammendrag = useMemo(() => {
    const funding = funn.filter((f) => f.signalSubtype === "funding").length;
    const nyLedelse = funn.filter((f) => f.signalSubtype === "ny-ledelse").length;
    const vekst = funn.filter((f) => f.signalSubtype === "vekst").length;
    if (funding > 0) return `${funding} selskaper i din bransje har hentet kapital nylig — de ansetter snart.`;
    if (nyLedelse > 0) return `${nyLedelse} selskaper har fått ny ledelse — godt tidspunkt for direkte kontakt.`;
    if (vekst > 0) return `${vekst} vekstsignaler i markedet ditt denne uken.`;
    return null;
  }, [funn]);

  const erHøySesong = useMemo(() => {
    const m = new Date().getMonth() + 1;
    return [1, 2, 3, 4, 8, 9, 10].includes(m);
  }, []);

  const dagligInnsikt = useMemo(() => {
    const liste = [
      { tekst: "80% av jobber lyses aldri ut — de fylles gjennom nettverk. Er du i kontakt med noen som jobber der du vil jobbe?", kilde: "LinkedIn Economic Graph" },
      { tekst: "Rekrutterere bruker 7 sekunder på første gjennomlesning. Åpningssetningen din er alt.", kilde: "Ladders Inc. studie" },
      { tekst: "Det beste tidspunktet å søke er tirsdag og onsdag morgen — da er rekrutterere mest aktive.", kilde: "Glassdoor Research" },
      { tekst: "En søknad tilpasset stillingen er 3× mer effektiv enn en generisk søknad.", kilde: "CareerBuilder" },
      { tekst: "Kandidater med et aktivt LinkedIn-nettverk på 500+ får 2× flere henvendelser.", kilde: "LinkedIn Talent Solutions" },
      { tekst: "Høysesong for regnskap og finans i Norge: januar–april og august–oktober.", kilde: "NAV Arbeidsmarkedsstatistikk" },
      { tekst: "Følg opp søknaden din etter 5 dager — det viser initiativ uten å mase.", kilde: "Karriereveiledning Norge" },
    ];
    return liste[new Date().getDay()];
  }, []);

  const FILTERS: { key: Filter; label: string }[] = [
    { key: "alle", label: "Alle" },
    { key: "stilling", label: "Stillinger" },
    { key: "signal", label: "Signaler" },
    { key: "person", label: "Nøkkelpersoner" },
  ];

  return (
    <div className="min-h-screen bg-[#f5f4f0] pb-24 pt-8">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">

        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-medium text-zinc-950" style={{ letterSpacing: "-0.02em" }}>
              Din feed
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              {profil ? `Basert på profilen til ${profil.navn}` : "Logg inn eller lag profil"}
            </p>
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={doScan}
            className="flex items-center gap-2 rounded-xl bg-[#111] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-50"
          >
            <i className={`ti ti-radar text-base ${loading ? "animate-spin" : ""}`} />
            {loading ? "Oppdaterer…" : "Oppdater feed"}
          </button>
        </div>

        {/* Ingen profil */}
        {!profil && (
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <Link href="/profil" className="font-medium underline">Opprett profil</Link> for å aktivere automatisk skanning.
          </div>
        )}

        {/* Web scanning disabled */}
        {webScanningDisabled && (
          <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
            Brave Search er av — sett <code className="rounded bg-white px-1">BRAVE_SEARCH_API_KEY</code> for å aktivere signaler og nyheter.
          </div>
        )}

        {/* Summary-kort */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Stillinger", value: stillinger.length, color: "text-emerald-700" },
            { label: "Signaler", value: signaler.length, color: "text-orange-600" },
            { label: "Nøkkelpersoner", value: personer.length, color: "text-violet-600" },
            { label: "Match-score", value: `${matchScore}%`, color: "text-[#1D9E75]" },
          ].map((c) => (
            <div key={c.label} className="rounded-2xl bg-white p-4" style={{ border: "0.5px solid rgba(0,0,0,0.08)" }}>
              <p className={`text-2xl font-semibold ${c.color}`}>{c.value}</p>
              <p className="mt-1 text-xs text-zinc-500">{c.label}</p>
            </div>
          ))}
        </div>

        {/* Signal-sammendrag (Del 5) */}
        {signalSammendrag && (
          <div className="flex items-start gap-3 rounded-xl px-4 py-3" style={{ background: "#F0FDF4", border: "0.5px solid rgba(29,158,117,0.25)" }}>
            <svg className="mt-0.5 h-4 w-4 shrink-0 text-[#1D9E75]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 18h6M10 22h4M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z" />
            </svg>
            <p className="text-sm text-emerald-900">{signalSammendrag}</p>
          </div>
        )}

        {/* Karriere coach — høysesong */}
        {erHøySesong && <KarriereCoach kontekst="hoy-sesong" />}

        {/* Daglig innsikt */}
        <div className="rounded-xl px-4 py-3" style={{ background: "#FFFBF0", border: "0.5px solid rgba(29,158,117,0.2)" }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#1D9E75]">Hva sier markedet i dag</p>
          <p className="mt-1 text-sm leading-relaxed text-zinc-800">{dagligInnsikt.tekst}</p>
          <p className="mt-1 text-[10px] text-zinc-400">{dagligInnsikt.kilde}</p>
        </div>

        {/* Siste oppdatering */}
        {sist && (
          <p className="mt-3 text-xs text-zinc-400">
            Oppdatert:{" "}
            {new Date(sist).toLocaleString("nb-NO", { dateStyle: "medium", timeStyle: "short" })}
          </p>
        )}

        {/* Scan-melding */}
        {scanMsg && <p className="mt-3 text-sm text-emerald-700">{scanMsg}</p>}

        {/* Warnings */}
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
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                filter === f.key
                  ? "bg-[#111] text-white"
                  : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
              }`}
            >
              {f.label}
              {f.key !== "alle" && (
                <span className="ml-1.5 text-xs opacity-60">
                  {f.key === "stilling" ? stillinger.length : f.key === "signal" ? signaler.length : personer.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Feed */}
        <div className="mt-4 flex flex-col gap-3">
          {sorted.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-200 bg-white py-12 text-center">
              <p className="text-sm text-zinc-500">
                {funn.length === 0
                  ? "Trykk «Oppdater feed» for å starte skanningen."
                  : "Ingen funn i denne kategorien."}
              </p>
            </div>
          ) : (
            sorted.map((f) => {
              const kat = getKategori(f);
              const isLocked = kat === "person";
              const d = f.deadline ? Math.ceil((new Date(f.deadline).getTime() - Date.now()) / 86400000) : null;

              const fristBadge = d === null ? null
                : d <= 1
                  ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">{d <= 0 ? "Utløpt" : "Siste dag!"}</span>
                  : d <= 5
                    ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">{d} dager igjen</span>
                    : <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Frist: {new Date(f.deadline!).toLocaleDateString("nb-NO")}</span>;

              const badge =
                kat === "stilling" ? { label: "NAV-stilling", cls: "bg-emerald-50 text-emerald-700" }
                : kat === "signal" ? { label: "Vekstsignal", cls: "bg-orange-50 text-orange-700" }
                : kat === "person" ? { label: "Nøkkelperson", cls: "bg-violet-50 text-violet-700" }
                : { label: "Nyhet", cls: "bg-zinc-100 text-zinc-600" };

              return (
                <div
                  key={f.id}
                  className={`flex gap-4 rounded-2xl bg-white p-4 ${isLocked ? "pointer-events-none opacity-40" : ""}`}
                  style={{ border: "0.5px solid rgba(0,0,0,0.08)" }}
                >
                  <KategoriIkon kategori={kat} />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${badge.cls}`}>
                        {isLocked ? "🔒 " : ""}{badge.label}
                      </span>
                      {fristBadge}
                    </div>

                    <h3 className="mt-1.5 text-sm font-semibold leading-snug text-zinc-950">
                      {f.title}
                    </h3>

                    {(f.company || f.location) && (
                      <p className="mt-0.5 text-xs text-zinc-500">
                        {[f.company, f.location].filter(Boolean).join(" · ")}
                      </p>
                    )}

                    {f.beskrivelse && (
                      <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-zinc-600">
                        {f.beskrivelse}
                      </p>
                    )}

                    {!isLocked && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {kat === "stilling" && (
                          <button
                            type="button"
                            onClick={() => velgOgGa(f)}
                            className="rounded-lg bg-[#111] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-zinc-800"
                          >
                            Generer søknad
                          </button>
                        )}
                        {kat === "stilling" && (
                          <button
                            type="button"
                            onClick={() => addToPipeline(f)}
                            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                              addedIds.has(f.id)
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                            }`}
                          >
                            {addedIds.has(f.id) ? "✓ Lagt til" : "+ Pipeline"}
                          </button>
                        )}
                        <a
                          href={f.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50"
                        >
                          Se mer ↗
                        </a>
                      </div>
                    )}

                    {isLocked && (
                      <p className="mt-2 text-xs text-zinc-400">Direktekontakt krever Pro</p>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
