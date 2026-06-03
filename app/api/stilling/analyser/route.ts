import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: {
    stilling?: Record<string, unknown>;
    userProfile?: Record<string, unknown>;
    personProfile?: Record<string, unknown>;
  };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Ugyldig JSON" }, { status: 400 }); }

  const { stilling, userProfile: up } = body;
  if (!stilling) return NextResponse.json({ matchScore: 50, gap: [], anbefaling: "" });

  const client = new Anthropic();

  const ferdigheter = Array.isArray(up?.ferdigheter)
    ? (up.ferdigheter as string[]).join(", ")
    : String(up?.ferdigheter ?? "");

  const prompt = `Du er en norsk karriererådgiver. Analyser match mellom kandidat og stilling.

KANDIDAT:
- Søker: ${up?.soker ?? ""}
- Bransje: ${up?.bransje ?? ""}
- Erfaring: ${up?.erfaring ?? ""}
- Ferdigheter: ${ferdigheter}
- Karrieremål: ${up?.karrieremaal ?? ""}

STILLING:
- Tittel: ${stilling.title ?? ""}
- Selskap: ${stilling.company ?? ""}
- Beskrivelse: ${stilling.beskrivelse ?? stilling.description ?? ""}

Returner KUN gyldig JSON uten markdown:
{
  "matchScore": <tall 0-100>,
  "matchForklaring": "<én setning>",
  "gap": [
    {"type": "ok", "tekst": "<noe kandidaten har som matcher>"},
    {"type": "gap", "tekst": "<noe som mangler men kan kompenseres>"},
    {"type": "missing", "tekst": "<noe som mangler helt>"}
  ],
  "anbefaling": "<konkret råd i én setning>"
}`;

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }],
    });

    const tekst = response.content.find(b => b.type === "text")
      ? (response.content.find(b => b.type === "text") as { type: "text"; text: string }).text
      : "{}";
    const data = JSON.parse(tekst.replace(/```json|```/g, "").trim()) as unknown;
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ matchScore: 70, gap: [], anbefaling: "" });
  }
}
