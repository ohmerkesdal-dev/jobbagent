"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UpgradeModal } from "@/components/UpgradeModal";
import { buttonPrimary } from "@/lib/ui-classes";
import {
  getStoredCvText,
  getStoredProfile,
  hasReachedFreeLimit,
  incrementAnalysisCount,
  profileForApiRequest,
  RESULT_STORAGE_KEY,
} from "@/lib/client-storage";
import { isAnalysisResult } from "@/lib/analysis-types";
import { CV_TEXT_MAX_FOR_MODEL } from "@/lib/system-prompt";
import type { StoredAnalysisPayload } from "@/lib/stored-result";
import type { JobbagentProfil } from "@/lib/profile-types";

const STRIPE_URL =
  process.env.NEXT_PUBLIC_STRIPE_CHECKOUT_URL ?? "https://stripe.com";

export default function AnalysePage() {
  const router = useRouter();
  const [signal, setSignal] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [profil, setProfil] = useState<JobbagentProfil | null>(null);

  useEffect(() => {
    setProfil(getStoredProfile());
  }, []);

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

    const currentProfil = getStoredProfile();
    const cvRaw = getStoredCvText();
    const cvTextSlice =
      cvRaw.length > 0 ? cvRaw.slice(0, CV_TEXT_MAX_FOR_MODEL) : undefined;

    setLoading(true);
    try {
      const payload: Record<string, unknown> = { signal: trimmed };
      if (currentProfil) {
        payload.jobbagent_profil = profileForApiRequest(currentProfil);
      }
      if (cvTextSlice !== undefined && cvTextSlice.length > 0) {
        payload.cvText = cvTextSlice;
      }

      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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

      const stored: StoredAnalysisPayload = {
        analysis: data,
        originalSignal: trimmed,
      };
      if (currentProfil?.name) {
        stored.usedProfile = {
          name: currentProfil.name,
          seeking: currentProfil.seeking,
        };
      }

      sessionStorage.setItem(RESULT_STORAGE_KEY, JSON.stringify(stored));
      router.push("/resultat");
    } catch {
      setError("Kunne ikke koble til serveren. Prøv igjen.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f5f4f0] text-zinc-950">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-4 pb-16 pt-12 sm:px-6 sm:pt-20">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {profil?.name ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                  Profil aktiv · {profil.name}
                </span>
              </div>
              <Link
                href="/profil"
                className="text-sm text-zinc-500 underline-offset-4 hover:text-emerald-700 hover:underline"
              >
                Rediger profil →
              </Link>
            </>
          ) : (
            <Link
              href="/profil"
              className="text-sm text-zinc-500 underline-offset-4 hover:text-emerald-700 hover:underline"
            >
              Legg til profil for bedre resultater →
            </Link>
          )}
        </div>

        <header className="mb-10 text-center sm:mb-14">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-emerald-700">
            Jobbagent.no
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
            Analyser jobbsignalet ditt
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-zinc-600">
            Lim inn et LinkedIn-innlegg, en nyhetsartikkel eller tekst fra en
            stillingsannonse (f.eks. fra NAV / arbeidsplassen.no). Vi tolker
            signalet og gir deg en klar kontaktstrategi og melding.
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
            className="min-h-[220px] w-full resize-y rounded-xl border border-zinc-200 bg-white px-4 py-4 text-base text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-60"
          />

          {error && (
            <p className="text-sm text-red-500" role="alert">
              {error}
            </p>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="submit"
              disabled={loading}
              className={buttonPrimary}
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
