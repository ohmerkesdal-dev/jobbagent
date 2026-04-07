export type PipelineKanal = "linkedin" | "epost" | "telefon";

export type PipelineStatus = "sendt" | "svar" | "møte" | "avsluttet";

export type PipelineHistorikkEntry = {
  status: PipelineStatus;
  dato: string;
};

export interface PipelineKontakt {
  id: string;
  navn: string;
  tittel: string;
  selskap: string;
  kanal: PipelineKanal;
  status: PipelineStatus;
  melding: string;
  signal: string;
  sendtDato: string;
  oppfølgingDato: string;
  notat: string;
  svarDato?: string;
  møteDato?: string;
  historikk?: PipelineHistorikkEntry[];
}
