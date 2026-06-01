"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getStoredUserProfile } from "@/lib/client-storage";
import { KarriereCoach } from "@/components/KarriereCoach";
import { loadScannerFunn } from "@/lib/scanner-storage";
import type { ScannerFunn } from "@/lib/scanner-types";
import type { UserProfile, PersonProfile } from "@/lib/types";

const FORBUDTE_ORD = [
  "resultatorientert", "løsningsorientert", "brenner for",
  "lidenskap", "robuste", "proaktiv", "dedikert",
  "navigere", "helhetlig", "verdifullt tilskudd",
];

function beregnMenneskeligScore(tekst: string): number {
  const treff = FORBUDTE_ORD.filter(ord => tekst.toLowerCase().includes(ord)).length;
  return Math.max(0, 100 - treff * 15);
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 75 ? "bg-emerald-500" : score >= 50 ? "bg-amber-400" : "bg-red-500";
  const label = score >= 75 ? "Høy menneskelig score" : score >= 50 ? "Middels" : "For generisk";
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>{label}</span>
        <span className="font-semibold">{score}%</span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-zinc-100">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

export default function SokPage() {
  const [up, setUp] = useState<UserProfile | null>(null);
  const [pp, setPp] = useState<PersonProfile>({ erfaringer: [], verdier: [], arbeidsstil: [], prestasjoner: [] });
  const [stillinger, setStillinger] = useState<ScannerFunn[]>([]);
  const [valgtId, setValgtId] = useState("");
  const [genererer, setGenererer] = useState(false);
  const [soknadsbrev, setSoknadsbrev] = useState("");
  const [harGenerert, setHarGenerert] = useState(false);
  const [kopiert, setKopiert] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const soknadRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setUp(getStoredUserProfile());
    const raw = typeof window !== "undefined" ? localStorage.getItem("personProfile") : null;
    if (raw) { try { setPp(JSON.parse(raw)); } catch {} }
    const scanFunn = loadScannerFunn().filter(f => f.kategori === "stilling" || f.signalType === "Utlyst stilling");
    setStillinger(scanFunn);
    const valgt = typeof window !== "undefined" ? localStorage.getItem("valgtStilling") : null;
    if (valgt) { try { const p = JSON.parse(valgt) as { id?: string }; if (p.id) setValgtId(p.id); } catch {} }
  }, []);

  async function genererSoknad() {
    const stilling = stillinger.find(f => f.id === valgtId);
    if (!stilling || !up) return;
    setGenererer(true); setSoknadsbrev(""); setScore(null);
    try {
      const res = await fetch("/api/personifisering/generer-soknad", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stilling: { title: stilling.title, company: stilling.company ?? "", description: stilling.beskrivelse ?? "" }, userProfile: up, personProfile: pp }),
      });
      const data = (await res.json()) as { soknadsbrev?: string; error?: string };
      if (data.soknadsbrev) {
        setSoknadsbrev(data.soknadsbrev);
        setScore(beregnMenneskeligScore(data.soknadsbrev));
        setHarGenerert(true);
        setTimeout(() => soknadRef.current?.focus(), 100);
      }
    } catch {} finally { setGenererer(false); }
  }

  const valgtStilling = stillinger.find(f => f.id === valgtId);
  const ordtelling = soknadsbrev.trim().split(/\s+/).filter(Boolean).length;
  const bruktTags = [...pp.verdier, ...pp.arbeidsstil].slice(0, 6);

  return (
    <div className="min-h-screen bg-[#f5f4f0] pb-24 pt-8">
      <div className="mx-auto max-w-2xl px-4 sm:px-6">
        <h1 className="text-2xl font-medium text-zinc-950" style={{ letterSpacing: "-0.02em" }}>Søk smart</h1>
        <p className="mt-1 text-sm text-zinc-500">Generer et skreddersydd søknadsbrev basert på din profil.</p>

        {harGenerert && <div className="mt-4"><KarriereCoach kontekst="forste-soknad" /></div>}

        {/* Seksjon 1: Velg stilling */}
        <div className="mt-8 space-y-4">
          {stillinger.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-200 bg-white px-4 py-8 text-center text-sm text-zinc-500">
              Ingen stillinger funnet — gå til <Link href="/finn" className="text-[#1D9E75] underline">Finn</Link> og kjør en skanning først.
            </div>
          ) : (
            <select value={valgtId} onChange={e => setValgtId(e.target.value)} className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-[#1D9E75]/60 focus:ring-2 focus:ring-[#1D9E75]/20">
              <option value="">Velg en stilling…</option>
              {stillinger.map(f => <option key={f.id} value={f.id}>{f.title}{f.company ? ` — ${f.company}` : ""}</option>)}
            </select>
          )}

          {/* Brukes i søknaden */}
          {bruktTags.length > 0 && (
            <div className="rounded-xl bg-zinc-50 px-4 py-3" style={{ border: "0.5px solid rgba(0,0,0,0.06)" }}>
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Brukes i søknaden din</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {bruktTags.map(t => <span key={t} className="rounded-full bg-white px-3 py-1 text-xs font-medium text-zinc-700" style={{ border: "0.5px solid rgba(0,0,0,0.1)" }}>{t}</span>)}
              </div>
            </div>
          )}

          <button type="button" onClick={genererSoknad} disabled={!valgtId || genererer} className="w-full rounded-xl bg-[#1D9E75] py-3.5 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-40">
            {genererer ? "Skriver søknaden din…" : "Generer søknadsbrev →"}
          </button>

          {genererer && (
            <div className="flex items-center gap-3 text-sm text-zinc-500">
              {[0,150,300].map(d => <span key={d} className="h-2 w-2 animate-bounce rounded-full bg-[#1D9E75]" style={{ animationDelay: `${d}ms` }} />)}
              Skriver søknaden din...
            </div>
          )}
        </div>

        {/* Seksjon 2: Resultat */}
        {soknadsbrev && (
          <div className="mt-6 space-y-4">
            <div className="rounded-2xl bg-white" style={{ border: "0.5px solid rgba(0,0,0,0.08)" }}>
              <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
                <div>
                  <p className="text-sm font-semibold text-zinc-950">{valgtStilling?.title}</p>
                  {valgtStilling?.company && <p className="text-xs text-zinc-400">{valgtStilling.company}</p>}
                </div>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700">Personifisert</span>
              </div>
              <textarea ref={soknadRef} value={soknadsbrev} onChange={e => { setSoknadsbrev(e.target.value); setScore(beregnMenneskeligScore(e.target.value)); }} rows={14} className="w-full resize-y bg-transparent px-5 py-4 text-sm leading-relaxed text-zinc-800 outline-none" />
              <div className="flex items-center justify-between border-t border-zinc-100 px-5 py-3">
                <p className="text-xs text-zinc-400">{ordtelling} ord</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => soknadRef.current?.focus()} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50">Rediger</button>
                  <button type="button" onClick={async () => { await navigator.clipboard.writeText(soknadsbrev); setKopiert(true); setTimeout(() => setKopiert(false), 2000); }} className="rounded-lg bg-[#111] px-3 py-1.5 text-xs font-semibold text-white">
                    {kopiert ? "✓ Kopiert" : "Kopier"}
                  </button>
                </div>
              </div>
            </div>

            {/* Menneskelig score */}
            {score !== null && (
              <div className="rounded-xl bg-white p-4" style={{ border: "0.5px solid rgba(0,0,0,0.08)" }}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">Menneskelig score</p>
                <ScoreBar score={score} />
                {score < 75 && (
                  <p className="mt-2 text-xs text-zinc-500">Tips: Unngå generiske fraser og bruk konkrete eksempler fra din erfaring.</p>
                )}
              </div>
            )}

            {/* Hva som er brukt */}
            {bruktTags.length > 0 && (
              <div className="rounded-xl bg-zinc-50 px-4 py-4" style={{ border: "0.5px solid rgba(0,0,0,0.06)" }}>
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Hva som er brukt fra din profil</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {pp.verdier.map(v => <span key={v} className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">{v}</span>)}
                  {pp.arbeidsstil.map(a => <span key={a} className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">{a}</span>)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
