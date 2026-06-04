"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { extractTextFromPdfFile } from "@/lib/pdf-extract";
import { buttonPrimary } from "@/lib/ui-classes";
import type { UserProfile } from "@/lib/types";
import {
  CV_TEXT_STORAGE_KEY,
  getStoredUserProfile,
  saveUserProfile,
} from "@/lib/client-storage";
import { formControlRounded3xl } from "@/lib/ui-classes";

const BIO_MAX = 200;
const PDF_MAX_BYTES = 5 * 1024 * 1024;

const defaultProfile: UserProfile = {
  navn: "",
  soker: "",
  bransje: "",
  geografi: "",
  bio: "",
  erfaring: "1-3",
  ferdigheter: [],
  karrieremaal: "Annet",
  cvText: undefined,
  selskaper: [],
};

export default function ProfilPage() {
  const [profile, setProfile] = useState<UserProfile>(defaultProfile);
  const [cvFileName, setCvFileName] = useState<string | null>(null);
  const [cvStatus, setCvStatus] = useState<string | null>(null);
  const [cvError, setCvError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const stored = getStoredUserProfile();
    if (stored) {
      setProfile(stored);
      if (stored.cvText) {
        setCvFileName("Lagret CV-tekst");
        setCvStatus(
          `CV-tekst hentet (${stored.cvText.length} tegn). Lagres ved «Lagre profil».`,
        );
      }
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
      const text = await extractTextFromPdfFile(file);
      setProfile((current) => ({ ...current, cvText: text }));
      setCvFileName(file.name);
      localStorage.setItem(CV_TEXT_STORAGE_KEY, text);
      setCvStatus(
        text.length > 0
          ? `Tekst hentet fra PDF (${text.length} tegn). Lagres ved «Lagre profil».`
          : "Fant lite tekst i PDF. Du kan fortsatt lagre profilen.",
      );
    } catch (err) {
      setCvError(
        err instanceof Error ? err.message : "Kunne ikke lese PDF-en.",
      );
      setCvFileName(null);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);

    try {
      const nextProfile: UserProfile = {
        ...profile,
        navn: profile.navn.trim(),
        soker: profile.soker.trim(),
        bransje: profile.bransje.trim(),
        geografi: profile.geografi.trim(),
        bio: profile.bio.trim().slice(0, BIO_MAX),
        ferdigheter: profile.ferdigheter.map((item) => item.trim()).filter(Boolean),
        selskaper: profile.selskaper.map((item) => item.trim()).filter(Boolean),
      };

      saveUserProfile(nextProfile);
      if (nextProfile.cvText) {
        localStorage.setItem(CV_TEXT_STORAGE_KEY, nextProfile.cvText);
      }
      setProfile(nextProfile);
      setSaved(true);
      setTimeout(() => setSaved(false), 4000);
    } finally {
      setSaving(false);
    }
  }

  const bioLeft = Math.max(0, BIO_MAX - profile.bio.length);

  return (
    <div className="min-h-screen bg-white text-zinc-950">
      <div className="mx-auto max-w-4xl px-4 pb-20 pt-10 sm:px-6 sm:pt-16">
        <Link
          href="/"
          className="inline-flex text-sm text-emerald-700 hover:text-emerald-600"
        >
          ← Tilbake
        </Link>

        <div className="mt-8 rounded-[2rem] border border-zinc-200 bg-white p-8 shadow-sm">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">
            Din profil
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600">
            Lag en personlig profil for bedre analyser, kontaktmeldinger og
            selskapssøk. Alt lagres lokalt i nettleseren din.
          </p>

          <form onSubmit={handleSubmit} className="mt-10 space-y-8">
            <div className="grid gap-6 md:grid-cols-2">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Navn
                </span>
                <input
                  value={profile.navn}
                  onChange={(e) =>
                    setProfile((current) => ({ ...current, navn: e.target.value }))
                  }
                  required
                  className={`mt-2 ${formControlRounded3xl}`}
                  placeholder="Fornavn Etternavn"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Hva du søker
                </span>
                <input
                  value={profile.soker}
                  onChange={(e) =>
                    setProfile((current) => ({ ...current, soker: e.target.value }))
                  }
                  required
                  className={`mt-2 ${formControlRounded3xl}`}
                  placeholder="F.eks. Sales, AE, salgsleder"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Bransje
                </span>
                <input
                  value={profile.bransje}
                  onChange={(e) =>
                    setProfile((current) => ({ ...current, bransje: e.target.value }))
                  }
                  required
                  className={`mt-2 ${formControlRounded3xl}`}
                  placeholder="F.eks. Tech, SaaS, konsument"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Geografi
                </span>
                <input
                  value={profile.geografi}
                  onChange={(e) =>
                    setProfile((current) => ({ ...current, geografi: e.target.value }))
                  }
                  required
                  className={`mt-2 ${formControlRounded3xl}`}
                  placeholder="F.eks. Oslo, remote OK"
                />
              </label>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Erfaring
                </span>
                <select
                  value={profile.erfaring}
                  onChange={(e) =>
                    setProfile((current) => ({
                      ...current,
                      erfaring: e.target.value as UserProfile["erfaring"],
                    }))
                  }
                  className="mt-2 w-full rounded-3xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-950 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
                >
                  <option value="0-1">0-1 år</option>
                  <option value="1-3">1-3 år</option>
                  <option value="3-5">3-5 år</option>
                  <option value="5-10">5-10 år</option>
                  <option value="10+">10+ år</option>
                </select>
              </label>

              <label className="block md:col-span-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Karrieremål
                </span>
                <select
                  value={profile.karrieremaal}
                  onChange={(e) =>
                    setProfile((current) => ({
                      ...current,
                      karrieremaal: e.target.value,
                    }))
                  }
                  className="mt-2 w-full rounded-3xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-950 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
                >
                  <option value="Annet">Annet</option>
                  <option value="Fast jobb">Fast jobb</option>
                  <option value="Konsulentrolle">Konsulentrolle</option>
                  <option value="Lederrolle">Lederrolle</option>
                  <option value="Bytte bransje">Bytte bransje</option>
                </select>
              </label>
            </div>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Bio / elevator pitch
              </span>
              <textarea
                value={profile.bio}
                onChange={(e) =>
                  setProfile((current) => ({
                    ...current,
                    bio: e.target.value.slice(0, BIO_MAX),
                  }))
                }
                rows={4}
                className={`mt-2 ${formControlRounded3xl} resize-y`}
                placeholder="Kort beskrivelse som hjelper analysen med å forstå deg."
              />
              <p className="mt-2 text-right text-xs text-zinc-500">
                {bioLeft} tegn igjen
              </p>
            </label>

            <div className="grid gap-6 md:grid-cols-2">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Høyeste utdanning
                </span>
                <select
                  value={(profile as UserProfile & { utdanning?: string }).utdanning ?? ""}
                  onChange={e => setProfile(cur => ({ ...cur, utdanning: e.target.value } as UserProfile))}
                  className="mt-2 w-full rounded-3xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-950 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
                >
                  <option value="">Ikke valgt</option>
                  {["Videregående","Fagbrev","Bachelor","Master","PhD","Annet"].map(u => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Sertifiseringer (kommaseparert)
                </span>
                <input
                  value={((profile as UserProfile & { sertifiseringer?: string[] }).sertifiseringer ?? []).join(", ")}
                  onChange={e => setProfile(cur => ({ ...cur, sertifiseringer: e.target.value.split(",").map(s => s.trim()).filter(Boolean) } as UserProfile))}
                  className={`mt-2 ${formControlRounded3xl}`}
                  placeholder="F.eks: Statsautorisert regnskapsfører, PMP"
                />
              </label>
            </div>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Selskaper å følge
              </span>
              <textarea
                value={profile.selskaper.join("\n")}
                onChange={(e) =>
                  setProfile((current) => ({
                    ...current,
                    selskaper: e.target.value
                      .split(/[\n,]+/)
                      .map((item) => item.trim())
                      .filter(Boolean),
                  }))
                }
                rows={3}
                className={`mt-2 ${formControlRounded3xl} resize-y`}
                placeholder="Kolonial.no\nOtovo\n…"
              />
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                CV-tekst (PDF)
              </span>
              <input
                type="file"
                accept="application/pdf"
                onChange={onCvChange}
                className="mt-2 block w-full text-sm text-zinc-500 file:mr-4 file:rounded-full file:border-0 file:bg-zinc-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-zinc-900 hover:file:bg-zinc-200"
              />
              {cvFileName && (
                <p className="mt-2 text-sm text-zinc-600">{cvFileName}</p>
              )}
              {cvStatus && (
                <p className="mt-2 text-sm text-emerald-700">{cvStatus}</p>
              )}
              {cvError && (
                <p className="mt-2 text-sm text-red-500" role="alert">
                  {cvError}
                </p>
              )}
            </label>

            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="submit"
                disabled={saving}
                className={buttonPrimary}
              >
                {saving ? "Lagrer…" : "Lagre profil"}
              </button>
              {saved && (
                <p className="text-sm text-emerald-700">Profil lagret lokalt.</p>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
