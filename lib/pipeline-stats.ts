import type { PipelineKontakt, PipelineStatus } from "./pipeline-types";

export function countByStatus(
  list: PipelineKontakt[],
): Record<PipelineStatus, number> {
  const c = {
    sendt: 0,
    svar: 0,
    møte: 0,
    avsluttet: 0,
  };
  for (const k of list) {
    c[k.status]++;
  }
  return c;
}

/** Kontakter med status sendt der oppfølgingstid er passert (ingen svar ennå). */
export function getOppfølgingsKø(list: PipelineKontakt[]): PipelineKontakt[] {
  const now = Date.now();
  return list.filter(
    (k) =>
      k.status === "sendt" &&
      new Date(k.oppfølgingDato).getTime() <= now,
  );
}

export function countAktive(list: PipelineKontakt[]): number {
  return list.filter((k) => k.status !== "avsluttet").length;
}

/**
 * Svarprosent: (svar + møte) / totalt × 100 (alle poster teller som «sendt ut»).
 */
export function svarProsent(list: PipelineKontakt[]): number {
  if (list.length === 0) return 0;
  const num = list.filter((k) => k.status === "svar" || k.status === "møte")
    .length;
  return Math.round((num / list.length) * 100);
}
