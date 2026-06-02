"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { saveUserProfile } from "@/lib/client-storage";
import type { UserProfile } from "@/lib/types";

const PILLS = [
  "Regnskapsfører Oslo",
  "Controller Bergen",
  "HR-konsulent",
  "Revisor Oslo",
];

const TICKER = [
  "Søker Finn.no — ledige stillinger",
  "Finner selskaper med vekstsignaler",
  "Analyserer markedssignaler med AI",
  "Finner nøkkelpersoner du kan kontakte",
];

const RESULT_CARDS = [
  {
    badge: "Vekstsignal",
    badgeClass: "bg-zinc-100 text-zinc-700",
    title: "Otovo hentet 200 MNOK",
    desc: "Økonomiavdeling prioritert. Ta kontakt nå.",
    action: "Ta kontakt ↗",
  },
  {
    badge: "Finn.no",
    badgeClass: "bg-zinc-100 text-zinc-700",
    title: "Regnskapskonsulent — Azets",
    desc: "Oslo · 5 dager igjen til frist",
    action: "+ Pipeline",
  },
  {
    badge: "Vekstsignal",
    badgeClass: "bg-zinc-100 text-zinc-700",
    title: "Kolonial.no — 40 nye stillinger",
    desc: "Finance nevnt som prioritert",
    action: "Ta kontakt ↗",
  },
  {
    badge: "LinkedIn",
    badgeClass: "bg-zinc-100 text-zinc-700",
    title: "Junior regnskapsfører — BDO",
    desc: "Oslo · Nyutdannede velkommen · 8 dager igjen",
    action: "+ Pipeline",
  },
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

const HOW_IT_WORKS = [
  { num: "01", title: "Fortell oss hva du søker", desc: "Stillingstittel og by — det tar 5 sekunder." },
  { num: "02", title: "Vi scanner markedet", desc: "Finn.no, LinkedIn og Webcruiter analyseres parallelt på 30 sekunder." },
  { num: "03", title: "Du ser funn ingen andre har", desc: "Signaler, vekstnyheter og nøkkelpersoner du kan kontakte direkte." },
];

export default function Home() {
  const router = useRouter();
  const [step, setStep] = useState<0 | 1 | 2 | 3 | 4>(0);
  const [query, setQuery] = useState("");
  const [navn, setNavn] = useState("");
  const [epost, setEpost] = useState("");
  const [tick, setTick] = useState(-1);

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

  function startScan(e: { preventDefault: () => void }) {
    e.preventDefault();
    if (!query.trim()) return;
    setStep(1);
  }

  function register(e: { preventDefault: () => void }) {
    e.preventDefault();
    if (!navn.trim() || !epost.trim()) return;
    const profile: UserProfile = {
      navn: navn.trim(),
      soker: query.trim(),
      bransje: "",
      geografi: "",
      bio: "",
      erfaring: "1-3",
      ferdigheter: [],
      karrieremaal: "Annet",
      cvText: undefined,
      selskaper: [],
    };
    saveUserProfile(profile);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("jobbagent_email", epost.trim());
    }
    setStep(4);
  }

  /* ── STEG 0 — Landing ── */
  if (step === 0) {
    return (
      <div className="flex min-h-screen flex-col bg-white">
        {/* Hero */}
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-20 sm:py-28">
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-zinc-400">
            Jobbagent.no
          </p>

          <h1
            className="mt-6 max-w-2xl text-center font-semibold text-zinc-950"
            style={{
              fontSize: "clamp(38px, 7vw, 80px)",
              lineHeight: 1.06,
              letterSpacing: "-0.04em",
            }}
          >
            Finn jobben<br />
            før den lyses ut.
          </h1>

          <p
            className="mt-7 max-w-md text-center text-zinc-500"
            style={{ fontSize: "clamp(15px, 2vw, 18px)", lineHeight: 1.65 }}
          >
            Ett søk. 30 sekunder. Stillinger, vekstsignaler og nøkkelpersoner
            ingen andre viser deg.
          </p>

          <form onSubmit={startScan} className="mt-10 flex w-full max-w-xl gap-2.5">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="F.eks: regnskapsfører i Oslo..."
              className="flex-1 rounded-xl border border-zinc-200 bg-white px-5 py-4 text-base text-zinc-950 placeholder:text-zinc-400 outline-none transition focus:border-zinc-950 focus:ring-2 focus:ring-zinc-950/10"
            />
            <button
              type="submit"
              className="whitespace-nowrap rounded-xl bg-zinc-950 px-6 py-4 text-sm font-semibold text-white transition hover:bg-zinc-800"
            >
              Scan →
            </button>
          </form>

          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {PILLS.map((pill) => (
              <button
                key={pill}
                type="button"
                onClick={() => setQuery(pill)}
                className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-600 transition hover:border-zinc-400 hover:text-zinc-950"
              >
                {pill}
              </button>
            ))}
          </div>

          <p className="mt-8 text-xs text-zinc-400">
            Ingen kredittkort. Ingen registrering.
          </p>
        </div>

        {/* Divider */}
        <div className="border-t border-zinc-100" />

        {/* How it works */}
        <div className="px-6 py-16 sm:py-20">
          <div className="mx-auto max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-zinc-400">
              Slik fungerer det
            </p>
            <div className="mt-10 grid gap-10 sm:grid-cols-3">
              {HOW_IT_WORKS.map((s) => (
                <div key={s.num}>
                  <p
                    className="font-semibold text-zinc-200"
                    style={{ fontSize: "42px", letterSpacing: "-0.04em", lineHeight: 1 }}
                  >
                    {s.num}
                  </p>
                  <p
                    className="mt-4 text-base font-semibold text-zinc-950"
                    style={{ letterSpacing: "-0.02em" }}
                  >
                    {s.title}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-500">
                    {s.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="border-t border-zinc-100 px-6 py-16">
          <div className="mx-auto flex max-w-3xl flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p
                className="text-2xl font-semibold text-zinc-950"
                style={{ letterSpacing: "-0.03em" }}
              >
                Klar til å prøve?
              </p>
              <p className="mt-1 text-sm text-zinc-500">
                Gratis. Ingen registrering. Bare skriv inn det du søker.
              </p>
            </div>
            <button
              type="button"
              onClick={() => document.querySelector("input")?.focus()}
              className="rounded-xl bg-zinc-950 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-zinc-800"
            >
              Start nå →
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── STEG 1 — Scanning ── */
  if (step === 1) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white px-6">
        <p className="text-sm text-zinc-400">
          Søker for{" "}
          <span className="font-semibold text-zinc-950">«{query}»</span>
        </p>

        <h2
          className="mt-4 font-semibold text-zinc-950"
          style={{
            fontSize: "clamp(28px, 5vw, 48px)",
            letterSpacing: "-0.04em",
            lineHeight: 1.1,
          }}
        >
          Søker i markedet...
        </h2>

        <ul className="mt-12 w-full max-w-xs space-y-5">
          {TICKER.map((text, i) => {
            const active = tick === i;
            const done = tick > i;
            return (
              <li key={text} className="flex items-center gap-3">
                {done ? (
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-950 text-[10px] font-bold text-white">
                    ✓
                  </span>
                ) : active ? (
                  <span className="flex h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-zinc-950 border-t-transparent" />
                ) : (
                  <span className="ml-1 flex h-2.5 w-2.5 shrink-0 rounded-full bg-zinc-200" />
                )}
                <span
                  className={`text-sm transition-colors duration-300 ${
                    done || active ? "text-zinc-950" : "text-zinc-400"
                  }`}
                >
                  {text}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  /* ── STEG 2 — Resultater ── */
  if (step === 2) {
    return (
      <div className="min-h-screen bg-white px-5 pb-24 pt-10">
        <div className="mx-auto max-w-3xl">
          {/* AI insight */}
          <div
            className="flex items-start gap-3 rounded-2xl border border-zinc-100 bg-zinc-50 p-5"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0 text-zinc-700">
              <path d="M9 18h6M10 22h4M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z" />
            </svg>
            <p className="text-sm leading-relaxed text-zinc-700">
              <strong>3 selskaper</strong> ansetter sannsynligvis innen regnskap
              neste 30 dager — basert på funding-nyheter og LinkedIn-aktivitet.
              Ingen har lyst ut stillingen ennå.
            </p>
          </div>

          {/* Cards */}
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {RESULT_CARDS.map((c) => (
              <div
                key={c.title}
                className="rounded-2xl border border-zinc-100 bg-white p-5"
              >
                <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${c.badgeClass}`}>
                  {c.badge}
                </span>
                <h3
                  className="mt-3 text-base font-semibold text-zinc-950"
                  style={{ letterSpacing: "-0.02em" }}
                >
                  {c.title}
                </h3>
                <p className="mt-1 text-sm text-zinc-500">{c.desc}</p>
                <button
                  type="button"
                  className="mt-4 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50"
                >
                  {c.action}
                </button>
              </div>
            ))}
          </div>

          {/* Locked */}
          <div className="mt-4 rounded-2xl border border-zinc-100 bg-white p-6">
            <div className="flex items-center gap-2">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-zinc-400">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <p className="text-sm font-medium text-zinc-700">
                5 nøkkelpersoner du kan kontakte direkte — krever gratis konto
              </p>
            </div>
            <button
              type="button"
              onClick={() => setStep(3)}
              className="mt-4 rounded-lg bg-zinc-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800"
            >
              Lås opp gratis
            </button>
            <div className="pointer-events-none mt-5 grid grid-cols-2 gap-3 select-none opacity-30">
              {LOCKED_PERSONS.map((p) => (
                <div key={p.name} className="rounded-xl border border-zinc-100 bg-zinc-50 p-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-sm font-semibold text-zinc-600">
                      {p.initials}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-zinc-950">{p.name}</p>
                      <p className="text-xs text-zinc-500">{p.title}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Dark CTA */}
          <div className="mt-4 rounded-2xl bg-zinc-950 px-8 py-8">
            <h3
              className="text-xl font-semibold text-white"
              style={{ letterSpacing: "-0.03em" }}
            >
              Vil du se alle 11 funn + daglig oppdatering?
            </h3>
            <button
              type="button"
              onClick={() => setStep(3)}
              className="mt-5 rounded-lg bg-white px-6 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-100"
            >
              Ja, vis meg alt →
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── STEG 3 — Registrering ── */
  if (step === 3) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white px-6 py-16">
        <div className="w-full max-w-sm">
          <button
            type="button"
            onClick={() => setStep(2)}
            className="text-sm text-zinc-400 transition hover:text-zinc-700"
          >
            ← Tilbake
          </button>

          <h1
            className="mt-8 font-semibold text-zinc-950"
            style={{ fontSize: "clamp(28px, 5vw, 40px)", letterSpacing: "-0.04em" }}
          >
            Lagre funnene<br />dine.
          </h1>
          <p className="mt-3 text-sm text-zinc-500">
            Kun to felter. Vi sender deg daglige oppdateringer.
          </p>

          <form onSubmit={register} className="mt-8 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-medium text-zinc-500">Navn</span>
                <input
                  required
                  value={navn}
                  onChange={(e) => setNavn(e.target.value)}
                  placeholder="Ola Nordmann"
                  className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-950 placeholder:text-zinc-400 outline-none focus:border-zinc-950 focus:ring-2 focus:ring-zinc-950/10"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-zinc-500">E-post</span>
                <input
                  required
                  type="email"
                  value={epost}
                  onChange={(e) => setEpost(e.target.value)}
                  placeholder="ola@eks.no"
                  className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-950 placeholder:text-zinc-400 outline-none focus:border-zinc-950 focus:ring-2 focus:ring-zinc-950/10"
                />
              </label>
            </div>
            <button
              type="submit"
              className="w-full rounded-lg bg-zinc-950 py-4 text-base font-semibold text-white transition hover:bg-zinc-800"
            >
              Start gratis →
            </button>
          </form>

          <p className="mt-4 text-center text-xs text-zinc-400">
            Ingen betalingsinformasjon. Lagres kun lokalt i nettleseren.
          </p>
        </div>
      </div>
    );
  }

  /* ── STEG 4 — Velkommen ── */
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-6 py-16">
      <div className="w-full max-w-sm text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-zinc-400">
          Du er i gang
        </p>
        <h1
          className="mt-5 font-semibold text-zinc-950"
          style={{ fontSize: "clamp(28px, 5vw, 40px)", letterSpacing: "-0.04em" }}
        >
          Velkommen, {navn}.
        </h1>
        <p className="mt-3 text-sm text-zinc-500">
          Her er et sammendrag av dagens skanning.
        </p>

        <div className="mt-10 grid grid-cols-2 gap-3">
          {SUMMARY_CARDS.map((c) => (
            <div
              key={c.label}
              className="rounded-2xl border border-zinc-100 p-5 text-left"
            >
              <p
                className="text-3xl font-semibold text-zinc-950"
                style={{ letterSpacing: "-0.04em" }}
              >
                {c.value}
              </p>
              <p className="mt-1.5 text-xs text-zinc-500">{c.label}</p>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => router.push("/finn")}
          className="mt-8 w-full rounded-lg bg-zinc-950 py-4 text-base font-semibold text-white transition hover:bg-zinc-800"
        >
          Gå til feeden →
        </button>
      </div>
    </div>
  );
}
