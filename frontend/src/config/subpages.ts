import type { LogoOption, SubpageConfig } from "../types/config";
import { DEFAULT_LAYOUT } from "../types/config";

const LL_LOGOS: LogoOption[] = [
  { value: "A", label: "A logo", src: "/subpage-assets/ll/icon_1.png", cssClass: "logo-a" },
  { value: "B", label: "B logo", src: "/subpage-assets/ll/icon_2.png", cssClass: "logo-b" },
];

/**
 * Az 5 aloldal konfigurációja - az ALOLDAL_KULONBSEG_MATRIX.md alapján.
 * Egységesítési döntések (mindenkire): normalizePrice, inline címke-szerkesztő,
 * objektum-alapú logóváltás, egységes címkeméret 1 mm réssel (DEFAULT_LAYOUT),
 * oldalszám a 2. oldaltól a lap tetején. Akciós ár: saleEnabled flag (LL/Hudak/demo).
 */
export const subpages: Record<string, SubpageConfig> = {
  ll: {
    subpageId: "ll",
    companyUsername: "L_L",
    uiTexts: { focim: "Festékbolt címkéi", alcim: "Címke generátor 1.3.1" },
    pdfFilename: "cimkek.pdf",
    templates: [{ label: "Sablon Excel", file: "excel_sablon.xlsx" }],
    logos: LL_LOGOS,
    acceptExtensions: [".xlsx"],
    trimHeaders: false,
    detectPreprocessedExcel: true,
    maxLines: 3,
    unitMap: "standard",
    ftM2: false,
    extractSzin: false,
    batchAutofix: false,
    saleEnabled: true,
    layout: DEFAULT_LAYOUT,
    arvaltozasEnabled: false, // BETA - jelenleg mindenhol kikapcsolva; bekapcsolás: true
    cimbiEnabled: true,
    isDemo: false,
  },

  ea: {
    subpageId: "ea",
    companyUsername: "EA_HU",
    uiTexts: { focim: "European Aerosols", alcim: "Címke generátor 1.3.1" },
    pdfFilename: "ea_cimkek.pdf",
    templates: [
      { label: "ÚJ (.xlsx)", file: "new_ea_sablon.xlsx" },
      { label: "RÉGI (.xlsm)", file: "ea_excel_sablon.xlsm" },
    ],
    logos: [
      // Mindkettő a régi fix .logo osztályt kapja (65px, top 11, right 8) - a kimenet pixelre azonos.
      { value: "A", label: "EA címke", src: "/subpage-assets/ea/ea.png", cssClass: "logo" },
      { value: "B", label: "HG címke", src: "/subpage-assets/ea/hg.png", cssClass: "logo" },
    ],
    acceptExtensions: [".xlsx", ".xlsm"],
    trimHeaders: true,
    detectPreprocessedExcel: true,
    maxLines: 3,
    unitMap: "standard",
    ftM2: false,
    extractSzin: false,
    batchAutofix: false,
    saleEnabled: false,
    layout: DEFAULT_LAYOUT,
    arvaltozasEnabled: false,
    cimbiEnabled: true,
    isDemo: false,
  },

  ditall: {
    subpageId: "ditall",
    companyUsername: "DITALL",
    uiTexts: { focim: "Ditáll 2002 Kft. címkéi", alcim: "Címke generátor 1.0.1" },
    pdfFilename: "ditall_cimkek.pdf",
    templates: [{ label: "Sablon Excel", file: "ditall_sablon.xlsx" }],
    logos: [
      { value: "A", label: "A címke", src: "/subpage-assets/ditall/ditall_logo.png", cssClass: "logo logo-a" },
      { value: "B", label: "B címke", src: "/subpage-assets/ditall/ditall_logo2.png", cssClass: "logo logo-b" },
    ],
    acceptExtensions: [".xlsx"],
    trimHeaders: false,
    detectPreprocessedExcel: true,
    maxLines: 4,
    unitMap: "ditall",
    ftM2: true,
    extractSzin: true,
    batchAutofix: true,
    saleEnabled: false,
    layout: DEFAULT_LAYOUT,
    arvaltozasEnabled: false,
    cimbiEnabled: true,
    isDemo: false,
  },

  // Új ügyfél - cél: mindenben egyezik az LL-lel, kivéve az árváltozás-detektort (LL-only beta).
  hudak: {
    subpageId: "hudak",
    companyUsername: "HUDAK",
    uiTexts: { focim: "Hudák Kft. címkéi", alcim: "Címke generátor 1.0.0" },
    pdfFilename: "hudak_cimkek.pdf",
    templates: [{ label: "Sablon Excel", file: "hudak_sablon.xlsx" }],
    logos: [
      { value: "A", label: "A címke", src: "/subpage-assets/hudak/hudak_logo.png", cssClass: "logo logo-a" },
      { value: "B", label: "B címke", src: "/subpage-assets/hudak/hudak_logo2.png", cssClass: "logo logo-b" },
    ],
    acceptExtensions: [".xlsx"],
    trimHeaders: false,
    detectPreprocessedExcel: true, // LL-paritás
    maxLines: 3,
    unitMap: "standard",
    ftM2: false,
    extractSzin: false,
    batchAutofix: false,
    saleEnabled: true,
    layout: DEFAULT_LAYOUT,
    arvaltozasEnabled: false, // LL-only beta - itt SOHA
    cimbiEnabled: true,
    isDemo: false,
  },

  // Ritzer helyén: nyilvános demo - részletek: DEMO_OLDAL_TERV.md
  demo: {
    subpageId: "demo",
    companyUsername: "DEMO",
    uiTexts: { focim: "Label Labor - DEMO", alcim: "Címke generátor 1.0.0" },
    pdfFilename: "minta_cimkek.pdf",
    templates: [{ label: "Sablon Excel", file: "demo_sablon.xlsx" }],
    logos: LL_LOGOS, // Label Labor arculat, nem Ritzer
    acceptExtensions: [".xlsx"],
    trimHeaders: false,
    detectPreprocessedExcel: false,
    maxLines: 3,
    unitMap: "standard",
    ftM2: false,
    extractSzin: false,
    batchAutofix: false,
    saleEnabled: true,
    layout: DEFAULT_LAYOUT,
    arvaltozasEnabled: false,
    cimbiEnabled: false,
    isDemo: true,
    watermarkColumns: ["LABEL LABOR", "MINTACÍMKÉK"],
    maxRows: 21, // 21 címke = pontosan 1 A4 oldal
  },
};
