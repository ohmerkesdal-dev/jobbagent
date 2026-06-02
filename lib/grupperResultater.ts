import type { ScannerFunn, ScannerKategori } from "./scanner-types";
import type { SelskapKort } from "./types";

function getKategori(f: ScannerFunn): ScannerKategori {
  if (f.kategori) return f.kategori;
  if (f.signalType === "Utlyst stilling") return "stilling";
  if (f.signalType === "LinkedIn") return "person";
  if (f.signalType === "Selskap") return "signal";
  return "nyhet";
}

function trekktUtSelskapsnavn(f: ScannerFunn): string {
  if (f.company) return f.company;
  const etterDash = f.title.split("–")[1]?.trim() ?? f.title.split("-")[1]?.trim();
  return etterDash || f.title.slice(0, 40);
}

function nøkkelForFunn(f: ScannerFunn): string {
  const company = f.company?.toLowerCase().trim();
  if (company) return company;
  const etterDash =
    f.title.split("–")[1]?.trim().toLowerCase() ??
    f.title.split("-")[1]?.trim().toLowerCase();
  return etterDash || f.id;
}

export function grupperPerSelskap(resultater: ScannerFunn[]): SelskapKort[] {
  const selskapMap = new Map<string, SelskapKort>();

  for (const r of resultater) {
    const nøkkel = nøkkelForFunn(r);

    if (!selskapMap.has(nøkkel)) {
      selskapMap.set(nøkkel, {
        id: nøkkel,
        navn: trekktUtSelskapsnavn(r),
        lokasjon: r.location,
        erFulgt: false,
        stillinger: [],
        signaler: [],
        personer: [],
      });
    }

    const kort = selskapMap.get(nøkkel)!;
    const kat = getKategori(r);

    if (kat === "stilling") kort.stillinger.push(r);
    else if (kat === "signal") kort.signaler.push(r);
    else if (kat === "person") kort.personer.push(r);

    if (r.deadline && (!kort.høyestFrist || r.deadline < kort.høyestFrist)) {
      kort.høyestFrist = r.deadline;
    }
  }

  return (
    Array.from(selskapMap.values())
      // Kast oppføringer uten noe relevant innhold
      .filter((s) => s.stillinger.length > 0 || s.signaler.length > 0)
      // Sorter: stilling (×3) + signal (×2) + person (×1) = relevansScore
      .sort((a, b) => {
        const scoreA =
          a.stillinger.length * 3 + a.signaler.length * 2 + a.personer.length;
        const scoreB =
          b.stillinger.length * 3 + b.signaler.length * 2 + b.personer.length;
        return scoreB - scoreA;
      })
  );
}

/** Beregn matchScore 0–100 basert på hva som finnes */
export function beregnMatchScore(kort: SelskapKort): number {
  let score = 40;
  if (kort.stillinger.length > 0) score += 30;
  if (kort.signaler.length > 0) score += 20;
  if (kort.personer.length > 0) score += 10;
  return Math.min(score, 100);
}
