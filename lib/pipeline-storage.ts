import type { PipelineCard, PipelineKontakt } from "./pipeline-types";

export const PIPELINE_STORAGE_KEY = "pipeline";
export const LEGACY_PIPELINE_STORAGE_KEY = "jobbagent_pipeline";

function isPipelineCard(value: unknown): value is PipelineCard {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.selskap === "string" &&
    typeof o.rolle === "string" &&
    typeof o.dato === "string" &&
    typeof o.kolonne === "string" &&
    [
      "Interessant",
      "Kontaktet",
      "Intervju",
      "Tilbud",
      "Avslått",
    ].includes(o.kolonne) &&
    (o.notat === undefined || typeof o.notat === "string")
  );
}

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
    Array.isArray(o.historikk)
  );
}

export function loadPipeline(): PipelineCard[] {
  if (typeof window === "undefined") return [];
  try {
    const raw =
      window.localStorage.getItem(PIPELINE_STORAGE_KEY) ||
      window.localStorage.getItem(LEGACY_PIPELINE_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isPipelineCard);
  } catch {
    return [];
  }
}

export function loadPipelineContacts(): PipelineKontakt[] {
  if (typeof window === "undefined") return [];
  try {
    const raw =
      window.localStorage.getItem(PIPELINE_STORAGE_KEY) ||
      window.localStorage.getItem(LEGACY_PIPELINE_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (isPipelineKontakt(item)) {
          return {
            ...item,
            rolle: item.rolle ?? item.tittel ?? "",
            dato: item.dato ?? item.sendtDato,
            kolonne: item.kolonne ?? "Interessant",
          };
        }
        if (isPipelineCard(item)) {
          return item as PipelineKontakt;
        }
        return null;
      })
      .filter((item): item is PipelineKontakt => item !== null);
  } catch {
    return [];
  }
}

export function savePipeline(list: PipelineCard[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PIPELINE_STORAGE_KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent("jobbagent-pipeline"));
}

export function upsertPipelineCard(card: PipelineCard): void {
  const list = loadPipeline();
  const i = list.findIndex((x) => x.id === card.id);
  if (i >= 0) list[i] = card;
  else list.push(card);
  savePipeline(list);
}

export function upsertKontakt(card: PipelineKontakt): void {
  upsertPipelineCard({
    ...card,
    rolle: card.rolle ?? card.tittel,
  });
}

export function addHoursToIso(iso: string, hours: number): string {
  const date = new Date(iso);
  return new Date(date.getTime() + hours * 3_600_000).toISOString();
}

export function newId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `k-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
