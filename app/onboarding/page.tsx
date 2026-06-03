"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { saveUserProfile } from "@/lib/client-storage";
import type { UserProfile } from "@/lib/types";

const HURTIGVALG = [
  "Regnskapsfører", "Controller", "HR-leder",
  "Revisor", "CFO", "Markedskoordinator",
];

const GEO_PILLER = ["Oslo", "Bergen", "Trondheim", "Stavanger", "Hele Norge"];

const ERFARING_PILLER: Array<{ label: string; value: UserProfile["erfaring"] }> = [
  { label: "Student",  value: "0-1"  },
  { label: "0–1 år",   value: "0-1"  },
  { label: "1–3 år",   value: "1-3"  },
  { label: "3–5 år",   value: "3-5"  },
  { label: "5+ år",    value: "5-10" },
];

const BIO_EKSEMPLER = [
  "Strukturert og nøyaktig",
  "Liker å jobbe med mennesker",
  "Analytisk og resultatorientert",
];

const TICKER_LINJER = [
  (soker: string, geo: string) => `Søker NAV for ${soker} i ${geo}`,
  () => "Finner vekstselskaper i din bransje",
  () => "Analyserer markedssignaler...",
  () => "Finner nøkkelpersoner du kan kontakte",
];

function Dots({ steg }: { steg: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-10">
      {[0, 1, 2].map(i => (
        <div key={i} className="rounded-full transition-all duration-300" style={{
          width: i === steg ? 20 : 6,
          height: 6,
          background: i === steg ? "#111" : "#D4D4D8",
        }} />
      ))}
    </div>
  );
}

function Pill({
  label, valgt, onClick,
}: { label: string; valgt: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full px-4 py-2 text-sm font-medium transition-all"
      style={{
        border: "0.5px solid",
        borderColor: valgt ? "#111" : "rgba(0,0,0,0.12)",
        background: valgt ? "#111" : "#fff",
        color: valgt ? "#fff" : "#3F3F46",
      }}
    >
      {label}
    </button>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const [steg, setSteg] = useState(0);
  const [soker, setSoker] = useState("");
  const [geo, setGeo] = useState("");
  const [erfaring, setErfaring] = useState<UserProfile["erfaring"] | "">("");
  const [bio, setBio] = useState("");
  const [tick, setTick] = useState(-1);

  // Redirect til /finn hvis profil allerede finnes
  useEffect(() => {
    try {
      const p = localStorage.getItem("userProfile");
      if (p && JSON.parse(p)?.soker) router.replace("/finn");
    } catch {}
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Animasjon og redirect i steg 3
  useEffect(() => {
    if (steg !== 3) return;

    // Lagre profil
    const profil: UserProfile = {
      navn:        "",
      soker:       soker.trim(),
      bransje:     soker.trim().split(" ")[0],
      geografi:    geo,
      bio:         bio.trim(),
      erfaring:    (erfaring as UserProfile["erfaring"]) || "1-3",
      ferdigheter: [],
      karrieremaal: soker.trim(),
      cvText:      undefined,
      selskaper:   [],
    };
    saveUserProfile(profil);

    const timers = [
      setTimeout(() => setTick(0), 300),
      setTimeout(() => setTick(1), 800),
      setTimeout(() => setTick(2), 1400),
      setTimeout(() => setTick(3), 1800),
      setTimeout(() => router.push("/finn"), 2400),
    ];
    return () => timers.forEach(clearTimeout);
  }, [steg]); // eslint-disable-line react-hooks/exhaustive-deps

  const base: React.CSSProperties = {
    minHeight: "100vh",
    background: "#f5f4f0",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "40px 24px",
  };

  const inner: React.CSSProperties = {
    width: "100%",
    maxWidth: 480,
  };

  const bigTitle: React.CSSProperties = {
    fontSize: "clamp(26px,5vw,36px)",
    fontWeight: 500,
    letterSpacing: "-0.02em",
    lineHeight: 1.15,
    color: "#111",
    marginBottom: 8,
  };

  const sub: React.CSSProperties = {
    fontSize: 14,
    color: "#71717A",
    marginBottom: 32,
  };

  const btn: React.CSSProperties = {
    background: "#111",
    color: "#fff",
    borderRadius: 24,
    padding: "14px 32px",
    fontSize: 15,
    fontWeight: 600,
    border: "none",
    cursor: "pointer",
    width: "100%",
    marginTop: 32,
    transition: "opacity 0.2s",
  };

  const btnDisabled: React.CSSProperties = {
    ...btn,
    opacity: 0.35,
    cursor: "not-allowed",
  };

  // ── Steg 0 — Hva leter du etter? ──
  if (steg === 0) return (
    <div style={base}>
      <div style={inner}>
        <Dots steg={0} />
        <h1 style={bigTitle}>Hva leter du etter?</h1>
        <p style={sub}>Vi setter opp agenten din på 60 sekunder.</p>
        <input
          autoFocus
          value={soker}
          onChange={e => setSoker(e.target.value)}
          onKeyDown={e => e.key === "Enter" && soker.trim() && setSteg(1)}
          placeholder="F.eks: regnskapsfører, HR-leder, controller..."
          style={{
            width: "100%",
            padding: "16px 20px",
            borderRadius: 16,
            border: "0.5px solid rgba(0,0,0,0.15)",
            background: "#fff",
            fontSize: 16,
            outline: "none",
            boxSizing: "border-box",
          }}
        />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
          {HURTIGVALG.map(h => (
            <button key={h} type="button" onClick={() => setSoker(h)}
              style={{
                border: "0.5px solid rgba(0,0,0,0.12)",
                borderRadius: 20,
                background: soker === h ? "#111" : "#fff",
                color: soker === h ? "#fff" : "#3F3F46",
                padding: "7px 16px",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
              }}>
              {h}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={!soker.trim()}
          style={soker.trim() ? btn : btnDisabled}
          onClick={() => soker.trim() && setSteg(1)}
        >
          Neste →
        </button>
      </div>
    </div>
  );

  // ── Steg 1 — Hvor og erfaring ──
  if (steg === 1) return (
    <div style={base}>
      <div style={inner}>
        <Dots steg={1} />
        <h1 style={bigTitle}>Litt mer om deg</h1>
        <p style={sub}>To raske spørsmål — så er du i gang.</p>

        <p style={{ fontSize: 13, fontWeight: 600, color: "#3F3F46", marginBottom: 12 }}>
          Hvor i Norge?
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 28 }}>
          {GEO_PILLER.map(g => (
            <Pill key={g} label={g} valgt={geo === g} onClick={() => setGeo(g)} />
          ))}
        </div>

        <p style={{ fontSize: 13, fontWeight: 600, color: "#3F3F46", marginBottom: 12 }}>
          Hvor mye erfaring har du?
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {ERFARING_PILLER.map(e => (
            <Pill key={e.label} label={e.label} valgt={erfaring === e.value && ERFARING_PILLER.find(x => x.value === erfaring)?.label === e.label} onClick={() => setErfaring(e.value)} />
          ))}
        </div>

        <div style={{ display: "flex", gap: 12, marginTop: 32 }}>
          <button type="button" onClick={() => setSteg(0)}
            style={{ flex: 1, borderRadius: 24, border: "0.5px solid rgba(0,0,0,0.15)", background: "#fff", padding: "14px 0", fontSize: 15, fontWeight: 500, cursor: "pointer", color: "#3F3F46" }}>
            ← Tilbake
          </button>
          <button
            type="button"
            disabled={!geo || !erfaring}
            style={{ flex: 2, ...(!geo || !erfaring ? btnDisabled : btn), marginTop: 0 }}
            onClick={() => geo && erfaring && setSteg(2)}
          >
            Neste →
          </button>
        </div>
      </div>
    </div>
  );

  // ── Steg 2 — Beskriv deg selv ──
  if (steg === 2) return (
    <div style={base}>
      <div style={inner}>
        <Dots steg={2} />
        <h1 style={bigTitle}>Beskriv deg selv</h1>
        <p style={sub}>Dette bruker vi til å tilpasse søknadene dine.</p>

        <textarea
          autoFocus
          value={bio}
          onChange={e => setBio(e.target.value)}
          placeholder="F.eks: Strukturert og analytisk, liker å jobbe selvstendig..."
          rows={3}
          style={{
            width: "100%",
            padding: "16px 20px",
            borderRadius: 16,
            border: "0.5px solid rgba(0,0,0,0.15)",
            background: "#fff",
            fontSize: 15,
            outline: "none",
            resize: "none",
            boxSizing: "border-box",
            fontFamily: "inherit",
            lineHeight: 1.5,
          }}
        />
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
          {BIO_EKSEMPLER.map(eks => (
            <button key={eks} type="button" onClick={() => setBio(eks)}
              style={{
                textAlign: "left",
                background: bio === eks ? "#F4F4F5" : "transparent",
                border: "none",
                padding: "6px 4px",
                fontSize: 13,
                color: "#71717A",
                cursor: "pointer",
                borderRadius: 8,
              }}>
              &ldquo;{eks}&rdquo;
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 12, marginTop: 32 }}>
          <button type="button" onClick={() => setSteg(1)}
            style={{ flex: 1, borderRadius: 24, border: "0.5px solid rgba(0,0,0,0.15)", background: "#fff", padding: "14px 0", fontSize: 15, fontWeight: 500, cursor: "pointer", color: "#3F3F46" }}>
            ← Tilbake
          </button>
          <button
            type="button"
            style={{ flex: 2, ...btn, marginTop: 0 }}
            onClick={() => setSteg(3)}
          >
            {bio.trim() ? "Start agenten →" : "Hopp over →"}
          </button>
        </div>
      </div>
    </div>
  );

  // ── Steg 3 — A-ha-øyeblikket ──
  return (
    <div style={{ ...base, justifyContent: "center" }}>
      <div style={{ ...inner, textAlign: "center" }}>
        <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.2em", textTransform: "uppercase", color: "#A1A1AA", marginBottom: 16 }}>
          Jobbagent
        </p>
        <h1 style={{ ...bigTitle, textAlign: "center", marginBottom: 40 }}>
          Setter opp agenten din...
        </h1>
        <ul style={{ listStyle: "none", padding: 0, margin: "0 auto", maxWidth: 340, textAlign: "left" }}>
          {TICKER_LINJER.map((fn, i) => {
            const done   = tick > i;
            const active = tick === i;
            const tekst  = fn(soker, geo === "Hele Norge" ? "Norge" : geo);
            return (
              <li key={i} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                {done ? (
                  <span style={{ display: "flex", width: 22, height: 22, borderRadius: "50%", background: "#111", color: "#fff", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>✓</span>
                ) : active ? (
                  <span style={{ width: 22, height: 22, borderRadius: "50%", border: "2px solid #111", borderTopColor: "transparent", flexShrink: 0, animation: "spin 0.7s linear infinite", display: "inline-block" }} />
                ) : (
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#E4E4E7", flexShrink: 0, marginLeft: 6 }} />
                )}
                <span style={{ fontSize: 14, color: done || active ? "#111" : "#A1A1AA", transition: "color 0.3s" }}>
                  {tekst}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
