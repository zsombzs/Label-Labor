/** Nyers Excel-sor (SheetJS sheet_to_json kimenete) - kulcsok az Excel fejlécei. */
export type LabelRow = Record<string, string | number | undefined>;

/** A backend által feldolgozott, renderelésre kész sor (agent/tools.py kimenete). */
export interface ProcessedRow {
  Cikkszám?: string | number;
  "EAN-13"?: string | number;
  Megnevezés?: string;
  Szín?: string; // csak Ditall
  Kiszerelés?: string;
  Ár?: string | number;
  Akciós_ár?: string | number;
  Első_sor?: string;
  Második_sor?: string;
  Harmadik_sor?: string;
  Negyedik_sor?: string; // csak Ditall
  ml?: string | number;
  l?: string | number;
  kg?: string | number;
  g?: string | number;
  db?: string | number;
  m2?: string | number; // csak Ditall
  "Ft/l"?: string | number;
  "Ft/kg"?: string | number;
  "Ft/m2"?: string | number; // csak Ditall
  [key: string]: string | number | undefined;
}

/** Egyetlen mező-hiba a validátortól (agent/validator_agent.py). */
export interface Hiba {
  oszlop: string;
  eredeti?: string;
  javitott?: string;
  /** Hibaleírás szövege. */
  hiba?: string;
  tipus?: string;
  auto_javitott?: boolean;
}

/** Egy problémás sor az issues listában. */
export interface ValidationIssue {
  row_index: number;
  termek?: string;
  excel_sor?: number;
  hibak: Hiba[];
}

/** A /api/process-labels válasza. */
export interface ProcessLabelsResponse {
  processed_rows: ProcessedRow[];
  issues: ValidationIssue[];
  osszes_hiba: number;
  /** Manuális beavatkozást igénylő hibák száma (batch autofix után) - Ditall. */
  osszes_manualis_hiba?: number;
}

/** A /api/label-command (Cimbi) strukturált intentje. */
export interface LabelCommandIntent {
  operation: string;
  target: { mode: string; [key: string]: unknown };
  [key: string]: unknown;
}
