import { useState } from "react";
import * as XLSX from "xlsx";
import type { LabelRow } from "../types/label";

interface ArvaltozasPanelProps {
  /** A változott sorok - a szülő ugyanúgy dolgozza fel, mint a normál feltöltést. */
  onGenerate: (rows: LabelRow[]) => void;
  onStatus?: (msg: string) => void;
  showAlert: (message: string, title?: string) => void;
}

function readExcelFile(file: File, callback: (err: Error | null, data: LabelRow[] | null) => void) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: "array" });
      const sheetName = wb.SheetNames[0] as string;
      const ws = wb.Sheets[sheetName];
      if (!ws) throw new Error("üres munkafüzet");
      const json = XLSX.utils.sheet_to_json<LabelRow>(ws, { defval: "", blankrows: false });
      callback(null, json);
    } catch (err) {
      callback(err as Error, null);
    }
  };
  reader.readAsArrayBuffer(file);
}

/** Oszlopnév normalizálás: whitespace + Unicode NFC. */
function normalizeRow(row: LabelRow): LabelRow {
  const result: LabelRow = {};
  for (const [k, v] of Object.entries(row)) {
    result[String(k).trim().normalize("NFC")] = v;
  }
  return result;
}

/** Ár normalizálás: csak számjegyek ("8 990" / "8.990" / 8990 → "8990"). */
function normalizeAr(val: string | number | undefined): string {
  if (val === null || val === undefined || val === "") return "";
  return String(val).replace(/[^0-9]/g, "");
}

/** Rendezési kulcs: Cikkszám (numerikusan) → Megnevezés → sorok szövege. */
function cikkKulcs(row: LabelRow): string {
  const cikk = String(row["Cikkszám"] ?? "").trim();
  if (cikk) return cikk.padStart(20, "0");
  const megn = String(row["Megnevezés"] ?? "").trim().toLowerCase();
  if (megn) return megn;
  const e1 = String(row["Első_sor"] ?? "").trim().toLowerCase();
  const e2 = String(row["Második_sor"] ?? "").trim().toLowerCase();
  const e3 = String(row["Harmadik_sor"] ?? "").trim().toLowerCase();
  return (e1 + " " + e2 + " " + e3).trim();
}

function csoportosit(sorok: LabelRow[]): Map<string, LabelRow[]> {
  const map = new Map<string, LabelRow[]>();
  for (const sor of sorok) {
    const row = normalizeRow(sor);
    const k = cikkKulcs(row);
    if (!k) continue;
    if (!map.has(k)) map.set(k, []);
    (map.get(k) as LabelRow[]).push(row);
  }
  return map;
}

/**
 * Árváltozás-detektor (BETA - csak LL): két árlista összehasonlítása,
 * csak a változott/új termékek címkéinek generálása.
 */
export function ArvaltozasPanel({ onGenerate, showAlert }: ArvaltozasPanelProps) {
  const [open, setOpen] = useState(false);
  const [regiData, setRegiData] = useState<LabelRow[] | null>(null);
  const [ujData, setUjData] = useState<LabelRow[] | null>(null);
  const [regiName, setRegiName] = useState("Régi árlista");
  const [ujName, setUjName] = useState("Új árlista");
  const [status, setStatus] = useState("");

  function loadFile(which: "regi" | "uj", file: File | undefined) {
    if (!file) return;
    setStatus("Beolvasás...");
    readExcelFile(file, (err, data) => {
      if (err || !data) {
        showAlert(`Hiba a${which === "regi" ? " régi" : "z új"} árlista beolvasásakor!`);
        setStatus("");
        return;
      }
      if (which === "regi") {
        setRegiData(data);
        setRegiName(file.name);
        setStatus(`Régi: ${data.length} sor betöltve`);
      } else {
        setUjData(data);
        setUjName(file.name);
        setStatus(`Új: ${data.length} sor betöltve`);
      }
    });
  }

  function reset(e: React.MouseEvent) {
    e.stopPropagation();
    setRegiData(null);
    setUjData(null);
    setRegiName("Régi árlista");
    setUjName("Új árlista");
    setStatus("");
  }

  function generate() {
    if (!regiData || !ujData) return;
    const regiCsop = csoportosit(regiData);
    const ujCsop = csoportosit(ujData);
    const valtozottSorok: LabelRow[] = [];
    const mindenKulcs = new Set([...regiCsop.keys(), ...ujCsop.keys()]);

    for (const kulcs of [...mindenKulcs].sort()) {
      const regiCsoport = regiCsop.get(kulcs) ?? [];
      const ujCsoport = ujCsop.get(kulcs) ?? [];

      // Csak az újban van → teljesen új termék
      if (regiCsoport.length === 0) {
        for (const ujRow of ujCsoport) {
          if (normalizeAr(ujRow["Ár"]) || normalizeAr(ujRow["Akciós_ár"])) valtozottSorok.push(ujRow);
        }
        continue;
      }
      // Csak a régiben van → törölt termék
      if (ujCsoport.length === 0) continue;

      // Meglévő termék: pozíció-alapú összehasonlítás csoporton belül
      const minLen = Math.min(regiCsoport.length, ujCsoport.length);
      for (let i = 0; i < minLen; i++) {
        const regiRow = regiCsoport[i] as LabelRow;
        const ujRow = ujCsoport[i] as LabelRow;
        const valtozott =
          normalizeAr(regiRow["Ár"]) !== normalizeAr(ujRow["Ár"]) ||
          normalizeAr(regiRow["Akciós_ár"]) !== normalizeAr(ujRow["Akciós_ár"]) ||
          String(regiRow["Kiszerelés"] ?? "").trim() !== String(ujRow["Kiszerelés"] ?? "").trim();
        const ujVanAr = !!(normalizeAr(ujRow["Ár"]) || normalizeAr(ujRow["Akciós_ár"]));
        if (valtozott && ujVanAr) valtozottSorok.push(ujRow);
      }
      // Új csoportban több sor → új sorok ennél a terméknél
      for (let i = minLen; i < ujCsoport.length; i++) {
        const ujRow = ujCsoport[i] as LabelRow;
        if (normalizeAr(ujRow["Ár"]) || normalizeAr(ujRow["Akciós_ár"])) valtozottSorok.push(ujRow);
      }
    }

    if (valtozottSorok.length === 0) {
      showAlert("A két árlista között nincs különbség - nincs generálandó címke.");
      return;
    }
    setStatus(`${valtozottSorok.length} változott termék feldolgozása...`);
    onGenerate(valtozottSorok);
    setStatus(`✓ ${valtozottSorok.length} címke generálva`);
  }

  return (
    <div className="arvaltozas-section">
      <div className="arvaltozas-toggle" onClick={() => setOpen((o) => !o)}>
        <span className="arvaltozas-toggle-label">Árváltozás detektor</span>
        <button className="arv-reset-btn" title="Visszaállítás" onClick={reset}>
          ↺
        </button>
        <span className={`arvaltozas-toggle-arrow${open ? " open" : ""}`}>▼</span>
      </div>
      <div className={`arvaltozas-body${open ? " open" : ""}`}>
        <div className="arv-upload-row">
          <label className={`arv-upload-btn${regiData ? " loaded" : ""}`}>
            <span className="arv-upload-icon">📂</span>
            <span className="arv-upload-text">{regiName}</span>
            <input
              type="file"
              accept=".xlsx"
              style={{ display: "none" }}
              onChange={(e) => loadFile("regi", e.target.files?.[0])}
            />
          </label>
        </div>
        <div className="arv-upload-row">
          <label className={`arv-upload-btn${ujData ? " loaded" : ""}`}>
            <span className="arv-upload-icon">📂</span>
            <span className="arv-upload-text">{ujName}</span>
            <input
              type="file"
              accept=".xlsx"
              style={{ display: "none" }}
              onChange={(e) => loadFile("uj", e.target.files?.[0])}
            />
          </label>
        </div>
        <div className="arv-status">{status}</div>
        <button className="arv-generate-btn" disabled={!(regiData && ujData)} onClick={generate}>
          Változott termékek generálása
        </button>
      </div>
    </div>
  );
}
