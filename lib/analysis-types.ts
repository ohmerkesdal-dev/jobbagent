export type AnalysisResult = {
  signalType: string;
  signalExplanation: string;
  hiddenJobProbability: number;
  contactStrategy: string;
  linkedinMessage: string;
  timingRecommendation: string;
};

export function isAnalysisResult(value: unknown): value is AnalysisResult {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.signalType === "string" &&
    typeof o.signalExplanation === "string" &&
    typeof o.hiddenJobProbability === "number" &&
    typeof o.contactStrategy === "string" &&
    typeof o.linkedinMessage === "string" &&
    typeof o.timingRecommendation === "string"
  );
}
