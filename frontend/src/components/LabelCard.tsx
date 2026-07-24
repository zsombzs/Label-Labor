import { useEffect, useRef } from "react";
import { Pencil } from "lucide-react";
import type { ProcessedRow } from "../types/label";
import type { LogoOption, SubpageConfig } from "../types/config";
import { formatPrice, normalizePrice, parsePrice, recalculateUnitPrice } from "../lib/labelUtils";
import { Barcode } from "./Barcode";

export interface LabelEditValues {
  [field: string]: string;
}

interface LabelCardProps {
  row: ProcessedRow;
  index: number;
  logo: LogoOption | null;
  config: SubpageConfig;
  editing: boolean;
  onStartEdit: (index: number) => void;
  onCommitEdit: (index: number, values: LabelEditValues) => void;
  onCancelEdit: () => void;
}

const PRICE_FIELDS = ["Ár", "Akciós_ár"];

function str(v: string | number | undefined): string {
  return String(v ?? "");
}

/** "m2" → m² (Ditall kiszerelés/egységcímke formázás, a régi formatKiszereles párja). */
function withSup(text: string): React.ReactNode {
  const parts = text.split(/m2/gi);
  if (parts.length === 1) return text;
  return parts.map((p, i) => (
    <span key={i}>
      {p}
      {i < parts.length - 1 && (
        <>
          m<sup>2</sup>
        </>
      )}
    </span>
  ));
}

/**
 * Egy polccímke - normál vagy akciós formátum, standard (LL/EA/Hudak/demo)
 * vagy Ditall-változat (4. sor, m², Ft/m2), helyben szerkesztéssel.
 */
export function LabelCard({
  row,
  index,
  logo,
  config,
  editing,
  onStartEdit,
  onCommitEdit,
  onCancelEdit,
}: LabelCardProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const isDitall = config.unitMap === "ditall";
  const line3Max = isDitall ? 24 : 20;

  // ── Akciós formátum eldöntése ── (normalizePrice: a 0 ár üresnek számít)
  const rowAr = normalizePrice(row["Ár"]);
  const akciosAr = config.saleEnabled ? normalizePrice(row["Akciós_ár"]) : "";
  const arNum = parsePrice(rowAr);
  const akciosNum = parsePrice(akciosAr);
  const arIsValid = rowAr !== "" && arNum !== null && arNum > 0;
  const akciosIsValid = akciosAr !== "" && akciosNum !== null && akciosNum > 0;
  const isSale = arIsValid && akciosIsValid;
  const renderRow: ProcessedRow =
    !arIsValid && akciosIsValid ? { ...row, Ár: akciosAr, Akciós_ár: "" } : row;

  // ── Helyben szerkesztés: kívülre kattintás → commit ──
  useEffect(() => {
    if (!editing) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const root = rootRef.current;
      if (root && e.target instanceof Node && root.contains(e.target)) return;
      commit();
    };
    document.addEventListener("mousedown", onDocMouseDown, true);
    return () => document.removeEventListener("mousedown", onDocMouseDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  function readValues(): LabelEditValues {
    const values: LabelEditValues = {};
    rootRef.current?.querySelectorAll<HTMLElement>("[data-edit]").forEach((el) => {
      const field = el.dataset["edit"];
      if (!field) return;
      // SEC: a contentEditable-nek nincs maxLength attribútuma, ezért a beolvasott
      // értéket itt vágjuk 200 karakterre (a feltöltési útvonal MAX_CELL_CHARS-ával
      // egyezően) - egy pathologikus beillesztés se fújhassa fel a state-et/rendert.
      let val = (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 200);
      if (PRICE_FIELDS.includes(field) && val !== "") {
        const p = parsePrice(val);
        val = p === null ? str(row[field]) : String(Math.round(p));
      }
      values[field] = val;
    });
    if (isDitall) parseLine4Prefixes(values);
    return values;
  }

  /**
   * Ditall 4. sor: a beírt "szín: kék" / "cikkszám: 123" prefixet felismeri és a
   * megfelelő mezőbe írja - mintha a táblázatba írták volna. A megjelenítési
   * prioritás változatlan: Szín → Cikkszám → Negyedik_sor. Ha a magasabb
   * prioritású mezőből irányítunk át alacsonyabba, a forrásmezőt ürítjük,
   * hogy az új érték látszódjon a címkén.
   */
  function parseLine4Prefixes(values: LabelEditValues): void {
    const PRECEDENCE: Record<string, number> = { Szín: 2, Cikkszám: 1, Negyedik_sor: 0 };
    for (const edited of Object.keys(PRECEDENCE)) {
      const v = values[edited];
      if (v === undefined || v === "") continue;
      const szinM = v.match(/^sz[ií]n\s*:\s*(.*)$/i);
      const cikkM = v.match(/^cikksz[áa]m\s*:\s*(.*)$/i);
      const target = szinM ? "Szín" : cikkM ? "Cikkszám" : null;
      const parsed = (szinM?.[1] ?? cikkM?.[1] ?? "").trim();
      if (!target) continue;
      if (target === edited) {
        values[edited] = parsed; // redundáns prefix leválasztása
      } else {
        values[target] = parsed;
        if ((PRECEDENCE[edited] as number) > (PRECEDENCE[target] as number)) {
          values[edited] = ""; // pl. Szín mezőbe írt "cikkszám: X" → a szín törlődik
        } else {
          delete values[edited]; // pl. Cikkszám mezőbe írt "szín: X" → a cikkszám megmarad
        }
      }
    }
  }

  function commit() {
    onCommitEdit(index, readValues());
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!editing) return;
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancelEdit();
    }
  }

  function onPaste(e: React.ClipboardEvent) {
    if (!editing) return;
    e.preventDefault();
    // SEC: a beillesztett szöveget normalizáljuk és 200 karakterre vágjuk.
    const text = e.clipboardData.getData("text").replace(/\s+/g, " ").slice(0, 200);
    document.execCommand("insertText", false, text);
  }

  function onDoubleClick(e: React.MouseEvent) {
    if (editing) return;
    onStartEdit(index);
    const editEl = (e.target as HTMLElement).closest("[data-edit]");
    requestAnimationFrame(() => {
      const focusEl =
        (editEl as HTMLElement | null) ??
        rootRef.current?.querySelector<HTMLElement>("[data-edit]") ??
        null;
      focusEl?.focus();
      placeCaretEnd(focusEl);
    });
  }

  function placeCaretEnd(el: HTMLElement | null) {
    if (!el) return;
    try {
      const r = document.createRange();
      r.selectNodeContents(el);
      r.collapse(false);
      const s = window.getSelection();
      s?.removeAllRanges();
      s?.addRange(r);
    } catch {
      /* nem kritikus */
    }
  }

  /** Szerkeszthető mező: edit módban a nyers érték, egyébként a megjelenített. */
  function Field({
    field,
    display,
    editValue,
    className,
    style,
    as: Tag = "div",
  }: {
    field: string;
    display: React.ReactNode;
    editValue?: string;
    className?: string;
    style?: React.CSSProperties;
    as?: "div" | "span";
  }) {
    return (
      <Tag
        className={className}
        style={style}
        data-edit={field}
        contentEditable={editing}
        suppressContentEditableWarning
        spellCheck={false}
      >
        {editing && editValue !== undefined ? editValue : display}
      </Tag>
    );
  }

  const editProps = { onKeyDown, onPaste, onDoubleClick };

  const rawPrice = (v: string | number | undefined): string => {
    const p = parsePrice(v);
    return p === null ? "" : String(Math.round(p));
  };

  let body: React.ReactNode;
  if (isSale) {
    // ── AKCIÓS címke (csak saleEnabled oldalakon) ──
    const line1 = str(renderRow["Első_sor"]).substring(0, 20);
    const line2 = str(renderRow["Második_sor"]).substring(0, 20);
    const line3 = str(renderRow["Harmadik_sor"]).substring(0, line3Max);
    const kiszereles = str(renderRow["Kiszerelés"]);
    const ar = normalizePrice(renderRow["Ár"]);
    const akcios = normalizePrice(renderRow["Akciós_ár"]);

    const origNum = parsePrice(ar);
    const saleNum = parsePrice(akcios);
    let discountPct = "";
    if (origNum !== null && saleNum !== null && origNum > 0 && saleNum < origNum) {
      discountPct = "-" + Math.round(((origNum - saleNum) / origNum) * 100) + "%";
    }

    let saleUnitPrice = "";
    let saleUnitLabel = "";
    if (/db$/i.test(kiszereles)) {
      saleUnitLabel = "Ft/db";
      saleUnitPrice = formatPrice(akcios);
    } else {
      const { ftl, ftkg } = recalculateUnitPrice(kiszereles, akcios, config.unitMap);
      if (ftl) {
        saleUnitPrice = formatPrice(ftl);
        saleUnitLabel = "Ft/l";
      } else if (ftkg) {
        saleUnitPrice = formatPrice(ftkg);
        saleUnitLabel = "Ft/kg";
      }
    }

    const smClass = logo
      ? logo.cssClass.replace(/logo-a\b/, "logo-a-sm").replace(/logo-b\b/, "logo-b-sm")
      : null;

    body = (
      <>
        {logo && smClass && <img src={logo.src} className={smClass} alt="" />}
        <Field field="Első_sor" display={line1} className="line1" />
        <Field field="Második_sor" display={line2} className="line2" />
        <Field field="Harmadik_sor" display={line3} className="line3" />
        <Barcode value={row["EAN-13"]} />
        <div className="sale-info-row">
          <Field
            field="Cikkszám"
            display={str(renderRow["Cikkszám"]).substring(0, 12)}
            className="sale-cikk"
            as="span"
          />
          <Field field="Kiszerelés" display={kiszereles} className="sale-kiszeres" as="span" />
        </div>
        <div className="price-box-orig">
          <span className="original-price">
            <Field field="Ár" display={formatPrice(ar)} editValue={rawPrice(ar)} as="span" />
            ,- Ft
          </span>
          <span className="pct">{discountPct}</span>
        </div>
        <div className="price-box-sale">
          <Field
            field="Akciós_ár"
            display={formatPrice(akcios)}
            editValue={rawPrice(akcios)}
            className="amount"
            as="span"
          />
          <span className="unit">,- Ft</span>
        </div>
        {saleUnitLabel && (
          <div className="sale-unit-price">
            {saleUnitPrice ? saleUnitPrice + ",- " : ""}
            {saleUnitLabel}
          </div>
        )}
      </>
    );
  } else {
    // ── NORMÁL címke ──
    const line1 = str(renderRow["Első_sor"]).substring(0, 20);
    const line2 = str(renderRow["Második_sor"]).substring(0, 20);
    const line3 = str(renderRow["Harmadik_sor"]).substring(0, line3Max);
    const kiszereles = str(renderRow["Kiszerelés"]);
    const ar = normalizePrice(renderRow["Ár"]);
    const ftPerL = str(renderRow["Ft/l"]);
    const ftPerKg = str(renderRow["Ft/kg"]);
    const ftPerM2 = isDitall ? str(renderRow["Ft/m2"]) : "";

    let price = "";
    let pricePerUnit = "";
    let unitLabel = "";
    if (/db$/i.test(kiszereles)) {
      unitLabel = "Ft/db";
      if (ar !== "") {
        pricePerUnit = formatPrice(ar);
        price = formatPrice(ar);
      }
    } else if (ar !== "") {
      price = formatPrice(ar);
      if (ftPerL !== "") {
        pricePerUnit = formatPrice(ftPerL);
        unitLabel = "Ft/l";
      } else if (ftPerKg !== "") {
        pricePerUnit = formatPrice(ftPerKg);
        unitLabel = "Ft/kg";
      } else if (isDitall && ftPerM2 !== "") {
        pricePerUnit = formatPrice(ftPerM2);
        unitLabel = "Ft/m2";
      }
    } else {
      if (/ml|l/i.test(kiszereles)) unitLabel = "Ft/l";
      else if (/g|kg/i.test(kiszereles)) unitLabel = "Ft/kg";
      else if (isDitall && /m2/i.test(kiszereles)) unitLabel = "Ft/m2";
    }

    if (isDitall) {
      // ── DITALL: 4. sor prioritás: Szín → Cikkszám → Negyedik_sor → üres ──
      const cikkszam = str(renderRow["Cikkszám"]);
      const szin = str(renderRow["Szín"]);
      const negyedikSor = str(renderRow["Negyedik_sor"]);
      // Ha nincs szín, a terméknév vastag (kiemelés fallback)
      const nameWeight: React.CSSProperties = { fontWeight: szin ? "normal" : "bold" };
      const line4Style: React.CSSProperties =
        !cikkszam && !szin && negyedikSor
          ? { fontSize: "11pt", fontWeight: szin ? "normal" : "bold" }
          : {};

      let line4: React.ReactNode;
      if (szin) {
        line4 = (
          <>
            Szín:{" "}
            <strong>
              <Field field="Szín" display={szin} className="line4-val" as="span" />
            </strong>
          </>
        );
      } else if (cikkszam) {
        line4 = (
          <>
            cikkszám:{" "}
            <Field field="Cikkszám" display={cikkszam.substring(0, 14)} className="line4-val" as="span" />
          </>
        );
      } else {
        line4 = (
          <Field
            field="Negyedik_sor"
            display={negyedikSor.substring(0, 24)}
            className="line4-val"
            as="span"
          />
        );
      }

      body = (
        <>
          {logo && <img src={logo.src} className={logo.cssClass} alt="" />}
          <Field field="Első_sor" display={line1} className="line1" style={nameWeight} />
          <Field field="Második_sor" display={line2} className="line2" style={nameWeight} />
          <Field field="Harmadik_sor" display={line3} className="line3" style={nameWeight} />
          <Field field="Kiszerelés" display={withSup(kiszereles)} editValue={kiszereles} className="kiszereles" />
          <div className="line4" style={line4Style}>
            {line4}
          </div>
          <Barcode value={row["EAN-13"]} />
          <div className="bottom">
            <div className="price-box1">
              <Field field="Ár" display={price} editValue={rawPrice(ar)} className="amount" as="span" />
              <span className="unit">,- Ft</span>
            </div>
            <div className="price-box2">
              <span className="amount">{pricePerUnit}</span>
              <span className="unit">{unitLabel ? <>,- {withSup(unitLabel)}</> : ""}</span>
            </div>
          </div>
        </>
      );
    } else {
      // ── STANDARD (LL/EA/Hudak/demo) ──
      body = (
        <>
          {logo && <img src={logo.src} className={logo.cssClass} alt="" />}
          <Field field="Első_sor" display={line1} className="line1" />
          <Field field="Második_sor" display={line2} className="line2" />
          <Field field="Harmadik_sor" display={line3} className="line3" />
          <Field field="Kiszerelés" display={kiszereles} className="kiszereles" />
          <div className="line4">
            cikkszám:{" "}
            <Field field="Cikkszám" display={str(renderRow["Cikkszám"]).substring(0, 16)} as="span" />
          </div>
          <Barcode value={row["EAN-13"]} />
          <div className="bottom">
            <div className="price-box1">
              <Field field="Ár" display={price} editValue={rawPrice(ar)} className="amount" as="span" />
              <span className="unit">,- Ft</span>
            </div>
            <div className="price-box2">
              <span className="amount">{pricePerUnit}</span>
              <span className="unit">{unitLabel ? ",- " + unitLabel : ""}</span>
            </div>
          </div>
        </>
      );
    }
  }

  const watermarkText = config.watermarkColumns?.join(" ") ?? "";

  return (
    <div
      ref={rootRef}
      className={`label${isSale ? " label-sale" : ""}${editing ? " label-editing" : ""}`}
      {...editProps}
    >
      {watermarkText && (
        <div className="label-watermark" aria-hidden="true">
          {Array.from({ length: 8 }, (_, i) => (
            <span className="wm-text" key={i}>
              {watermarkText}
            </span>
          ))}
        </div>
      )}
      {body}
      {/* Sorszám-jelvény (csak képernyőn; PDF-ből kizárva ignoreElements-szel) */}
      <span className="cimbi-label-num">{index + 1}</span>
      {/* Látható Szerkesztés gomb (hoverre; PDF-ből kizárva) */}
      {!editing && (
        <button type="button" className="label-edit-btn" onClick={() => onStartEdit(index)}>
          <Pencil width={13} height={13} />
          <span>Szerkesztés</span>
        </button>
      )}
      {editing && (
        <div className="label-edit-actions">
          <button type="button" className="lea-done" onClick={commit}>
            ✓ Kész
          </button>
          <button type="button" className="lea-cancel" onClick={onCancelEdit}>
            ✕ Mégse
          </button>
        </div>
      )}
    </div>
  );
}
