import type { PipelineCard, PipelineColumn } from "./pipeline-types";

export function countByColumn(
  list: PipelineCard[],
): Record<PipelineColumn, number> {
  return list.reduce(
    (acc, next) => ({
      ...acc,
      [next.kolonne]: (acc[next.kolonne] ?? 0) + 1,
    }),
    {
      Interessant: 0,
      Kontaktet: 0,
      Intervju: 0,
      Tilbud: 0,
      Avslått: 0,
    } as Record<PipelineColumn, number>,
  );
}

export function getOppfølgingsKø(list: PipelineCard[]): PipelineCard[] {
  return list.filter((k) => k.kolonne === "Kontaktet");
}

export function countByStatus(list: { status: string }[]): Record<string, number> {
  return list.reduce((acc, next) => ({
    ...acc,
    [next.status]: (acc[next.status] ?? 0) + 1,
  }), {} as Record<string, number>);
}

export function countAktive(list: PipelineCard[]): number {
  return list.filter((k) => k.kolonne !== "Avslått").length;
}

export function svarProsent(list: PipelineCard[]): number {
  const open = list.filter((k) => k.kolonne !== "Avslått");
  if (open.length === 0) return 0;
  const responded = list.filter((k) => k.kolonne === "Kontaktet");
  return Math.round((responded.length / open.length) * 100);
}
