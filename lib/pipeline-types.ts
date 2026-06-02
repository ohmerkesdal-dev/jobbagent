import type {
  PipelineCard as PipelineCardType,
  PipelineColumn as PipelineColumnType,
} from "./types";

export type PipelineKanal = "linkedin" | "epost" | "telefon";

export type PipelineStatus = "sendt" | "svar" | "møte" | "avsluttet";

export type PipelineColumn = PipelineColumnType;

export type PipelineCard = PipelineCardType;

export type PipelineHistorikkEntry = {
  status: PipelineStatus;
  dato: string;
};

export type Kontaktperson = {
  navn: string;
  linkedinUrl?: string;
};

export type PipelineKontakt = Omit<PipelineCardType, "rolle" | "dato" | "kolonne"> & {
  navn: string;
  tittel: string;
  kanal: PipelineKanal;
  status: PipelineStatus;
  melding: string;
  signal: string;
  sendtDato: string;
  oppfølgingDato: string;
  historikk: PipelineHistorikkEntry[];
  svarDato?: string;
  møteDato?: string;
  rolle: string;
  dato: string;
  kolonne: PipelineColumn;
  /** URL fra Finn.no, LinkedIn, Webcruiter el.l. — satt ved URL-import */
  kildeUrl?: string;
  /** Kontaktperson lagt til manuelt */
  kontaktperson?: Kontaktperson;
};
