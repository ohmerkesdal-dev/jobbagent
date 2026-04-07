export type JobbagentProfil = {
  name: string;
  seeking: string;
  industry: string;
  geography: string;
  bio: string;
  /** Base64-encoded PDF bytes (uten data: URI-prefix) */
  cvBase64?: string;
};

export function isJobbagentProfil(value: unknown): value is JobbagentProfil {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.name === "string" &&
    typeof o.seeking === "string" &&
    typeof o.industry === "string" &&
    typeof o.geography === "string" &&
    typeof o.bio === "string" &&
    (o.cvBase64 === undefined || typeof o.cvBase64 === "string")
  );
}

export type UsedProfileMeta = {
  name: string;
  seeking: string;
};
