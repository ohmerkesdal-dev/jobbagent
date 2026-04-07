import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

const MODEL =
  process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-5";

type Body = {
  daysSince?: unknown;
  melding?: unknown;
  signal?: unknown;
  navn?: unknown;
  selskap?: unknown;
};

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY er ikke konfigurert" },
      { status: 500 },
    );
  }

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ugyldig JSON" }, { status: 400 });
  }

  const daysSince =
    typeof body.daysSince === "number" && Number.isFinite(body.daysSince)
      ? Math.max(0, Math.floor(body.daysSince))
      : 0;
  const melding = typeof body.melding === "string" ? body.melding.trim() : "";
  const signal = typeof body.signal === "string" ? body.signal.trim() : "";
  const navn = typeof body.navn === "string" ? body.navn.trim() : "";
  const selskap = typeof body.selskap === "string" ? body.selskap.trim() : "";

  if (!melding || !signal) {
    return NextResponse.json(
      { error: "melding og signal er påkrevd" },
      { status: 400 },
    );
  }

  const userPrompt = `Du er Jobbagent. Brukeren sendte denne meldingen for ${daysSince} dager siden og har ikke fått svar. Skriv en kort, naturlig norsk oppfølgingsmelding (maks 40 ord) som:
- Refererer subtilt til den første meldingen
- Ikke er masete eller desperat
- Spør enkelt om meldingen nådde frem
- Er vennlig og profesjonell

Første melding: ${melding}

Signal: ${signal}

Kontaktperson: ${navn || "(ukjent)"} hos ${selskap || "(ukjent)"}

Svar kun med selve oppfølgingsmeldingen, uten overskrift eller anførselstegn rundt hele teksten.`;

  const client = new Anthropic({ apiKey });

  try {
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 512,
      system:
        "Du skriver korte, naturlige norske LinkedIn- eller DM-meldinger. Ingen AI-referanser.",
      messages: [{ role: "user", content: userPrompt }],
    });

    const textBlock = msg.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json(
        { error: "Tomt svar fra modellen" },
        { status: 502 },
      );
    }

    const followupMessage = textBlock.text.trim().replace(/^["']|["']$/g, "");
    return NextResponse.json({ followupMessage });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Kunne ikke generere oppfølging";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
