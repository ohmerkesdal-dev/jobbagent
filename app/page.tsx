"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveUserProfile } from "@/lib/client-storage";
import type { UserProfile } from "@/lib/types";

const PILLS = ["Regnskapsfører Oslo", "Controller Bergen", "HR-konsulent", "Revisor Oslo"];

const TICKER = [
  "Søker Finn.no — ledige stillinger",
  "Finner selskaper med vekstsignaler",
  "Analyserer markedssignaler med AI",
  "Finner nøkkelpersoner du kan kontakte",
];

const RESULT_CARDS = [
  { badge: "Vekstsignal", title: "Otovo hentet 200 MNOK", desc: "Økonomiavdeling prioritert. Ta kontakt nå.", action: "Ta kontakt ↗" },
  { badge: "Finn.no", title: "Regnskapskonsulent — Azets", desc: "Oslo · 5 dager igjen til frist", action: "+ Pipeline" },
  { badge: "Vekstsignal", title: "Kolonial.no — 40 nye stillinger", desc: "Finance nevnt som prioritert", action: "Ta kontakt ↗" },
  { badge: "LinkedIn", title: "Junior regnskapsfører — BDO", desc: "Oslo · Nyutdannede velkommen · 8 dager igjen", action: "+ Pipeline" },
];

const LOCKED_PERSONS = [
  { initials: "O", name: "████████ ██████", title: "CFO · Otovo AS" },
  { initials: "K", name: "████ ███████", title: "Finance Director · Kolonial.no" },
];

const SUMMARY_CARDS = [
  { value: "11", label: "Funn fra i dag" },
  { value: "3", label: "Vekstsignaler" },
  { value: "5", label: "Nøkkelpersoner" },
  { value: "Q2", label: "Høysesong nå" },
];

export default function Home() {
  const router = useRouter();
  const bgRef = useRef<HTMLDivElement>(null);
  const heroTextRef = useRef<HTMLDivElement>(null);
  const searchSectionRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<0 | 1 | 2 | 3 | 4>(0);

  const [harProfil, setHarProfil] = useState(false);

  // Sjekk om profil finnes — ikke redirect, vis landing-siden
  useEffect(() => {
    try {
      const p = localStorage.getItem("userProfile");
      setHarProfil(!!(p && JSON.parse(p)?.soker));
    } catch {}
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [query, setQuery] = useState("");
  const [navn, setNavn] = useState("");
  const [epost, setEpost] = useState("");
  const [tick, setTick] = useState(-1);

  /* Scroll zoom effect — only on step 0 */
  useEffect(() => {
    if (step !== 0) return;
    const onScroll = () => {
      const sy = window.scrollY;
      const vh = window.innerHeight;
      const p = Math.min(sy / (vh * 0.85), 1);
      if (bgRef.current) {
        bgRef.current.style.transform = `scale(${1 + p * 1.7})`;
      }
      if (heroTextRef.current) {
        const op = Math.max(0, 1 - p * 2.8);
        heroTextRef.current.style.opacity = String(op);
        heroTextRef.current.style.transform = `translateY(${-p * 70}px)`;
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [step]);

  /* Scanning animation */
  useEffect(() => {
    if (step !== 1) return;
    const timers = [
      setTimeout(() => setTick(0), 200),
      setTimeout(() => setTick(1), 700),
      setTimeout(() => setTick(2), 1300),
      setTimeout(() => setTick(3), 1800),
      setTimeout(() => { setStep(2); setTick(-1); }, 2300),
    ];
    return () => timers.forEach(clearTimeout);
  }, [step]);

  function startScan(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    window.scrollTo({ top: 0 });
    setStep(1);
  }

  function register(e: React.FormEvent) {
    e.preventDefault();
    if (!navn.trim() || !epost.trim()) return;
    const profile: UserProfile = {
      navn: navn.trim(), soker: query.trim(),
      bransje: "", geografi: "", bio: "",
      erfaring: "1-3", ferdigheter: [],
      karrieremaal: "Annet", cvText: undefined, selskaper: [],
    };
    saveUserProfile(profile);
    localStorage.setItem("jobbagent_email", epost.trim());
    setStep(4);
  }

  /* ── STEG 1 — Scanning ── */
  if (step === 1) return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-6">
      <p className="text-sm text-zinc-400">
        Søker for <span className="font-semibold text-zinc-950">«{query}»</span>
      </p>
      <h2 className="mt-4 font-semibold text-zinc-950"
        style={{ fontSize: "clamp(28px,5vw,48px)", letterSpacing: "-0.04em", lineHeight: 1.1 }}>
        Søker i markedet...
      </h2>
      <ul className="mt-12 w-full max-w-xs space-y-5">
        {TICKER.map((text, i) => {
          const active = tick === i, done = tick > i;
          return (
            <li key={text} className="flex items-center gap-3">
              {done
                ? <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-950 text-[10px] font-bold text-white">✓</span>
                : active
                  ? <span className="flex h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-zinc-950 border-t-transparent" />
                  : <span className="ml-1 flex h-2.5 w-2.5 shrink-0 rounded-full bg-zinc-200" />}
              <span className={`text-sm transition-colors duration-300 ${done || active ? "text-zinc-950" : "text-zinc-400"}`}>{text}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );

  /* ── STEG 2 — Resultater ── */
  if (step === 2) return (
    <div className="min-h-screen bg-white px-5 pb-24 pt-10">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-start gap-3 rounded-2xl border border-zinc-100 bg-zinc-50 p-5">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0 text-zinc-700">
            <path d="M9 18h6M10 22h4M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z" />
          </svg>
          <p className="text-sm leading-relaxed text-zinc-700">
            <strong>3 selskaper</strong> ansetter sannsynligvis innen regnskap neste 30 dager — basert på funding-nyheter og LinkedIn-aktivitet.
          </p>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {RESULT_CARDS.map((c) => (
            <div key={c.title} className="rounded-2xl border border-zinc-100 bg-white p-5">
              <span className="inline-block rounded-full bg-zinc-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-700">{c.badge}</span>
              <h3 className="mt-3 text-base font-semibold text-zinc-950" style={{ letterSpacing: "-0.02em" }}>{c.title}</h3>
              <p className="mt-1 text-sm text-zinc-500">{c.desc}</p>
              <button type="button" className="mt-4 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50">{c.action}</button>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-2xl border border-zinc-100 bg-white p-6">
          <p className="text-sm font-medium text-zinc-700">🔒 5 nøkkelpersoner du kan kontakte — krever gratis konto</p>
          <button type="button" onClick={() => setStep(3)} className="mt-4 rounded-lg bg-zinc-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800">Lås opp gratis</button>
          <div className="pointer-events-none mt-5 grid grid-cols-2 gap-3 select-none opacity-30">
            {LOCKED_PERSONS.map((p) => (
              <div key={p.name} className="rounded-xl border border-zinc-100 bg-zinc-50 p-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-sm font-semibold text-zinc-600">{p.initials}</span>
                  <div><p className="text-sm font-medium text-zinc-950">{p.name}</p><p className="text-xs text-zinc-500">{p.title}</p></div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-4 rounded-2xl bg-zinc-950 px-8 py-8">
          <h3 className="text-xl font-semibold text-white" style={{ letterSpacing: "-0.03em" }}>Vil du se alle 11 funn + daglig oppdatering?</h3>
          <button type="button" onClick={() => setStep(3)} className="mt-5 rounded-lg bg-white px-6 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-100">Ja, vis meg alt →</button>
        </div>
      </div>
    </div>
  );

  /* ── STEG 3 — Registrering ── */
  if (step === 3) return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-6 py-16">
      <div className="w-full max-w-sm">
        <button type="button" onClick={() => setStep(2)} className="text-sm text-zinc-400 transition hover:text-zinc-700">← Tilbake</button>
        <h1 className="mt-8 font-semibold text-zinc-950" style={{ fontSize: "clamp(28px,5vw,40px)", letterSpacing: "-0.04em" }}>
          Lagre funnene<br />dine.
        </h1>
        <p className="mt-3 text-sm text-zinc-500">Kun to felter. Vi sender deg daglige oppdateringer.</p>
        <form onSubmit={register} className="mt-8 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-zinc-500">Navn</span>
              <input required value={navn} onChange={e => setNavn(e.target.value)} placeholder="Ola Nordmann"
                className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm placeholder:text-zinc-400 outline-none focus:border-zinc-950 focus:ring-2 focus:ring-zinc-950/10" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-zinc-500">E-post</span>
              <input required type="email" value={epost} onChange={e => setEpost(e.target.value)} placeholder="ola@eks.no"
                className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm placeholder:text-zinc-400 outline-none focus:border-zinc-950 focus:ring-2 focus:ring-zinc-950/10" />
            </label>
          </div>
          <button type="submit" className="w-full rounded-lg bg-zinc-950 py-4 text-base font-semibold text-white transition hover:bg-zinc-800">Start gratis →</button>
        </form>
        <p className="mt-4 text-center text-xs text-zinc-400">Ingen betalingsinformasjon. Lagres kun lokalt.</p>
      </div>
    </div>
  );

  /* ── STEG 4 — Velkommen ── */
  if (step === 4) return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-6 py-16">
      <div className="w-full max-w-sm text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-zinc-400">Du er i gang</p>
        <h1 className="mt-5 font-semibold text-zinc-950" style={{ fontSize: "clamp(28px,5vw,40px)", letterSpacing: "-0.04em" }}>
          Velkommen, {navn}.
        </h1>
        <p className="mt-3 text-sm text-zinc-500">Her er et sammendrag av dagens skanning.</p>
        <div className="mt-10 grid grid-cols-2 gap-3">
          {SUMMARY_CARDS.map((c) => (
            <div key={c.label} className="rounded-2xl border border-zinc-100 p-5 text-left">
              <p className="font-semibold text-zinc-950" style={{ fontSize: "32px", letterSpacing: "-0.04em", lineHeight: 1 }}>{c.value}</p>
              <p className="mt-2 text-xs text-zinc-500">{c.label}</p>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => router.push("/finn")} className="mt-8 w-full rounded-lg bg-zinc-950 py-4 text-base font-semibold text-white transition hover:bg-zinc-800">
          Gå til feeden →
        </button>
      </div>
    </div>
  );

  /* ── STEG 0 — Landing med scroll-zoom ── */
  return (
    <div className="bg-white">

      {/* ─── SCROLL HERO — 190vh for scroll-rom ─── */}
      <div style={{ height: "190vh" }}>
        <div className="sticky top-0 h-screen overflow-hidden" style={{ background: "#f7f6f2" }}>

          {/* Bakgrunn som zoomer inn */}
          <div
            ref={bgRef}
            className="absolute inset-0"
            style={{ transformOrigin: "55% 52%", willChange: "transform" }}
          >
            {/* Base */}
            <div className="absolute inset-0" style={{ background: "#f7f6f2" }} />

            {/* Stor sentral sirkel — "portalen" */}
            <div
              className="absolute"
              style={{
                left: "50%", top: "52%",
                transform: "translate(-50%, -50%)",
                width: "62vmin", height: "62vmin",
                borderRadius: "50%",
                background: "radial-gradient(circle at 40% 40%, #dbeafe 0%, #eff6ff 45%, #f0fdf4 75%, transparent 100%)",
              }}
            />

            {/* Ytre ring 1 */}
            <div className="absolute" style={{
              left: "50%", top: "52%",
              transform: "translate(-50%, -50%)",
              width: "76vmin", height: "76vmin",
              borderRadius: "50%",
              border: "1px solid rgba(99,102,241,0.10)",
            }} />

            {/* Ytre ring 2 */}
            <div className="absolute" style={{
              left: "50%", top: "52%",
              transform: "translate(-50%, -50%)",
              width: "92vmin", height: "92vmin",
              borderRadius: "50%",
              border: "1px solid rgba(99,102,241,0.05)",
            }} />

            {/* Fargeblob øvre venstre */}
            <div className="absolute" style={{
              left: "15%", top: "15%",
              width: "28vmin", height: "28vmin",
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(199,210,254,0.55) 0%, transparent 70%)",
              filter: "blur(18px)",
            }} />

            {/* Fargeblob nedre høyre */}
            <div className="absolute" style={{
              right: "12%", bottom: "18%",
              width: "22vmin", height: "22vmin",
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(167,243,208,0.45) 0%, transparent 70%)",
              filter: "blur(14px)",
            }} />

            {/* Prikker — stjerneeffekt */}
            {[
              { left: "22%", top: "28%" }, { left: "68%", top: "18%" },
              { left: "78%", top: "62%" }, { left: "32%", top: "72%" },
              { left: "14%", top: "55%" }, { left: "85%", top: "35%" },
              { left: "55%", top: "82%" }, { left: "42%", top: "14%" },
            ].map((pos, i) => (
              <div key={i} className="absolute rounded-full bg-zinc-400/30" style={{
                left: pos.left, top: pos.top,
                width: i % 2 === 0 ? "3px" : "2px",
                height: i % 2 === 0 ? "3px" : "2px",
              }} />
            ))}

            {/* Senter-merkelapp */}
            <div className="absolute" style={{
              left: "50%", top: "52%",
              transform: "translate(-50%, -50%)",
              fontSize: "clamp(11px, 1.2vw, 14px)",
              fontWeight: 700,
              letterSpacing: "0.02em",
              color: "rgba(0,0,0,0.18)",
              whiteSpace: "nowrap",
              userSelect: "none",
            }}>
              jobbagent.
            </div>
          </div>

          {/* Kontaktinfo øvre høyre */}
          <div className="absolute top-5 right-6 hidden sm:flex items-center gap-6 text-xs text-zinc-400 z-10">
            <span>hei@jobbagent.no</span>
          </div>

          {/* Herotext venstre — fader ut ved scroll */}
          <div
            ref={heroTextRef}
            className="absolute inset-0 flex flex-col justify-center px-8 sm:px-14 lg:px-20 z-10"
            style={{ willChange: "opacity, transform", maxWidth: "700px" }}
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-400 mb-5">
              Jobbagent.no
            </p>
            <h1
              className="font-bold text-zinc-950 leading-[0.93]"
              style={{ fontSize: "clamp(50px, 8.5vw, 110px)", letterSpacing: "-0.045em" }}
            >
              Finn jobben.<br />
              Før den<br />
              lyses ut.
            </h1>
            <p
              className="mt-6 text-zinc-500"
              style={{ fontSize: "clamp(14px, 1.8vw, 18px)", fontStyle: "italic" }}
            >
              Ikke bare søk — bli funnet av markedet.
            </p>
          </div>

          {/* CTA-knapper — bunnen sentert */}
          <div className="absolute bottom-10 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3">
            {harProfil ? (
              <button
                type="button"
                onClick={() => router.push("/finn")}
                className="rounded-full bg-zinc-950 px-8 py-4 text-sm font-semibold text-white transition hover:bg-zinc-800"
              >
                Gå til feeden →
              </button>
            ) : (
              <button
                type="button"
                onClick={() => router.push("/onboarding")}
                className="rounded-full bg-zinc-950 px-8 py-4 text-sm font-semibold text-white transition hover:bg-zinc-800"
              >
                Kom i gang gratis →
              </button>
            )}
            <button
              type="button"
              onClick={() => searchSectionRef.current?.scrollIntoView({ behavior: "smooth" })}
              className="flex h-12 w-12 items-center justify-center rounded-full border border-zinc-300 bg-white text-base text-zinc-950 transition hover:bg-zinc-50"
            >
              ↓
            </button>
          </div>

          {/* Scroll-indikator — nedre høyre */}
          <div className="absolute bottom-10 right-8 z-10 flex items-center gap-3">
            <div className="h-8 w-px bg-zinc-300" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-400">
              Scroll ned
            </span>
          </div>
        </div>
      </div>

      {/* ─── SØKESEKSJON — vises etter scroll ─── */}
      <div ref={searchSectionRef} className="flex min-h-screen flex-col items-center justify-center bg-white px-6 py-24">
        <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-zinc-400">
          Ett søk. 30 sekunder.
        </p>
        <h2
          className="mt-4 text-center font-semibold text-zinc-950"
          style={{ fontSize: "clamp(28px, 5vw, 56px)", letterSpacing: "-0.04em", lineHeight: 1.1 }}
        >
          Hva søker du?
        </h2>

        <form onSubmit={startScan} className="mt-10 flex w-full max-w-xl gap-2.5">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="F.eks: regnskapsfører i Oslo..."
            className="flex-1 rounded-xl border border-zinc-200 bg-white px-5 py-4 text-base placeholder:text-zinc-400 outline-none transition focus:border-zinc-950 focus:ring-2 focus:ring-zinc-950/10"
          />
          <button type="submit"
            className="whitespace-nowrap rounded-xl bg-zinc-950 px-6 py-4 text-sm font-semibold text-white transition hover:bg-zinc-800">
            Scan →
          </button>
        </form>

        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {PILLS.map(p => (
            <button key={p} type="button" onClick={() => setQuery(p)}
              className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-600 transition hover:border-zinc-400 hover:text-zinc-950">
              {p}
            </button>
          ))}
        </div>

        <p className="mt-8 text-xs text-zinc-400">Ingen kredittkort. Ingen registrering.</p>

        {/* Slik fungerer det */}
        <div className="mt-28 w-full max-w-3xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-zinc-400">Slik fungerer det</p>
          <div className="mt-10 grid gap-10 sm:grid-cols-3">
            {[
              { num: "01", title: "Fortell oss hva du søker", desc: "Stillingstittel og by — det tar 5 sekunder." },
              { num: "02", title: "Vi scanner markedet", desc: "Finn.no, LinkedIn og Webcruiter analyseres parallelt på 30 sekunder." },
              { num: "03", title: "Du ser funn ingen andre har", desc: "Signaler, vekstnyheter og nøkkelpersoner du kan kontakte direkte." },
            ].map(s => (
              <div key={s.num}>
                <p className="font-semibold text-zinc-200" style={{ fontSize: "44px", letterSpacing: "-0.04em", lineHeight: 1 }}>{s.num}</p>
                <p className="mt-4 text-base font-semibold text-zinc-950" style={{ letterSpacing: "-0.02em" }}>{s.title}</p>
                <p className="mt-2 text-sm leading-relaxed text-zinc-500">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Bunn-CTA */}
        <div className="mt-24 w-full max-w-3xl rounded-2xl bg-zinc-950 px-10 py-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-zinc-400">Klar?</p>
          <h3 className="mt-3 font-semibold text-white" style={{ fontSize: "clamp(22px,4vw,36px)", letterSpacing: "-0.04em" }}>
            Finn jobben før<br />den lyses ut.
          </h3>
          <button type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="mt-6 rounded-full bg-white px-7 py-3.5 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-100">
            Gå til toppen →
          </button>
        </div>
      </div>
    </div>
  );
}
