import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { UserProfile, PersonProfile } from "@/lib/types";

type StillingInput = {
  title: string;
  company: string;
  description: string;
};

type RequestBody = {
  stilling: StillingInput;
  userProfile: UserProfile;
  personProfile: PersonProfile;
};

const client = new Anthropic();

export async function POST(request: Request) {
  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ugyldig JSON" }, { status: 400 });
  }

  const { stilling, userProfile: up, personProfile: pp } = body;

  if (!stilling?.title || !up?.navn) {
    return NextResponse.json(
      { error: "Stilling og brukerprofil er påkrevd" },
      { status: 400 },
    );
  }

  const prestasjoner =
    pp.prestasjoner.length > 0
      ? pp.prestasjoner.map((p) => `- ${p.tekst} [${p.tag}]`).join("\n")
      : "Ingen loggede prestasjoner ennå";

  const cvBullets =
    pp.erfaringer.length > 0
      ? pp.erfaringer
          .flatMap((e) => {
            const lines: string[] = [];
            if (e.svar1) lines.push(`- ${e.tittel}: ${e.svar1}`);
            if (e.svar2) lines.push(`- ${e.svar2}`);
            if (e.svar3) lines.push(`- ${e.svar3}`);
            if (lines.length === 0) lines.push(`- ${e.tittel}`);
            return lines;
          })
          .join("\n")
      : "";

  const verdier = pp.verdier.join(", ");
  const arbeidsstil = pp.arbeidsstil.join(", ");

  const prompt = `Du er en norsk karriererådgiver som skriver skreddersydde søknadsbrev.

Kandidat: ${up.navn}
Søker: ${up.soker}
Bransje: ${up.bransje}
Erfaring: ${up.erfaring}
Ferdigheter: ${up.ferdigheter.join(", ")}
Bio: ${up.bio}
Verdier: ${verdier}
Arbeidsstil: ${arbeidsstil}

Kandidatens sterkeste prestasjoner — bruk minst 2 av disse konkret:
${prestasjoner}

CV-kulepunkter fra erfaringer:
${cvBullets}

Stilling: ${stilling.title} hos ${stilling.company}
Beskrivelse: ${stilling.description}

Skriv et søknadsbrev på norsk som:
1. Høres ut som kandidaten selv — ikke generisk AI-språk
2. Bruker minst 2 konkrete prestasjoner fra listen over med tall og detaljer
3. Kobler kandidatens verdier til stillingen
4. Er 3 avsnitt, maks 250 ord
5. Starter IKKE med "Jeg søker herved"
6. Er direkte og selvsikker i tonen

Returner kun søknadsbrevet, ingen forklaring eller tittel.`;

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    });

    const text = message.content
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("");

    return NextResponse.json({ soknadsbrev: text });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Ukjent feil fra Claude" },
      { status: 500 },
    );
  }
}
