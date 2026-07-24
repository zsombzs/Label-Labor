import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle, HelpCircle, Info, Pencil, RotateCcw, Search } from "lucide-react";
import * as XLSX from "xlsx";
import { api } from "../api/client";
import type { LabelRow, ProcessedRow } from "../types/label";
import type { CompanyLabelCountResponse, UpdateLabelCountResponse } from "../types/api";
import type { LogoOption, SubpageConfig } from "../types/config";
import { applyUnitPrices, buildRawRow, recalculateUnitPrice } from "../lib/labelUtils";
import { useValidationFlow } from "../hooks/useValidationFlow";
import { usePdfExport } from "../hooks/usePdfExport";
import { LabelCard, type LabelEditValues } from "./LabelCard";
import { ValidationModal } from "./ValidationModal";
import { DataTableModal } from "./DataTableModal";
import { CimbiChat } from "./CimbiChat";
import { ArvaltozasPanel } from "./ArvaltozasPanel";
import { DemoWizard } from "./DemoWizard";
import { useLanguage } from "../i18n/LanguageContext";
import "../styles/generator.css";
import "../styles/generator-demo.css";

interface AlertState {
  title: string;
  message: string;
}

const RECALC_FIELDS = ["Ár", "Akciós_ár", "Kiszerelés"];

// ── Feltöltés-hardening (SEC): a fájlt kliensoldalon (a felhasználó böngészőjében)
// parse-oljuk a SheetJS-szel, ezért egy rosszindulatú/túlméretes .xlsx elsősorban a
// saját fület fagyaszthatja meg (memória-/CPU-DoS, pl. "dekompressziós bomba" nagy
// belső táblával). Ezek a korlátok azelőtt vágnak, hogy a teljes lapot JSON-ná
// alakítanánk, és mielőtt bármit a backendnek küldenénk.
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // 2 MB — ~500 termékhez bőven elég
const MAX_SHEET_ROWS = 5000; // a lap deklarált sortartománya
const MAX_SHEET_COLS = 100; // a lap deklarált oszloptartománya
const MAX_SHEET_CELLS = 200000; // sor × oszlop felső korlát (bomba ellen)
const MAX_CELL_CHARS = 200; // egy cella max hossza (a címke ~24 karaktert mutat)

/**
 * A konfigból vezérelt címkegenerátor oldal - az LL aloldal React-portja.
 * Minden cég-eltérés a SubpageConfig-ból jön; új ügyfél = új config-bejegyzés.
 */
const SUBPAGE_CSS: Record<string, () => Promise<unknown>> = {
  ea: () => import("../styles/ea.css"),
  ditall: () => import("../styles/ditall.css"),
  hudak: () => import("../styles/hudak.css"),
};

export function GeneratorPage({ config }: { config: SubpageConfig }) {
  const [rawData, setRawData] = useState<LabelRow[] | null>(null);
  const [validatedData, setValidatedData] = useState<ProcessedRow[] | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [selectedLogoValue, setSelectedLogoValue] = useState<LogoOption["value"]>(
    config.logos[0]?.value ?? "A",
  );
  const [dragOver, setDragOver] = useState(false);
  const [dataTableOpen, setDataTableOpen] = useState(false);
  const [alert, setAlert] = useState<AlertState | null>(null);
  const [companyCount, setCompanyCount] = useState<number>(0);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [undoSnapshot, setUndoSnapshot] = useState<ProcessedRow[] | null>(null);
  const [showUndoToast, setShowUndoToast] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  // ── Demo wizard állapot (csak demónál használt) ──
  const [demoStep, setDemoStep] = useState(1);
  const [templateDownloaded, setTemplateDownloaded] = useState(false);

  const labelsRef = useRef<HTMLDivElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingFlashRef = useRef<number | null>(null);

  const { lang } = useLanguage();

  const selectedLogo: LogoOption | null =
    config.logos.find((l) => l.value === selectedLogoValue) ?? null;

  const showAlert = useCallback((message: string, title?: string) => {
    setAlert({ title: title ?? "Figyelmeztetés", message });
  }, []);

  // ── Validációs flow ──
  const onValidationComplete = useCallback((rows: ProcessedRow[]) => {
    setValidatedData(rows);
  }, []);
  const validation = useValidationFlow(config, onValidationComplete, (msg) =>
    showAlert(msg, "Feldolgozás elutasítva"),
  );

  // ── PDF export ──
  const pdf = usePdfExport(config.pdfFilename, config.layout);

  // ── Zöld "Cimbi" villanás a helyben szerkesztett címkén (render után fut) ──
  useEffect(() => {
    const idx = pendingFlashRef.current;
    if (idx === null) return;
    pendingFlashRef.current = null;
    const els = document.querySelectorAll<HTMLElement>("#labels .label");
    els[idx]?.classList.add("cimbi-diff-applied");
    const t = setTimeout(() => {
      document.querySelectorAll<HTMLElement>("#labels .label")[idx]?.classList.remove("cimbi-diff-applied");
    }, 1500);
    return () => clearTimeout(t);
  }, [validatedData]);

  // ── Aloldal-specifikus CSS (a régi [cegnev].css) betöltése ──
  useEffect(() => {
    void SUBPAGE_CSS[config.subpageId]?.();
  }, [config.subpageId]);

  // ── A generátor html/body szabályai (overflow:hidden, magasság-lánc) csak itt élnek,
  //    a főoldal normál görgetését nem boríthatják fel ──
  useEffect(() => {
    document.documentElement.classList.add("generator-page");
    document.body.classList.add("generator-page");
    // A demo a főoldal (landing) világos arculatát kapja - a többi aloldal
    // kinézete változatlan. A skin a generator-demo.css-ben él.
    if (config.isDemo) {
      document.documentElement.classList.add("demo-skin");
      document.body.classList.add("demo-skin");
    }
    return () => {
      document.documentElement.classList.remove("generator-page", "demo-skin");
      document.body.classList.remove("generator-page", "demo-skin");
    };
  }, [config.isDemo]);

  // ── Demo wizard: automatikus lépés-váltás a VALÓS állapot alapján ──
  // (Nem a kattintások, hanem az állapot vezérli - így az e2e is működik,
  //  ami közvetlenül a #excelFile inputra tölt fel, lépések nélkül.)
  useEffect(() => {
    if (!config.isDemo) return;
    if (validatedData && validatedData.length > 0) {
      setDemoStep((s) => (s < 4 ? 4 : s));
    }
  }, [validatedData, config.isDemo]);

  useEffect(() => {
    if (!config.isDemo) return;
    if (pdf.reloadMode) setDemoStep(5);
  }, [pdf.reloadMode, config.isDemo]);

  // ── Cég címkeszám ──
  useEffect(() => {
    void api
      .get<CompanyLabelCountResponse>("/api/company-label-count")
      .then((d) => setCompanyCount(d.count))
      .catch((e) => console.error("Hiba a címkeszám betöltésekor:", e));
  }, []);

  const updateLabelCount = useCallback((count: number) => {
    // A demo is a többi aloldallal AZONOSAN a backendet hívja. A szerver a demo
    // tokenre korlátozza a hozzáadott mennyiséget (per-hívás max 1 A4 oldal + napi
    // sapka), és a DEMO a saját companies sorába számol, ami a total-label-count-ba
    // (össz-számláló) is beleszámít.
    void api
      .post<UpdateLabelCountResponse>("/api/update-label-count", { count })
      .then((d) => setCompanyCount(d.new_count))
      .catch((e) => console.error("Hiba a címkeszám frissítésekor:", e));
  }, []);

  // ── Excel feltöltés ──
  const handleFile = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onerror = () => showAlert("Hiba történt a fájl beolvasása során!");
      reader.onload = (event) => {
        try {
          const data = new Uint8Array(event.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: "array" });
          if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
            showAlert("Az Excel fájl üres vagy hibás!");
            return;
          }
          const sheetName = workbook.SheetNames[0] as string;
          const sheet = workbook.Sheets[sheetName];
          if (!sheet) {
            showAlert("Az Excel fájl üres vagy hibás!");
            return;
          }
          // SEC: a lap méretét a sheet_to_json ELŐTT ellenőrizzük - egy hatalmas
          // (akár tömörítve kicsi) tartomány különben itt fagyasztaná meg a fület.
          const ref = sheet["!ref"];
          if (ref) {
            const r = XLSX.utils.decode_range(ref);
            const nRows = r.e.r - r.s.r + 1;
            const nCols = r.e.c - r.s.c + 1;
            if (nRows > MAX_SHEET_ROWS || nCols > MAX_SHEET_COLS || nRows * nCols > MAX_SHEET_CELLS) {
              showAlert(
                "A táblázat túl sok cellát tartalmaz. Használja a letöltött sablont, soronként egy termékkel.",
                "Túl nagy táblázat",
              );
              return;
            }
          }
          let json = XLSX.utils.sheet_to_json<LabelRow>(sheet, { defval: "", blankrows: true });
          // A SheetJS a fejléc NÉLKÜLI oszlopoknak __EMPTY, __EMPTY_1 ... kulcsot ad.
          // Ezek nem valódi adatoszlopok, hanem a táblán kívüli megjegyzések/jelölők
          // (pl. a demo sablon piros "MAXIMUM 21 TERMÉK" sora a H oszlopban, vagy a
          // "<-- MINTAADATOK" felirat). Eldobjuk őket, különben egy ilyen jelölősor
          // önálló (üres) címkét generálna.
          json = json.map((row) => {
            const clean: LabelRow = {};
            for (const [k, v] of Object.entries(row)) {
              if (k.startsWith("__EMPTY")) continue;
              // SEC: a felfújt cellákat levágjuk - a címke amúgy is csak pár tíz
              // karaktert mutat, a hosszú érték csak a backend AI-promptját duzzasztaná.
              clean[k] = typeof v === "string" && v.length > MAX_CELL_CHARS ? v.slice(0, MAX_CELL_CHARS) : v;
            }
            return clean;
          });
          // Teljesen üres sorok kiszűrése - az Excel gyakran hagy "fantom" sorokat
          // (formázott, de üres cellák), amikből üres címke lenne
          json = json.filter((row) =>
            Object.values(row).some((v) => String(v ?? "").trim() !== ""),
          );
          // Fejléc-trim (EA: xlsm trailing space-ek)
          if (config.trimHeaders) {
            json = json.map((row) => {
              const normalized: LabelRow = {};
              for (const [k, v] of Object.entries(row)) normalized[k.trim()] = v;
              return normalized;
            });
          }
          if (json.length === 0) {
            showAlert("Az Excel fájl nem tartalmaz adatokat!");
            return;
          }
          // Demo: sorplafon (a backend is kényszeríti - ez csak UX)
          if (config.maxRows !== undefined && json.length > config.maxRows) {
            showAlert(
              `A demó legfeljebb ${config.maxRows} sort dolgoz fel - az első ${config.maxRows} sort használjuk.`,
              "Demo korlátozás",
            );
            json = json.slice(0, config.maxRows);
          }

          setRawData(json.map((r) => ({ ...r })));

          const first = json[0] as LabelRow;
          if (config.detectPreprocessedExcel && Object.prototype.hasOwnProperty.call(first, "Első_sor")) {
            // RÉGI MÓDSZER: makróval előfeldolgozott Excel → közvetlen render
            setValidatedData(json as ProcessedRow[]);
          } else {
            // ÚJ MÓDSZER: backend agent-validáció
            void validation.validate(json);
          }
        } catch (error) {
          showAlert(`Hiba történt az Excel feldolgozása során: ${(error as Error).message}`);
        }
      };
      reader.readAsArrayBuffer(file);
    },
    [config, showAlert, validation],
  );

  const acceptFile = useCallback(
    (file: File | undefined) => {
      if (!file) return;
      const fname = file.name.toLowerCase();
      if (!config.acceptExtensions.some((ext) => fname.endsWith(ext))) {
        showAlert(`Csak ${config.acceptExtensions.join(" vagy ")} fájl feltöltése támogatott!`);
        return;
      }
      // SEC: méret-korlát még a beolvasás előtt - a túl nagy fájl a saját böngészőt
      // fagyasztaná meg (a parse kliensoldali). 2 MB bőven elég egy terméklistához.
      if (file.size > MAX_UPLOAD_BYTES) {
        showAlert(
          "A fájl túl nagy (max 2 MB). Ellenőrizze, hogy a letöltött sablon Excelt tölti-e fel.",
          "Túl nagy fájl",
        );
        return;
      }
      setValidatedData(null);
      setEditingIndex(null);
      setUploadedFileName(file.name);
      handleFile(file);
    },
    [config.acceptExtensions, handleFile, showAlert],
  );

  // ── Sablon letöltés ──
  function downloadTemplate(file: string) {
    const link = document.createElement("a");
    link.href = `/subpage-assets/${config.subpageId}/${file}`;
    link.download = file;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTemplateDownloaded(true);
  }

  // ── Helyben szerkesztés commit ──
  const commitEdit = useCallback(
    // eslint-disable-next-line react-hooks/exhaustive-deps
    (index: number, values: LabelEditValues) => {
      setEditingIndex(null);
      setValidatedData((prev) => {
        if (!prev || !prev[index]) return prev;
        const snapshot = JSON.parse(JSON.stringify(prev)) as ProcessedRow[];
        const next = prev.map((r, i) => (i === index ? { ...r } : r));
        const row = next[index] as ProcessedRow;
        let changed = false;
        let recalc = false;
        for (const [field, val] of Object.entries(values)) {
          const cur = String(row[field] ?? "");
          if (cur !== val) {
            row[field] = val;
            changed = true;
            if (RECALC_FIELDS.includes(field)) recalc = true;
          }
        }
        if (!changed) return prev;
        if (recalc) {
          applyUnitPrices(row, recalculateUnitPrice(row["Kiszerelés"], row["Ár"], config.unitMap), config.unitMap);
        }
        setUndoSnapshot(snapshot);
        setShowUndoToast(true);
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        toastTimerRef.current = setTimeout(() => setShowUndoToast(false), 6000);
        pendingFlashRef.current = index; // zöld villanás a render utáni effektben
        return next;
      });
    },
    [],
  );

  const undoEdit = useCallback(() => {
    if (undoSnapshot) {
      setValidatedData(undoSnapshot);
      setUndoSnapshot(null);
    }
    setShowUndoToast(false);
  }, [undoSnapshot]);

  // ── Adattábla: mentés és generálás ──
  const saveAndGenerate = useCallback(
    (rows: ProcessedRow[]) => {
      setDataTableOpen(false);
      const rawForValidation = rows.map((r) => buildRawRow(r, config.extractSzin));
      void validation.validate(rawForValidation);
    },
    [validation],
  );

  // ── PDF letöltés gomb ──
  function onDownloadClick() {
    if (pdf.reloadMode) {
      window.location.reload();
      return;
    }
    if (!labelsRef.current || !validatedData) return;
    setEditingIndex(null); // nyitott szerkesztés lezárása
    pdf.exportPdf(labelsRef.current, () => updateLabelCount(validatedData.length));
  }

  // ── Címkék oldalakra bontása a layout szerint ──
  const perPage = config.layout.columns * config.layout.rows;
  const pages = useMemo(() => {
    if (!validatedData) return [];
    const out: ProcessedRow[][] = [];
    for (let i = 0; i < validatedData.length; i += perPage) {
      out.push(validatedData.slice(i, i + perPage));
    }
    return out;
  }, [validatedData, perPage]);

  const pageStyle: React.CSSProperties = {
    gridTemplateColumns: `repeat(${config.layout.columns}, ${config.layout.labelWidthMm}mm)`,
    gridTemplateRows: `repeat(${config.layout.rows}, ${config.layout.labelHeightMm}mm)`,
    gap: `${config.layout.gapMm}mm`,
    padding: `${config.layout.gapMm}mm`,
  };

  const busy = pdf.progress !== null;
  const uploadText = uploadedFileName
    ? validatedData
      ? `${uploadedFileName} - ${validatedData.length} polccímke`
      : uploadedFileName
    : `2. Excel fájl feltöltése (${config.acceptExtensions.join(", ")})`;

  // A címke-oldalak (PDF-kritikus DOM) - mindkét elrendezés ugyanezt használja.
  const labelPages = pages.map((pageRows, pageIdx) => (
    <div className="page" style={pageStyle} key={pageIdx}>
      {pageRows.map((row, i) => {
        const index = pageIdx * perPage + i;
        return (
          <LabelCard
            key={index}
            row={row}
            index={index}
            logo={selectedLogo}
            config={config}
            editing={editingIndex === index}
            onStartEdit={setEditingIndex}
            onCommitEdit={commitEdit}
            onCancelEdit={() => setEditingIndex(null)}
          />
        );
      })}
    </div>
  ));

  // Demo: a labelsRef-et hordozó #labels konténer, amit a wizard 4. lépése mutat.
  const demoLabelsNode = (
    <div id="labels" ref={labelsRef}>
      {labelPages}
    </div>
  );

  return (
    <>
      {config.isDemo && (
        <div className="demo-banner">DEMO - próbafelület, a címkék MINTACÍMKÉK jelölést kapnak</div>
      )}
      {config.isDemo && lang === "en" && (
        <div className="demo-lang-note">
          Note: the demo is only available in Hungarian.
        </div>
      )}
      {config.isDemo ? (
        <>
          {/* A rejtett fájl-input MINDIG a DOM-ban van: a dropzone label erre mutat,
              és az e2e is közvetlenül erre tölt fel (#excelFile). */}
          <input
            type="file"
            id="excelFile"
            className="demo-file-input"
            accept={config.acceptExtensions.join(",")}
            onChange={(e) => acceptFile(e.target.files?.[0])}
          />
          <DemoWizard
            config={config}
            step={demoStep}
            setStep={setDemoStep}
            templateDownloaded={templateDownloaded}
            onDownloadTemplate={() =>
              downloadTemplate((config.templates[0] as { file: string }).file)
            }
            dragOver={dragOver}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragOver(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node))
                setDragOver(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragOver(false);
              acceptFile(e.dataTransfer.files[0]);
            }}
            uploadedFileName={uploadedFileName}
            processing={validation.loading}
            labelsNode={demoLabelsNode}
            logos={config.logos}
            selectedLogoValue={selectedLogoValue}
            setSelectedLogoValue={setSelectedLogoValue}
            onOpenDataTable={() => {
              if (!validatedData || validatedData.length === 0) {
                showAlert("Nincs megjeleníthető adat. Töltse fel az Excel fájlt először!");
                return;
              }
              setDataTableOpen(true);
            }}
            onDownloadPdf={onDownloadClick}
            busy={busy}
            progress={pdf.progress}
            labelCount={validatedData?.length ?? 0}
            companyCount={companyCount}
            hasData={!!validatedData && validatedData.length > 0}
            pdfDone={pdf.reloadMode}
            onRestart={() => window.location.reload()}
            onRequestQuote={() => {
              // Vissza a főoldal árajánlat szekciójához (teljes navigáció: a demo
              // külön route, a Landing a #arajanlat horgonyra görget belépéskor).
              window.location.href = "/#arajanlat";
            }}
          />
        </>
      ) : (
        <>
      <div className="cim-container">
        <h1 className="focim">{config.uiTexts.focim}</h1>
      </div>
      <div className="main-container">
        {/* ── Bal panel ── */}
        <div
          className={`left-panel${dragOver ? " drag-over" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDragOver(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setDragOver(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDragOver(false);
            acceptFile(e.dataTransfer.files[0]);
          }}
        >
          <div className="controls1">
            <div className="controls1-inner">
            {config.templates.length === 1 ? (
              <button
                className="btn"
                disabled={busy}
                onClick={() => downloadTemplate((config.templates[0] as { file: string }).file)}
              >
                1. Sablon Excel letöltése
              </button>
            ) : (
              <div className="sablon-dropdown">
                <button className="btn sablon-trigger" disabled={busy}>
                  1. Sablon Excel letöltése
                </button>
                <div className="sablon-menu">
                  {config.templates.map((t) => (
                    <button
                      key={t.file}
                      className="btn sablon-menu-btn"
                      onClick={() => downloadTemplate(t.file)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {config.isDemo && (
              <button
                type="button"
                className="guide-help-btn"
                aria-label="Hogyan töltsem ki?"
                title="Hogyan töltsem ki?"
                onClick={() => setGuideOpen(true)}
              >
                <HelpCircle />
              </button>
            )}
            </div>
            {config.isDemo && (
              <p className="step-hint">Töltse le és nyissa meg Excelben, majd írja be a termékeit</p>
            )}
          </div>
          <div className="controls2">
            <label
              htmlFor="excelFile"
              className={`btn btn-with-info${uploadedFileName ? " upload-done" : ""}`}
            >
              <span className="upload-label-text">{uploadText}</span>
              <span className="info-tooltip-wrapper">
                {uploadedFileName ? (
                  <CheckCircle className="info-icon icon-after-upload" />
                ) : (
                  <Info className="info-icon icon-before-upload" />
                )}
                <span className="info-tooltip">
                  {uploadedFileName ?? `Húzzon ide egy ${config.acceptExtensions[0]} fájlt a feltöltéshez`}
                </span>
              </span>
            </label>
            <input
              type="file"
              id="excelFile"
              accept={config.acceptExtensions.join(",")}
              onChange={(e) => acceptFile(e.target.files?.[0])}
            />
            {config.isDemo && (
              <p className="step-hint">Mentés után húzza ide, vagy kattintson a tallózáshoz</p>
            )}
          </div>
          <div className="controls3">
            <button
              className="btn"
              id="tablePreviewBtn"
              disabled={busy}
              onClick={() => {
                if (!validatedData || validatedData.length === 0) {
                  showAlert("Nincs megjeleníthető adat. Töltse fel az Excel fájlt először!");
                  return;
                }
                setDataTableOpen(true);
              }}
            >
              Adatok megtekintése
              <Search className="preview-icon" />
            </button>
            {config.isDemo && (
              <p className="step-hint step-hint-optional">Nem kötelező - ellenőrizze táblázatos nézetben</p>
            )}
          </div>
          <div className="controls4">
            <button
              className={`btn${pdf.reloadMode ? " btn-reload" : ""}`}
              id="downloadBtn"
              disabled={busy || (!pdf.reloadMode && !validatedData)}
              onClick={onDownloadClick}
            >
              {pdf.reloadMode ? (
                <>
                  <RotateCcw className="reload-icon" /> Új címkék generálása{" "}
                  <RotateCcw className="reload-icon" />
                </>
              ) : (
                "3. PDF letöltése"
              )}
            </button>
            {config.isDemo && !pdf.reloadMode && (
              <p className="step-hint">A kész, nyomtatható PDF letöltése</p>
            )}
          </div>
          <div className="label-type">
            {config.logos.map((logo) => (
              <label className="circle-radio" key={logo.value}>
                <input
                  type="radio"
                  name="labelType"
                  value={logo.value}
                  checked={selectedLogoValue === logo.value}
                  onChange={() => setSelectedLogoValue(logo.value)}
                />
                <span></span>
                {logo.label}
              </label>
            ))}
          </div>
          {config.arvaltozasEnabled && (
            <ArvaltozasPanel
              showAlert={showAlert}
              onGenerate={(rows) => {
                const first = rows[0] as LabelRow;
                if (Object.prototype.hasOwnProperty.call(first, "Első_sor")) {
                  // Makróval feldolgozott formátum → közvetlen render
                  setValidatedData(rows as ProcessedRow[]);
                  showAlert(
                    `${rows.length} változott / új termék címkéje elkészült.`,
                    "Árváltozás detektor",
                  );
                } else {
                  void validation.validate(rows);
                }
              }}
            />
          )}
          <div className={`downloading-bar${busy ? " busy" : ""}`}>
            <div id="progressContainer">
              <div id="progressBar" style={{ width: `${pdf.progress ?? 0}%` }}></div>
            </div>
          </div>
        </div>

        {/* ── Jobb panel ── */}
        <div className="right-panel">
          <div className="company-stats-container">
            <span className="company-stats-text">
              Generált címkék száma:{" "}
              <span className="company-stats-number">{companyCount.toLocaleString("hu-HU")}</span>
            </span>
          </div>
          <div className="alcim-container">
            <h2 className="alcim">{config.uiTexts.alcim}</h2>
            <span className="edit-hint-wrapper" tabIndex={0} aria-label="Szerkesztési tipp">
              <Pencil className="edit-hint-icon" />
              <span className="edit-hint-tooltip">
                Tipp: kattints duplán bármelyik címkére a szerkesztéséhez
              </span>
            </span>
          </div>
          <div id="labels" ref={labelsRef}>
            {!validatedData && (
              <div className="labels-empty-state">
                {config.isDemo ? (
                  <div className="empty-guide">
                    <p className="empty-guide-lead">Így készül a címke - 3 lépés a bal oldali panelen:</p>
                    <div className="empty-steps">
                      <div className="empty-step">
                        <span className="empty-step-num">1</span>
                        <span>Töltse le a sablon Excelt</span>
                      </div>
                      <div className="empty-step-arrow">→</div>
                      <div className="empty-step">
                        <span className="empty-step-num">2</span>
                        <span>Töltse fel kitöltve</span>
                      </div>
                      <div className="empty-step-arrow">→</div>
                      <div className="empty-step">
                        <span className="empty-step-num">3</span>
                        <span>Töltse le a nyomtatható PDF-et</span>
                      </div>
                    </div>
                    <p className="empty-guide-foot">A címkék itt jelennek meg, amint feltöltötte a fájlt.</p>
                  </div>
                ) : (
                  <p>Töltse fel az Excel fájlt a polccímkék megjelenítéséhez</p>
                )}
              </div>
            )}
            {labelPages}
          </div>
        </div>
      </div>
      </>
      )}

      {/* ── Betöltési animáció ── */}
      {validation.loading && (
        <div className="loading-overlay active">
          <div className="loading-content">
            <div className="spinner"></div>
            <div className="loading-text">Címkegenerálás folyamatban...</div>
            <div className="loading-subtext">Kérem várjon, a rendszer elemzi a termékadatokat</div>
          </div>
        </div>
      )}

      {/* ── Validációs modal ── */}
      {validation.pendingResult && (
        <ValidationModal
          result={validation.pendingResult}
          unitMap={config.unitMap}
          isDemo={config.isDemo}
          onApply={validation.applyFixes}
          onSkip={validation.skipFixes}
        />
      )}

      {/* ── Adatok előnézete ── */}
      {dataTableOpen && validatedData && (
        <DataTableModal
          config={config}
          data={validatedData}
          rawData={rawData}
          onDataChange={setValidatedData}
          onClose={() => setDataTableOpen(false)}
          onSaveAndGenerate={saveAndGenerate}
        />
      )}

      {/* ── Custom alert ── */}
      {alert && (
        <div
          className="custom-alert-overlay active"
          onClick={(e) => {
            if (e.target === e.currentTarget) setAlert(null);
          }}
        >
          <div className="custom-alert-modal">
            <div className="custom-alert-header">
              <span className="custom-alert-title">{alert.title}</span>
              <button className="custom-alert-close" onClick={() => setAlert(null)}>
                ✕
              </button>
            </div>
            <div className="custom-alert-message">{alert.message}</div>
            <div className="custom-alert-footer">
              <button className="custom-alert-ok" onClick={() => setAlert(null)}>
                Bezárás
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Cimbi chat ── */}
      <CimbiChat
        config={config}
        data={validatedData}
        onDataChange={setValidatedData}
        onReprocess={(rows) => void validation.validate(rows.map((r) => buildRawRow(r, config.extractSzin)))}
      />

      {/* ── Undo toast (helyben szerkesztés) ── */}
      {showUndoToast && (
        <div className="inline-edit-toast show">
          <span>Címke frissítve</span>
          <button type="button" onClick={undoEdit}>
            Visszavonás
          </button>
        </div>
      )}

      {/* ── Demo: "Hogyan töltsem ki?" súgó modal ── */}
      {config.isDemo && guideOpen && (
        <div
          className="guide-modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setGuideOpen(false);
          }}
        >
          <div className="guide-modal">
            <div className="guide-modal-head">
              <span className="guide-modal-title">Hogyan töltsem ki?</span>
              <button className="guide-modal-close" aria-label="Bezárás" onClick={() => setGuideOpen(false)}>
                ✕
              </button>
            </div>
            <div className="fill-guide-body">
              <p className="fill-guide-lead">
                Töltse le a sablon Excelt, és az „1. Termékek” fülön írja be a termékeit - soronként egyet.
                A táblázat „2. Útmutató” füle minden mezőt részletesen elmagyaráz.
              </p>
              <div className="fill-guide-cols">
                <div>
                  <b>Cikkszám</b> - belső azonosító, nem kötelező. <i>pl. 100234</i>
                </div>
                <div>
                  <b>EAN-13</b> - a vonalkód 13 számjegye. <i>pl. 5998200912345</i>
                </div>
                <div>
                  <b>Megnevezés</b> - a termék neve, ahogy a címkén lesz. <i>pl. Prémium falfesték fehér</i>
                </div>
                <div>
                  <b>Kiszerelés</b> - mennyiség + mértékegység. <i>pl. 5 l · 25 kg · 500 ml · 10 db</i>
                </div>
                <div>
                  <b>Ár</b> - a termék normál ára forintban, csak szám. <i>pl. 4990</i>
                </div>
                <div>
                  <b>Akciós ár</b> - az akciós ár forintban. <i>pl. 3990</i>
                </div>
              </div>
              <p className="fill-guide-units">
                <b>Akciós címkéhez:</b> töltse ki az Árat ÉS az Akciós árat is (mindkettőt kell). Ha nincs
                akció, az Akciós ár oszlop maradjon üres.
              </p>
              <ul className="fill-guide-tips">
                <li>Egy sor = egy címke.</li>
                <li>Legfeljebb 21 termék (ez pontosan 1 A4 oldal).</li>
                <li>Használható mértékegységek: l, ml, kg, g, db.</li>
                <li>A színes fejléc sort ne írja át.</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
