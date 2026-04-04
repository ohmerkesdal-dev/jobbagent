"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { isAnalysisResult, type AnalysisResult } from "@/lib/analysis-types";
import { RESULT_STORAGE_KEY } from "@/lib/client-storage";

export default function ResultatPage() {
  const router = useRouter();
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem(RESULT_STORAGE_KEY);
    if (!raw) {
      router.replace("/");
      return;
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      if (isAnalysisResult(parsed)) {
        setResult(parsed);
      } else {
        router.replace("/");
      }
    } catch {
      router.replace("/");
    }
  }, [router]);

  async function copyMessage() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.linkedinMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  if (!result) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        <p className="text-sm">Laster…</p>
      </div>
    );
  }

  const pct = result.hiddenJobProbability;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-3xl px-4 pb-20 pt-10 sm:px-6 sm:pt-16">
        <Link
          href="/"
          className="inline-flex text-sm text-emerald-500/90 hover:text-emerald-400"
        >
          ← Ny analyse
        </Link>

        <h1 className="mt-8 text-2xl font-semibold tracking-tight text-zinc-50 sm:text-3xl">
          Analyse
        </h1>

        <div className="mt-10 flex flex-col gap-10">
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Signal
            </h2>
            <p className="mt-2 text-lg font-medium text-zinc-100">
              {result.signalType}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-zinc-400">
              {result.signalExplanation}
            </p>
          </section>

          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Sannsynlighet
            </h2>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-4xl font-semibold tabular-nums text-emerald-400">
                {pct}%
              </span>
              <span className="text-sm text-zinc-500">
                for skjult/relevant stilling innen 60 dager
              </span>
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-emerald-500/80 transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </section>

          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Kontaktstrategi
            </h2>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
              {result.contactStrategy}
            </p>
          </section>

          <section>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Melding
              </h2>
              <button
                type="button"
                onClick={copyMessage}
                className="self-start rounded-lg border border-zinc-600 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-zinc-800 sm:self-auto"
              >
                {copied ? "Kopiert" : "Kopier melding"}
              </button>
            </div>
            <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-200">
                {result.linkedinMessage}
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Timing
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-zinc-300">
              {result.timingRecommendation}
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
