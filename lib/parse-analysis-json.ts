import { isAnalysisResult, type AnalysisResult } from "./analysis-types";

export function parseAnalysisJson(raw: string): AnalysisResult {
  const trimmed = raw.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? jsonMatch[0] : trimmed;
  const parsed: unknown = JSON.parse(jsonStr);
  if (!isAnalysisResult(parsed)) {
    throw new Error("Ugyldig svar fra modellen");
  }
  const p = Math.round(
    Math.min(100, Math.max(0, parsed.hiddenJobProbability)),
  );
  return { ...parsed, hiddenJobProbability: p };
}
