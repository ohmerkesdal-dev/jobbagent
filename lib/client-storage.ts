const COUNT_KEY = "jobbagent_analyses_count";
const FREE_LIMIT = 3;

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
