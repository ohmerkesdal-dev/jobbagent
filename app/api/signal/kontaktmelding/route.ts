import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export async function POST(request: Request) {
  let body: {
    signal?: { title?: string; signalSubtype?: string; beskrivelse?: string };
    userProfile?: { navn?: string; soker?: string; bransje?: string; erfaring?: string; ferdigheter?: string[] };
    personProfile?: { prestasjoner?: Array<{ tekst?: string }> };
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ugyldig JSON" }, { status: 400 });
  }

  const { signal, userProfile: up, personProfile: pp } = body;
  if (!signal?.title) {
    return NextResponse.json({ error: "Signal mangler" }, { status: 400 });
  }

  const prestasjon = pp?.prestasjoner?.[0]?.tekst ?? "ikke oppgitt";

  const prompt = `Du er en norsk karriererådgiver som skriver korte, direkte kontaktmeldinger for jobbsøkere.

Kandidat: ${up?.navn ?? "ukjent"}
Søker: ${up?.soker ?? ""}
Bransje: ${up?.bransje ?? ""}
Erfaring: ${up?.erfaring ?? ""}
Ferdigheter: ${(up?.ferdigheter ?? []).join(", ")}

Kandidatens sterkeste prestasjon (bruk denne):
${prestasjon}

Signal som utløser kontakt:
Tittel: ${signal.title}
Type: ${signal.signalSubtype ?? "vekst"}
Beskrivelse: ${signal.beskrivelse ?? ""}

Skriv en LinkedIn-direktemelding på norsk som:
1. Er maks 5 setninger
2. Refererer direkte til signalet (funding, ny leder, vekst)
3. Nevner én konkret ting kandidaten kan bidra med
4. Ikke starter med "Hei" pluss navn — bare "Hei,"
5. Aldri bruker: "brenner for", "resultatorientert", "løsningsorientert"
6. Slutter med ett enkelt spørsmål

NORSK SPRÅKFILTER:
Aldri: resultatorientert, løsningsorientert, brenner for, lidenskap, robuste løsninger, proaktiv, dedikert
Alltid: korte setninger, aktiv form, konkret og direkte

Returner kun meldingen, ingen forklaring.`;

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    });

    const melding = message.content
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("");

    return NextResponse.json({ melding });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Ukjent feil" },
      { status: 500 },
    );
  }
}
