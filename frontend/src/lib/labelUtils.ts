/**
 * Tiszta segédfüggvények - az LL script.js logikájának 1:1 portja.
 * Minden függvény mellékhatás-mentes; a DOM-hoz semmi köze.
 */
import type { ProcessedRow } from "../types/label";

/** "8990" → "8.990" (ezres tagolás ponttal). Nem szám esetén változatlan. */
export function formatPrice(price: string | number | null | undefined): string {
  if (price === null || price === undefined || price === "") return "";
  const num = parseInt(String(price), 10);
  if (isNaN(num)) return String(price);
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** A 0 ár minden formáját ("0", "0,00", "0 Ft") üresként kezeli - ilyenkor kézzel írják rá az árat. */
export function normalizePrice(val: string | number | null | undefined): string {
  const num = parseFloat(String(val ?? "").replace(",", "."));
  return !isNaN(num) && num === 0 ? "" : String(val ?? "");
}

/** Ár szövegből szám ("8 990" / "8990,5") - érvénytelen esetén null. */
export function parsePrice(v: string | number | null | undefined): number | null {
  const n = parseFloat(String(v ?? "").replace(/\s/g, "").replace(",", "."));
  return isNaN(n) ? null : n;
}

export interface UnitPrices {
  ftl: string;
  ftkg: string;
  ftm2: string;
}

const EMPTY_UNIT_PRICES: UnitPrices = { ftl: "", ftkg: "", ftm2: "" };

/**
 * Egységár (Ft/l, Ft/kg, Ditallnál Ft/m2) a Kiszerelés + Ár alapján.
 * A "ditall" unitMap a szám utáni maradékból olvassa az egységet (m2 támogatás),
 * a "standard" a régi LL-módszerrel (nem-numerikus karakterek).
 */
export function recalculateUnitPrice(
  kiszereles: string | number | undefined,
  ar: string | number | undefined,
  unitMap: "standard" | "ditall" = "standard",
): UnitPrices {
  if (!kiszereles || !ar) return { ...EMPTY_UNIT_PRICES };
  const priceVal = parseFloat(String(ar).replace(",", "."));
  if (isNaN(priceVal) || priceVal <= 0) return { ...EMPTY_UNIT_PRICES };
  const packStr = String(kiszereles).trim().toLowerCase();
  const numMatch = packStr.match(/[\d.,]+/);
  if (!numMatch) return { ...EMPTY_UNIT_PRICES };
  const qty = parseFloat(numMatch[0].replace(",", "."));
  if (isNaN(qty) || qty <= 0) return { ...EMPTY_UNIT_PRICES };
  const unit =
    unitMap === "ditall"
      ? packStr.slice((numMatch.index ?? 0) + numMatch[0].length).trim()
      : packStr.replace(/[\d.,\s]/g, "").trim();
  if (unit === "ml") return { ftl: String(Math.round(priceVal / (qty / 1000))), ftkg: "", ftm2: "" };
  if (unit === "l") return { ftl: String(Math.round(priceVal / qty)), ftkg: "", ftm2: "" };
  if (unit === "g") return { ftl: "", ftkg: String(Math.round(priceVal / (qty / 1000))), ftm2: "" };
  if (unit === "kg") return { ftl: "", ftkg: String(Math.round(priceVal / qty)), ftm2: "" };
  if (unitMap === "ditall" && unit === "m2") return { ftl: "", ftkg: "", ftm2: String(Math.round(priceVal / qty)) };
  return { ...EMPTY_UNIT_PRICES };
}

/** Egységár-mezők visszaírása egy sorba (Ft/m2 csak ditall unitMap esetén). */
export function applyUnitPrices(row: ProcessedRow, u: UnitPrices, unitMap: "standard" | "ditall"): void {
  row["Ft/l"] = u.ftl;
  row["Ft/kg"] = u.ftkg;
  if (unitMap === "ditall") row["Ft/m2"] = u.ftm2;
}

export interface ParsedKiszereles {
  ml: string;
  l: string;
  kg: string;
  g: string;
  db: string;
  m2: string;
}

/** Kiszerelés szövegéből ml / l / kg / g / db (+ Ditallnál m2) értékek. */
export function parseKiszereles(kiszereles: string | number | undefined): ParsedKiszereles {
  const result: ParsedKiszereles = { ml: "", l: "", kg: "", g: "", db: "", m2: "" };
  if (!kiszereles) return result;
  const str = String(kiszereles).trim().toLowerCase();
  if (str === "db") {
    result.db = "db";
    return result;
  }
  const numMatch = str.match(/([\d.,]+)/);
  if (!numMatch || numMatch[1] === undefined) return result;
  const qty = parseFloat(numMatch[1].replace(",", "."));
  if (isNaN(qty) || qty <= 0) return result;
  // Egység a szám UTÁNI maradékból (a Ditall-módszer) - a replace-alapú kinyerés
  // a "m2"-ből kitörölné a 2-est. Standard egységekre a kettő ekvivalens.
  const unit = str.slice((numMatch.index ?? 0) + numMatch[1].length).trim();
  if (unit === "ml") {
    result.ml = String(qty);
    result.l = String(parseFloat((qty / 1000).toFixed(3)));
  } else if (unit === "l") {
    result.l = String(qty);
    result.ml = String(Math.round(qty * 1000));
  } else if (unit === "g") {
    result.g = String(qty);
    result.kg = String(parseFloat((qty / 1000).toFixed(3)));
  } else if (unit === "kg") {
    result.kg = String(qty);
    result.g = String(Math.round(qty * 1000));
  } else if (unit === "db") {
    result.db = String(qty);
  } else if (unit === "m2") {
    result.m2 = String(qty);
  }
  return result;
}

/** EAN-13 formátum + check digit ellenőrzés. Üres = rendben. */
export function validateEan13(ean: string | number | undefined): boolean {
  if (!ean || ean === "") return true;
  const str = String(ean).replace(/\s/g, "");
  if (!/^\d{13}$/.test(str)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(str[i] as string) * (i % 2 === 0 ? 1 : 3);
  }
  return (10 - (sum % 10)) % 10 === parseInt(str[12] as string);
}

export function isUpperName(s: unknown): boolean {
  const str = String(s ?? "");
  return str === str.toUpperCase() && str !== str.toLowerCase();
}

/** A backend `split_name` JS-tükre: szavanként tördel max sorra, sor-limitekkel. */
export function splitName(
  name: unknown,
  maxLines: number,
  maxChars: number,
  maxCharsLine3?: number | null,
): string[] {
  const l3 = maxCharsLine3 ?? maxChars;
  const limits: number[] = [];
  for (let k = 0; k < maxLines; k++) limits.push(k < 2 ? maxChars : l3);
  const out: string[] = new Array(maxLines).fill("");
  const words = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  let cur = 0;
  for (const w of words) {
    if (cur >= maxLines) break;
    if (out[cur] === "") out[cur] = w;
    else if ((out[cur] + " " + w).length <= (limits[cur] as number)) out[cur] = out[cur] + " " + w;
    else {
      cur++;
      if (cur >= maxLines) break;
      out[cur] = w;
    }
  }
  return out;
}

/** Standard oldal: a név 3 sorra tördelve (max 18, kisbetűsnél 20). */
export function computeNameLines(value: string, maxLines: 3 | 4 = 3): string[] {
  const mc = isUpperName(value) ? 18 : 20;
  return splitName(value, maxLines, mc, mc);
}

export const NAME_LINE_COLS = ["Első_sor", "Második_sor", "Harmadik_sor"] as const;

/** A címkén megjelenő név a sor-mezőkből (a Megnevezés elavulhat). */
export function nameOf(row: ProcessedRow): string {
  const joined = NAME_LINE_COLS.map((c) => row[c])
    .filter(Boolean)
    .join(" ")
    .trim();
  if (joined) return joined;
  return String(row["Megnevezés"] ?? "").trim();
}

export function applyNameToRow(row: ProcessedRow, value: string, maxLines: 3 | 4 = 3): void {
  row["Megnevezés"] = value;
  const lines = computeNameLines(value, maxLines);
  row["Első_sor"] = lines[0] ?? "";
  row["Második_sor"] = lines[1] ?? "";
  row["Harmadik_sor"] = lines[2] ?? "";
}

export function cut(s: unknown, n: number): string {
  const str = String(s ?? "");
  return str.length > n ? str.slice(0, n - 1) + "…" : str;
}

export function wordCount(s: unknown): number {
  return String(s ?? "").trim().split(/\s+/).filter(Boolean).length;
}

export function median(arr: number[]): number | null {
  if (!arr.length) return null;
  const a = arr.slice().sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? (a[m] as number) : ((a[m - 1] as number) + (a[m] as number)) / 2;
}

export function rowText(row: ProcessedRow): string {
  return [row["Első_sor"], row["Második_sor"], row["Harmadik_sor"], row["Megnevezés"], row["Cikkszám"]]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function normUnit(u: unknown): string {
  const s = String(u ?? "").toLowerCase();
  if (/^ml/.test(s)) return "ml";
  if (/^(l|liter)/.test(s)) return "l";
  if (/^(kg|kilo)/.test(s)) return "kg";
  if (/^(dkg|deka)/.test(s)) return "dkg";
  if (/^(g|gramm)/.test(s)) return "g";
  if (/^(db|darab)/.test(s)) return "db";
  if (/^(m2|m²|négyz|negyz)/.test(s)) return "m2";
  return s;
}

export function parsePack(s: unknown): { qty: number; unit: string } | null {
  const str = String(s ?? "").toLowerCase().trim();
  const m = str.match(/([\d]+(?:[.,][\d]+)?)\s*([a-zá-ű²2]*)/);
  if (!m || m[1] === undefined) return null;
  const qty = parseFloat(m[1].replace(",", "."));
  if (isNaN(qty)) return null;
  return { qty, unit: normUnit(m[2]) };
}

export function sizeMatch(filterSize: string, kiszereles: string | number | undefined): boolean {
  const fp = parsePack(filterSize);
  if (!fp) return false;
  const rp = parsePack(kiszereles);
  if (!rp) return false;
  if (Math.abs(rp.qty - fp.qty) > 1e-9) return false;
  if (fp.unit && rp.unit && fp.unit !== rp.unit) return false;
  return true;
}

/** Nyers sor összeállítása a backendnek (Megnevezés = összefűzött névsorok). Ditallnál a Szín is megy. */
export function buildRawRow(row: ProcessedRow, includeSzin = false): Record<string, string> {
  const raw: Record<string, string> = {
    Megnevezés: NAME_LINE_COLS.map((c) => String(row[c] ?? ""))
      .filter((s) => s)
      .join(" ")
      .trim(),
    Kiszerelés: String(row["Kiszerelés"] ?? ""),
    Ár: String(row["Ár"] ?? ""),
    Akciós_ár: String(row["Akciós_ár"] ?? ""),
    "EAN-13": String(row["EAN-13"] ?? ""),
    Cikkszám: String(row["Cikkszám"] ?? ""),
  };
  if (includeSzin) raw["Szín"] = String(row["Szín"] ?? "");
  return raw;
}
