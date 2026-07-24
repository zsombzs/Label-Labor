import { useMemo, useState } from "react";
import type { ProcessLabelsResponse, ProcessedRow } from "../types/label";
import type { CorrectionRecordFull } from "../hooks/useValidationFlow";
import { applyUnitPrices, recalculateUnitPrice } from "../lib/labelUtils";

interface ValidationModalProps {
  result: ProcessLabelsResponse;
  unitMap: "standard" | "ditall";
  /** Demo oldalon minden gondolatjel sima kötőjelre cserélve. */
  isDemo?: boolean;
  onApply: (finalData: ProcessedRow[], fixes: CorrectionRecordFull[]) => void;
  onSkip: (fixes: CorrectionRecordFull[]) => void;
}

interface FixState {
  value: string;
  accepted: boolean;
}

function fixKey(rowIndex: number, hibaIdx: number): string {
  return `${rowIndex}_${hibaIdx}`;
}

/**
 * Adatellenőrző modal - az LL showValidationModal React-portja.
 * Elfogadott javítások a munkapéldányba íródnak; Ár/Kiszerelés elfogadásakor
 * az egységár újraszámolódik. A "Kihagyás" a backend-feldolgozott sorokat adja vissza.
 */
export function ValidationModal({ result, unitMap, isDemo = false, onApply, onSkip }: ValidationModalProps) {
  const dash = isDemo ? "-" : "-";
  // Munkapéldány: a feldolgozott sorok mély másolata (ebbe írnak az elfogadások)
  const [workingData] = useState<ProcessedRow[]>(() =>
    JSON.parse(JSON.stringify(result.processed_rows)) as ProcessedRow[],
  );
  const [fixes, setFixes] = useState<Record<string, FixState>>(() => {
    const init: Record<string, FixState> = {};
    result.issues.forEach((issue) => {
      issue.hibak.forEach((hiba, hibaIdx) => {
        init[fixKey(issue.row_index, hibaIdx)] = {
          value: String(hiba.javitott || hiba.eredeti || ""),
          accepted: false,
        };
      });
    });
    return init;
  });

  const loggedFixes = useMemo<CorrectionRecordFull[]>(
    () =>
      result.issues.flatMap((issue) =>
        issue.hibak.map((hiba) => ({
          rowIndex: issue.row_index,
          oszlop: hiba.oszlop,
          eredeti: hiba.eredeti ?? "",
          ai_javaslat: hiba.javitott ?? "",
          termek: issue.termek ?? "",
          excel_sor: issue.excel_sor ?? null,
          hiba_leiras: hiba.hiba ?? "",
        })),
      ),
    [result],
  );

  function toggleAccept(rowIndex: number, oszlop: string, key: string) {
    setFixes((prev) => {
      const fix = prev[key];
      if (!fix) return prev;
      const next = { ...prev, [key]: { ...fix, accepted: !fix.accepted } };
      const row = workingData[rowIndex];
      if (row) {
        if (!fix.accepted) {
          // Elfogadás: érték beírása a munkapéldányba
          row[oszlop] = fix.value.trim();
          if (oszlop === "Ár" || oszlop === "Kiszerelés") {
            applyUnitPrices(row, recalculateUnitPrice(row["Kiszerelés"], row["Ár"], unitMap), unitMap);
          }
        }
        // Visszavonásnál a régi kód sem állította vissza az értéket - paritás.
      }
      return next;
    });
  }

  function onBlurField(rowIndex: number, oszlop: string, key: string, original: string) {
    const fix = fixes[key];
    if (fix && !fix.accepted && fix.value.trim() !== original) {
      toggleAccept(rowIndex, oszlop, key);
    }
  }

  return (
    <div className="validation-overlay active">
      <div className="validation-modal">
        <h2>⚠️ Adatellenőrzés</h2>
        <div className="summary">
          <strong>
            {result.osszes_hiba} problémát találtunk {result.issues.length} terméknél.
          </strong>
          <br />
          <br />
          <small>
            Az alábbiakban javasolt javításokat talál. Ha szükséges, manuálisan is módosítható
            bármelyik érték. A &quot;Javítások alkalmazása&quot; gombra kattintva az összes javítás
            automatikusan érvénybe lép.
          </small>
        </div>
        <div id="issuesList">
          {result.issues.map((issue) => (
            <div className="issue-card" key={issue.row_index}>
              <div className="product-name">
                {(issue.excel_sor ?? 0) - 1}. termék {dash} {issue.termek}
              </div>
              {issue.hibak.map((hiba, hibaIdx) => {
                const key = fixKey(issue.row_index, hibaIdx);
                const fix = fixes[key];
                if (!fix) return null;
                const original = String(hiba.javitott || hiba.eredeti || "");
                // Ditall: sor-mezők karakterlimitje (a régi getLineMaxLength párja)
                const maxLen =
                  unitMap === "ditall"
                    ? hiba.oszlop === "Harmadik_sor"
                      ? 24
                      : hiba.oszlop === "Első_sor" || hiba.oszlop === "Második_sor"
                        ? 20
                        : undefined
                    : undefined;
                return (
                  <div
                    className="issue-item"
                    key={key}
                    style={fix.accepted ? { backgroundColor: "rgba(76, 175, 80, 0.2)" } : undefined}
                  >
                    <div className="field-label">
                      {(issue.excel_sor ?? 0) - 1}. termék, {hiba.oszlop} oszlop
                    </div>
                    <div className="error-text">{hiba.hiba}</div>
                    <div className="fix-row">
                      <input
                        type="text"
                        value={fix.value}
                        maxLength={maxLen}
                        placeholder="Javított érték..."
                        disabled={fix.accepted}
                        style={fix.accepted ? { borderColor: "#4caf50" } : undefined}
                        onChange={(e) =>
                          setFixes((prev) => ({
                            ...prev,
                            [key]: { ...(prev[key] as FixState), value: e.target.value },
                          }))
                        }
                        onBlur={() => onBlurField(issue.row_index, hiba.oszlop, key, original)}
                      />
                      <button
                        className="accept-btn"
                        style={fix.accepted ? { background: "#4caf50" } : undefined}
                        onClick={() => toggleAccept(issue.row_index, hiba.oszlop, key)}
                      >
                        ✓
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="modal-buttons">
          <button className="apply-btn" onClick={() => onApply(workingData, loggedFixes)}>
            ✓ Javítások alkalmazása
          </button>
          <button className="skip-btn" onClick={() => onSkip(loggedFixes)}>
            Kihagyás
          </button>
        </div>
      </div>
    </div>
  );
}
