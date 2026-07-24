import { useMemo, useState } from "react";
import { T, useLanguage } from "../i18n/LanguageContext";

/**
 * Árajánlat-konfigurátor (a régi üres "Üzenet" mező helyett).
 * A látogató bejelöli a boltja profilját, ebből strukturált brief készül,
 * amit a Landing a Formspree `message` mezőjeként küld el (mindig magyarul).
 */

/** HU egységár-alapegységek (kg, l, db, m, m²) + gyakori másodlagos kiszerelések. */
const UNITS = ["l", "dl", "cl", "ml", "kg", "dkg", "g", "db", "m", "m²", "m³"] as const;

const LIMITS = { sizes: [1, 10], layouts: [1, 10], logos: [1, 10], stores: [1, 50] } as const;
type NumKey = keyof typeof LIMITS;

interface CfgState {
  units: Set<string>;
  other: boolean;
  otherText: string;
  sizes: number;
  layouts: number;
  logos: number;
  stores: number;
  sale: boolean;
  brand: boolean;
  freeMsg: string;
}

const initialState = (): CfgState => ({
  units: new Set(["l", "kg", "db"]),
  other: false,
  otherText: "",
  sizes: 1,
  layouts: 2,
  logos: 1,
  stores: 1,
  sale: true,
  brand: true,
  freeMsg: "",
});

export function useQuoteConfig() {
  const [state, setState] = useState<CfgState>(initialState);

  const toggleUnit = (u: string) =>
    setState((s) => {
      const units = new Set(s.units);
      if (units.has(u)) units.delete(u);
      else units.add(u);
      return { ...s, units };
    });

  const stepNum = (key: NumKey, d: number) =>
    setState((s) => {
      const [min, max] = LIMITS[key];
      return { ...s, [key]: Math.min(max, Math.max(min, s[key] + d)) };
    });

  const patch = (p: Partial<CfgState>) => setState((s) => ({ ...s, ...p }));

  const reset = () => setState(initialState());

  /** A kiválasztott kiszerelések listája (az "Egyéb" szöveggel együtt).
   *  SEC: az "Egyéb" szabad szöveget itt is levágjuk (a maxLength csak UX). */
  const unitList = useMemo(() => {
    const list = UNITS.filter((u) => state.units.has(u)) as string[];
    const other = state.other ? state.otherText.trim().slice(0, 60) : "";
    return other ? [...list, other] : list;
  }, [state.units, state.other, state.otherText]);

  /** A beérkező e-mail szövege - mindig magyarul (belső brief). */
  const brief = useMemo(() => {
    const lines = [
      "- A boltod adatai (konfigurátor) -",
      `Kiszerelések: ${unitList.join(", ") || "-"}`,
      `Címkeméretek száma: ${state.sizes}`,
      `Elrendezések méretenként: ${state.layouts}`,
      `Logók száma: ${state.logos}`,
      `Boltok száma: ${state.stores}`,
      `Akciós ár: ${state.sale ? "igen" : "nem"}`,
      `Egyedi arculat/logó: ${state.brand ? "igen" : "nem"}`,
    ];
    if (state.freeMsg.trim()) lines.push(`Egyéb üzenet: ${state.freeMsg.trim().slice(0, 1000)}`);
    return lines.join("\n");
  }, [unitList, state]);

  /** Strukturált mezők a Formspree payloadhoz (olvashatóbb e-mail). */
  const fields = useMemo(
    () => ({
      kiszerelesek: unitList.join(", ") || "-",
      cimkemeretek: String(state.sizes),
      elrendezesek: String(state.layouts),
      logok: String(state.logos),
      boltok: String(state.stores),
      akcios_ar: state.sale ? "igen" : "nem",
      egyedi_arculat: state.brand ? "igen" : "nem",
    }),
    [unitList, state],
  );

  return { state, toggleUnit, stepNum, patch, reset, unitList, brief, fields };
}

export type QuoteConfig = ReturnType<typeof useQuoteConfig>;

/* ── Az űrlapba épülő konfigurátor mezők ── */
export function QuoteConfiguratorFields({ cfg }: { cfg: QuoteConfig }) {
  const { t } = useLanguage();
  const { state } = cfg;

  const stepper = (key: NumKey, labelKey: "cfg-sizes" | "cfg-layouts" | "cfg-logos" | "cfg-stores") => (
    <div className="cfg-stepper">
      <span className="cfg-st-label">
        <T k={labelKey} />
        <small>
          <T k={`${labelKey}-hint` as "cfg-sizes-hint"} />
        </small>
      </span>
      <span className="cfg-st-controls">
        <button
          type="button"
          className="cfg-st-btn"
          aria-label={t("cfg-dec")}
          disabled={state[key] <= LIMITS[key][0]}
          onClick={() => cfg.stepNum(key, -1)}
        >
          −
        </button>
        <span className="cfg-st-val">{state[key]}</span>
        <button
          type="button"
          className="cfg-st-btn"
          aria-label={t("cfg-inc")}
          disabled={state[key] >= LIMITS[key][1]}
          onClick={() => cfg.stepNum(key, 1)}
        >
          +
        </button>
      </span>
    </div>
  );

  return (
    <div className="cfg-root">
      {/* 1. Kiszerelések */}
      <div className="cfg-section">
        <div className="cfg-label">
          <span className="cfg-num">1</span> <T k="cfg-units-label" />
        </div>
        <T k="cfg-units-hint" as="p" className="cfg-hint" />
      </div>
      <div className="cfg-chips">
        {UNITS.map((u) => (
          <button
            key={u}
            type="button"
            className="cfg-chip"
            aria-pressed={state.units.has(u)}
            onClick={() => cfg.toggleUnit(u)}
          >
            {u}
          </button>
        ))}
        <button
          type="button"
          className="cfg-chip cfg-chip-more"
          aria-pressed={state.other}
          onClick={() => cfg.patch({ other: !state.other })}
        >
          <T k="cfg-other-chip" />
        </button>
      </div>
      {state.other && (
        <div className="cfg-other-row">
          <input
            type="text"
            value={state.otherText}
            maxLength={60}
            placeholder={t("cfg-other-placeholder")}
            onChange={(e) => cfg.patch({ otherText: e.target.value })}
          />
        </div>
      )}

      {/* 2. Mennyiségek */}
      <div className="cfg-section">
        <div className="cfg-label">
          <span className="cfg-num">2</span> <T k="cfg-qty-label" />
        </div>
      </div>
      <div className="cfg-steppers">
        {stepper("sizes", "cfg-sizes")}
        {stepper("layouts", "cfg-layouts")}
        {stepper("logos", "cfg-logos")}
        {stepper("stores", "cfg-stores")}
      </div>

      {/* 3. Extrák */}
      <div className="cfg-section">
        <div className="cfg-label">
          <span className="cfg-num">3</span> <T k="cfg-extras-label" />
        </div>
      </div>
      <div className="cfg-switches">
        <label className="cfg-switch-row">
          <span className="cfg-st-label">
            <T k="cfg-sale" />
          </span>
          <span className="cfg-sw">
            <input type="checkbox" checked={state.sale} onChange={(e) => cfg.patch({ sale: e.target.checked })} />
            <i></i>
          </span>
        </label>
        <label className="cfg-switch-row">
          <span className="cfg-st-label">
            <T k="cfg-brand" />
          </span>
          <span className="cfg-sw">
            <input type="checkbox" checked={state.brand} onChange={(e) => cfg.patch({ brand: e.target.checked })} />
            <i></i>
          </span>
        </label>
      </div>

      {/* 4. Egyéb üzenet */}
      <div className="cfg-section">
        <div className="cfg-label">
          <span className="cfg-num">4</span> <T k="cfg-msg-label" />{" "}
          <span className="cfg-optional">
            <T k="cfg-msg-optional" />
          </span>
        </div>
      </div>
      <textarea
        className="cfg-free-msg"
        rows={3}
        maxLength={1000}
        value={state.freeMsg}
        placeholder={t("cfg-msg-placeholder")}
        onChange={(e) => cfg.patch({ freeMsg: e.target.value })}
      ></textarea>
    </div>
  );
}

/* ── Élő összefoglaló panel (desktopon a jobb oszlopban, sticky) ── */
export function QuoteSummary({ cfg }: { cfg: QuoteConfig }) {
  const { t } = useLanguage();
  const { state, unitList } = cfg;
  const msg = state.freeMsg.trim();

  return (
    <div className="contact-info-section cfg-summary-card">
      <div className="cfg-summary-title">
        <span className="cfg-summary-dot"></span> <T k="cfg-summary-title" />
      </div>
      <ul className="cfg-summary-list">
        {unitList.length > 0 ? (
          <li>
            {t("cfg-sum-units")}
            {unitList.join(", ")}
          </li>
        ) : (
          <li className="cfg-muted">
            <T k="cfg-summary-empty" />
          </li>
        )}
        <li>
          {state.sizes} {t("cfg-w-size")} × {state.layouts} {t("cfg-w-layout")}
        </li>
        <li>
          {state.logos} {t("cfg-w-logo")} · {state.stores} {t("cfg-w-store")}
        </li>
        <li className={state.sale ? "" : "cfg-muted"}>
          <T k={state.sale ? "cfg-sum-sale-yes" : "cfg-sum-sale-no"} />
        </li>
        <li className={state.brand ? "" : "cfg-muted"}>
          <T k={state.brand ? "cfg-sum-brand-yes" : "cfg-sum-brand-no"} />
        </li>
        {msg && (
          <li>
            {t("cfg-sum-msg")}
            {msg.length > 60 ? msg.slice(0, 60) + "…" : msg}
          </li>
        )}
      </ul>
    </div>
  );
}
