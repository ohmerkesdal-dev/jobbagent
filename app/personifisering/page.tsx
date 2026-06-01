"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { savePersonProfile, getStoredUserProfile } from "@/lib/client-storage";
import { loadScannerFunn } from "@/lib/scanner-storage";
import type { PersonProfile, UserProfile } from "@/lib/types";
import type { ScannerFunn } from "@/lib/scanner-types";

/* ─── constants ──────────────────────────────────────────────────────────── */

const STEG_LABELS = ["Hvem er du?", "Hva driver deg?", "Forberedelse", "Generer søknad"];

const S1_OPTIONS = [
  {
    label: "At jeg er pålitelig og tar initiativ",
    arbeidsstil: "Pålitelig og initiativrik",
    tags: ["Pålitelig", "Initiativrik", "Ansvarlig"],
    insight: "Tar ansvar uten å bli bedt — fungerer godt selvstendig og under press",
  },
  {
    label: "At jeg jobber godt alene under press",
    arbeidsstil: "Selvstendig under press",
    tags: ["Selvstendig", "Rolig under press", "Effektiv"],
    insight: "Leverer konsistent kvalitet — spesielt verdifull i tidspressede situasjoner",
  },
  {
    label: "At jeg er nøyaktig og detaljorientert",
    arbeidsstil: "Nøyaktig og detaljorientert",
    tags: ["Nøyaktig", "Detaljorientert", "Kvalitetsbevisst"],
    insight: "Fanger feil tidlig og sikrer høy kvalitet — kritisk i roller med ansvar",
  },
  {
    label: "At jeg er god til å se helheten",
    arbeidsstil: "Strategisk og helhetsorientert",
    tags: ["Strategisk", "Helhetsorientert", "Løsningsfokusert"],
    insight: "Kobler detaljer til større bilde — verdifull i komplekse og tverrfaglige prosjekter",
  },
];

const S2_VERDI_OPTIONS = [
  { label: "At jeg lærer noe nytt hele tiden", verdi: "Kontinuerlig læring", selskaper: "Veksende tech- og konsulentselskaper" },
  { label: "At jeg jobber med folk jeg liker og stoler på", verdi: "Sterk teamkultur", selskaper: "Selskaper med lav turnover og sterk internkultur" },
  { label: "At jeg ser tydelig fremgang og karrierevekst", verdi: "Karriereutvikling", selskaper: "Selskaper med strukturerte karriereveier" },
  { label: "At jeg har frihet til å jobbe på min måte", verdi: "Autonomi og fleksibilitet", selskaper: "Slanke team og startups med flat struktur" },
];

const S2_ARBEIDSSTIL_OPTIONS = [
  { label: "Dokumenterer og foreslår løsning til lederen", arbeidsstil: "Strukturert og prosessorientert" },
  { label: "Fikser det stille uten å lage støy", arbeidsstil: "Pragmatisk og løsningsfokusert" },
  { label: "Spør kollegaer om de har lagt merke til det", arbeidsstil: "Samarbeidsorientert og inkluderende" },
  { label: "Venter og observerer mer", arbeidsstil: "Analytisk og tålmodig" },
];

const EKSEMPEL_STILLINGER: ScannerFunn[] = [
  { id: "eks-1", signalType: "Utlyst stilling", kategori: "stilling", title: "Regnskapskonsulent", company: "Azets Insight AS", url: "https://arbeidsplassen.nav.no", kilde: "Eksempel", funnetDato: new Date().toISOString() },
  { id: "eks-2", signalType: "Utlyst stilling", kategori: "stilling", title: "Junior regnskapsfører", company: "BDO AS", url: "https://arbeidsplassen.nav.no", kilde: "Eksempel", funnetDato: new Date().toISOString() },
  { id: "eks-3", signalType: "Utlyst stilling", kategori: "stilling", title: "Controller", company: "Kolonial.no AS", url: "https://arbeidsplassen.nav.no", kilde: "Eksempel", funnetDato: new Date().toISOString() },
];

/* ─── helpers ────────────────────────────────────────────────────────────── */

function newId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function lønnstekst(bransje: string): string {
  const b = bransje.toLowerCase();
  if (b.includes("regnskap") || b.includes("økonomi") || b.includes("revisjon")) {
    return "Nyutdannet i Oslo: 480–560 000 kr/år. Autorisert regnskapsfører: 580–720 000 kr/år. Senior controller: 700–900 000 kr/år.";
  }
  if (b.includes("hr") || b.includes("personal")) {
    return "HR-konsulent Oslo: 520–640 000 kr/år. HR-leder: 700–950 000 kr/år.";
  }
  if (b.includes("it") || b.includes("tech") || b.includes("utvikling")) {
    return "Junior utvikler: 550–680 000 kr/år. Seniornivå: 800–1 100 000 kr/år.";
  }
  return "Sjekk SSB Lønnsstatistikk og Glassdoor.no for tall for din bransje.";
}

/* ─── sub-components ─────────────────────────────────────────────────────── */

function AgentBoble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1D9E75] text-xs font-bold text-white">
        JA
      </span>
      <div
        className="max-w-prose rounded-2xl rounded-tl-sm bg-white px-4 py-3 text-sm leading-relaxed text-zinc-800"
        style={{ border: "0.5px solid rgba(0,0,0,0.08)" }}
      >
        {children}
      </div>
    </div>
  );
}

function BrukerBoble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-prose rounded-2xl rounded-tr-sm bg-zinc-900 px-4 py-3 text-sm leading-relaxed text-zinc-100">
        {children}
      </div>
    </div>
  );
}

function AiBoks({ tittel, punkter, tags }: { tittel: string; punkter: string[]; tags: string[] }) {
  return (
    <div className="rounded-2xl bg-[#111] px-5 py-5 text-[#f5f4f0]">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
        {tittel}
      </p>
      <ul className="mt-3 space-y-1.5">
        {punkter.map((p) => (
          <li key={p} className="flex items-start gap-2 text-sm text-zinc-200">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#1D9E75]" />
            {p}
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap gap-2">
        {tags.map((t) => (
          <span key={t} className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-medium text-zinc-300">
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

function OptionKnapp({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-left text-sm text-zinc-800 transition hover:border-[#1D9E75]/40 hover:bg-emerald-50"
      style={{ border: "0.5px solid rgba(0,0,0,0.1)" }}
    >
      {label}
    </button>
  );
}

/* ─── progress bar ───────────────────────────────────────────────────────── */

function FremdriftLinje({ steg }: { steg: number }) {
  return (
    <div className="rounded-2xl bg-white px-6 py-4" style={{ border: "0.5px solid rgba(0,0,0,0.08)" }}>
      <ol className="flex items-stretch gap-0">
        {STEG_LABELS.map((label, i) => {
          const done = i + 1 < steg;
          const active = i + 1 === steg;
          return (
            <li key={label} className="flex flex-1 flex-col items-center gap-1.5 px-1">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-colors ${
                  done
                    ? "bg-[#1D9E75] text-white"
                    : active
                      ? "bg-[#111] text-white"
                      : "bg-zinc-100 text-zinc-400"
                }`}
              >
                {done ? "✓" : i + 1}
              </span>
              <span className={`text-center text-[10px] font-medium leading-tight ${active ? "text-zinc-900" : "text-zinc-400"}`}>
                {label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* ─── page ───────────────────────────────────────────────────────────────── */

export default function PersonifiseringPage() {
  const [steg, setSteg] = useState<1 | 2 | 3 | 4>(1);
  const [pp, setPp] = useState<PersonProfile>({ erfaringer: [], verdier: [], arbeidsstil: [], prestasjoner: [] });
  const [up, setUp] = useState<UserProfile | null>(null);

  // Step 1
  const [s1Tekst, setS1Tekst] = useState("");
  const [s1Submitted, setS1Submitted] = useState(false);
  const [s1Valg, setS1Valg] = useState<number | null>(null);
  const s1InputRef = useRef<HTMLInputElement>(null);

  // Step 2
  const [s2VerdiIdx, setS2VerdiIdx] = useState<number | null>(null);
  const [s2ArbeidsstilIdx, setS2ArbeidsstilIdx] = useState<number | null>(null);

  // Step 3
  const [visIntervju, setVisIntervju] = useState(false);

  // Step 4
  const [stillinger, setStillinger] = useState<ScannerFunn[]>([]);
  const [valgtId, setValgtId] = useState("");
  const [genererer, setGenererer] = useState(false);
  const [soknadsbrev, setSoknadsbrev] = useState("");
  const [kopiert, setKopiert] = useState(false);
  const soknadRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setUp(getStoredUserProfile());

    const raw = typeof window !== "undefined" ? localStorage.getItem("personProfile") : null;
    if (raw) {
      try {
        const stored = JSON.parse(raw) as PersonProfile;
        setPp(stored);
        if (stored.erfaringer.length > 0) {
          setS1Submitted(true);
          setS1Tekst(stored.erfaringer[0]?.svar1 ?? "");
          // Find matching option index
          const idx = S1_OPTIONS.findIndex(o => stored.arbeidsstil.includes(o.arbeidsstil));
          if (idx >= 0) setS1Valg(idx);
        }
        if (stored.verdier.length > 0) {
          const vIdx = S2_VERDI_OPTIONS.findIndex(o => stored.verdier.includes(o.verdi));
          if (vIdx >= 0) setS2VerdiIdx(vIdx);
        }
        if (stored.arbeidsstil.length > 1) {
          const aIdx = S2_ARBEIDSSTIL_OPTIONS.findIndex(o => stored.arbeidsstil.includes(o.arbeidsstil));
          if (aIdx >= 0) setS2ArbeidsstilIdx(aIdx);
        }
        // Auto-advance to first incomplete step
        if (stored.erfaringer.length > 0 && stored.verdier.length > 0) {
          setSteg(3);
        } else if (stored.erfaringer.length > 0) {
          setSteg(2);
        }
      } catch {}
    }

    const scanFunn = loadScannerFunn().filter(
      (f) => f.kategori === "stilling" || f.signalType === "Utlyst stilling",
    );
    setStillinger(scanFunn.length > 0 ? scanFunn : EKSEMPEL_STILLINGER);

    const valgt = typeof window !== "undefined" ? localStorage.getItem("valgtStilling") : null;
    if (valgt) {
      try {
        const parsed = JSON.parse(valgt) as { id?: string };
        if (parsed.id) setValgtId(parsed.id);
      } catch {}
    }
  }, []);

  function updatePp(updated: PersonProfile) {
    setPp(updated);
    if (typeof window !== "undefined") {
      localStorage.setItem("personProfile", JSON.stringify(updated));
    }
    savePersonProfile(updated);
  }

  /* ── Step 1 handlers ── */

  function submitS1() {
    if (!s1Tekst.trim()) return;
    setS1Submitted(true);
  }

  function velgS1(idx: number) {
    setS1Valg(idx);
    const opt = S1_OPTIONS[idx];
    const erfaring = {
      id: newId(),
      tittel: s1Tekst.trim() || "Min sterkeste erfaring",
      svar1: s1Tekst.trim(),
      svar2: opt.insight,
    };
    updatePp({
      ...pp,
      erfaringer: [erfaring],
      arbeidsstil: [opt.arbeidsstil, ...pp.arbeidsstil.filter((a) => a !== opt.arbeidsstil)],
    });
  }

  /* ── Step 2 handlers ── */

  function velgS2Verdi(idx: number) {
    setS2VerdiIdx(idx);
    const verdi = S2_VERDI_OPTIONS[idx].verdi;
    updatePp({ ...pp, verdier: [verdi, ...pp.verdier.filter((v) => v !== verdi)] });
  }

  function velgS2Arbeidsstil(idx: number) {
    setS2ArbeidsstilIdx(idx);
    const as = S2_ARBEIDSSTIL_OPTIONS[idx].arbeidsstil;
    updatePp({ ...pp, arbeidsstil: [...new Set([...pp.arbeidsstil, as])] });
  }

  /* ── Step 4 handlers ── */

  async function genererSoknad() {
    const stilling = stillinger.find((f) => f.id === valgtId);
    if (!stilling || !up) return;
    setGenererer(true);
    setSoknadsbrev("");
    try {
      const res = await fetch("/api/personifisering/generer-soknad", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stilling: { title: stilling.title, company: stilling.company ?? "", description: stilling.beskrivelse ?? "" },
          userProfile: up,
          personProfile: pp,
        }),
      });
      const data = (await res.json()) as { soknadsbrev?: string; error?: string };
      if (data.soknadsbrev) {
        setSoknadsbrev(data.soknadsbrev);
        setTimeout(() => soknadRef.current?.focus(), 100);
      }
    } catch {}
    finally { setGenererer(false); }
  }

  async function kopier() {
    await navigator.clipboard.writeText(soknadsbrev);
    setKopiert(true);
    setTimeout(() => setKopiert(false), 2000);
  }

  const valgtStilling = stillinger.find((f) => f.id === valgtId);
  const ordtelling = soknadsbrev.trim().split(/\s+/).filter(Boolean).length;

  /* ─── render ─────────────────────────────────────────────────────────── */

  return (
    <div className="min-h-screen bg-[#f5f4f0] px-4 pb-24 pt-8 sm:px-6">
      <div className="mx-auto max-w-xl space-y-6">

        {/* Back */}
        <Link href="/" className="inline-flex text-sm font-medium text-zinc-500 hover:text-zinc-800">
          ← Tilbake
        </Link>

        {/* Progress */}
        <FremdriftLinje steg={steg} />

        {/* ── STEG 1 ── */}
        {steg === 1 && (
          <div className="space-y-4">
            <AgentBoble>
              Hei! La oss starte enkelt. Hva er den jobberfaringen du er mest stolt av — uansett hvor liten den virker?
            </AgentBoble>

            {!s1Submitted ? (
              <div className="flex gap-2">
                <input
                  ref={s1InputRef}
                  value={s1Tekst}
                  onChange={(e) => setS1Tekst(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitS1()}
                  placeholder="Skriv fritt her…"
                  autoFocus
                  className="flex-1 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none focus:border-[#1D9E75]/60 focus:ring-2 focus:ring-[#1D9E75]/20"
                />
                <button
                  type="button"
                  onClick={submitS1}
                  disabled={!s1Tekst.trim()}
                  className="rounded-xl bg-[#111] px-4 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-40"
                >
                  Send
                </button>
              </div>
            ) : (
              <>
                <BrukerBoble>{s1Tekst}</BrukerBoble>

                <AgentBoble>
                  Det er sterkt — du tok ansvar under press. Hva tror du det sier om deg som person?
                </AgentBoble>

                {s1Valg === null ? (
                  <div className="grid gap-2">
                    {S1_OPTIONS.map((opt, i) => (
                      <OptionKnapp key={opt.label} label={opt.label} onClick={() => velgS1(i)} />
                    ))}
                  </div>
                ) : (
                  <>
                    <BrukerBoble>{S1_OPTIONS[s1Valg].label}</BrukerBoble>

                    <AiBoks
                      tittel="AI har lært dette om deg"
                      punkter={[
                        S1_OPTIONS[s1Valg].insight,
                        "Sterk på nøyaktighet og detaljarbeid",
                        "Fungerer godt selvstendig",
                      ]}
                      tags={S1_OPTIONS[s1Valg].tags}
                    />

                    <button
                      type="button"
                      onClick={() => setSteg(2)}
                      className="w-full rounded-xl bg-[#111] py-3.5 text-sm font-semibold text-white transition hover:bg-zinc-800"
                    >
                      Neste steg →
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* ── STEG 2 ── */}
        {steg === 2 && (
          <div className="space-y-4">
            <AgentBoble>
              Tenk på den beste jobben du kan se for deg — hva er det som gjør den perfekt?
            </AgentBoble>

            {s2VerdiIdx === null ? (
              <div className="grid gap-2">
                {S2_VERDI_OPTIONS.map((opt, i) => (
                  <OptionKnapp key={opt.label} label={opt.label} onClick={() => velgS2Verdi(i)} />
                ))}
              </div>
            ) : (
              <>
                <BrukerBoble>{S2_VERDI_OPTIONS[s2VerdiIdx].label}</BrukerBoble>

                <AgentBoble>
                  Du er ny på jobb og ser at en rutine er ineffektiv. Hva gjør du?
                </AgentBoble>

                {s2ArbeidsstilIdx === null ? (
                  <div className="grid gap-2">
                    {S2_ARBEIDSSTIL_OPTIONS.map((opt, i) => (
                      <OptionKnapp key={opt.label} label={opt.label} onClick={() => velgS2Arbeidsstil(i)} />
                    ))}
                  </div>
                ) : (
                  <>
                    <BrukerBoble>{S2_ARBEIDSSTIL_OPTIONS[s2ArbeidsstilIdx].label}</BrukerBoble>

                    <AiBoks
                      tittel="Din verdiprofil og arbeidsstil"
                      punkter={[
                        `Drevet av ${S2_VERDI_OPTIONS[s2VerdiIdx].verdi} — passer best i ${S2_VERDI_OPTIONS[s2VerdiIdx].selskaper.toLowerCase()}`,
                        S2_ARBEIDSSTIL_OPTIONS[s2ArbeidsstilIdx].arbeidsstil,
                        `Selskaper som passer: ${S2_VERDI_OPTIONS[s2VerdiIdx].selskaper}`,
                      ]}
                      tags={[
                        S2_VERDI_OPTIONS[s2VerdiIdx].verdi,
                        S2_ARBEIDSSTIL_OPTIONS[s2ArbeidsstilIdx].arbeidsstil,
                      ]}
                    />

                    <button
                      type="button"
                      onClick={() => setSteg(3)}
                      className="w-full rounded-xl bg-[#111] py-3.5 text-sm font-semibold text-white transition hover:bg-zinc-800"
                    >
                      Neste steg →
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* ── STEG 3 ── */}
        {steg === 3 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-medium text-zinc-950" style={{ letterSpacing: "-0.02em" }}>
                Forbered deg til intervjuet
              </h2>
              <p className="mt-1 text-sm text-zinc-500">Fire øvelser som gjør deg skarpere.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {/* Kort 1 — Intervjuspørsmål */}
              <div className="rounded-2xl bg-white p-5" style={{ border: "0.5px solid rgba(0,0,0,0.08)" }}>
                <svg className="h-6 w-6 text-[#1D9E75]" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 9.75a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 0 1 .778-.332 48.294 48.294 0 0 0 5.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
                </svg>
                <h3 className="mt-3 text-base font-medium text-zinc-950">Intervjuspørsmål</h3>
                <p className="mt-1 text-sm text-zinc-500">10 vanlige spørsmål for din bransje. Med eksempelsvar tilpasset din profil.</p>
                <button
                  type="button"
                  onClick={() => setVisIntervju((v) => !v)}
                  className="mt-4 text-sm font-medium text-[#1D9E75] hover:text-emerald-600"
                >
                  {visIntervju ? "Skjul ↑" : "Øv nå →"}
                </button>
                {visIntervju && (
                  <div className="mt-4 rounded-xl bg-zinc-50 p-4" style={{ border: "0.5px solid rgba(0,0,0,0.06)" }}>
                    <p className="text-sm font-medium text-zinc-900">
                      &quot;Fortell om en gang du oppdaget en feil andre hadde oversett.&quot;
                    </p>
                    <p className="mt-2 text-xs text-zinc-500">
                      💡 Tips: Bruk STAR-metoden — Situasjon, Oppgave, Handling, Resultat.
                    </p>
                  </div>
                )}
              </div>

              {/* Kort 2 — Evnetester */}
              <div className="rounded-2xl bg-white p-5" style={{ border: "0.5px solid rgba(0,0,0,0.08)" }}>
                <svg className="h-6 w-6 text-[#1D9E75]" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0 1 12 15a9.065 9.065 0 0 1-6.23-.693L5 14.5m14.8.8 1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0 1 12 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
                </svg>
                <h3 className="mt-3 text-base font-medium text-zinc-950">Evnetester</h3>
                <p className="mt-1 text-sm text-zinc-500">SHL og Cut-e brukes av mange norske selskaper. Øv på numerisk resonnement.</p>
                <a
                  href="https://www.shldirect.com/en/practice-tests"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-block text-sm font-medium text-[#1D9E75] hover:text-emerald-600"
                >
                  Øv nå →
                </a>
              </div>

              {/* Kort 3 — Lønn */}
              <div className="rounded-2xl bg-white p-5" style={{ border: "0.5px solid rgba(0,0,0,0.08)" }}>
                <svg className="h-6 w-6 text-[#1D9E75]" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
                <h3 className="mt-3 text-base font-medium text-zinc-950">Lønn</h3>
                <p className="mt-1 text-sm text-zinc-500">{lønnstekst(up?.bransje ?? "")}</p>
                <p className="mt-2 text-xs text-zinc-400">Tips: Unngå å gi et tall først — la arbeidsgiver foreslå.</p>
              </div>

              {/* Kort 4 — Personlighetstester */}
              <div className="rounded-2xl bg-white p-5" style={{ border: "0.5px solid rgba(0,0,0,0.08)" }}>
                <svg className="h-6 w-6 text-[#1D9E75]" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
                </svg>
                <h3 className="mt-3 text-base font-medium text-zinc-950">Personlighetstester</h3>
                <p className="mt-1 text-sm text-zinc-500">MBTI, Hogan og Predictive Index brukes av norske selskaper. Hva de egentlig måler — og hvordan du forbereder deg.</p>
                <p className="mt-2 text-xs text-zinc-400">Vær konsekvent og autentisk — testene oppdager inkonsistens.</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSteg(4)}
              className="w-full rounded-xl bg-[#111] py-3.5 text-sm font-semibold text-white transition hover:bg-zinc-800"
            >
              Generer søknad →
            </button>
          </div>
        )}

        {/* ── STEG 4 ── */}
        {steg === 4 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-medium text-zinc-950" style={{ letterSpacing: "-0.02em" }}>
                Generer søknadsbrev
              </h2>
              <p className="mt-1 text-sm text-zinc-500">
                Velg en stilling og få et brev skrevet som deg.
              </p>
            </div>

            {/* Brukes i søknaden */}
            {(pp.verdier.length > 0 || pp.arbeidsstil.length > 0) && (
              <div className="rounded-xl bg-zinc-50 px-4 py-3" style={{ border: "0.5px solid rgba(0,0,0,0.08)" }}>
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Brukes i søknaden din</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[...pp.verdier, ...pp.arbeidsstil].map((t) => (
                    <span key={t} className="rounded-full bg-white px-3 py-1 text-xs font-medium text-zinc-700" style={{ border: "0.5px solid rgba(0,0,0,0.1)" }}>
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Stilling-velger */}
            <div className="space-y-3">
              <select
                value={valgtId}
                onChange={(e) => setValgtId(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none focus:border-[#1D9E75]/60 focus:ring-2 focus:ring-[#1D9E75]/20"
              >
                <option value="">Velg en stilling…</option>
                {stillinger.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.title}{f.company ? ` — ${f.company}` : ""}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={genererSoknad}
                disabled={!valgtId || genererer}
                className="w-full rounded-xl bg-[#1D9E75] py-3.5 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-40"
              >
                Generer søknadsbrev →
              </button>
            </div>

            {/* Laste-indikator */}
            {genererer && (
              <div className="flex items-center gap-3 py-2 text-sm text-zinc-600">
                <span className="flex gap-1">
                  {[0, 150, 300].map((delay) => (
                    <span
                      key={delay}
                      className="h-2 w-2 animate-bounce rounded-full bg-[#1D9E75]"
                      style={{ animationDelay: `${delay}ms` }}
                    />
                  ))}
                </span>
                Skriver søknaden din...
              </div>
            )}

            {/* Resultat */}
            {soknadsbrev && (
              <div className="rounded-2xl bg-white" style={{ border: "0.5px solid rgba(0,0,0,0.08)" }}>
                {/* Header */}
                <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
                  <div>
                    <p className="text-sm font-semibold text-zinc-950">
                      {valgtStilling?.title ?? "Søknadsbrev"}
                    </p>
                    {valgtStilling?.company && (
                      <p className="text-xs text-zinc-400">{valgtStilling.company}</p>
                    )}
                  </div>
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700">
                    Personifisert
                  </span>
                </div>

                {/* Textarea */}
                <textarea
                  ref={soknadRef}
                  value={soknadsbrev}
                  onChange={(e) => setSoknadsbrev(e.target.value)}
                  rows={14}
                  className="w-full resize-y rounded-none bg-transparent px-5 py-4 text-sm leading-relaxed text-zinc-800 outline-none"
                />

                {/* Footer */}
                <div className="flex items-center justify-between border-t border-zinc-100 px-5 py-3">
                  <p className="text-xs text-zinc-400">{ordtelling} ord</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => soknadRef.current?.focus()}
                      className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-50"
                    >
                      Rediger
                    </button>
                    <button
                      type="button"
                      onClick={kopier}
                      className="rounded-lg bg-[#111] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-zinc-800"
                    >
                      {kopiert ? "✓ Kopiert" : "Kopier"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Hva som er brukt */}
            {soknadsbrev && (pp.prestasjoner.length > 0 || pp.verdier.length > 0) && (
              <div className="rounded-xl bg-zinc-50 px-4 py-4" style={{ border: "0.5px solid rgba(0,0,0,0.06)" }}>
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Hva som er brukt fra din profil
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {pp.verdier.map((v) => (
                    <span key={v} className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">{v}</span>
                  ))}
                  {pp.arbeidsstil.map((a) => (
                    <span key={a} className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">{a}</span>
                  ))}
                  {pp.prestasjoner.map((p) => (
                    <span key={p.id} className="rounded-full bg-zinc-200 px-3 py-1 text-xs font-medium text-zinc-700">
                      {p.tekst.slice(0, 40)}{p.tekst.length > 40 ? "…" : ""}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => setSteg(3)}
              className="text-sm text-zinc-400 transition hover:text-zinc-700"
            >
              ← Tilbake til forberedelse
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
