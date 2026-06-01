import { isJobbagentProfil, type JobbagentProfil } from "./profile-types";
import type { PersonProfile, UserProfile } from "./types";

const COUNT_KEY = "jobbagent_analyses_count";
const FREE_LIMIT = 3;

export const USER_PROFILE_STORAGE_KEY = "userProfile";
export const PERSON_PROFILE_STORAGE_KEY = "personProfile";
export const LEGACY_PROFILE_STORAGE_KEY = "jobbagent_profil";
export const LEGACY_CV_TEXT_STORAGE_KEY = "jobbagent_cv_tekst";
export const PROFILE_STORAGE_KEY = LEGACY_PROFILE_STORAGE_KEY;
export const CV_TEXT_STORAGE_KEY = LEGACY_CV_TEXT_STORAGE_KEY;

export function getAnalysisCount(): number {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(COUNT_KEY);
  const n = raw ? parseInt(raw, 10) : 0;
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function incrementAnalysisCount(): void {
  if (typeof window === "undefined") return;
  const next = getAnalysisCount() + 1;
  window.localStorage.setItem(COUNT_KEY, String(next));
}

export function hasReachedFreeLimit(): boolean {
  return getAnalysisCount() >= FREE_LIMIT;
}

export const RESULT_STORAGE_KEY = "jobbagent_last_result";

export function isUserProfile(value: unknown): value is UserProfile {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.navn === "string" &&
    typeof o.soker === "string" &&
    typeof o.bransje === "string" &&
    typeof o.geografi === "string" &&
    typeof o.bio === "string" &&
    typeof o.erfaring === "string" &&
    ["0-1", "1-3", "3-5", "5-10", "10+"].includes(o.erfaring) &&
    Array.isArray(o.ferdigheter) &&
    o.ferdigheter.every((item) => typeof item === "string") &&
    typeof o.karrieremaal === "string" &&
    Array.isArray(o.selskaper) &&
    o.selskaper.every((item) => typeof item === "string") &&
    (o.cvText === undefined || typeof o.cvText === "string")
  );
}

export function isPersonProfile(value: unknown): value is PersonProfile {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  return (
    Array.isArray(o.erfaringer) &&
    o.erfaringer.every(
      (item) =>
        !!item &&
        typeof item === "object" &&
        typeof (item as { id?: unknown }).id === "string" &&
        typeof (item as { tittel?: unknown }).tittel === "string",
    ) &&
    Array.isArray(o.verdier) &&
    o.verdier.every((item) => typeof item === "string") &&
    Array.isArray(o.arbeidsstil) &&
    o.arbeidsstil.every((item) => typeof item === "string") &&
    Array.isArray(o.prestasjoner) &&
    o.prestasjoner.every(
      (item) =>
        !!item &&
        typeof item === "object" &&
        typeof (item as { id?: unknown }).id === "string" &&
        typeof (item as { tekst?: unknown }).tekst === "string" &&
        typeof (item as { dato?: unknown }).dato === "string" &&
        typeof (item as { tag?: unknown }).tag === "string",
    )
  );
}

export function getStoredUserProfile(): UserProfile | null {
  if (typeof window === "undefined") return null;
  const raw =
    window.localStorage.getItem(USER_PROFILE_STORAGE_KEY) ||
    window.localStorage.getItem(LEGACY_PROFILE_STORAGE_KEY);
  if (!raw) return null;
  try {
    const p: unknown = JSON.parse(raw);
    if (isUserProfile(p)) return p;
    if (isJobbagentProfil(p)) {
      return {
        navn: p.name,
        soker: p.seeking,
        bransje: p.industry,
        geografi: p.geography,
        bio: p.bio,
        erfaring: "1-3",
        ferdigheter: [],
        karrieremaal: "Annet",
        cvText: undefined,
        selskaper: [],
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveUserProfile(profile: UserProfile): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(USER_PROFILE_STORAGE_KEY, JSON.stringify(profile));
  window.dispatchEvent(new CustomEvent("jobbagent-profile"));
}

export function getStoredPersonProfile(): PersonProfile | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(PERSON_PROFILE_STORAGE_KEY);
  if (!raw) return null;
  try {
    const p: unknown = JSON.parse(raw);
    return isPersonProfile(p) ? p : null;
  } catch {
    return null;
  }
}

export function savePersonProfile(profile: PersonProfile): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PERSON_PROFILE_STORAGE_KEY, JSON.stringify(profile));
  window.dispatchEvent(new CustomEvent("jobbagent-person-profile"));
}

export function getStoredProfile(): JobbagentProfil | null {
  const userProfile = getStoredUserProfile();
  if (userProfile) {
    return {
      name: userProfile.navn,
      seeking: userProfile.soker,
      industry: userProfile.bransje,
      geography: userProfile.geografi,
      bio: userProfile.bio,
    };
  }
  return null;
}

export function getStoredCvText(): string {
  if (typeof window === "undefined") return "";
  const profile = getStoredUserProfile();
  if (profile?.cvText) return profile.cvText;
  return window.localStorage.getItem(LEGACY_CV_TEXT_STORAGE_KEY) ?? "";
}

/** Profil sendt til API (uten tung base64). */
export function profileForApiRequest(
  p: JobbagentProfil | UserProfile,
): Omit<JobbagentProfil, "cvBase64"> {
  if ("navn" in p) {
    return {
      name: p.navn,
      seeking: p.soker,
      industry: p.bransje,
      geography: p.geografi,
      bio: p.bio,
    };
  }
  const { name, seeking, industry, geography, bio } = p;
  return { name, seeking, industry, geography, bio };
}
