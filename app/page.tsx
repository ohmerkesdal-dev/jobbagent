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
  { dot: "green", text: "Søker NAV — ledige stillinger i Oslo" },
  { dot: "green", text: "Finner selskaper med vekstsignaler" },
  { dot: "yellow", text: "Analyserer markedssignaler med AI..." },
  { dot: "gray", text: "Finner nøkkelpersoner du kan kontakte" },
];

const RESULT_CARDS = [
  {
    badge: "Vekstsignal",
    badgeClass: "bg-emerald-50 text-emerald-700",
    title: "Otovo hentet 200 MNOK",
    desc: "Økonomiavdeling prioritert. Ta kontakt nå.",
    action: "Ta kontakt ↗",
  },
  {
    badge: "NAV-stilling",
    badgeClass: "bg-blue-50 text-blue-700",
    title: "Regnskapskonsulent — Azets",
    desc: "Oslo · 5 dager igjen til frist",
    action: "+ Pipeline",
  },
  {
    badge: "Vekstsignal",
    badgeClass: "bg-emerald-50 text-emerald-700",
    title: "Kolonial.no — 40 nye stillinger",
    desc: "Finance nevnt som prioritert",
    action: "Ta kontakt ↗",
  },
  {
    badge: "NAV-stilling",
    badgeClass: "bg-blue-50 text-blue-700",
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
  { value: "Q2", label: "Sesong — høysesong" },
];

const inputBase =
  "w-full rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-950 placeholder:text-zinc-400 outline-none focus:border-[#1D9E75]/60 focus:ring-2 focus:ring-[#1D9E75]/20";

function BulbIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 mt-0.5 text-emerald-600"
    >
      <path d="M9 18h6M10 22h4M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-zinc-400"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

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
      setTimeout(() => setTick(1), 600),
      setTimeout(() => setTick(2), 1100),
      setTimeout(() => setTick(3), 1600),
      setTimeout(() => { setStep(2); setTick(-1); }, 2000),
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
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#f5f4f0] px-4 py-16">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#1D9E75]">
          Jobbagent.no
        </p>

        <h1
          className="mt-4 max-w-xl text-center text-[32px] font-medium text-zinc-950"
          style={{ letterSpacing: "-0.03em" }}
        >
          Se hva markedet gjør for deg — akkurat nå
        </h1>

        <p className="mt-4 max-w-md text-center text-base text-zinc-500">
          Ett søk. 30 sekunder. Du ser signaler, vekstselskaper og nøkkelpersoner
          ingen andre viser deg.
        </p>

        <form
          onSubmit={startScan}
          className="mt-10 flex w-full max-w-lg gap-2"
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="F.eks: regnskapsfører i Oslo..."
            className="flex-1 rounded-lg border border-zinc-200 bg-white px-4 py-3.5 text-base text-zinc-950 placeholder:text-zinc-400 outline-none focus:border-[#1D9E75]/60 focus:ring-2 focus:ring-[#1D9E75]/20"
          />
          <button
            type="submit"
            className="whitespace-nowrap rounded-lg bg-[#111] px-5 py-3.5 text-sm font-semibold text-[#f5f4f0] transition hover:bg-zinc-800"
          >
            Scan markedet →
          </button>
        </form>

        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {PILLS.map((pill) => (
            <button
              key={pill}
              type="button"
              onClick={() => setQuery(pill)}
              className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-600 transition hover:bg-zinc-50"
            >
              {pill}
            </button>
          ))}
        </div>

        <p className="mt-7 text-xs text-zinc-400">
          Ingen kredittkort. Ingen registrering. Bare verdi.
        </p>
      </div>
    );
  }

  /* ── STEG 1 — Scanning ── */
  if (step === 1) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#f5f4f0] px-4">
        <p className="text-sm text-zinc-500">
          Søker for{" "}
          <span className="font-semibold text-zinc-800">«{query}»</span>
        </p>
        <h2
          className="mt-3 text-2xl font-medium text-zinc-950"
          style={{ letterSpacing: "-0.03em" }}
        >
          Søker i markedet...
        </h2>

        <ul className="mt-10 w-full max-w-xs space-y-4">
          {TICKER.map((row, i) => {
            const active = tick === i;
            const done = tick > i;
            return (
              <li key={row.text} className="flex items-center gap-3">
                {done ? (
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-700">
                    ✓
                  </span>
                ) : active && row.dot === "yellow" ? (
                  <span className="flex h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
                ) : (
                  <span
                    className={`ml-1 flex h-2.5 w-2.5 shrink-0 rounded-full ${
                      row.dot === "green"
                        ? "bg-[#1D9E75]"
                        : row.dot === "yellow"
                          ? "bg-amber-400"
                          : "bg-zinc-300"
                    } ${active ? "opacity-100" : tick < i ? "opacity-40" : "opacity-100"}`}
                  />
                )}
                <span
                  className={`text-sm transition-colors duration-300 ${
                    done || active ? "text-zinc-800" : "text-zinc-400"
                  }`}
                >
                  {row.text}
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
      <div className="min-h-screen bg-[#f5f4f0] px-4 pb-24 pt-10">
        <div className="mx-auto max-w-3xl">
          {/* AI insight */}
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <BulbIcon />
            <p className="text-sm leading-relaxed text-emerald-900">
              <strong>3 selskaper</strong> ansetter sannsynligvis innen regnskap
              neste 30 dager — basert på funding-nyheter og LinkedIn-aktivitet.
              Ingen har lyst ut stillingen ennå.
            </p>
          </div>

          {/* Cards */}
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {RESULT_CARDS.map((c) => (
              <div
                key={c.title}
                className="rounded-2xl bg-white p-5"
                style={{ border: "0.5px solid rgba(0,0,0,0.08)" }}
              >
                <span
                  className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${c.badgeClass}`}
                >
                  {c.badge}
                </span>
                <h3 className="mt-3 text-base font-semibold text-zinc-950">
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

          {/* Locked section */}
          <div
            className="mt-6 rounded-2xl bg-white p-6"
            style={{ border: "0.5px solid rgba(0,0,0,0.08)" }}
          >
            <div className="flex items-center gap-2">
              <LockIcon />
              <p className="text-sm font-medium text-zinc-700">
                5 nøkkelpersoner du kan kontakte direkte — krever gratis konto
              </p>
            </div>
            <button
              type="button"
              onClick={() => setStep(3)}
              className="mt-4 rounded-lg bg-[#111] px-5 py-2.5 text-sm font-semibold text-[#f5f4f0] transition hover:bg-zinc-800"
            >
              Lås opp gratis
            </button>
            <div className="pointer-events-none mt-5 grid grid-cols-2 gap-3 select-none opacity-40">
              {LOCKED_PERSONS.map((p) => (
                <div
                  key={p.name}
                  className="rounded-xl bg-zinc-50 p-4"
                  style={{ border: "0.5px solid rgba(0,0,0,0.08)" }}
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-sm font-semibold text-zinc-600">
                      {p.initials}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-zinc-950">
                        {p.name}
                      </p>
                      <p className="text-xs text-zinc-500">{p.title}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Dark CTA */}
          <div className="mt-6 rounded-2xl bg-[#111] px-8 py-8 text-[#f5f4f0]">
            <h3
              className="text-xl font-medium"
              style={{ letterSpacing: "-0.03em" }}
            >
              Vil du se alle 11 funn + daglig oppdatering?
            </h3>
            <button
              type="button"
              onClick={() => setStep(3)}
              className="mt-5 rounded-lg bg-[#f5f4f0] px-6 py-3 text-sm font-semibold text-[#111] transition hover:bg-white"
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
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#f5f4f0] px-4 py-16">
        <div className="w-full max-w-sm">
          <button
            type="button"
            onClick={() => setStep(2)}
            className="text-sm text-zinc-400 transition hover:text-zinc-700"
          >
            ← Tilbake
          </button>

          <h1
            className="mt-6 text-[32px] font-medium text-zinc-950"
            style={{ letterSpacing: "-0.03em" }}
          >
            Lagre funnene dine
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
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
                  className={`mt-1.5 ${inputBase}`}
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-zinc-500">
                  E-post
                </span>
                <input
                  required
                  type="email"
                  value={epost}
                  onChange={(e) => setEpost(e.target.value)}
                  placeholder="ola@eks.no"
                  className={`mt-1.5 ${inputBase}`}
                />
              </label>
            </div>
            <button
              type="submit"
              className="w-full rounded-lg bg-[#111] py-4 text-base font-semibold text-[#f5f4f0] transition hover:bg-zinc-800"
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
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#f5f4f0] px-4 py-16">
      <div className="w-full max-w-sm text-center">
        <h1
          className="text-[32px] font-medium text-zinc-950"
          style={{ letterSpacing: "-0.03em" }}
        >
          Du er i gang, {navn}!
        </h1>
        <p className="mt-2 text-sm text-zinc-500">
          Her er et sammendrag av dagens skanning.
        </p>

        <div className="mt-8 grid grid-cols-2 gap-3">
          {SUMMARY_CARDS.map((c) => (
            <div
              key={c.label}
              className="rounded-2xl bg-white p-5 text-left"
              style={{ border: "0.5px solid rgba(0,0,0,0.08)" }}
            >
              <p className="text-2xl font-semibold text-zinc-950">{c.value}</p>
              <p className="mt-1 text-xs text-zinc-500">{c.label}</p>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => router.push("/scanner")}
          className="mt-8 w-full rounded-lg bg-[#111] py-4 text-base font-semibold text-[#f5f4f0] transition hover:bg-zinc-800"
        >
          Gå til dashbordet →
        </button>
      </div>
    </div>
  );
}
