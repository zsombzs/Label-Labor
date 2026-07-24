import { useMemo, useState } from "react";
import type { LabelRow, ProcessedRow } from "../types/label";
import type { SubpageConfig } from "../types/config";
import {
  applyUnitPrices,
  parseKiszereles,
  recalculateUnitPrice,
  validateEan13,
} from "../lib/labelUtils";

interface TableColumn {
  key: string;
  editable: boolean;
}

/** A TABLE_COLUMNS config-vezérelt változata (a régi LL / Ditall listák tükre). */
export function buildTableColumns(config: SubpageConfig): TableColumn[] {
  const ditall = config.unitMap === "ditall";
  const cols: TableColumn[] = [
    { key: "Cikkszám", editable: true },
    { key: "EAN-13", editable: true },
    { key: "Megnevezés", editable: false },
  ];
  if (ditall) cols.push({ key: "Szín", editable: true });
  cols.push({ key: "Kiszerelés", editable: true });
  cols.push(
    { key: "Első_sor", editable: true },
    { key: "Második_sor", editable: true },
    { key: "Harmadik_sor", editable: true },
  );
  if (ditall) cols.push({ key: "Negyedik_sor", editable: false });
  // Az akciós ár a rendes ár oszlop UTÁN jelenjen meg.
  cols.push({ key: "Ár", editable: true });
  if (config.saleEnabled) cols.push({ key: "Akciós_ár", editable: true });
  cols.push(
    { key: "ml", editable: false },
    { key: "l", editable: false },
    { key: "kg", editable: false },
    { key: "g", editable: false },
  );
  if (ditall) cols.push({ key: "m2", editable: false });
  cols.push({ key: "Ft/l", editable: false }, { key: "Ft/kg", editable: false });
  if (ditall) cols.push({ key: "Ft/m2", editable: false });
  cols.push({ key: "db", editable: false });
  return cols;
}

interface DataTableModalProps {
  config: SubpageConfig;
  data: ProcessedRow[];
  rawData: LabelRow[] | null;
  /** Cellamódosításkor azonnal frissítendő adat (Ár / Akciós_ár render-frissítéshez). */
  onDataChange: (next: ProcessedRow[]) => void;
  onClose: () => void;
  onSaveAndGenerate: (data: ProcessedRow[]) => void;
}

/**
 * "Adatok előnézete" szerkeszthető táblázat - az LL openDataTable/handleCellChange portja.
 * Derivált oszlopok (ml/l/kg/g/db, Ft/l, Ft/kg) readonly-k és automatikusan újraszámolódnak.
 */
export function DataTableModal({
  config,
  data,
  rawData,
  onDataChange,
  onClose,
  onSaveAndGenerate,
}: DataTableModalProps) {
  const columns = useMemo(() => buildTableColumns(config), [config]);
  // Lokális munkapéldány – mentéskor kerül vissza a szülőbe
  const [rows, setRows] = useState<ProcessedRow[]>(() =>
    JSON.parse(JSON.stringify(data)) as ProcessedRow[],
  );
  const [invalidEans, setInvalidEans] = useState<Set<number>>(new Set());

  function cellValue(colKey: string, rowIndex: number): string {
    const pRow = rows[rowIndex];
    const rRow = rawData?.[rowIndex];

    if (colKey === "Megnevezés") {
      if (rRow?.["Megnevezés"]) return String(rRow["Megnevezés"]);
      if (pRow) {
        return [pRow["Első_sor"] || "", pRow["Második_sor"] || "", pRow["Harmadik_sor"] || ""]
          .join(" ")
          .trim();
      }
      return "";
    }

    if (["ml", "l", "kg", "g", "db", "m2"].includes(colKey)) {
      if (pRow && pRow[colKey] !== undefined && pRow[colKey] !== "") return String(pRow[colKey]);
      if (rRow && rRow[colKey] !== undefined && rRow[colKey] !== "") return String(rRow[colKey]);
      const kiszereles = pRow?.["Kiszerelés"] || rRow?.["Kiszerelés"] || "";
      const parsed = parseKiszereles(kiszereles) as unknown as Record<string, string>;
      return parsed[colKey] ?? "";
    }

    if (colKey === "Ft/l" || colKey === "Ft/kg" || colKey === "Ft/m2") {
      if (pRow && pRow[colKey] !== undefined && pRow[colKey] !== "") return String(pRow[colKey]);
      if (rRow && rRow[colKey] !== undefined && rRow[colKey] !== "") return String(rRow[colKey]);
      const kiszereles = pRow?.["Kiszerelés"] || rRow?.["Kiszerelés"] || "";
      const ar = pRow?.["Ár"] || rRow?.["Ár"] || "";
      const u = recalculateUnitPrice(kiszereles, ar, config.unitMap);
      return colKey === "Ft/l" ? u.ftl : colKey === "Ft/kg" ? u.ftkg : u.ftm2;
    }

    // Akciós_ár: ha a feldolgozott adat szándékosan ürítette, ne essen vissza a nyersre
    if (colKey === "Akciós_ár") {
      if (pRow && pRow["Akciós_ár"] !== undefined) return String(pRow["Akciós_ár"] || "");
      if (rRow && rRow["Akciós_ár"] !== undefined) return String(rRow["Akciós_ár"] || "");
      return "";
    }

    if (pRow && pRow[colKey] !== undefined && pRow[colKey] !== "") return String(pRow[colKey]);
    if (rRow && rRow[colKey] !== undefined && rRow[colKey] !== "") return String(rRow[colKey]);
    return "";
  }

  function handleCellChange(rowIndex: number, colKey: string, newValue: string) {
    setRows((prev) => {
      const next = prev.map((r, i) => (i === rowIndex ? { ...r } : r));
      const row = next[rowIndex];
      if (!row) return prev;
      row[colKey] = newValue;

      if (colKey === "EAN-13") {
        setInvalidEans((s) => {
          const n = new Set(s);
          if (validateEan13(newValue)) n.delete(rowIndex);
          else n.add(rowIndex);
          return n;
        });
        return next;
      }

      if (colKey === "Kiszerelés") {
        const parsed = parseKiszereles(newValue) as unknown as Record<string, string>;
        const unitKeys = config.unitMap === "ditall"
          ? (["ml", "l", "kg", "g", "db", "m2"] as const)
          : (["ml", "l", "kg", "g", "db"] as const);
        unitKeys.forEach((k) => {
          row[k] = parsed[k] ?? "";
        });
        applyUnitPrices(row, recalculateUnitPrice(newValue, row["Ár"], config.unitMap), config.unitMap);
        return next;
      }

      if (colKey === "Ár") {
        applyUnitPrices(row, recalculateUnitPrice(row["Kiszerelés"], newValue, config.unitMap), config.unitMap);
        onDataChange(next); // azonnali címke-frissítés (régi viselkedés)
        return next;
      }

      if (colKey === "Akciós_ár") {
        onDataChange(next); // azonnal váltja a címkeformátumot
        return next;
      }

      return next;
    });
  }

  return (
    <div className="data-table-overlay active">
      <div className="data-table-modal">
        <div className="data-table-header">
          <h2>Adatok előnézete</h2>
          <button className="data-table-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="data-table-scroll">
          <table className="data-preview-table">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th key={col.key} className={col.editable ? "" : "col-readonly"}>
                    {col.key}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((_, rowIndex) => (
                <tr key={rowIndex}>
                  {columns.map((col) =>
                    col.editable ? (
                      <td key={col.key}>
                        <input
                          type="text"
                          className="table-cell-input"
                          maxLength={200}
                          value={cellValue(col.key, rowIndex)}
                          style={
                            col.key === "EAN-13" && invalidEans.has(rowIndex)
                              ? { borderColor: "#e53935" }
                              : undefined
                          }
                          onChange={(e) => handleCellChange(rowIndex, col.key, e.target.value)}
                        />
                      </td>
                    ) : (
                      <td key={col.key} className="cell-readonly">
                        {cellValue(col.key, rowIndex)}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="data-table-footer">
          <button className="data-table-save-btn" onClick={() => onSaveAndGenerate(rows)}>
            Mentés és generálás
          </button>
        </div>
      </div>
    </div>
  );
}
