import type { ProfilScanInput } from "./scanner-types";

/** Kombiner bransje + rolle til søkeord for NAV / nett-søk */
export function søkeordKjerne(p: ProfilScanInput): string {
  const parts = [p.industry, p.seeking]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return parts.slice(0, 120);
}

/** Første «by» fra geografi (grovt) */
export function grovBy(geography: string): string {
  const m = geography.match(
    /(Oslo|Bergen|Trondheim|Stavanger|Tromsø|Kristiansand|Fredrikstad|Sandnes|Drammen|Skien|Ålesund|Bodø|Haugesund|Tønsberg|Moss|Porsgrunn|Remote|remote)/i,
  );
  return m ? m[1] : geography.split(/[,\n]/)[0]?.trim() || "Norge";
}

/** Tre nett-søk basert på profil (Brave Search). */
export function byggProfilSøk(p: ProfilScanInput): string[] {
  const bransje = p.industry.trim() || "tech";
  const rolle = p.seeking.trim() || "jobb";

  return [
    `${bransje} ansetter ${rolle} Norge`,
    `${bransje} funding Norge`,
    `site:linkedin.com/in ${rolle} Oslo`,
  ];
}

/** Ett søk per selskap brukeren følger. */
export function byggSelskapSøk(selskap: string): string {
  const q = selskap.trim();
  return `"${q}" nyheter Norge OR site:linkedin.com/company ${q}`;
}

/**
 * Korte søkeord til NAV stillingssøk (lang `q` gir ofte få treff).
 * Prøves i rekkefølge til API returnerer data.
 */
export function navSøkeordVarianter(p: ProfilScanInput): string[] {
  const seeking = p.seeking.trim();
  const industry = p.industry.trim();
  const firstSeeking = seeking.split(/[,;]/)[0]?.trim() ?? "";
  const firstIndustry = industry.split(/[,;]/)[0]?.trim() ?? "";
  const kjerne = søkeordKjerne(p);
  const firstThreeWords = kjerne.split(/\s+/).filter(Boolean).slice(0, 3).join(" ");

  const out: string[] = [];
  const add = (s: string) => {
    const t = s.trim();
    if (t.length < 2) return;
    const clipped = t.slice(0, 72);
    if (!out.includes(clipped)) out.push(clipped);
  };

  if (firstSeeking) add(firstSeeking);
  if (firstIndustry && firstIndustry.toLowerCase() !== firstSeeking.toLowerCase()) {
    add(firstIndustry);
  }
  if (firstThreeWords) add(firstThreeWords);
  if (kjerne) add(kjerne.slice(0, 72));
  add("jobb");

  return out;
}
