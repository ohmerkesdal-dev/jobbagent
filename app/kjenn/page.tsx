"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { savePersonProfile, getStoredUserProfile } from "@/lib/client-storage";
import { KarriereCoach } from "@/components/KarriereCoach";
import { loadScannerFunn } from "@/lib/scanner-storage";
import type { PersonProfile, UserProfile } from "@/lib/types";
import type { ScannerFunn } from "@/lib/scanner-types";

const KARAKTERER_KEY = "jobbagent_karakterer";
const CV_KEY = "jobbagent_cv_navn";

const S1_OPTIONS = [
  { label: "At jeg er pålitelig og tar initiativ", arbeidsstil: "Pålitelig og initiativrik", tags: ["Pålitelig", "Initiativrik", "Ansvarlig"], insight: "Tar ansvar uten å bli bedt — fungerer godt selvstendig og under press" },
  { label: "At jeg jobber godt alene under press", arbeidsstil: "Selvstendig under press", tags: ["Selvstendig", "Rolig under press", "Effektiv"], insight: "Leverer konsistent kvalitet — spesielt verdifull i tidspressede situasjoner" },
  { label: "At jeg er nøyaktig og detaljorientert", arbeidsstil: "Nøyaktig og detaljorientert", tags: ["Nøyaktig", "Detaljorientert", "Kvalitetsbevisst"], insight: "Fanger feil tidlig og sikrer høy kvalitet — kritisk i roller med ansvar" },
  { label: "At jeg er god til å se helheten", arbeidsstil: "Strategisk og helhetsorientert", tags: ["Strategisk", "Helhetsorientert", "Løsningsfokusert"], insight: "Kobler detaljer til større bilde — verdifull i komplekse og tverrfaglige prosjekter" },
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

function newId() {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `p-${Date.now()}`;
}

export default function KjennPage() {
  const [pp, setPp] = useState<PersonProfile>({ erfaringer: [], verdier: [], arbeidsstil: [], prestasjoner: [] });
  const [up] = useState(() => getStoredUserProfile());
  const [steg, setSteg] = useState<1 | 2 | 3 | 4>(1);
  const [utdanning, setUtdanning] = useState<string>(up?.utdanning ?? "");
  const [sertifiseringer, setSertifiseringer] = useState<string[]>(up?.sertifiseringer ?? []);
  const [sertInput, setSertInput] = useState("");
  const [ferdigheter, setFerdigheter] = useState<string[]>(up?.ferdigheter ?? []);
  const [ferdInput, setFerdInput] = useState("");
  const [geografi, setGeografi] = useState<string>(up?.geografi ?? "");
  const [s1Tekst, setS1Tekst] = useState("");
  const [s1Submitted, setS1Submitted] = useState(false);
  const [s1Valg, setS1Valg] = useState<number | null>(null);
  const [s2VerdiIdx, setS2VerdiIdx] = useState<number | null>(null);
  const [s2ArbeidsstilIdx, setS2ArbeidsstilIdx] = useState<number | null>(null);
  const [stillinger, setStillinger] = useState<ScannerFunn[]>([]);
  const [valgtId, setValgtId] = useState("");
  const [genererer, setGenererer] = useState(false);
  const [soknadsbrev, setSoknadsbrev] = useState("");
  const [kopiert, setKopiert] = useState(false);
  const [karaktererTekst, setKaraktererTekst] = useState("");
  const [visKarakterer, setVisKarakterer] = useState(false);
  const [karaktererLagret, setKaraktererLagret] = useState(false);
  const [cvFilnavn, setCvFilnavn] = useState<string | null>(null);
  const [cvLaster, setCvLaster] = useState(false);
  const [cvFeil, setCvFeil] = useState<string | null>(null);
  const cvInputRef = useRef<HTMLInputElement>(null);
  const soknadRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const raw = typeof window !== "undefined" ? localStorage.getItem("personProfile") : null;
    if (raw) {
      try {
        const stored = JSON.parse(raw) as PersonProfile;
        setPp(stored);
        if (stored.erfaringer.length > 0) {
          setS1Submitted(true);
          setS1Tekst(stored.erfaringer[0]?.svar1 ?? "");
          const idx = S1_OPTIONS.findIndex(o => stored.arbeidsstil.includes(o.arbeidsstil));
          if (idx >= 0) setS1Valg(idx);
        }
        if (stored.verdier.length > 0) {
          const vIdx = S2_VERDI_OPTIONS.findIndex(o => stored.verdier.includes(o.verdi));
          if (vIdx >= 0) setS2VerdiIdx(vIdx);
        }
        if (stored.erfaringer.length > 0 && stored.verdier.length > 0) setSteg(3);
        else if (stored.erfaringer.length > 0) setSteg(2);
      } catch {}
    }
    const scanFunn = loadScannerFunn().filter(f => f.kategori === "stilling" || f.signalType === "Utlyst stilling");
    setStillinger(scanFunn);
    const valgt = typeof window !== "undefined" ? localStorage.getItem("valgtStilling") : null;
    if (valgt) {
      try { const p = JSON.parse(valgt) as { id?: string }; if (p.id) setValgtId(p.id); } catch {}
    }
    // Load karakterer
    const kar = typeof window !== "undefined" ? localStorage.getItem(KARAKTERER_KEY) : null;
    if (kar) setKaraktererTekst(kar);
    // Load CV navn
    const cvNavn = typeof window !== "undefined" ? localStorage.getItem(CV_KEY) : null;
    if (cvNavn) setCvFilnavn(cvNavn);
  }, []);

  function updatePp(updated: PersonProfile) {
    setPp(updated);
    if (typeof window !== "undefined") localStorage.setItem("personProfile", JSON.stringify(updated));
    savePersonProfile(updated);
  }

  function velgS1(idx: number) {
    setS1Valg(idx);
    updatePp({ ...pp, erfaringer: [{ id: newId(), tittel: s1Tekst || "Min erfaring", svar1: s1Tekst, svar2: S1_OPTIONS[idx].insight }], arbeidsstil: [S1_OPTIONS[idx].arbeidsstil, ...pp.arbeidsstil.filter(a => a !== S1_OPTIONS[idx].arbeidsstil)] });
  }

  function velgS2Verdi(idx: number) {
    setS2VerdiIdx(idx);
    updatePp({ ...pp, verdier: [S2_VERDI_OPTIONS[idx].verdi, ...pp.verdier.filter(v => v !== S2_VERDI_OPTIONS[idx].verdi)] });
  }

  function velgS2Arbeidsstil(idx: number) {
    setS2ArbeidsstilIdx(idx);
    updatePp({ ...pp, arbeidsstil: [...new Set([...pp.arbeidsstil, S2_ARBEIDSSTIL_OPTIONS[idx].arbeidsstil])] });
  }

  async function genererSoknad() {
    const stilling = stillinger.find(f => f.id === valgtId);
    if (!stilling || !up) return;
    setGenererer(true); setSoknadsbrev("");
    try {
      const res = await fetch("/api/personifisering/generer-soknad", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stilling: { title: stilling.title, company: stilling.company ?? "", description: stilling.beskrivelse ?? "" }, userProfile: up, personProfile: pp }) });
      const data = (await res.json()) as { soknadsbrev?: string };
      if (data.soknadsbrev) { setSoknadsbrev(data.soknadsbrev); setTimeout(() => soknadRef.current?.focus(), 100); }
    } catch {} finally { setGenererer(false); }
  }

  function lagreKarakterer() {
    if (typeof window !== "undefined") localStorage.setItem(KARAKTERER_KEY, karaktererTekst);
    setKaraktererLagret(true);
    setVisKarakterer(false);
    setTimeout(() => setKaraktererLagret(false), 3000);
  }

  async function lastOppCv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCvLaster(true);
    setCvFeil(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/cv/parse", { method: "POST", body: fd });
      const data = (await res.json()) as {
        profile?: {
          navn?: string; soker?: string; bransje?: string;
          bio?: string; erfaring?: string; ferdigheter?: string[]; karrieremaal?: string;
        };
        error?: string;
      };
      if (!res.ok || data.error) { setCvFeil(data.error ?? "Kunne ikke parse CV"); return; }
      if (data.profile) {
        const current = getStoredUserProfile();
        const updated: UserProfile = {
          navn: data.profile.navn ?? current?.navn ?? "",
          soker: data.profile.soker ?? current?.soker ?? "",
          bransje: data.profile.bransje ?? current?.bransje ?? "",
          geografi: current?.geografi ?? "",
          bio: data.profile.bio ?? current?.bio ?? "",
          erfaring: (data.profile.erfaring as UserProfile["erfaring"]) ?? current?.erfaring ?? "1-3",
          ferdigheter: data.profile.ferdigheter ?? current?.ferdigheter ?? [],
          karrieremaal: data.profile.karrieremaal ?? current?.karrieremaal ?? "Annet",
          cvText: undefined,
          selskaper: current?.selskaper ?? [],
        };
        if (typeof window !== "undefined") {
          localStorage.setItem("userProfile", JSON.stringify(updated));
        }
        setCvFilnavn(file.name);
        localStorage.setItem(CV_KEY, file.name);
      }
    } catch (err) {
      setCvFeil(err instanceof Error ? err.message : "Ukjent feil");
    } finally {
      setCvLaster(false);
      if (cvInputRef.current) cvInputRef.current.value = "";
    }
  }

  const ordtelling = soknadsbrev.trim().split(/\s+/).filter(Boolean).length;
  const profil = up;

  return (
    <div className="min-h-screen bg-white pb-24 pt-8">
      <div className="mx-auto grid max-w-5xl gap-6 px-4 sm:px-6 lg:grid-cols-[1fr_320px]">

        {/* Venstre: Chat-flyt */}
        <div className="space-y-5">
          <div>
            <h1 className="text-2xl font-medium text-zinc-950" style={{ letterSpacing: "-0.02em" }}>Kjenn deg selv</h1>
            <p className="mt-1 text-sm text-zinc-500">Bygg en profil som gjør søknadene dine mer personlige.</p>
          </div>

          {/* Coach — ufullstendig profil */}
          {pp.erfaringer.length === 0 && pp.verdier.length === 0 && pp.arbeidsstil.length === 0 && (
            <KarriereCoach kontekst="profil-ufullstendig" />
          )}

          {/* Steg-indikator */}
          <div className="flex gap-1">
            {[1,2,3,4].map(s => (
              <button key={s} type="button" onClick={() => setSteg(s as 1|2|3|4)}
                className={`h-1.5 flex-1 rounded-full transition-colors ${steg >= s ? "bg-[#1D9E75]" : "bg-zinc-200"}`} />
            ))}
          </div>

          {/* Steg 1 */}
          {steg === 1 && (
            <div className="space-y-4">
              <div className="flex gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1D9E75] text-xs font-bold text-white">JA</span>
                <div className="rounded-2xl rounded-tl-sm bg-white px-4 py-3 text-sm text-zinc-800" style={{ border: "0.5px solid rgba(0,0,0,0.08)" }}>
                  Hei! Hva er den jobberfaringen du er mest stolt av — uansett hvor liten den virker?
                </div>
              </div>
              {!s1Submitted ? (
                <div className="flex gap-2">
                  <input value={s1Tekst} onChange={e => setS1Tekst(e.target.value)} onKeyDown={e => e.key === "Enter" && s1Tekst.trim() && setS1Submitted(true)} placeholder="Skriv fritt her…" autoFocus className="flex-1 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-[#1D9E75]/60 focus:ring-2 focus:ring-[#1D9E75]/20" />
                  <button type="button" onClick={() => s1Tekst.trim() && setS1Submitted(true)} disabled={!s1Tekst.trim()} className="rounded-xl bg-[#111] px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">Send</button>
                </div>
              ) : (
                <>
                  <div className="flex justify-end"><div className="rounded-2xl rounded-tr-sm bg-zinc-900 px-4 py-3 text-sm text-zinc-100">{s1Tekst}</div></div>
                  <div className="flex gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1D9E75] text-xs font-bold text-white">JA</span>
                    <div className="rounded-2xl rounded-tl-sm bg-white px-4 py-3 text-sm text-zinc-800" style={{ border: "0.5px solid rgba(0,0,0,0.08)" }}>Hva tror du det sier om deg som person?</div>
                  </div>
                  {s1Valg === null ? (
                    <div className="grid gap-2">
                      {S1_OPTIONS.map((o, i) => (
                        <button key={o.label} type="button" onClick={() => velgS1(i)} className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-left text-sm text-zinc-800 hover:border-[#1D9E75]/40 hover:bg-emerald-50" style={{ border: "0.5px solid rgba(0,0,0,0.1)" }}>{o.label}</button>
                      ))}
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-end"><div className="rounded-2xl rounded-tr-sm bg-zinc-900 px-4 py-3 text-sm text-zinc-100">{S1_OPTIONS[s1Valg].label}</div></div>
                      <div className="rounded-2xl bg-[#111] px-5 py-4 text-[#f5f4f0]">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">AI har lært dette om deg</p>
                        <p className="mt-2 text-sm">{S1_OPTIONS[s1Valg].insight}</p>
                        <div className="mt-3 flex flex-wrap gap-2">{S1_OPTIONS[s1Valg].tags.map(t => <span key={t} className="rounded-full bg-white/10 px-3 py-1 text-[11px] text-zinc-300">{t}</span>)}</div>
                      </div>
                      <button type="button" onClick={() => setSteg(2)} className="w-full rounded-xl bg-[#111] py-3 text-sm font-semibold text-white hover:bg-zinc-800">Neste →</button>
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {/* Steg 2 */}
          {steg === 2 && (
            <div className="space-y-4">
              <div className="flex gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1D9E75] text-xs font-bold text-white">JA</span>
                <div className="rounded-2xl rounded-tl-sm bg-white px-4 py-3 text-sm text-zinc-800" style={{ border: "0.5px solid rgba(0,0,0,0.08)" }}>Hva gjør den perfekte jobben perfekt for deg?</div>
              </div>
              {s2VerdiIdx === null ? (
                <div className="grid gap-2">{S2_VERDI_OPTIONS.map((o, i) => <button key={o.label} type="button" onClick={() => velgS2Verdi(i)} className="rounded-xl border bg-white px-4 py-3 text-left text-sm text-zinc-800 hover:bg-emerald-50" style={{ border: "0.5px solid rgba(0,0,0,0.1)" }}>{o.label}</button>)}</div>
              ) : (
                <>
                  <div className="flex justify-end"><div className="rounded-2xl rounded-tr-sm bg-zinc-900 px-4 py-3 text-sm text-zinc-100">{S2_VERDI_OPTIONS[s2VerdiIdx].label}</div></div>
                  <div className="flex gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1D9E75] text-xs font-bold text-white">JA</span>
                    <div className="rounded-2xl rounded-tl-sm bg-white px-4 py-3 text-sm text-zinc-800" style={{ border: "0.5px solid rgba(0,0,0,0.08)" }}>Du ser en ineffektiv rutine på jobb. Hva gjør du?</div>
                  </div>
                  {s2ArbeidsstilIdx === null ? (
                    <div className="grid gap-2">{S2_ARBEIDSSTIL_OPTIONS.map((o, i) => <button key={o.label} type="button" onClick={() => velgS2Arbeidsstil(i)} className="rounded-xl border bg-white px-4 py-3 text-left text-sm text-zinc-800 hover:bg-emerald-50" style={{ border: "0.5px solid rgba(0,0,0,0.1)" }}>{o.label}</button>)}</div>
                  ) : (
                    <>
                      <div className="flex justify-end"><div className="rounded-2xl rounded-tr-sm bg-zinc-900 px-4 py-3 text-sm text-zinc-100">{S2_ARBEIDSSTIL_OPTIONS[s2ArbeidsstilIdx].label}</div></div>
                      <div className="rounded-2xl bg-[#111] px-5 py-4 text-[#f5f4f0]">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Din verdiprofil</p>
                        <ul className="mt-2 space-y-1 text-sm text-zinc-200">
                          <li>• Drevet av {S2_VERDI_OPTIONS[s2VerdiIdx].verdi}</li>
                          <li>• {S2_ARBEIDSSTIL_OPTIONS[s2ArbeidsstilIdx].arbeidsstil}</li>
                          <li>• Passer best: {S2_VERDI_OPTIONS[s2VerdiIdx].selskaper}</li>
                        </ul>
                      </div>
                      <button type="button" onClick={() => setSteg(3)} className="w-full rounded-xl bg-[#111] py-3 text-sm font-semibold text-white hover:bg-zinc-800">Neste →</button>
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {/* Steg 3 — Forberedelse */}
          {steg === 3 && (
            <div className="space-y-4">
              <h2 className="text-lg font-medium text-zinc-950">Forberedelse</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  { title: "Intervjuspørsmål", desc: "10 vanlige spørsmål for din bransje. Med eksempelsvar tilpasset din profil.", icon: "ti-message-question" },
                  { title: "Lønn", desc: up?.bransje?.includes("regnskap") ? "Nyutdannet Oslo: 480–560 000 kr/år. Autorisert: 580–720 000 kr/år." : "Sjekk SSB Lønnsstatistikk for din bransje.", icon: "ti-coin" },
                  { title: "Evnetester", desc: "SHL og Cut-e brukes av mange norske selskaper.", icon: "ti-brain", href: "https://www.shldirect.com/en/practice-tests" },
                  { title: "Personlighetstester", desc: "MBTI, Hogan og Predictive Index — hva de måler og hvordan du forbereder deg.", icon: "ti-users" },
                ].map(c => (
                  <div key={c.title} className="rounded-2xl bg-white p-5" style={{ border: "0.5px solid rgba(0,0,0,0.08)" }}>
                    <i className={`ti ${c.icon} text-xl text-[#1D9E75]`} />
                    <h3 className="mt-2 text-sm font-semibold text-zinc-950">{c.title}</h3>
                    <p className="mt-1 text-xs text-zinc-500">{c.desc}</p>
                    {c.href && <a href={c.href} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-xs font-medium text-[#1D9E75]">Øv nå →</a>}
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => setSteg(4)} className="w-full rounded-xl bg-[#111] py-3 text-sm font-semibold text-white hover:bg-zinc-800">Generer søknad →</button>
            </div>
          )}

          {/* Steg 4 — Generer søknad */}
          {steg === 4 && (
            <div className="space-y-4">
              <h2 className="text-lg font-medium text-zinc-950">Generer søknad</h2>
              <select value={valgtId} onChange={e => setValgtId(e.target.value)} className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-[#1D9E75]/60">
                <option value="">Velg en stilling…</option>
                {stillinger.map(f => <option key={f.id} value={f.id}>{f.title}{f.company ? ` — ${f.company}` : ""}</option>)}
              </select>
              <button type="button" onClick={genererSoknad} disabled={!valgtId || genererer} className="w-full rounded-xl bg-[#1D9E75] py-3.5 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-40">
                {genererer ? "Skriver søknaden din…" : "Generer søknadsbrev →"}
              </button>
              {genererer && (
                <div className="flex items-center gap-3 text-sm text-zinc-500">
                  {[0,150,300].map(d => <span key={d} className="h-2 w-2 animate-bounce rounded-full bg-[#1D9E75]" style={{ animationDelay: `${d}ms` }} />)}
                  Skriver søknaden din...
                </div>
              )}
              {soknadsbrev && (
                <div className="rounded-2xl bg-white" style={{ border: "0.5px solid rgba(0,0,0,0.08)" }}>
                  <div className="border-b border-zinc-100 px-5 py-4">
                    <p className="text-sm font-semibold text-zinc-950">{stillinger.find(f => f.id === valgtId)?.title}</p>
                    <span className="mt-1 inline-block rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">Personifisert</span>
                  </div>
                  <textarea ref={soknadRef} value={soknadsbrev} onChange={e => setSoknadsbrev(e.target.value)} rows={12} className="w-full resize-y bg-transparent px-5 py-4 text-sm leading-relaxed text-zinc-800 outline-none" />
                  <div className="flex items-center justify-between border-t border-zinc-100 px-5 py-3">
                    <p className="text-xs text-zinc-400">{ordtelling} ord</p>
                    <button type="button" onClick={async () => { await navigator.clipboard.writeText(soknadsbrev); setKopiert(true); setTimeout(() => setKopiert(false), 2000); }} className="rounded-lg bg-[#111] px-3 py-1.5 text-xs font-semibold text-white">
                      {kopiert ? "✓ Kopiert" : "Kopier"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Høyre: Profil-kort */}
        <div className="space-y-4">
          <div className="rounded-2xl bg-white p-5 shadow-sm" style={{ border: "0.5px solid rgba(0,0,0,0.08)" }}>
            {/* Avatar */}
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#111] text-lg font-bold text-white">
                {profil?.navn?.[0]?.toUpperCase() ?? "?"}
              </div>
              <div>
                <p className="font-semibold text-zinc-950">{profil?.navn ?? "Ukjent"}</p>
                <p className="text-xs text-zinc-500">{profil?.soker ?? "Ingen profil"}</p>
              </div>
            </div>

            {/* Match-score */}
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span>Profil-score</span>
                <span className="font-semibold text-[#1D9E75]">{Math.min(100, (pp.erfaringer.length > 0 ? 25 : 0) + (pp.verdier.length > 0 ? 25 : 0) + (pp.arbeidsstil.length > 0 ? 25 : 0) + (pp.prestasjoner.length > 0 ? 25 : 0))}%</span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
                <div className="h-full rounded-full bg-[#1D9E75] transition-all" style={{ width: `${Math.min(100, (pp.erfaringer.length > 0 ? 25 : 0) + (pp.verdier.length > 0 ? 25 : 0) + (pp.arbeidsstil.length > 0 ? 25 : 0) + (pp.prestasjoner.length > 0 ? 25 : 0))}%` }} />
              </div>
            </div>

            {/* Tags */}
            {(pp.verdier.length > 0 || pp.arbeidsstil.length > 0) && (
              <div className="mt-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">AI-lærte tags</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {[...pp.verdier, ...pp.arbeidsstil].slice(0, 6).map(t => (
                    <span key={t} className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700">{t}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Utdanning og sertifiseringer */}
            <div className="mt-4 border-t border-zinc-100 pt-4">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Utdanning</p>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {["Videregående","Fagbrev","Bachelor","Master","PhD","Annet"].map(u => (
                  <button key={u} type="button"
                    onClick={() => {
                      const ny = utdanning === u ? "" : u;
                      setUtdanning(ny);
                      const p = getStoredUserProfile();
                      if (p) { p.utdanning = ny || undefined; localStorage.setItem("userProfile", JSON.stringify(p)); }
                    }}
                    className="rounded-full px-2.5 py-1 text-[11px] font-medium transition"
                    style={{ border: "0.5px solid", borderColor: utdanning === u ? "#111" : "rgba(0,0,0,0.12)", background: utdanning === u ? "#111" : "#fff", color: utdanning === u ? "#fff" : "#3F3F46" }}>
                    {u}
                  </button>
                ))}
              </div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Sertifiseringer</p>
              <input
                value={sertInput}
                onChange={e => setSertInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && sertInput.trim()) {
                    const ny = [...sertifiseringer, sertInput.trim()];
                    setSertifiseringer(ny);
                    setSertInput("");
                    const p = getStoredUserProfile();
                    if (p) { p.sertifiseringer = ny; localStorage.setItem("userProfile", JSON.stringify(p)); }
                    e.preventDefault();
                  }
                }}
                placeholder="Trykk Enter for å legge til…"
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs outline-none focus:border-[#1D9E75]/60"
              />
              {sertifiseringer.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {sertifiseringer.map((s, i) => (
                    <span key={i} className="flex items-center gap-1 rounded-full bg-zinc-900 px-2.5 py-0.5 text-[11px] text-white">
                      {s}
                      <button type="button" onClick={() => {
                        const ny = sertifiseringer.filter((_, j) => j !== i);
                        setSertifiseringer(ny);
                        const p = getStoredUserProfile();
                        if (p) { p.sertifiseringer = ny; localStorage.setItem("userProfile", JSON.stringify(p)); }
                      }} className="ml-0.5 text-zinc-400 hover:text-white">×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Geografi og ferdigheter */}
            <div className="mt-4 border-t border-zinc-100 pt-4 space-y-3">
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Geografi</p>
                <input
                  value={geografi}
                  onChange={e => {
                    setGeografi(e.target.value);
                    const p = getStoredUserProfile();
                    if (p) { p.geografi = e.target.value; localStorage.setItem("userProfile", JSON.stringify(p)); }
                  }}
                  placeholder="F.eks: Oslo"
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs outline-none focus:border-[#1D9E75]/60"
                />
              </div>
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Ferdigheter</p>
                <input
                  value={ferdInput}
                  onChange={e => setFerdInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && ferdInput.trim()) {
                      const ny = [...ferdigheter, ferdInput.trim()];
                      setFerdigheter(ny);
                      setFerdInput("");
                      const p = getStoredUserProfile();
                      if (p) { p.ferdigheter = ny; localStorage.setItem("userProfile", JSON.stringify(p)); }
                      e.preventDefault();
                    }
                  }}
                  placeholder="Trykk Enter for å legge til…"
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs outline-none focus:border-[#1D9E75]/60"
                />
                {ferdigheter.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {ferdigheter.map((f, i) => (
                      <span key={i} className="flex items-center gap-1 rounded-full bg-zinc-900 px-2.5 py-0.5 text-[11px] text-white">
                        {f}
                        <button type="button" onClick={() => {
                          const ny = ferdigheter.filter((_, j) => j !== i);
                          setFerdigheter(ny);
                          const p = getStoredUserProfile();
                          if (p) { p.ferdigheter = ny; localStorage.setItem("userProfile", JSON.stringify(p)); }
                        }} className="ml-0.5 text-zinc-400 hover:text-white">×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Prestasjoner */}
            <div className="mt-4 flex items-center justify-between text-xs text-zinc-500">
              <span>{pp.prestasjoner.length} prestasjoner logget</span>
              <span>{pp.erfaringer.length} erfaringer</span>
            </div>
          </div>

          {/* Last opp CV */}
          <div className="rounded-2xl bg-white p-4" style={{ border: "0.5px solid rgba(0,0,0,0.08)" }}>
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">CV og dokumenter</p>

            <input
              ref={cvInputRef}
              type="file"
              accept=".pdf,.txt,.md,.docx"
              className="hidden"
              onChange={lastOppCv}
            />
            <button
              type="button"
              onClick={() => cvInputRef.current?.click()}
              disabled={cvLaster}
              className="mt-3 w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
            >
              <i className="ti ti-upload mr-1.5" />
              {cvLaster ? "Analyserer CV…" : "Last opp CV (PDF / TXT)"}
            </button>

            {cvFilnavn && !cvLaster && (
              <p className="mt-2 text-center text-xs text-emerald-600">✓ {cvFilnavn} — CV analysert</p>
            )}
            {cvFeil && (
              <p className="mt-2 text-center text-xs text-red-600">{cvFeil}</p>
            )}

            <button
              type="button"
              onClick={() => setVisKarakterer(v => !v)}
              className="mt-2 w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
            >
              <i className="ti ti-file-text mr-1.5" />
              {karaktererLagret ? "✓ Karakterutskrift lagret" : "Lim inn karakterutskrift"}
            </button>

            {visKarakterer && (
              <div className="mt-3 space-y-2">
                <textarea
                  value={karaktererTekst}
                  onChange={e => setKaraktererTekst(e.target.value)}
                  rows={5}
                  placeholder="Lim inn karakterutskrift fra Vitnemålsportalen her…"
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs outline-none focus:border-[#1D9E75]/60"
                />
                <button
                  type="button"
                  onClick={lagreKarakterer}
                  disabled={!karaktererTekst.trim()}
                  className="w-full rounded-xl bg-[#111] py-2 text-xs font-semibold text-white disabled:opacity-40"
                >
                  Lagre karakterutskrift
                </button>
              </div>
            )}
          </div>

          <Link href="/finn" className="block text-center text-xs text-zinc-400 hover:text-zinc-700">← Tilbake til feed</Link>
        </div>
      </div>
    </div>
  );
}
