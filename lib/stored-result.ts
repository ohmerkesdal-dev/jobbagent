import { isAnalysisResult, type AnalysisResult } from "./analysis-types";
import type { UsedProfileMeta } from "./profile-types";

export type StoredAnalysisPayload = {
  analysis: AnalysisResult;
  usedProfile?: UsedProfileMeta;
  /** Signalteksten brukeren limte inn på forsiden */
  originalSignal?: string;
};

export function parseStoredAnalysisPayload(
  raw: string,
): StoredAnalysisPayload | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;

    if ("analysis" in parsed && parsed.analysis) {
      const inner = (parsed as { analysis: unknown }).analysis;
      if (!isAnalysisResult(inner)) return null;
      const usedProfile =
        "usedProfile" in parsed &&
        parsed.usedProfile &&
        typeof parsed.usedProfile === "object" &&
        typeof (parsed.usedProfile as UsedProfileMeta).name === "string" &&
        typeof (parsed.usedProfile as UsedProfileMeta).seeking === "string"
          ? (parsed.usedProfile as UsedProfileMeta)
          : undefined;
      const originalSignal =
        "originalSignal" in parsed &&
        typeof (parsed as { originalSignal?: unknown }).originalSignal ===
          "string"
          ? (parsed as { originalSignal: string }).originalSignal
          : undefined;
      return { analysis: inner, usedProfile, originalSignal };
    }

    if (isAnalysisResult(parsed)) {
      return { analysis: parsed };
    }
    return null;
  } catch {
    return null;
  }
}
