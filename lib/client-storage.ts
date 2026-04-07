import { isJobbagentProfil, type JobbagentProfil } from "./profile-types";

const COUNT_KEY = "jobbagent_analyses_count";
const FREE_LIMIT = 3;

export const PROFILE_STORAGE_KEY = "jobbagent_profil";
export const CV_TEXT_STORAGE_KEY = "jobbagent_cv_tekst";

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

export function getStoredProfile(): JobbagentProfil | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
  if (!raw) return null;
  try {
    const p: unknown = JSON.parse(raw);
    return isJobbagentProfil(p) ? p : null;
  } catch {
    return null;
  }
}

export function getStoredCvText(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(CV_TEXT_STORAGE_KEY) ?? "";
}

/** Profil sendt til API (uten tung base64). */
export function profileForApiRequest(
  p: JobbagentProfil,
): Omit<JobbagentProfil, "cvBase64"> {
  const { name, seeking, industry, geography, bio } = p;
  return { name, seeking, industry, geography, bio };
}
