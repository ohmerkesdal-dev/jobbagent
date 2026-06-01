export type ScannerSignalType =
  | "Utlyst stilling"
  | "Nyhet"
  | "LinkedIn"
  | "Selskap";

export type ScannerKategori = "stilling" | "signal" | "person" | "nyhet";

export type ScannerFunn = {
  id: string;
  signalType: ScannerSignalType;
  /** AI-klassifisert kategori for visning i seksjoner */
  kategori?: ScannerKategori;
  title: string;
  company?: string;
  location?: string;
  url: string;
  /** Publiseringsdato fra kilde (ISO eller lesbar tekst) */
  dato?: string;
  /** Søknadsfrist (ISO) */
  deadline?: string;
  beskrivelse?: string;
  kilde: string;
  /** Når Jobbagent registrerte funnet */
  funnetDato: string;
};

export type ProfilScanInput = {
  name: string;
  seeking: string;
  industry: string;
  geography: string;
  bio: string;
};
