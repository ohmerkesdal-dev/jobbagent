import type { PipelineKontakt } from "./pipeline-types";

export const PIPELINE_STORAGE_KEY = "jobbagent_pipeline";

function isPipelineKontakt(value: unknown): value is PipelineKontakt {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.navn === "string" &&
    typeof o.tittel === "string" &&
    typeof o.selskap === "string" &&
    typeof o.kanal === "string" &&
    typeof o.status === "string" &&
    typeof o.melding === "string" &&
    typeof o.signal === "string" &&
    typeof o.sendtDato === "string" &&
    typeof o.oppfølgingDato === "string" &&
    typeof o.notat === "string"
  );
}

export function loadPipeline(): PipelineKontakt[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PIPELINE_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isPipelineKontakt);
  } catch {
    return [];
  }
}

export function savePipeline(list: PipelineKontakt[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PIPELINE_STORAGE_KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent("jobbagent-pipeline"));
}

export function upsertKontakt(k: PipelineKontakt): void {
  const list = loadPipeline();
  const i = list.findIndex((x) => x.id === k.id);
  if (i >= 0) list[i] = k;
  else list.push(k);
  savePipeline(list);
}

export function newId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `k-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function addHoursToIso(iso: string, hours: number): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return new Date().toISOString();
  d.setTime(d.getTime() + hours * 60 * 60 * 1000);
  return d.toISOString();
}
