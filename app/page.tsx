"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UpgradeModal } from "@/components/UpgradeModal";
import {
  hasReachedFreeLimit,
  incrementAnalysisCount,
  RESULT_STORAGE_KEY,
} from "@/lib/client-storage";
import { isAnalysisResult } from "@/lib/analysis-types";

const STRIPE_URL =
  process.env.NEXT_PUBLIC_STRIPE_CHECKOUT_URL ?? "https://stripe.com";

export default function Home() {
  const router = useRouter();
  const [signal, setSignal] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  async function handleAnalyze(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmed = signal.trim();
    if (!trimmed) {
      setError("Lim inn et signal først.");
      return;
    }

    if (hasReachedFreeLimit()) {
      setUpgradeOpen(true);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signal: trimmed }),
      });
      const data: unknown = await res.json();

      if (!res.ok) {
        const err =
          data &&
          typeof data === "object" &&
          "error" in data &&
          typeof (data as { error: unknown }).error === "string"
            ? (data as { error: string }).error
            : "Noe gikk galt.";
        setError(err);
        return;
      }

      if (!isAnalysisResult(data)) {
        setError("Ugyldig svar fra serveren.");
        return;
      }

      incrementAnalysisCount();
      sessionStorage.setItem(RESULT_STORAGE_KEY, JSON.stringify(data));
      router.push("/resultat");
    } catch {
      setError("Kunne ikke koble til serveren. Prøv igjen.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-4 pb-16 pt-12 sm:px-6 sm:pt-20">
        <header className="mb-10 text-center sm:mb-14">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-emerald-500/90">
            Jobbagent.no
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">
            Finn jobber før de lyses ut
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-zinc-400">
            Lim inn et LinkedIn-innlegg, en nyhetsartikkel eller en Finn-annonse.
            Vi tolker signalet og gir deg en klar kontaktstrategi og melding.
          </p>
        </header>

        <form onSubmit={handleAnalyze} className="flex flex-1 flex-col gap-4">
          <label htmlFor="signal" className="sr-only">
            Signal
          </label>
          <textarea
            id="signal"
            name="signal"
            rows={12}
            value={signal}
            onChange={(e) => setSignal(e.target.value)}
            placeholder="Lim inn signal her..."
            disabled={loading}
            className="min-h-[220px] w-full resize-y rounded-xl border border-zinc-800 bg-zinc-900/80 px-4 py-4 text-base text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-600/50 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 disabled:opacity-60"
          />

          {error && (
            <p className="text-sm text-red-400" role="alert">
              {error}
            </p>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-8 py-3.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span
                    className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
                    aria-hidden
                  />
                  Analyserer…
                </span>
              ) : (
                "Analyser signal"
              )}
            </button>
            <p className="text-xs text-zinc-500">
              3 gratis analyser. Ingen innlogging i beta.
            </p>
          </div>
        </form>
      </div>

      <UpgradeModal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        stripeUrl={STRIPE_URL}
      />
    </div>
  );
}
