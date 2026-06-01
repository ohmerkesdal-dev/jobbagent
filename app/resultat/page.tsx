"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AnalysisResult } from "@/lib/analysis-types";
import { RESULT_STORAGE_KEY } from "@/lib/client-storage";
import { parseStoredAnalysisPayload } from "@/lib/stored-result";
import type { UsedProfileMeta } from "@/lib/profile-types";
import { prefillFromAnalysis } from "@/lib/pipeline-prefill";
import type { PipelineKanal } from "@/lib/pipeline-types";
import type { PipelineCard } from "@/lib/types";
import { buttonAccent, buttonOverlay, buttonPrimary, buttonText } from "@/lib/ui-classes";
import { loadPipeline, newId, savePipeline } from "@/lib/pipeline-storage";

export default function ResultatPage() {
  const router = useRouter();
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [usedProfile, setUsedProfile] = useState<UsedProfileMeta | null>(null);
  const [copied, setCopied] = useState(false);
  const [pipelineOpen, setPipelineOpen] = useState(false);
  const [navn, setNavn] = useState("");
  const [tittel, setTittel] = useState("");
  const [selskap, setSelskap] = useState("");
  const [kanal, setKanal] = useState<PipelineKanal>("linkedin");
  const [sendtDato, setSendtDato] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );

  useEffect(() => {
    const raw = sessionStorage.getItem(RESULT_STORAGE_KEY);
    if (!raw) {
      router.replace("/analyse");
      return;
    }
    const parsed = parseStoredAnalysisPayload(raw);
    if (!parsed) {
      router.replace("/analyse");
      return;
    }
    setResult(parsed.analysis);
    setUsedProfile(parsed.usedProfile ?? null);
    const pre = prefillFromAnalysis(parsed.analysis);
    setNavn(pre.navn);
    setTittel(pre.tittel);
    setSelskap(pre.selskap);
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

  function openPipelineModal() {
    if (result) {
      const pre = prefillFromAnalysis(result);
      setNavn(pre.navn);
      setTittel(pre.tittel);
      setSelskap(pre.selskap);
    }
    setSendtDato(new Date().toISOString().slice(0, 10));
    setPipelineOpen(true);
  }

  function saveToPipeline(e: React.FormEvent) {
    e.preventDefault();
    if (!result) return;
    if (!selskap.trim()) return;
    const sendtIso = new Date(sendtDato + "T12:00:00").toISOString();
    const card: PipelineCard = {
      id: newId(),
      selskap: selskap.trim(),
      rolle: tittel.trim() || "Uklar rolle",
      dato: sendtIso,
      notat: "",
      kolonne: "Interessant",
    };
    savePipeline([...loadPipeline(), card]);
    setPipelineOpen(false);
    router.push("/pipeline");
  }

  if (!result) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f4f0] text-zinc-500">
        <p className="text-sm">Laster…</p>
      </div>
    );
  }

  const pct = result.hiddenJobProbability;

  return (
    <div className="min-h-screen bg-[#f5f4f0] text-zinc-950">
      <div className="mx-auto max-w-3xl px-4 pb-20 pt-10 sm:px-6 sm:pt-16">
        <Link
          href="/analyse"
          className="inline-flex text-sm text-emerald-700 hover:text-emerald-600"
        >
          ← Ny analyse
        </Link>

        <h1 className="mt-8 text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl">
          Analyse
        </h1>

        {usedProfile && (
          <div className="mt-6 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Personalisert for
            </p>
            <p className="mt-1 font-medium text-zinc-950">{usedProfile.name}</p>
            <p className="mt-0.5 text-zinc-600">{usedProfile.seeking}</p>
          </div>
        )}

        <div className="mt-10 flex flex-col gap-10">
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Signal
            </h2>
            <p className="mt-2 text-lg font-medium text-zinc-950">
              {result.signalType}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-zinc-600">
              {result.signalExplanation}
            </p>
          </section>

          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Sannsynlighet
            </h2>
            <div className="mt-3 flex flex-wrap items-baseline gap-2">
              <span className="text-4xl font-semibold tabular-nums text-emerald-600">
                {pct}%
              </span>
              <span className="text-sm text-zinc-500">
                for skjult/relevant stilling innen 60 dager
              </span>
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-zinc-200">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </section>

          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Kontaktstrategi
            </h2>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">
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
                className={buttonText}
              >
                {copied ? "Kopiert" : "Kopier melding"}
              </button>
            </div>
            <div className="mt-3 rounded-xl border border-zinc-200 bg-white p-4">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-900">
                {result.linkedinMessage}
              </p>
            </div>
            <button
              type="button"
              onClick={openPipelineModal}
              className={buttonAccent}
            >
              Lagre i pipeline →
            </button>
          </section>

          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Timing
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-zinc-700">
              {result.timingRecommendation}
            </p>
          </section>
        </div>
      </div>

      {pipelineOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className={buttonOverlay}
            onClick={() => setPipelineOpen(false)}
            aria-label="Lukk"
          />
          <div className="relative z-10 w-full max-w-lg">
            <form
              onSubmit={saveToPipeline}
              className="modal-animate max-h-[90vh] overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl"
            >
              <h2 className="text-lg font-semibold text-zinc-950">
                Lagre i pipeline
              </h2>
              <p className="mt-2 text-sm text-zinc-500">
                Sjekk og fyll inn kontaktperson. Melding og signal er hentet fra
                analysen.
              </p>
              <div className="mt-6 flex flex-col gap-4">
                <label className="block">
                  <span className="text-xs font-medium text-zinc-500">Navn *</span>
                  <input
                    required
                    value={navn}
                    onChange={(e) => setNavn(e.target.value)}
                    className="input-surface mt-1"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-zinc-500">Tittel</span>
                  <input
                    value={tittel}
                    onChange={(e) => setTittel(e.target.value)}
                    className="input-surface mt-1"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-zinc-500">
                    Selskap *
                  </span>
                  <input
                    required
                    value={selskap}
                    onChange={(e) => setSelskap(e.target.value)}
                    className="input-surface mt-1"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-zinc-500">Kanal</span>
                  <select
                    value={kanal}
                    onChange={(e) =>
                      setKanal(e.target.value as PipelineKanal)
                    }
                    className="input-surface mt-1"
                  >
                    <option value="linkedin">LinkedIn</option>
                    <option value="epost">E-post</option>
                    <option value="telefon">Telefon</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-zinc-500">
                    Dato sendt
                  </span>
                  <input
                    type="date"
                    value={sendtDato}
                    onChange={(e) => setSendtDato(e.target.value)}
                    className="input-surface mt-1"
                  />
                </label>
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPipelineOpen(false)}
                  className={buttonText}
                >
                  Avbryt
                </button>
                <button
                  type="submit"
                  className={buttonPrimary}
                >
                  Lagre og gå til pipeline
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
