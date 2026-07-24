import { useCallback, useState } from "react";
import { api, ApiError } from "../api/client";
import type { LabelRow, ProcessLabelsResponse, ProcessedRow } from "../types/label";
import type { SubpageConfig } from "../types/config";

/** Egy javítás teljes naplórekordja (a régi loggedFixes elemei). */
export interface CorrectionRecordFull {
  rowIndex: number;
  oszlop: string;
  eredeti: string;
  ai_javaslat: string;
  termek: string;
  excel_sor: number | null;
  hiba_leiras: string;
}

interface ValidationState {
  loading: boolean;
  /** Ha nem null: a validációs modal nyitva ezzel az eredménnyel. */
  pendingResult: ProcessLabelsResponse | null;
}

/**
 * A /api/process-labels hívás + validációs modal állapot + korrekció-naplózás
 * (az LL validateWithAgent + logCorrections portja).
 */
export function useValidationFlow(
  config: SubpageConfig,
  onComplete: (rows: ProcessedRow[]) => void,
  onError?: (msg: string) => void,
) {
  const [state, setState] = useState<ValidationState>({ loading: false, pendingResult: null });

  const validate = useCallback(
    async (rows: LabelRow[] | ProcessedRow[]) => {
      setState({ loading: true, pendingResult: null });
      try {
        const result = await api.post<ProcessLabelsResponse>("/api/process-labels", {
          rows,
          subpage: config.subpageId,
        });
        // Batch autofix (Ditall): az automatikusan javított hibák NEM kerülnek a modalba,
        // csak a manuális beavatkozást igénylők (a régi showValidationModal szűrése).
        const manualisIssues = result.issues
          .map((issue) => ({ ...issue, hibak: issue.hibak.filter((h) => !h.auto_javitott) }))
          .filter((issue) => issue.hibak.length > 0);
        const manualisCount =
          result.osszes_manualis_hiba ??
          manualisIssues.reduce((s, i) => s + i.hibak.length, 0);
        if (manualisCount > 0) {
          setState({
            loading: false,
            pendingResult: { ...result, issues: manualisIssues, osszes_hiba: manualisCount },
          });
        } else {
          setState({ loading: false, pendingResult: null });
          onComplete(result.processed_rows);
        }
      } catch (err) {
        console.warn("Feldolgozás hiba:", err);
        setState({ loading: false, pendingResult: null });
        // SEC: ha a backend SZÁNDÉKOSAN utasította el a kérést (4xx - pl. demo
        // sorplafon 400, rate limit / napi keret 429, túl nagy body 413), NE
        // rendereljünk csendben nyers, ellenőrizetlen adatot. Mutassuk a szerver
        // üzenetét - különben a kliens megkerülné a szerveroldali demo-korlátot.
        if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
          onError?.(err.message);
          return;
        }
        // Hálózati hiba / 5xx: elnéző fallback (a backend nem érhető el) - de a demo
        // sorplafont itt is betartjuk, hogy a fallback-út ne legyen megkerülés.
        const capped =
          config.maxRows != null
            ? (rows as ProcessedRow[]).slice(0, config.maxRows)
            : (rows as ProcessedRow[]);
        onComplete(capped);
      }
    },
    [config.subpageId, config.maxRows, onComplete, onError],
  );

  const logCorrections = useCallback(
    (fixes: CorrectionRecordFull[], finalData: ProcessedRow[], mode: "applied" | "skipped") => {
      if (!fixes || fixes.length === 0) return;
      try {
        const records = fixes.map((f) => {
          const finalVal =
            mode === "skipped"
              ? f.eredeti
              : String(finalData[f.rowIndex]?.[f.oszlop] ?? "");
          let action: string;
          if (mode === "skipped") action = "skipped";
          else if (f.ai_javaslat && finalVal === f.ai_javaslat) action = "accepted";
          else if (finalVal === f.eredeti) action = "unchanged";
          else action = "edited";
          return {
            oszlop: f.oszlop,
            eredeti: f.eredeti,
            ai_javaslat: f.ai_javaslat,
            vegso_ertek: finalVal,
            action,
            termek: f.termek,
            excel_sor: f.excel_sor,
            hiba_leiras: f.hiba_leiras,
          };
        });
        void api
          .post("/api/log-corrections", { subpage: config.subpageId, corrections: records })
          .catch(() => {});
      } catch (e) {
        console.warn("Korrekciós napló hiba:", e);
      }
    },
    [config.subpageId],
  );

  const applyFixes = useCallback(
    (finalData: ProcessedRow[], fixes: CorrectionRecordFull[]) => {
      setState({ loading: false, pendingResult: null });
      logCorrections(fixes, finalData, "applied");
      onComplete(finalData);
    },
    [logCorrections, onComplete],
  );

  const skipFixes = useCallback(
    (fixes: CorrectionRecordFull[]) => {
      const result = state.pendingResult;
      setState({ loading: false, pendingResult: null });
      if (result) {
        logCorrections(fixes, result.processed_rows, "skipped");
        onComplete(result.processed_rows);
      }
    },
    [state.pendingResult, logCorrections, onComplete],
  );

  return {
    loading: state.loading,
    pendingResult: state.pendingResult,
    validate,
    applyFixes,
    skipFixes,
  };
}
