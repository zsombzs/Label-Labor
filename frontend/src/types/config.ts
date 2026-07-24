/** Logóválasztó egy opciója (A/B rádiógomb). */
export interface LogoOption {
  value: "A" | "B";
  label: string;
  src: string;
  cssClass: string;
}

/** Letölthető Excel-sablon. */
export interface TemplateOption {
  label: string;
  file: string;
}

/**
 * A4-es nyomtatási elrendezés. Aloldalanként configolható, mert később
 * oldalanként többféle címkeméret lesz - új méret = új layout-bejegyzés.
 */
export interface LabelLayout {
  labelWidthMm: number;
  labelHeightMm: number;
  /** Rés a címkék között (vízszintesen és függőlegesen) - a kivágást segíti. */
  gapMm: number;
  columns: number;
  rows: number;
  /** Oldalszám a lap TETEJÉN, ettől az oldaltól kezdve (1 = mindenhol, 2 = a másodiktól). */
  pageNumberFromPage: number;
}

/** Egységes alapértelmezett elrendezés: 62.67×39.7 mm, 1 mm rés, 3×7 = 21 címke/oldal. */
export const DEFAULT_LAYOUT: LabelLayout = {
  labelWidthMm: 62.67,
  labelHeightMm: 39.7,
  gapMm: 1,
  columns: 3,
  rows: 7,
  pageNumberFromPage: 2,
};

/**
 * Egy aloldal teljes konfigurációja - az agent/subpage_configs.py frontend-tükre
 * kiegészítve a kliens-oldali eltérésekkel (ALOLDAL_KULONBSEG_MATRIX.md).
 * Új ügyfél = egy új bejegyzés a subpages.ts-ben, nem új kódág.
 */
/** Az oldalon megjelenő feliratok - pontosan a régi HTML-ek szövegei. */
export interface UiTexts {
  /** <h1 class="focim"> */
  focim: string;
  /** <h2 class="alcim"> */
  alcim: string;
}

export interface SubpageConfig {
  subpageId: "ll" | "ea" | "ditall" | "hudak" | "demo";
  companyUsername: string;
  uiTexts: UiTexts;
  pdfFilename: string;
  templates: TemplateOption[];
  logos: LogoOption[];
  acceptExtensions: string[];
  /** Oszlopfejlécek trim-elése beolvasáskor (xlsm trailing space) - EA. */
  trimHeaders: boolean;
  /** Makróval előfeldolgozott Excel felismerése (Első_sor oszlop → backend kihagyása). */
  detectPreprocessedExcel: boolean;
  maxLines: 3 | 4;
  unitMap: "standard" | "ditall";
  /** Ft/m2 egységár kliens-oldali számítása - Ditall. */
  ftM2: boolean;
  extractSzin: boolean;
  batchAutofix: boolean;
  /** Akciós ár logika (label-sale render + Akciós_ár oszlop) - csak LL, Hudak, demo. */
  saleEnabled: boolean;
  /** Nyomtatási elrendezés (címkeméret, rés, rács, oldalszámozás). */
  layout: LabelLayout;
  /** Árváltozás-detektor - BETA, kizárólag LL. */
  arvaltozasEnabled: boolean;
  cimbiEnabled: boolean;
  isDemo: boolean;
  /**
   * A generátor felület elrendezése.
   * - "classic" (alap): a régi kétpaneles LL-elrendezés (bal vezérlők, jobb címkék).
   * - "dashboard": új, a főoldalhoz illő elrendezés — bal oldali számozott lépés-dashboard
   *   + jobb oldali nagy panel, lépésenkénti tartalommal és auto-léptetéssel.
   * Config-vezérelt, hogy később bármelyik aloldal egy sorral átállítható legyen.
   */
  uiStyle?: "classic" | "dashboard";
  /** Vízjel-oszlopok szövegei (a címke hátterében, függőlegesen). */
  watermarkColumns?: string[];
  maxRows?: number;
}
