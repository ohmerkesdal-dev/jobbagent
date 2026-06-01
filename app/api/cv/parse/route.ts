import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

type ParsedCV = {
  navn?: string;
  soker?: string;
  bransje?: string;
  bio?: string;
  erfaring?: string;
  ferdigheter?: string[];
  karrieremaal?: string;
};

export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Ugyldig formdata" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "Ingen fil lastet opp" }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

  const prompt = `Les denne CV-en og ekstraher følgende informasjon som JSON. Svar KUN med gyldig JSON, ingen forklaring eller markdown.

{
  "navn": "fullt navn",
  "soker": "ønsket stilling/tittel (f.eks. Regnskapsfører, Prosjektleder)",
  "bransje": "bransje eller fagfelt (f.eks. Regnskap og økonomi, IT, HR)",
  "bio": "2-3 setninger som oppsummerer kandidaten profesjonelt",
  "erfaring": "velg én: 0-1, 1-3, 3-5, 5-10, eller 10+",
  "ferdigheter": ["ferdighet1", "ferdighet2", "ferdighet3"],
  "karrieremaal": "kort karrieremål basert på CV"
}`;

  try {
    let result;

    if (isPdf) {
      const base64 = buffer.toString("base64");
      result = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: {
                  type: "base64",
                  media_type: "application/pdf",
                  data: base64,
                },
              } as Parameters<typeof client.messages.create>[0]["messages"][0]["content"][0],
              { type: "text", text: prompt },
            ],
          },
        ],
      });
    } else {
      const text = buffer.toString("utf-8");
      result = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [
          {
            role: "user",
            content: `${prompt}\n\nCV-innhold:\n${text}`,
          },
        ],
      });
    }

    const raw = result.content
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("");

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Kunne ikke parse CV" }, { status: 500 });
    }

    const parsed: ParsedCV = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ profile: parsed });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Ukjent feil" },
      { status: 500 },
    );
  }
}
