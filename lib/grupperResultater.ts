import type { ScannerFunn, ScannerKategori } from "./scanner-types";
import type { SelskapKort } from "./types";

function getKategori(f: ScannerFunn): ScannerKategori {
  if (f.kategori) return f.kategori;
  if (f.signalType === "Utlyst stilling") return "stilling";
  if (f.signalType === "LinkedIn") return "person";
  if (f.signalType === "Selskap") return "signal";
  return "nyhet";
}

/**
 * Grupper kun funn der company er eksplisitt satt av scraperen.
 * Stillinger uten company vises flatt (se getUgrupperteStillinger).
 */
export function grupperPerSelskap(resultater: ScannerFunn[]): SelskapKort[] {
  const selskapMap = new Map<string, SelskapKort>();

  for (const r of resultater) {
    const company = r.company?.trim();
    if (!company) continue; // hopp over funn uten kjent selskap

    const nøkkel = company.toLowerCase();

    if (!selskapMap.has(nøkkel)) {
      selskapMap.set(nøkkel, {
        id: nøkkel,
        navn: company,
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

  return Array.from(selskapMap.values())
    .filter((s) => s.stillinger.length > 0 || s.signaler.length > 0)
    .sort((a, b) => {
      const scoreA = a.stillinger.length * 3 + a.signaler.length * 2 + a.personer.length;
      const scoreB = b.stillinger.length * 3 + b.signaler.length * 2 + b.personer.length;
      return scoreB - scoreA;
    });
}

/** Stillinger uten kjent selskap — vises som flat liste */
export function getUgrupperteStillinger(resultater: ScannerFunn[]): ScannerFunn[] {
  return resultater.filter(
    (f) => getKategori(f) === "stilling" && !f.company?.trim(),
  );
}

/** Alle signaler (funding, vekst, ny-ledelse, ansetter) — vises flatt */
export function getSignalerFlat(resultater: ScannerFunn[]): ScannerFunn[] {
  return resultater.filter(
    (f) => getKategori(f) === "signal" && f.signalSubtype !== "bransjenyhet",
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
