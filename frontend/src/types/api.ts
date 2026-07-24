import type { LabelRow, ProcessedRow } from "./label";

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  redirect_url: string;
  token: string;
}

export interface ProcessLabelsRequest {
  rows: LabelRow[];
  subpage: string;
}

export interface CorrectionRecord {
  row_index: number;
  oszlop: string;
  eredeti: string;
  javitott: string;
  action: string;
}

export interface LogCorrectionsRequest {
  subpage: string;
  corrections: CorrectionRecord[];
}

export interface LabelCommandRequest {
  subpage: string;
  message: string;
  labels: ProcessedRow[];
}

export interface UpdateLabelCountRequest {
  count: number;
}

export interface UpdateLabelCountResponse {
  success: boolean;
  new_count: number;
}

export interface TotalLabelCountResponse {
  total: number;
}

export interface CompanyLabelCountResponse {
  count: number;
}
