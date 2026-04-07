"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AnalysisResult } from "@/lib/analysis-types";
import { RESULT_STORAGE_KEY } from "@/lib/client-storage";
import { parseStoredAnalysisPayload } from "@/lib/stored-result";
import type { UsedProfileMeta } from "@/lib/profile-types";
import { prefillFromAnalysis } from "@/lib/pipeline-prefill";
import type { PipelineKanal, PipelineKontakt } from "@/lib/pipeline-types";
import {
  addHoursToIso,
  newId,
  upsertKontakt,
} from "@/lib/pipeline-storage";

export default function ResultatPage() {
  const router = useRouter();
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [usedProfile, setUsedProfile] = useState<UsedProfileMeta | null>(null);
  const [originalSignal, setOriginalSignal] = useState("");
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
      router.replace("/");
      return;
    }
    const parsed = parseStoredAnalysisPayload(raw);
    if (!parsed) {
      router.replace("/");
      return;
    }
    setResult(parsed.analysis);
    setUsedProfile(parsed.usedProfile ?? null);
    setOriginalSignal(parsed.originalSignal ?? "");
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
    if (!navn.trim() || !selskap.trim()) return;
    const sendtIso = new Date(sendtDato + "T12:00:00").toISOString();
    const k: PipelineKontakt = {
      id: newId(),
      navn: navn.trim(),
      tittel: tittel.trim(),
      selskap: selskap.trim(),
      kanal,
      status: "sendt",
      melding: result.linkedinMessage,
      signal: originalSignal.trim() || result.signalExplanation,
      sendtDato: sendtIso,
      oppfølgingDato: addHoursToIso(sendtIso, 48),
      notat: "",
      historikk: [{ status: "sendt", dato: sendtIso }],
    };
    upsertKontakt(k);
    setPipelineOpen(false);
    router.push("/pipeline");
  }

  if (!result) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0f] text-zinc-400">
        <p className="text-sm">Laster…</p>
      </div>
    );
  }

  const pct = result.hiddenJobProbability;

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-zinc-100">
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

        {usedProfile && (
          <div className="mt-6 rounded-xl border border-white/[0.08] bg-[#111118] px-4 py-3 text-sm text-zinc-300">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Personalisert for
            </p>
            <p className="mt-1 font-medium text-zinc-100">{usedProfile.name}</p>
            <p className="mt-0.5 text-zinc-400">{usedProfile.seeking}</p>
          </div>
        )}

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
            <div className="mt-3 flex flex-wrap items-baseline gap-2">
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
            <div className="mt-3 rounded-xl border border-white/[0.08] bg-[#111118] p-4">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-200">
                {result.linkedinMessage}
              </p>
            </div>
            <button
              type="button"
              onClick={openPipelineModal}
              className="mt-4 text-sm font-medium text-emerald-400/90 hover:text-emerald-300"
            >
              Lagre i pipeline →
            </button>
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

      {pipelineOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="modal-animate absolute inset-0 bg-black/75 backdrop-blur-sm"
            onClick={() => setPipelineOpen(false)}
            aria-label="Lukk"
          />
          <div className="relative z-10 w-full max-w-lg">
            <form
              onSubmit={saveToPipeline}
              className="modal-animate max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#111118] p-6 shadow-2xl"
            >
              <h2 className="text-lg font-semibold text-zinc-50">
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
                  className="rounded-lg px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200"
                >
                  Avbryt
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
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
