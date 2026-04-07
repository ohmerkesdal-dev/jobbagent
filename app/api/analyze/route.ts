import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import {
  CV_TEXT_MAX_FOR_MODEL,
  JOBBAGENT_SYSTEM_PROMPT,
  JOBBAGENT_SYSTEM_PROMPT_WITH_PROFILE,
  JSON_OUTPUT_INSTRUCTION,
} from "@/lib/system-prompt";
import { parseAnalysisJson } from "@/lib/parse-analysis-json";
import type { JobbagentProfil } from "@/lib/profile-types";

const MODEL =
  process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-5";

function isProfilPayload(value: unknown): value is JobbagentProfil {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.name === "string" &&
    typeof o.seeking === "string" &&
    typeof o.industry === "string" &&
    typeof o.geography === "string" &&
    typeof o.bio === "string"
  );
}

function buildUserContent(
  signal: string,
  jobbagent_profil: JobbagentProfil | undefined,
  cvText: string | undefined,
): string {
  const base = `Analyser følgende signal:\n\n${signal}`;

  const cvTrim =
    typeof cvText === "string"
      ? cvText.slice(0, CV_TEXT_MAX_FOR_MODEL).trim()
      : "";

  if (!jobbagent_profil) {
    if (cvTrim) {
      return `${base}

Valgfritt utdrag fra kandidatens CV (tekst):
${cvTrim}

${JSON_OUTPUT_INSTRUCTION}`;
    }
    return `${base}\n\n${JSON_OUTPUT_INSTRUCTION}`;
  }

  const profilBlock = `
Kandidatprofil:
- Navn: ${jobbagent_profil.name}
- Søker: ${jobbagent_profil.seeking}
- Bransje: ${jobbagent_profil.industry}
- Geografi: ${jobbagent_profil.geography}
- Bio: ${jobbagent_profil.bio}

Utdrag fra CV (tekst, maks ${CV_TEXT_MAX_FOR_MODEL} tegn):
${cvTrim || "(Ingen CV-tekst tilgjengelig — bruk bio og profilfelt.)"}
`.trim();

  return `${base}\n\n${profilBlock}\n\n${JSON_OUTPUT_INSTRUCTION}`;
}

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY er ikke konfigurert" },
      { status: 500 },
    );
  }

  let body: {
    signal?: string;
    jobbagent_profil?: unknown;
    cvText?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ugyldig JSON" }, { status: 400 });
  }

  const signal = typeof body.signal === "string" ? body.signal.trim() : "";
  if (!signal) {
    return NextResponse.json({ error: "Signal mangler" }, { status: 400 });
  }
  if (signal.length > 120_000) {
    return NextResponse.json({ error: "Signalet er for langt" }, { status: 400 });
  }

  let jobbagent_profil: JobbagentProfil | undefined;
  if (body.jobbagent_profil !== undefined) {
    if (!isProfilPayload(body.jobbagent_profil)) {
      return NextResponse.json(
        { error: "Ugyldig jobbagent_profil" },
        { status: 400 },
      );
    }
    jobbagent_profil = {
      name: body.jobbagent_profil.name.trim(),
      seeking: body.jobbagent_profil.seeking.trim(),
      industry: body.jobbagent_profil.industry.trim(),
      geography: body.jobbagent_profil.geography.trim(),
      bio: body.jobbagent_profil.bio.trim(),
    };
  }

  let cvText: string | undefined;
  if (body.cvText !== undefined) {
    if (typeof body.cvText !== "string") {
      return NextResponse.json({ error: "cvText må være tekst" }, { status: 400 });
    }
    cvText = body.cvText.slice(0, CV_TEXT_MAX_FOR_MODEL);
  }

  const system =
    jobbagent_profil !== undefined
      ? JOBBAGENT_SYSTEM_PROMPT_WITH_PROFILE
      : JOBBAGENT_SYSTEM_PROMPT;

  const userContent = buildUserContent(signal, jobbagent_profil, cvText);

  const client = new Anthropic({ apiKey });

  try {
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system,
      messages: [
        {
          role: "user",
          content: userContent,
        },
      ],
    });

    const textBlock = msg.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json(
        { error: "Tomt svar fra modellen" },
        { status: 502 },
      );
    }

    const result = parseAnalysisJson(textBlock.text);
    return NextResponse.json(result);
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Kunne ikke fullføre analysen";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
