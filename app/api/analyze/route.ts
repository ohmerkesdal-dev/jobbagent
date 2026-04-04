import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import {
  JOBBAGENT_SYSTEM_PROMPT,
  JSON_OUTPUT_INSTRUCTION,
} from "@/lib/system-prompt";
import { parseAnalysisJson } from "@/lib/parse-analysis-json";

const MODEL =
  process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-5";

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY er ikke konfigurert" },
      { status: 500 },
    );
  }

  let body: { signal?: string };
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

  const client = new Anthropic({ apiKey });

  try {
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: JOBBAGENT_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Analyser følgende signal:\n\n${signal}\n\n${JSON_OUTPUT_INSTRUCTION}`,
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
