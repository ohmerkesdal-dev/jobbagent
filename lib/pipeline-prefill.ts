import type { AnalysisResult } from "./analysis-types";

/** Enkel heuristikk for å foreslå selskap fra kontaktstrategi (f.eks. «hos Kolonial»). */
export function guessSelskapFromStrategy(text: string): string {
  const m = text.match(
    /(?:hos|i|ved|selskapet)\s+([A-ZÆØÅa-zæøå0-9][^,\.\n]{1,40})/i,
  );
  return m ? m[1].trim() : "";
}

/** Foreslå kontaktnavn fra strategi (første treff av «Kontakt X» eller lignende). */
export function guessNavnFromStrategy(text: string): string {
  const m = text.match(
    /(?:kontakt|nå ut til|ta kontakt med)\s+([A-ZÆØÅ][a-zæøå]+(?:\s+[A-ZÆØÅ][a-zæøå]+)?)/i,
  );
  return m ? m[1].trim() : "";
}

export function prefillFromAnalysis(analysis: AnalysisResult): {
  navn: string;
  tittel: string;
  selskap: string;
} {
  const cs = analysis.contactStrategy;
  const se = analysis.signalExplanation;
  return {
    navn:
      guessNavnFromStrategy(cs) ||
      guessNavnFromStrategy(se) ||
      "",
    tittel: "",
    selskap:
      guessSelskapFromStrategy(cs) || guessSelskapFromStrategy(se) || "",
  };
}
