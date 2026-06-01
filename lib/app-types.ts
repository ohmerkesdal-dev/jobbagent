export type ScanResult = {
  id: string;
  source: 'nav' | 'brave' | 'linkedin';
  category: 'stilling' | 'vekst' | 'person' | 'signal' | 'fulgt';
  title: string;
  company?: string;
  location?: string;
  description: string;
  url?: string;
  date: string;
};

export type UserProfile = {
  navn: string;
  soker: string;
  bransje: string;
  geografi: string;
  bio: string;
  erfaring: '0-1' | '1-3' | '3-5' | '5-10' | '10+';
  ferdigheter: string[];
  karrieremaal: string;
  cvText?: string;
  selskaper: string[];
};

export type PipelineCard = {
  id: string;
  selskap: string;
  rolle: string;
  dato: string;
  notat?: string;
  kolonne: 'Interessant' | 'Kontaktet' | 'Intervju' | 'Tilbud' | 'Avslått';
};
