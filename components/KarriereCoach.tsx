"use client";

import { useEffect, useState } from "react";

export type KoachKontekst =
  | "etter-avslag"
  | "ingen-svar-5-dager"
  | "forste-soknad"
  | "intervju-booket"
  | "pipeline-tom"
  | "profil-ufullstendig"
  | "hoy-sesong";

const karriereRaad: Record<
  KoachKontekst,
  { melding: string; tips: string[]; forskning: string; kilde: string }
> = {
  "etter-avslag": {
    melding:
      "Et avslag betyr ikke at du ikke er god nok — det betyr at det ikke var riktig match akkurat nå.",
    tips: [
      "Be om tilbakemelding innen 48 timer — de fleste er villige til å gi det",
      "Skriv ned hva du ville gjort annerledes — ikke for å kritisere deg selv, men for å lære",
      "Søk én ny stilling i dag mens motivasjonen er høy — det hjelper mot grubling",
    ],
    forskning:
      "Jobbsøkere som ber om tilbakemelding etter avslag har 34% høyere sjanse for å lykkes i neste intervju.",
    kilde: "Karriereveiledning Norge",
  },
  "ingen-svar-5-dager": {
    melding:
      "5 dager uten svar er normalt — men en kort oppfølging kan doble svarprosenten.",
    tips: [
      "Send én kort e-post: «Vil bare bekrefte at søknaden er mottatt, og si at jeg fortsatt er veldig interessert»",
      "Finn HR-ansvarlig på LinkedIn og send en kort melding — ikke e-post",
      "Ikke send mer enn én oppfølging — respekter prosessen",
    ],
    forskning:
      "Kandidater som følger opp én gang får svar 2× oftere enn de som venter passivt.",
    kilde: "LinkedIn Talent Solutions 2025",
  },
  "forste-soknad": {
    melding:
      "Den første søknaden er alltid den vanskeligste. Her er hva som faktisk fungerer.",
    tips: [
      "Les stillingsannonsen tre ganger — bruk de samme ordene de bruker",
      "Åpne med noe du har gjort, ikke hvem du er",
      "En konkret prestasjon med tall er verdt mer enn tre avsnitt med adjektiver",
    ],
    forskning:
      "Rekrutterere bruker i gjennomsnitt 7 sekunder på første gjennomlesning av en søknad.",
    kilde: "Eye-tracking studie, Ladders Inc.",
  },
  "intervju-booket": {
    melding:
      "Du har fått intervju — nå handler det om forberedelse, ikke prestasjon.",
    tips: [
      "Forbered 3 STAR-historier (Situasjon, Oppgave, Handling, Resultat) fra din erfaring",
      "Søk på selskapet på Google Nyheter — siste 3 måneder. Vis at du følger med",
      "Forbered 2 gjennomtenkte spørsmål til dem — ikke om lønn, om arbeidet",
    ],
    forskning:
      "Kandidater som stiller gjennomtenkte spørsmål vurderes 40% mer positivt av intervjuere.",
    kilde: "Harvard Business Review",
  },
  "pipeline-tom": {
    melding:
      "En tom pipeline er ikke fiasko — det er et signal om å søke bredere eller smartere.",
    tips: [
      "Legg til 3 selskaper i «Interessant» i dag — ikke bare stillingsannonser, men selskaper du vil jobbe for",
      "Ta kontakt med én nøkkelperson denne uken — ikke for å søke jobb, men for å lære",
      "Oppdater profilen din med en ny ferdighet eller prestasjon",
    ],
    forskning:
      "80% av jobber lyses aldri ut offentlig — de fylles gjennom nettverk og direkte kontakt.",
    kilde: "LinkedIn Economic Graph",
  },
  "profil-ufullstendig": {
    melding:
      "En ufullstendig profil gir unøyaktige anbefalinger — 10 minutter nå sparer timer senere.",
    tips: [
      "Last opp CV-en din — systemet bruker den til å tilpasse alle søknader",
      "Svar på 2 spørsmål i «Kjenn deg selv» — det tar 3 minutter",
      "Legg til én prestasjon i prestasjonsboksen",
    ],
    forskning:
      "Brukere med fullstendig profil får 3× mer relevante stillingsforslag.",
    kilde: "Jobbagent intern data",
  },
  "hoy-sesong": {
    melding:
      "Du er i høysesong — januar–april og august–oktober er de beste månedene å søke i Norge.",
    tips: [
      "Søk nå — ikke vent til stillingen er perfekt. Budsjetter settes i denne perioden",
      "Øk antall søknader til 3–5 per uke i høysesong",
      "Ta kontakt med selskaper direkte — mange ansetter før de lyser ut",
    ],
    forskning:
      "65% av alle stillinger i Norge lyses ut i januar–april og august–oktober.",
    kilde: "NAV Arbeidsmarkedsstatistikk",
  },
};

const DISMISSED_KEY = "dismissedCoach";

function getDismissed(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function dismiss(kontekst: string) {
  const s = getDismissed();
  s.add(kontekst);
  localStorage.setItem(DISMISSED_KEY, JSON.stringify([...s]));
}

export function KarriereCoach({ kontekst }: { kontekst: KoachKontekst }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(!getDismissed().has(kontekst));
  }, [kontekst]);

  if (!visible) return null;

  const raad = karriereRaad[kontekst];

  return (
    <div
      className="relative rounded-r-xl py-4 pl-5 pr-10"
      style={{
        background: "#FFFBF0",
        borderLeft: "3px solid #1D9E75",
        borderRadius: "0 12px 12px 0",
      }}
    >
      <button
        type="button"
        onClick={() => {
          dismiss(kontekst);
          setVisible(false);
        }}
        aria-label="Lukk"
        className="absolute right-3 top-3 text-zinc-400 transition hover:text-zinc-700"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      {/* Melding */}
      <p className="pr-4 text-sm font-medium leading-snug text-zinc-900">
        {raad.melding}
      </p>

      {/* Tips */}
      <ul className="mt-3 space-y-1.5">
        {raad.tips.map((tip) => (
          <li key={tip} className="flex items-start gap-2 text-sm text-zinc-700">
            <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#1D9E75]" />
            {tip}
          </li>
        ))}
      </ul>

      {/* Forskning */}
      <div className="mt-4 rounded-lg bg-white/70 px-3 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#1D9E75]">
          Dette sier forskning
        </p>
        <p className="mt-1 text-xs leading-relaxed text-zinc-700">{raad.forskning}</p>
        <p className="mt-1.5 text-[10px] text-zinc-400">
          Basert på norske karriererådgivere og jobbsøkerdata · {raad.kilde}
        </p>
      </div>
    </div>
  );
}
