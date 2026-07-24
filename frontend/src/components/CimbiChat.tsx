import { useCallback, useRef, useState } from "react";
import { ArrowUp, X } from "lucide-react";
import { api } from "../api/client";
import type { ProcessedRow } from "../types/label";
import type { SubpageConfig } from "../types/config";
import {
  applyNameToRow,
  applyUnitPrices,
  recalculateUnitPrice,
  cut,
  formatPrice,
  median,
  nameOf,
  parsePrice,
  rowText,
  sizeMatch,
  computeNameLines,
  validateEan13,
  wordCount,
  NAME_LINE_COLS,
} from "../lib/labelUtils";

// ── Intent típus (a backend /api/label-command válasza) ──
interface CimbiIntent {
  operation: string;
  summary?: string;
  target?: { mode: string; numbers?: number[]; filter?: Record<string, unknown> };
  factor?: number;
  round_to?: number;
  round_mode?: string;
  psych_ending?: number;
  price_value?: number;
  sale_value?: number;
  sale_factor?: number;
  field?: string;
  field_value?: string;
  text_column?: string;
  text_op?: string;
  find?: string;
  replace?: string;
  max_len?: number;
  metric?: string;
  edits?: { n: number; fields: Record<string, unknown> }[];
}

interface Change {
  i: number;
  rowLabel?: string;
  before: string;
  after: string;
  apply: (r: ProcessedRow) => void;
}

interface Plan {
  indices: number[];
  changes: Change[];
  needsReprocess: boolean;
}

type Msg =
  | { kind: "user"; text: string }
  | { kind: "bot"; text: string }
  | { kind: "help" }
  | { kind: "review"; html: React.ReactNode }
  | { kind: "card"; intent: CimbiIntent; plan: Plan; state: "preview" | "applied" | "undone" | "cancelled" };

interface CimbiChatProps {
  config: SubpageConfig;
  data: ProcessedRow[] | null;
  onDataChange: (next: ProcessedRow[]) => void;
  /** Tartalmi módosítás után backend-újrafeldolgozás (mint a "Mentés és generálás"). */
  onReprocess: (rows: ProcessedRow[]) => void;
}

const PRICE_OPS = ["price_multiply", "price_round", "price_psychological", "set_price"];
const KNOWN_OPS = PRICE_OPS.concat(["set_sale", "clear_sale", "set_field", "edit_text", "custom_edit"]);
const TEXT_COLS = ["Első_sor", "Második_sor", "Harmadik_sor"];
const FIELD_COLS = ["Cikkszám", "EAN-13", "Kiszerelés", "Első_sor", "Második_sor", "Harmadik_sor", "Ár", "Akciós_ár"];
const FIELD_ALIASES: Record<string, string> = {
  cikkszám: "Cikkszám", cikkszam: "Cikkszám", cikk: "Cikkszám",
  ean: "EAN-13", "ean-13": "EAN-13", ean13: "EAN-13", vonalkód: "EAN-13", vonalkod: "EAN-13",
  kiszerelés: "Kiszerelés", kiszereles: "Kiszerelés", kiszer: "Kiszerelés",
  ár: "Ár", ar: "Ár", price: "Ár",
  akciós_ár: "Akciós_ár", akcios_ar: "Akciós_ár", "akciós ár": "Akciós_ár", akciós: "Akciós_ár", akcios: "Akciós_ár",
  első_sor: "Első_sor", elso_sor: "Első_sor", "első sor": "Első_sor",
  második_sor: "Második_sor", masodik_sor: "Második_sor",
  harmadik_sor: "Harmadik_sor", negyedik_sor: "Negyedik_sor",
  szín: "Szín", szin: "Szín", color: "Szín",
};

const HELP_TEXT =
  "Segítek a betöltött címkéken - mindig előnézettel, és bármit vissza tudsz vonni. Tudok: árat emelni/csökkenteni %-kal, árat kerekíteni (akár x90/x99 végződésre), egy adott címke árát konkrét értékre állítani, akciót be- vagy kikapcsolni, és a címke szövegét szerkeszteni. Hivatkozhatsz a címke SORSZÁMÁRA, a termék nevére/márkájára, a kiszerelésre vagy ársávra.";

function resolveFieldCol(field: string | undefined): string | null {
  if (!field) return null;
  const f = String(field).trim().toLowerCase();
  if (/^(megnevez|név|nev|termék|termek|name)/.test(f)) return "__NAME__";
  const mapped = FIELD_ALIASES[f];
  if (mapped) return FIELD_COLS.includes(mapped) ? mapped : null;
  return FIELD_COLS.includes(field) ? field : null;
}

function computePrice(val: number, intent: CimbiIntent): number | null {
  let r: number;
  if (intent.operation === "price_multiply") {
    const f = Number(intent.factor);
    if (!isFinite(f) || f <= 0) return null;
    r = Math.round((val * f) / 10) * 10;
  } else if (intent.operation === "price_round") {
    const step = Number(intent.round_to) || 10;
    const m = intent.round_mode;
    r = m === "up" ? Math.ceil(val / step) * step : m === "down" ? Math.floor(val / step) * step : Math.round(val / step) * step;
  } else if (intent.operation === "price_psychological") {
    const e = Number(intent.psych_ending) === 99 ? 99 : 90;
    const h = Math.round(val / 100) * 100;
    r = h - (100 - e);
    if (r <= 0) r = e;
  } else if (intent.operation === "set_price") {
    const v = Number(intent.price_value);
    if (!isFinite(v) || v < 0) return null;
    r = v;
  } else return null;
  r = Math.round(r);
  if (r > 99999) r = 99999;
  if (r < 0) r = 0;
  return r;
}

function transformText(cur: string, intent: CimbiIntent): string {
  const op = intent.text_op;
  const addText = intent.replace != null && intent.replace !== "" ? String(intent.replace) : intent.find != null ? String(intent.find) : "";
  if (op === "uppercase") return cur.toUpperCase();
  if (op === "lowercase") return cur.toLowerCase();
  if (op === "truncate") {
    const ml = Number(intent.max_len) || 20;
    return cur.slice(0, ml).trim();
  }
  if (op === "append") {
    if (!addText) return cur;
    const sep = cur && !/\s$/.test(cur) && !/^[\s.,!?;:)-]/.test(addText) ? " " : "";
    return cur + sep + addText;
  }
  if (op === "prepend") {
    if (!addText) return cur;
    const sep = cur && !/^\s/.test(cur) && !/\s$/.test(addText) ? " " : "";
    return addText + sep + cur;
  }
  if (op === "remove" && intent.find) return cur.split(intent.find).join("").replace(/\s+/g, " ").trim();
  if (op === "replace" && intent.find != null) return cur.split(intent.find).join(intent.replace || "");
  return cur;
}

export function CimbiChat({ config, data, onDataChange, onReprocess }: CimbiChatProps) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const undoRef = useRef<ProcessedRow[] | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  const greetedRef = useRef(false);

  const maxLines = config.maxLines;

  function scrollDown() {
    requestAnimationFrame(() => {
      const t = threadRef.current;
      if (t) t.scrollTop = t.scrollHeight;
    });
  }
  const push = useCallback((m: Msg) => {
    setMsgs((prev) => [...prev, m]);
    scrollDown();
  }, []);

  // ── Címke-kiemelés (DOM-alapú, mint a régi kód) ──
  function highlightLabels(indices: number[], cls: string) {
    const els = document.querySelectorAll<HTMLElement>("#labels .label");
    indices.forEach((i) => els[i]?.classList.add(cls));
    const first = indices[0];
    if (first !== undefined && els[first]) els[first].scrollIntoView({ behavior: "smooth", block: "center" });
  }
  function clearHighlight(cls: string) {
    document.querySelectorAll("#labels ." + cls).forEach((el) => el.classList.remove(cls));
  }

  // ── Célfeloldás ──
  function resolveTargets(intent: CimbiIntent): number[] {
    const rows = data ?? [];
    const t = intent.target ?? { mode: "all" };
    let idx = rows.map((_, i) => i);
    if (t.mode === "numbers" && Array.isArray(t.numbers)) {
      const set = new Set(t.numbers.map((n) => Number(n) - 1));
      idx = idx.filter((i) => set.has(i));
    } else if (t.mode === "filter" && t.filter) {
      const f = t.filter;
      const brand = f["brand"] ? String(f["brand"]).toLowerCase() : null;
      const keyword = f["keyword"] ? String(f["keyword"]).toLowerCase() : null;
      const size = f["size"] ? String(f["size"]) : null;
      const pmin = f["price_min"] != null ? Number(f["price_min"]) : null;
      const pmax = f["price_max"] != null ? Number(f["price_max"]) : null;
      idx = idx.filter((i) => {
        const row = rows[i] as ProcessedRow;
        const txt = rowText(row);
        if (brand && !txt.includes(brand)) return false;
        if (keyword && !txt.includes(keyword)) return false;
        if (size && !sizeMatch(size, row["Kiszerelés"])) return false;
        const p = parsePrice(row["Ár"]);
        if (pmin != null && (p == null || p < pmin)) return false;
        if (pmax != null && (p == null || p > pmax)) return false;
        return true;
      });
    }
    return idx;
  }

  function planText(row: ProcessedRow, intent: CimbiIntent): { kind: "line" | "name"; col?: string; before: string; after: string; value: string } | null {
    const col = intent.text_column;
    if (col && TEXT_COLS.includes(col)) {
      const cur = String(row[col] ?? "");
      const next = transformText(cur, intent);
      if (next === cur) return null;
      return { kind: "line", col, before: cur || "-", after: next || "-", value: next };
    }
    const cur = nameOf(row);
    const next = transformText(cur, intent);
    if (next === cur) return null;
    return { kind: "name", before: cur || "-", after: next || "-", value: next };
  }

  function planChanges(intent: CimbiIntent): Plan {
    const rows = data ?? [];
    const op = intent.operation;
    const changes: Change[] = [];

    if (op === "custom_edit") {
      const arr = Array.isArray(intent.edits) ? intent.edits.slice(0, 200) : [];
      arr.forEach((ed) => {
        const i = Number(ed?.n) - 1;
        const row = rows[i];
        if (!row || !ed.fields || typeof ed.fields !== "object") return;
        const fields = ed.fields;
        const hasLines = NAME_LINE_COLS.some((c) => c in fields);
        if ("Megnevezés" in fields && !hasLines) {
          const val = String(fields["Megnevezés"] ?? "");
          const curName = nameOf(row);
          if (curName !== val)
            changes.push({ i, rowLabel: i + 1 + ". · név", before: cut(curName || "-", 26), after: cut(val || "-", 26), apply: (r) => applyNameToRow(r, val, maxLines) });
        }
        Object.keys(fields).forEach((col) => {
          if (col === "Megnevezés") return;
          if (!FIELD_COLS.includes(col)) return;
          const val = fields[col] == null ? "" : String(fields[col]);
          if ((col === "Ár" || col === "Akciós_ár") && val !== "" && parsePrice(val) === null) return;
          const curV = String(row[col] ?? "");
          if (curV === val) return;
          changes.push({ i, rowLabel: i + 1 + ". · " + col, before: cut(curV || "-", 26), after: cut(val || "-", 26), apply: (r) => { r[col] = val; } });
        });
      });
      return { indices: [...new Set(changes.map((c) => c.i))], changes, needsReprocess: false };
    }

    const indices = resolveTargets(intent);
    indices.forEach((i) => {
      const row = rows[i] as ProcessedRow;
      if (op === "set_price") {
        const np = computePrice(0, intent);
        if (np === null) return;
        const val = parsePrice(row["Ár"]);
        if (val !== null && Math.round(val) === np) return;
        const before = val !== null && val > 0 ? formatPrice(String(Math.round(val))) + " Ft" : "nincs ár";
        changes.push({ i, before, after: formatPrice(String(np)) + " Ft", apply: (r) => { r["Ár"] = String(np); } });
      } else if (PRICE_OPS.includes(op)) {
        const val = parsePrice(row["Ár"]);
        if (val === null || val <= 0) return;
        const np = computePrice(val, intent);
        if (np === null || np === Math.round(val)) return;
        changes.push({ i, before: formatPrice(String(Math.round(val))) + " Ft", after: formatPrice(String(np)) + " Ft", apply: (r) => { r["Ár"] = String(np); } });
      } else if (op === "set_sale") {
        if (!config.saleEnabled) return;
        const base = parsePrice(row["Ár"]);
        let sv: number | null = null;
        if (intent.sale_value != null) sv = Math.round(Number(intent.sale_value));
        else if (intent.sale_factor != null && base !== null) sv = Math.round((base * Number(intent.sale_factor)) / 10) * 10;
        if (sv === null || !isFinite(sv) || sv <= 0) return;
        const curS = parsePrice(row["Akciós_ár"]);
        if (curS !== null && Math.round(curS) === sv) return;
        changes.push({ i, before: curS ? formatPrice(String(Math.round(curS))) + " Ft" : "nincs akció", after: formatPrice(String(sv)) + " Ft akció", apply: (r) => { r["Akciós_ár"] = String(sv); } });
      } else if (op === "clear_sale") {
        const curS = parsePrice(row["Akciós_ár"]);
        if (curS === null) return;
        changes.push({ i, before: formatPrice(String(Math.round(curS))) + " Ft", after: "nincs akció", apply: (r) => { r["Akciós_ár"] = ""; } });
      } else if (op === "set_field") {
        const col = resolveFieldCol(intent.field);
        if (!col) return;
        const val = intent.field_value == null ? "" : String(intent.field_value);
        if (col === "__NAME__") {
          const curName = nameOf(row);
          if (curName === val) return;
          changes.push({ i, before: cut(curName || "-", 22), after: cut(val || "-", 22), apply: (r) => applyNameToRow(r, val, maxLines) });
        } else {
          const curV = String(row[col] ?? "");
          if (curV === val) return;
          changes.push({ i, before: cut(curV || "-", 22), after: cut(val || "-", 22), apply: (r) => { r[col] = val; } });
        }
      } else if (op === "edit_text") {
        const res = planText(row, intent);
        if (res === null) return;
        if (res.kind === "name") {
          changes.push({ i, before: cut(res.before, 22), after: cut(res.after, 22), apply: (r) => applyNameToRow(r, res.value, maxLines) });
        } else {
          changes.push({ i, before: cut(res.before, 22), after: cut(res.after, 22), apply: (r) => { r[res.col as string] = res.value; } });
        }
      }
    });
    const needsReprocess = op === "set_field" || op === "edit_text";
    return { indices: changes.map((c) => c.i), changes, needsReprocess };
  }

  // ── Terv alkalmazása ──
  function applyPlan(plan: Plan, msgIdx: number) {
    if (!data) return;
    undoRef.current = JSON.parse(JSON.stringify(data)) as ProcessedRow[];
    const next = data.map((r) => ({ ...r }));
    plan.changes.forEach((c) => {
      const row = next[c.i];
      if (row) c.apply(row);
    });
    if (plan.needsReprocess) {
      onReprocess(next);
    } else {
      // Csak ár változott → gyors helyi egységár-újraszámolás (régi viselkedés)
      plan.changes.forEach((c) => {
        const r = next[c.i];
        if (r) applyUnitPrices(r, recalculateUnitPrice(r["Kiszerelés"], r["Ár"], config.unitMap), config.unitMap);
      });
      onDataChange(next);
    }
    setMsgs((prev) => prev.map((m, i) => (i === msgIdx && m.kind === "card" ? { ...m, state: "applied" } : m)));
    clearHighlight("cimbi-diff");
    highlightLabels(plan.indices, "cimbi-diff-applied");
    setTimeout(() => clearHighlight("cimbi-diff-applied"), 1800);
    scrollDown();
  }

  function undo(msgIdx: number) {
    if (undoRef.current) {
      onDataChange(undoRef.current);
      undoRef.current = null;
    }
    clearHighlight("cimbi-diff-applied");
    setMsgs((prev) => prev.map((m, i) => (i === msgIdx && m.kind === "card" ? { ...m, state: "undone" } : m)));
  }

  // ── Átnézés (lektor) ──
  function runReview(intent: CimbiIntent) {
    const rows = data ?? [];
    const idx = resolveTargets(intent);
    const noPrice: number[] = [];
    const badEan: number[] = [];
    const overflow: number[] = [];
    const dupCikk: { c: string; nums: number[] }[] = [];
    const oddPrice: { n: number; kisz: string; ar: string }[] = [];
    let missingEan = 0;
    const flagged = new Set<number>();

    const cikkMap: Record<string, number[]> = {};
    idx.forEach((i) => {
      const c = String((rows[i] as ProcessedRow)["Cikkszám"] ?? "").trim();
      if (c) (cikkMap[c] = cikkMap[c] ?? []).push(i);
    });
    Object.keys(cikkMap).forEach((c) => {
      const list = cikkMap[c] as number[];
      if (list.length > 1) {
        dupCikk.push({ c, nums: list.map((i) => i + 1) });
        list.forEach((i) => flagged.add(i));
      }
    });

    const groups: Record<string, { i: number; p: number }[]> = {};
    idx.forEach((i) => {
      const p = parsePrice((rows[i] as ProcessedRow)["Ár"]);
      if (p == null || p <= 0) return;
      const k = String((rows[i] as ProcessedRow)["Kiszerelés"] ?? "").toLowerCase().replace(/\s/g, "");
      if (!k) return;
      (groups[k] = groups[k] ?? []).push({ i, p });
    });
    Object.values(groups).forEach((g) => {
      if (g.length < 3) return;
      const med = median(g.map((x) => x.p));
      if (!med) return;
      g.forEach((x) => {
        if (x.p >= med * 6 || x.p <= med / 6) {
          oddPrice.push({ n: x.i + 1, kisz: String((rows[x.i] as ProcessedRow)["Kiszerelés"] ?? "?"), ar: formatPrice(String(Math.round(x.p))) });
          flagged.add(x.i);
        }
      });
    });

    idx.forEach((i) => {
      const row = rows[i] as ProcessedRow;
      const p = parsePrice(row["Ár"]);
      const ap = parsePrice(row["Akciós_ár"]);
      if ((p == null || p <= 0) && (ap == null || ap <= 0)) {
        noPrice.push(i + 1);
        flagged.add(i);
      }
      const ean = String(row["EAN-13"] ?? "").trim();
      if (ean === "") missingEan++;
      else if (!validateEan13(ean)) {
        badEan.push(i + 1);
        flagged.add(i);
      }
      const name = nameOf(row);
      if (name) {
        const kept = wordCount(computeNameLines(name, maxLines).join(" "));
        if (kept < wordCount(name)) {
          overflow.push(i + 1);
          flagged.add(i);
        }
      }
    });

    const fmtNums = (ns: number[]) => ns.slice(0, 12).join(", ") + (ns.length > 12 ? " …" : "");
    const items: React.ReactNode[] = [];
    if (noPrice.length) items.push(<li key="np"><b>Hiányzó ár</b> ({noPrice.length}): {fmtNums(noPrice)}. címke</li>);
    if (badEan.length) items.push(<li key="be"><b>Hibás vonalkód</b> ({badEan.length}): {fmtNums(badEan)}. címke</li>);
    if (dupCikk.length) items.push(<li key="dc"><b>Dupla cikkszám</b>: {dupCikk.slice(0, 6).map((d) => `${d.c} → ${d.nums.join(", ")}`).join("; ")}</li>);
    if (oddPrice.length) items.push(<li key="op"><b>Gyanús ár</b> (lehet elgépelt): {oddPrice.slice(0, 6).map((o) => `${o.n}. (${o.kisz}, ${o.ar} Ft)`).join("; ")}</li>);
    if (overflow.length) items.push(<li key="of"><b>Nem fér ki a név</b> ({overflow.length}): {fmtNums(overflow)}. címke</li>);
    if (missingEan) items.push(<li key="me"><b>Hiányzó vonalkód</b>: {missingEan} db (ha szándékos, hagyd figyelmen kívül)</li>);

    clearHighlight("cimbi-review");
    if (!items.length) {
      push({ kind: "review", html: <><b>Átnéztem a {idx.length} címkét</b> - nem találtam hibát, minden rendben.</> });
    } else {
      push({
        kind: "review",
        html: (
          <>
            <b>Átnéztem a {idx.length} címkét, ezeket találtam:</b>
            <ul className="cimbi-help-list">{items}</ul>
            {flagged.size > 0 && <span className="cimbi-help-foot">A megjelölt címkék sárgán villognak. Szólj, ha javítsam valamelyiket.</span>}
          </>
        ),
      });
      if (flagged.size) highlightLabels([...flagged], "cimbi-review");
    }
  }

  // ── Statisztika ──
  function runStats(intent: CimbiIntent) {
    const rows = data ?? [];
    const idx = resolveTargets(intent);
    const priced = idx.map((i) => ({ i, p: parsePrice((rows[i] as ProcessedRow)["Ár"]) })).filter((x): x is { i: number; p: number } => x.p != null && x.p > 0);
    const metric = intent.metric || "count";
    const nm = (i: number) => {
      const n = nameOf(rows[i] as ProcessedRow);
      return i + 1 + ". " + (n ? cut(n, 30) : "címke");
    };
    let msg: string;
    if (metric === "count") {
      msg = "Összesen " + idx.length + " címke" + (idx.length !== rows.length ? " (a szűrésnek megfelelő)" : "") + ".";
    } else if (metric === "on_sale_count") {
      const n = idx.filter((i) => {
        const a = parsePrice((rows[i] as ProcessedRow)["Akciós_ár"]);
        return a != null && a > 0;
      }).length;
      msg = n + " címkén van akciós ár.";
    } else if (!priced.length) {
      msg = "Ehhez nincs érvényes ár a címkéken.";
    } else if (metric === "average_price") {
      const avg = priced.reduce((s, x) => s + x.p, 0) / priced.length;
      msg = "Átlagár: " + formatPrice(String(Math.round(avg))) + " Ft (" + priced.length + " címke).";
    } else if (metric === "total_price") {
      const sum = priced.reduce((s, x) => s + x.p, 0);
      msg = "Az árak összege: " + formatPrice(String(Math.round(sum))) + " Ft (" + priced.length + " címke).";
    } else if (metric === "min_price") {
      const best = priced.reduce((a, b) => (b.p < a.p ? b : a));
      msg = "A legolcsóbb a " + nm(best.i) + " - " + formatPrice(String(Math.round(best.p))) + " Ft.";
    } else if (metric === "max_price") {
      const best = priced.reduce((a, b) => (b.p > a.p ? b : a));
      msg = "A legdrágább a " + nm(best.i) + " - " + formatPrice(String(Math.round(best.p))) + " Ft.";
    } else {
      msg = "Ezt nem tudom kiszámolni.";
    }
    push({ kind: "bot", text: msg });
  }

  function renderIntent(intent: CimbiIntent) {
    if (intent.operation === "review") return runReview(intent);
    if (intent.operation === "stats") return runStats(intent);
    if (!KNOWN_OPS.includes(intent.operation)) {
      if (intent.summary) push({ kind: "bot", text: intent.summary });
      else push({ kind: "help" });
      return;
    }
    const plan = planChanges(intent);
    if (plan.changes.length === 0) {
      push({ kind: "bot", text: intent.summary ? "Ehhez nem találtam módosítható címkét: " + intent.summary : "Nem találtam módosítható címkét ehhez a kéréshez." });
      return;
    }
    push({ kind: "card", intent, plan, state: "preview" });
    clearHighlight("cimbi-diff");
    highlightLabels(plan.indices, "cimbi-diff");
  }

  function labelContext() {
    return (data ?? []).slice(0, 150).map((row, i) => ({
      n: i + 1,
      nev: cut(nameOf(row), 60),
      kisz: String(row["Kiszerelés"] ?? "").slice(0, 20),
      ar: parsePrice(row["Ár"]),
      akcio: parsePrice(row["Akciós_ár"]),
    }));
  }

  async function handleCommand(text: string) {
    push({ kind: "user", text });
    clearHighlight("cimbi-review");
    if (text.trim() === "__help__" || /mit tudsz/i.test(text)) {
      push({ kind: "help" });
      return;
    }
    if (!data || data.length === 0) {
      push({ kind: "bot", text: "Előbb tölts fel egy Excelt, utána tudok segíteni." });
      return;
    }
    setThinking(true);
    try {
      const res = await api.post<{ intent?: CimbiIntent }>("/api/label-command", {
        subpage: config.subpageId,
        message: text,
        labels: labelContext(),
      });
      setThinking(false);
      renderIntent(res.intent ?? { operation: "unknown", summary: HELP_TEXT });
    } catch {
      setThinking(false);
      push({ kind: "bot", text: "Most nem értem el a szervert. Próbáld újra." });
    }
  }

  function openPanel() {
    setOpen(true);
    document.body.classList.add("cimbi-open");
    if (!greetedRef.current) {
      greetedRef.current = true;
      push({
        kind: "bot",
        text:
          !data || data.length === 0
            ? "Szia! Tölts fel egy Excelt, és segítek az árváltozásban és a címkék szerkesztésében."
            : "Szia! Miben segítsek? Hivatkozhatsz a címkék sorszámára (a sarokban lévő kék szám) vagy a címkeadatokra.",
      });
    }
  }
  function closePanel() {
    setOpen(false);
    document.body.classList.remove("cimbi-open");
    clearHighlight("cimbi-diff");
    clearHighlight("cimbi-diff-applied");
    clearHighlight("cimbi-review");
  }

  // ── Panel mozgatása a fejlécnél ──
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
  function onHeaderPointerDown(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest(".cimbi-close")) return;
    const panel = panelRef.current;
    if (!panel) return;
    const r = panel.getBoundingClientRect();
    dragRef.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    panel.style.left = r.left + "px";
    panel.style.top = r.top + "px";
    panel.style.right = "auto";
    panel.style.bottom = "auto";
    panel.classList.add("cimbi-dragging");
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }
  function onHeaderPointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    const panel = panelRef.current;
    if (!drag || !panel) return;
    panel.style.left = clamp(e.clientX - drag.dx, 4, window.innerWidth - panel.offsetWidth - 4) + "px";
    panel.style.top = clamp(e.clientY - drag.dy, 4, window.innerHeight - panel.offsetHeight - 4) + "px";
  }
  function onHeaderPointerUp() {
    dragRef.current = null;
    panelRef.current?.classList.remove("cimbi-dragging");
  }

  if (!config.cimbiEnabled) return null;

  return (
    <>
      <button className="cimbi-launcher" aria-label="Cimbi segéd megnyitása" onClick={openPanel}>
        <svg viewBox="0 0 40 40" aria-hidden="true">
          <rect x="7" y="9" width="26" height="25" rx="7" fill="#ffffff" />
          <circle cx="15" cy="19" r="3" fill="#1C1C1C" />
          <circle cx="25" cy="19" r="3" fill="#1C1C1C" />
          <ellipse cx="11" cy="24" rx="2.2" ry="1.4" fill="#D97706" opacity="0.5" />
          <ellipse cx="29" cy="24" rx="2.2" ry="1.4" fill="#D97706" opacity="0.5" />
          <path d="M16 24 Q20 28 24 24" stroke="#1C1C1C" strokeWidth="1.8" fill="none" strokeLinecap="round" />
          <g fill="#1C1C1C">
            <rect x="13" y="29" width="1.5" height="3" />
            <rect x="16" y="29" width="1" height="3" />
            <rect x="18" y="29" width="2" height="3" />
            <rect x="21" y="29" width="1" height="3" />
            <rect x="23" y="29" width="1.5" height="3" />
            <rect x="25.5" y="29" width="1" height="3" />
          </g>
        </svg>
      </button>

      <div className={`cimbi-panel${open ? " open" : ""}`} ref={panelRef} aria-hidden={!open} role="dialog" aria-label="Cimbi segéd">
        <div
          className="cimbi-header"
          onPointerDown={onHeaderPointerDown}
          onPointerMove={onHeaderPointerMove}
          onPointerUp={onHeaderPointerUp}
          onPointerCancel={onHeaderPointerUp}
        >
          <svg viewBox="0 0 32 32" aria-hidden="true">
            <path d="M16 2 C18 6 19 8 16 9 C13 8 14 6 16 2Z" fill="#1D4ED8" />
            <rect x="5" y="8" width="22" height="21" rx="6" fill="#ffffff" stroke="#E2E0DA" strokeWidth="1.4" />
            <circle cx="12.5" cy="17" r="2.4" fill="#1C1C1C" />
            <circle cx="19.5" cy="17" r="2.4" fill="#1C1C1C" />
            <ellipse cx="9.5" cy="21" rx="1.8" ry="1.1" fill="#D97706" opacity="0.45" />
            <ellipse cx="22.5" cy="21" rx="1.8" ry="1.1" fill="#D97706" opacity="0.45" />
            <path d="M13 21 Q16 23.6 19 21" stroke="#1C1C1C" strokeWidth="1.4" fill="none" strokeLinecap="round" />
          </svg>
          <div className="cimbi-id">
            <div className="cimbi-name">Cimbi</div>
            <div className="cimbi-sub">Polccímke-szerkesztő gyakornok</div>
          </div>
          <button className="cimbi-close" aria-label="bezárás" onClick={closePanel}>
            <X />
          </button>
        </div>
        <div className="cimbi-note">Cimbi tesztelés alatt van és az üzenetekből tanul.</div>
        <div className="cimbi-thread" ref={threadRef}>
          {msgs.map((m, idx) => {
            if (m.kind === "user") return <div className="cimbi-msg cimbi-user" key={idx}>{m.text}</div>;
            if (m.kind === "bot") return <div className="cimbi-msg cimbi-bot" key={idx}>{m.text}</div>;
            if (m.kind === "help")
              return (
                <div className="cimbi-msg cimbi-bot cimbi-help" key={idx}>
                  <b>Ezt tudom:</b>
                  <ul className="cimbi-help-list">
                    <li>Áremelés / csökkentés %-kal</li>
                    <li>Árak kerekítése (x10 / x90 / x99)</li>
                    <li>Egy címke árának beállítása</li>
                    {config.saleEnabled && <li>Akció be- és kikapcsolása</li>}
                    <li>Tartalom: név, cikkszám, kiszerelés</li>
                    <li>Szöveg: csere, nagybetű, rövidítés</li>
                    <li>Egyedi kérések: pl. „tördeld a nevet 3 sorba"</li>
                    <li>Átnézés: hibák keresése a címkéken</li>
                    <li>Gyors kérdések: átlagár, legdrágább, darabszám</li>
                  </ul>
                  <span className="cimbi-help-foot">Hivatkozhatsz sorszámra, névre, márkára vagy kiszerelésre.</span>
                </div>
              );
            if (m.kind === "review") return <div className="cimbi-msg cimbi-bot cimbi-help" key={idx}>{m.html}</div>;
            // card
            const labelCount = new Set(m.plan.changes.map((c) => c.i)).size;
            if (m.state === "applied")
              return (
                <div className="cimbi-msg cimbi-bot cimbi-done" key={idx}>
                  <span>Kész - {labelCount} címke frissítve</span>
                  <button className="cimbi-undo" onClick={() => undo(idx)}>
                    Visszavonás
                  </button>
                </div>
              );
            if (m.state === "undone") return <div className="cimbi-msg cimbi-bot" key={idx}>Visszavonva.</div>;
            if (m.state === "cancelled") return <div className="cimbi-msg cimbi-bot" key={idx}>Rendben, nem módosítok semmit.</div>;
            return (
              <div className="cimbi-card" key={idx}>
                <div className="cimbi-card-head">
                  <span className="cimbi-card-title">{m.intent.summary || "Módosítás"}</span>
                  <span className="cimbi-card-tag">előnézet</span>
                </div>
                <div className="cimbi-card-row">
                  <span>Érintett címkék</span>
                  <b>{labelCount} db</b>
                </div>
                {m.plan.changes.slice(0, 3).map((c, ci) => (
                  <div className="cimbi-card-row" key={ci}>
                    <span>{c.rowLabel ?? c.i + 1 + ". címke"}</span>
                    <b>
                      {c.before} → {c.after}
                    </b>
                  </div>
                ))}
                {m.plan.changes.length > 3 && (
                  <div className="cimbi-card-row cimbi-card-more">
                    <span></span>
                    <b>…és még {m.plan.changes.length - 3}</b>
                  </div>
                )}
                <div className="cimbi-card-actions">
                  <button className="cimbi-apply" onClick={() => applyPlan(m.plan, idx)}>
                    Alkalmaz a {labelCount} címkén
                  </button>
                  <button
                    className="cimbi-cancel"
                    onClick={() => {
                      clearHighlight("cimbi-diff");
                      setMsgs((prev) => prev.map((mm, i) => (i === idx && mm.kind === "card" ? { ...mm, state: "cancelled" } : mm)));
                    }}
                  >
                    Mégse
                  </button>
                </div>
              </div>
            );
          })}
          {thinking && <div className="cimbi-msg cimbi-bot cimbi-thinking">Cimbi gondolkodik…</div>}
        </div>
        <div className="cimbi-chips">
          <button className="cimbi-chip" onClick={() => void handleCommand("nézd át a címkéket")}>
            Címkék átnézése
          </button>
          <button
            className="cimbi-chip"
            onClick={() => {
              push({ kind: "user", text: "Mit tudsz?" });
              push({ kind: "help" });
            }}
          >
            Mit tudsz?
          </button>
        </div>
        <form
          className="cimbi-input"
          onSubmit={(e) => {
            e.preventDefault();
            const t = input.trim();
            if (!t) return;
            setInput("");
            void handleCommand(t);
          }}
        >
          <input
            type="text"
            placeholder="Írj Cimbinek..."
            autoComplete="off"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button type="submit" aria-label="küldés">
            <ArrowUp />
          </button>
        </form>
      </div>
    </>
  );
}
