export type ScanResult = {
  id: string;
  source: "nav" | "brave" | "linkedin";
  category: "stilling" | "signal" | "innlegg" | "forberedelse";
  title: string;
  company?: string;
  location?: string;
  description: string;
  url?: string;
  date: string;
  deadline?: string;
  signalType?: "funding" | "ansetter" | "ny-ledelse" | "vekst";
};

export type UserProfile = {
  navn: string;
  soker: string;
  bransje: string;
  geografi: string;
  bio: string;
  erfaring: "0-1" | "1-3" | "3-5" | "5-10" | "10+";
  ferdigheter: string[];
  karrieremaal: string;
  cvText?: string;
  selskaper: string[];
};

export type PersonProfile = {
  erfaringer: Erfaring[];
  verdier: string[];
  arbeidsstil: string[];
  prestasjoner: Prestasjon[];
};

export type Erfaring = {
  id: string;
  tittel: string;
  svar1?: string;
  svar2?: string;
  svar3?: string;
};

export type Prestasjon = {
  id: string;
  tekst: string;
  dato: string;
  tag: "Ansvar" | "Kvalitet" | "Utvikling" | "Resultat" | "Annet";
};

export type PipelineColumn =
  | "Interessant"
  | "Kontaktet"
  | "Intervju"
  | "Tilbud"
  | "Avslått";

export type PipelineCard = {
  id: string;
  selskap: string;
  rolle: string;
  dato: string;
  notat?: string;
  kolonne: PipelineColumn;
};
