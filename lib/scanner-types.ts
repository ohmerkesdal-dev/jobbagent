export type ScannerSignalType =
  | "Utlyst stilling"
  | "Nyhet"
  | "LinkedIn"
  | "Selskap";

export type ScannerFunn = {
  id: string;
  signalType: ScannerSignalType;
  title: string;
  company?: string;
  url: string;
  /** Publiseringsdato fra kilde (ISO eller lesbar tekst) */
  dato?: string;
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
