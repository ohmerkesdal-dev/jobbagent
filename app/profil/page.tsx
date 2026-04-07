"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { extractTextFromPdfFile } from "@/lib/pdf-extract";
import type { JobbagentProfil } from "@/lib/profile-types";
import {
  CV_TEXT_STORAGE_KEY,
  PROFILE_STORAGE_KEY,
} from "@/lib/client-storage";

const BIO_MAX = 200;
const PDF_MAX_BYTES = 5 * 1024 * 1024;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = r.result as string;
      const i = s.indexOf(",");
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    r.onerror = () => reject(new Error("Kunne ikke lese filen"));
    r.readAsDataURL(file);
  });
}

export default function ProfilPage() {
  const [name, setName] = useState("");
  const [seeking, setSeeking] = useState("");
  const [industry, setIndustry] = useState("");
  const [geography, setGeography] = useState("");
  const [bio, setBio] = useState("");
  const [cvBase64, setCvBase64] = useState<string | undefined>();
  const [cvFileName, setCvFileName] = useState<string | null>(null);
  const [cvStatus, setCvStatus] = useState<string | null>(null);
  const [cvError, setCvError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw) as Partial<JobbagentProfil>;
        if (typeof p.name === "string") setName(p.name);
        if (typeof p.seeking === "string") setSeeking(p.seeking);
        if (typeof p.industry === "string") setIndustry(p.industry);
        if (typeof p.geography === "string") setGeography(p.geography);
        if (typeof p.bio === "string") setBio(p.bio);
        if (typeof p.cvBase64 === "string" && p.cvBase64) {
          setCvBase64(p.cvBase64);
          setCvFileName("Lagret CV (PDF)");
        }
      }
      const txt = localStorage.getItem(CV_TEXT_STORAGE_KEY);
      if (txt) setCvStatus("CV-tekst er lagret fra tidligere opplasting.");
    } catch {
      /* ignore */
    }
  }, []);

  async function onCvChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setCvError(null);
    setCvStatus(null);
    if (!file) return;

    if (file.type !== "application/pdf") {
      setCvError("Kun PDF er støttet.");
      return;
    }
    if (file.size > PDF_MAX_BYTES) {
      setCvError("PDF kan maks være 5 MB.");
      return;
    }

    try {
      const [text, b64] = await Promise.all([
        extractTextFromPdfFile(file),
        fileToBase64(file),
      ]);
      setCvBase64(b64);
      setCvFileName(file.name);
      localStorage.setItem(CV_TEXT_STORAGE_KEY, text);
      setCvStatus(
        text.length > 0
          ? `Tekst hentet fra PDF (${text.length} tegn). Lagres ved «Lagre profil».`
          : "Fant lite tekst i PDF. Du kan fortsatt lagre filen.",
      );
    } catch (err) {
      setCvError(
        err instanceof Error ? err.message : "Kunne ikke lese PDF-en.",
      );
      setCvBase64(undefined);
      setCvFileName(null);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);

    try {
      const profil: JobbagentProfil = {
        name: name.trim(),
        seeking: seeking.trim(),
        industry: industry.trim(),
        geography: geography.trim(),
        bio: bio.trim().slice(0, BIO_MAX),
        ...(cvBase64 ? { cvBase64 } : {}),
      };

      localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profil));
      setSaved(true);
      setTimeout(() => setSaved(false), 4000);
    } finally {
      setSaving(false);
    }
  }

  const bioLeft = Math.max(0, BIO_MAX - bio.length);

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-zinc-100">
      <div className="mx-auto max-w-2xl px-4 pb-20 pt-10 sm:px-6 sm:pt-16">
        <Link
          href="/"
          className="inline-flex text-sm text-emerald-500/90 hover:text-emerald-400"
        >
          ← Tilbake
        </Link>

        <h1 className="mt-8 text-2xl font-semibold tracking-tight text-zinc-50 sm:text-3xl">
          Din profil
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">
          Vi bruker profilen og CV-teksten til å tilpasse analyse og
          LinkedIn-melding. Alt lagres lokalt i nettleseren din.
        </p>

        <form onSubmit={handleSubmit} className="mt-10 flex flex-col gap-6">
          <div>
            <label
              htmlFor="name"
              className="block text-xs font-semibold uppercase tracking-wider text-zinc-500"
            >
              Navn
            </label>
            <input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-900/80 px-4 py-3 text-base text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-600/50 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
              placeholder="Fornavn Etternavn"
            />
          </div>

          <div>
            <label
              htmlFor="seeking"
              className="block text-xs font-semibold uppercase tracking-wider text-zinc-500"
            >
              Hva du søker
            </label>
            <input
              id="seeking"
              name="seeking"
              type="text"
              value={seeking}
              onChange={(e) => setSeeking(e.target.value)}
              required
              className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-900/80 px-4 py-3 text-base text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-600/50 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
              placeholder="F.eks. Sales, AE, salgsleder"
            />
          </div>

          <div>
            <label
              htmlFor="industry"
              className="block text-xs font-semibold uppercase tracking-wider text-zinc-500"
            >
              Bransje
            </label>
            <input
              id="industry"
              name="industry"
              type="text"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              required
              className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-900/80 px-4 py-3 text-base text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-600/50 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
              placeholder="F.eks. Tech, SaaS, konsument"
            />
          </div>

          <div>
            <label
              htmlFor="geography"
              className="block text-xs font-semibold uppercase tracking-wider text-zinc-500"
            >
              Geografi
            </label>
            <input
              id="geography"
              name="geography"
              type="text"
              value={geography}
              onChange={(e) => setGeography(e.target.value)}
              required
              className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-900/80 px-4 py-3 text-base text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-600/50 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
              placeholder="F.eks. Oslo, remote OK"
            />
          </div>

          <div>
            <label
              htmlFor="bio"
              className="block text-xs font-semibold uppercase tracking-wider text-zinc-500"
            >
              Kort bio / elevator pitch
            </label>
            <textarea
              id="bio"
              name="bio"
              rows={4}
              maxLength={BIO_MAX}
              value={bio}
              onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX))}
              className="mt-2 w-full resize-y rounded-xl border border-zinc-800 bg-zinc-900/80 px-4 py-3 text-base text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-600/50 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
              placeholder="Maks 200 tegn."
            />
            <p className="mt-1 text-right text-xs text-zinc-500">
              {bioLeft} tegn igjen
            </p>
          </div>

          <div>
            <span className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
              CV (PDF, maks 5 MB)
            </span>
            <input
              type="file"
              accept="application/pdf"
              onChange={onCvChange}
              className="mt-2 block w-full text-sm text-zinc-400 file:mr-4 file:rounded-lg file:border-0 file:bg-zinc-800 file:px-4 file:py-2 file:text-sm file:font-medium file:text-zinc-200 hover:file:bg-zinc-700"
            />
            {cvFileName && (
              <p className="mt-2 text-sm text-zinc-400">{cvFileName}</p>
            )}
            {cvStatus && (
              <p className="mt-2 text-sm text-emerald-400/90">{cvStatus}</p>
            )}
            {cvError && (
              <p className="mt-2 text-sm text-red-400" role="alert">
                {cvError}
              </p>
            )}
          </div>

          {saved && (
            <p
              className="rounded-xl border border-emerald-700/50 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-300"
              role="status"
            >
              Profil lagret
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-emerald-600 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
          >
            {saving ? "Lagrer…" : "Lagre profil"}
          </button>
        </form>
      </div>
    </div>
  );
}
