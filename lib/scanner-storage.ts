import type { ScannerFunn } from "./scanner-types";

export const SCANNER_FUNN_KEY = "scanResults";
export const LEGACY_SCANNER_FUNN_KEY = "jobbagent_scanner_funn";
export const SCANNER_SIST_KEY = "jobbagent_scanner_sist";
export const SCANNER_SELSKAPER_KEY = "jobbagent_scanner_selskaper";

const MAX_LAGRET = 200;

export function loadScannerFunn(): ScannerFunn[] {
  if (typeof window === "undefined") return [];
  try {
    const raw =
      window.localStorage.getItem(SCANNER_FUNN_KEY) ||
      window.localStorage.getItem(LEGACY_SCANNER_FUNN_KEY);
    if (!raw) return [];
    const p: unknown = JSON.parse(raw);
    if (!Array.isArray(p)) return [];
    return p.filter(
      (x): x is ScannerFunn =>
        !!x &&
        typeof x === "object" &&
        typeof (x as ScannerFunn).id === "string" &&
        typeof (x as ScannerFunn).title === "string" &&
        typeof (x as ScannerFunn).url === "string",
    );
  } catch {
    return [];
  }
}

export function saveScannerFunn(list: ScannerFunn[]): void {
  if (typeof window === "undefined") return;
  const trimmed = list.slice(0, MAX_LAGRET);
  window.localStorage.setItem(SCANNER_FUNN_KEY, JSON.stringify(trimmed));
  window.dispatchEvent(new CustomEvent("jobbagent-scanner"));
}

export function mergeScannerFunn(
  existing: ScannerFunn[],
  incoming: ScannerFunn[],
): ScannerFunn[] {
  const seen = new Set(existing.map((x) => x.url));
  const merged = [...existing];
  for (const item of incoming) {
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    merged.unshift(item);
  }
  return merged.slice(0, MAX_LAGRET);
}

export function loadSelskaper(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SCANNER_SELSKAPER_KEY);
    if (!raw) return [];
    const p: unknown = JSON.parse(raw);
    if (!Array.isArray(p)) return [];
    return p.filter((x): x is string => typeof x === "string").map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export function saveSelskaper(list: string[]): void {
  if (typeof window === "undefined") return;
  const uniq = [...new Set(list.map((s) => s.trim()).filter(Boolean))].slice(
    0,
    10,
  );
  window.localStorage.setItem(SCANNER_SELSKAPER_KEY, JSON.stringify(uniq));
  window.dispatchEvent(new CustomEvent("jobbagent-scanner"));
}

export function getSistScan(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(SCANNER_SIST_KEY);
}

export function setSistScan(iso: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SCANNER_SIST_KEY, iso);
}

export function funnSisteDager(list: ScannerFunn[], dager: number): ScannerFunn[] {
  const cutoff = Date.now() - dager * 86_400_000;
  return list.filter((f) => {
    const t = new Date(f.funnetDato).getTime();
    return !Number.isNaN(t) && t >= cutoff;
  });
}
