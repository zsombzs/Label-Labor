import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Download,
  FileText,
  Pencil,
  RotateCcw,
  Table2,
  Tag,
  Upload,
} from "lucide-react";
import type { LogoOption, SubpageConfig } from "../types/config";

/**
 * GENERATOR DASHBOARD — a főoldalhoz illő, modern generátor-elrendezés.
 *
 * Felépítés: fejléc (cím · számláló · verzió) + a fejléc alatt kétoszlopos test:
 *   - BAL: mindig látható, számozott lépés-dashboard (4 főpont).
 *   - JOBB: egy nagy panel, amelyben LÉPÉSENKÉNT történik a tevékenység
 *     (sablon → kitöltés → feltöltés → előnézet). Az aktív lépés száma a
 *     jobb panel fejlécében is megjelenik.
 *
 * A `DemoWizard` testvére, de:
 *   - ez ÜGYFÉL-oldal (nincs vízjel, nincs 5. „Kész” lépés, nincs árajánlat-CTA),
 *   - config-vezérelt (`uiStyle: "dashboard"`), így bármelyik aloldalra integrálható.
 *
 * FONTOS: a #labels / .page / .label DOM-hoz NEM nyúlunk — a `labelsNode`-ot a
 * GeneratorPage adja át készen (a labelsRef is rajta van), így a PDF ugyanabból a
 * DOM-ból készül. A jobb panel belül görget, az ablak fix marad → html2canvas-biztos.
 */

const STEPS = [
  { label: "Sablon", sub: "Excel sablon letöltése", title: "Töltse le a sablon táblázatot" },
  { label: "Kitöltés", sub: "Termékek beírása", title: "A termékek megadása" },
  { label: "Feltöltés", sub: "Kitöltött fájl feltöltése", title: "Töltse fel a kész táblázatot" },
  { label: "Előnézet", sub: "Ellenőrzés és PDF", title: "A címkék előnézete" },
];

interface GeneratorDashboardProps {
  config: SubpageConfig;
  step: number;
  setStep: (updater: number | ((s: number) => number)) => void;
  templateDownloaded: boolean;
  onDownloadTemplate: () => void;
  dragOver: boolean;
  onDragOver: React.DragEventHandler<HTMLElement>;
  onDragLeave: React.DragEventHandler<HTMLElement>;
  onDrop: React.DragEventHandler<HTMLElement>;
  uploadedFileName: string | null;
  processing: boolean;
  labelsNode: React.ReactNode;
  logos: LogoOption[];
  selectedLogoValue: LogoOption["value"];
  setSelectedLogoValue: (v: LogoOption["value"]) => void;
  onOpenDataTable: () => void;
  onDownloadPdf: () => void;
  busy: boolean;
  progress: number | null;
  labelCount: number;
  companyCount: number;
  hasData: boolean;
  pdfDone: boolean;
  showConfetti: boolean;
  onRestart: () => void;
}

export function GeneratorDashboard({
  config,
  step,
  setStep,
  templateDownloaded,
  onDownloadTemplate,
  dragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  uploadedFileName,
  processing,
  labelsNode,
  logos,
  selectedLogoValue,
  setSelectedLogoValue,
  onOpenDataTable,
  onDownloadPdf,
  busy,
  progress,
  labelCount,
  companyCount,
  hasData,
  pdfDone,
  showConfetti,
  onRestart,
}: GeneratorDashboardProps) {
  // Az info-címke kép (a bal dashboard alján). Ha még nincs feltöltve a fájl,
  // a kártya csendben elrejtőzik (nincs törött kép-ikon).
  const [infoImgOk, setInfoImgOk] = useState(true);

  // Nyomtatási összefoglaló a 4. lépéshez: hány címke, hány A4 oldal.
  const perPage = config.layout.columns * config.layout.rows;
  const pageCount = Math.max(1, Math.ceil(labelCount / perPage));

  // Számláló-animáció: a fejléc-szám lágyan felszámol a célértékre (minden
  // változásnál - betöltéskor és generálás után is).
  const [displayCount, setDisplayCount] = useState(companyCount);
  const fromRef = useRef(companyCount);
  const rafRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    const from = fromRef.current;
    const to = companyCount;
    if (from === to) return;
    const start = performance.now();
    const dur = 800;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setDisplayCount(Math.round(from + (to - from) * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current);
    };
  }, [companyCount]);

  // Confetti-darabkák (csak az első generálásnál jelennek meg, egyszer lejátszva).
  const confetti = useMemo(
    () =>
      Array.from({ length: 16 }, (_, i) => ({
        left: Math.round((i / 16) * 96) + 2,
        delay: (Math.random() * 0.4).toFixed(2),
        dur: (1.1 + Math.random() * 0.8).toFixed(2),
        color: ["#1D4ED8", "#D97706", "#059669", "#DBEAFE", "#FCD34D"][i % 5],
        rot: Math.round(Math.random() * 360),
      })),
    [],
  );

  // Lépés-navigáció logikus korláttal: a 4. lépés csak feltöltött adattal érhető el.
  const goTo = (n: number) => {
    if (n === 4 && !hasData) {
      setStep(3);
      return;
    }
    setStep(n);
  };

  const shownStep = step < 1 ? 1 : step > 4 ? 4 : step;
  const active = STEPS[shownStep - 1];

  return (
    <div className="dash-root">
      {/* ── Fejléc: cím + számláló (bal) · verzió (jobb) ── */}
      <header className="dash-header">
        <div className="dash-header-id">
          <h1 className="dash-title">{config.uiTexts.focim}</h1>
          <p className="dash-stat">
            Eddig összesen <b>{displayCount.toLocaleString("hu-HU")}</b> polccímkét generáltak a Hudák
            oldalon
          </p>
        </div>
        <a
          href="/"
          className="dash-home-link"
          aria-label="Vissza a főoldalra"
          title="Vissza a főoldalra"
        >
          <img src="/assets/main_icon.png" alt="Label Labor" className="dash-home-logo" />
        </a>
      </header>

      {/* ── Kétoszlopos test: bal dashboard + jobb nagy panel ── */}
      <div className="dash-body">
        <aside className="dash-sidebar" aria-label="Lépések">
          <ol className="dash-steplist">
            {STEPS.map((s, i) => {
              const n = i + 1;
              const state = n < step ? "done" : n === step ? "current" : "todo";
              return (
                <li key={s.label} className={`dash-step dash-step-${state}`}>
                  <button
                    type="button"
                    className="dash-step-btn"
                    onClick={() => goTo(n)}
                    aria-current={state === "current" ? "step" : undefined}
                    aria-label={`${n}. lépés: ${s.label}`}
                  >
                    <span className="dash-step-num">{state === "done" ? <Check /> : n}</span>
                    <span className="dash-step-text">
                      <span className="dash-step-label">{s.label}</span>
                      <span className="dash-step-sub">{s.sub}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>

          {/* Info-címke a dashboard alján (üres hely kitöltése). Ha a kép nincs
              feltöltve, a kártya elrejtőzik. */}
          {infoImgOk && (
            <div className="dash-info-card">
              <span className="dash-info-title">Kapcsolat &amp; segítség</span>
              <div className="dash-info-frame">
                <img
                  src="/subpage-assets/hudak/info_cimke.png"
                  alt="Label Labor - kapcsolat"
                  className="dash-info-img"
                  onError={() => setInfoImgOk(false)}
                />
              </div>
              <span className="dash-info-foot">Kérdése van? Írjon nekünk bátran.</span>
            </div>
          )}
        </aside>

        <main className="dash-stage">
          <div className="dash-stage-head">
            <span key={shownStep} className="dash-stage-num">
              {shownStep}
            </span>
            <div className="dash-stage-heading">
              <span className="dash-stage-eyebrow">
                {shownStep}/{STEPS.length}
              </span>
              <h2 className="dash-stage-title">{active?.title}</h2>
            </div>
            {step === 4 && (
              <div className="dash-head-summary">
                <span className="dash-chip">
                  <Tag /> {labelCount} polccímke
                </span>
                <span className="dash-chip">
                  <FileText /> {pageCount} A4-es oldal
                </span>
              </div>
            )}
          </div>

          <div className="dash-stage-body">
            {/* ── 1. Sablon (középre igazítva, függőlegesen és vízszintesen) ── */}
            {step === 1 && (
              <div className="dash-panel dash-panel-center">
                <div className="dash-center-inner">
                  <p className="dash-lead">
                    Ebbe az Excel-táblázatba kerülnek a termékadatok. Nyissa meg Excel-lel vagy
                    bármelyik ingyenes táblázatkezelővel.
                  </p>
                  <button
                    type="button"
                    className="dash-btn dash-btn-primary dash-btn-download"
                    onClick={onDownloadTemplate}
                  >
                    <Download /> Sablon letöltése
                  </button>
                  {templateDownloaded && (
                    <p className="dash-ok">
                      <CheckCircle2 /> Megvan a sablon - töltse ki, majd lépjen tovább.
                    </p>
                  )}
                  <button
                    type="button"
                    className={`dash-btn dash-btn-next${templateDownloaded ? " pulse" : " ghost"}`}
                    onClick={() => setStep(2)}
                  >
                    {templateDownloaded ? "Tovább" : "Már megvan"} <ArrowRight />
                  </button>
                </div>
              </div>
            )}

            {/* ── 2. Kitöltés (tájékoztató) ── */}
            {step === 2 && (
              <div className="dash-panel">
                <p className="dash-lead">
                  Nyissa meg a letöltött táblázatot, és írja be a termékadatokat. Az alábbi mezőket
                  kérjük:
                </p>
                <div className="dash-fields">
                  <div className="dash-field">
                    <b>Cikkszám</b> <span>belső azonosító, nem kötelező</span> <i>pl. 100234</i>
                  </div>
                  <div className="dash-field">
                    <b>EAN-13</b> <span>a vonalkód 13 számjegye</span> <i>pl. 5998200912345</i>
                  </div>
                  <div className="dash-field">
                    <b>Megnevezés</b> <span>a termék neve, ahogy a címkén megjelenik</span>{" "}
                    <i>pl. Prémium falfesték fehér</i>
                  </div>
                  <div className="dash-field">
                    <b>Kiszerelés</b> <span>mennyiség + mértékegység</span>{" "}
                    <i>pl. 5 l · 25 kg · 500 ml</i>
                  </div>
                  <div className="dash-field">
                    <b>Ár</b> <span>normál ár forintban, csak szám</span> <i>pl. 4990</i>
                  </div>
                  <div className="dash-field">
                    <b>Akciós ár</b> <span>ha van akció, egyébként üres</span> <i>pl. 3990</i>
                  </div>
                </div>
                <p className="dash-note">
                  <b>Akciós címkéhez:</b> töltse ki az <b>Árat</b> ÉS az <b>Akciós árat</b> is. Egy sor
                  = egy címke, a színes fejléc sor maradjon változatlan.
                </p>
                <div className="dash-nav dash-nav-2">
                  <button type="button" className="dash-btn dash-btn-back" onClick={() => setStep(1)}>
                    <ArrowLeft /> Vissza
                  </button>
                  <button type="button" className="dash-btn dash-btn-next pulse" onClick={() => setStep(3)}>
                    Tovább a feltöltéshez <ArrowRight />
                  </button>
                </div>
              </div>
            )}

            {/* ── 3. Feltöltés (nagy dropzone, majdnem a teljes panel) ── */}
            {step === 3 && (
              <div className="dash-panel dash-panel-drop">
                <p className="dash-lead dash-lead-center">
                  Húzza ide a kitöltött fájlt, vagy kattintson bárhol a mezőben a tallózáshoz. A
                  rendszer automatikusan feldolgozza és ellenőrzi az adatokat.
                </p>
                <label
                  htmlFor="excelFile"
                  className={`dash-drop dash-drop-fill${dragOver ? " over" : ""}${processing ? " busy" : ""}`}
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onDrop={onDrop}
                >
                  {processing ? (
                    <>
                      <span className="dash-drop-spinner" aria-hidden="true" />
                      <span className="dash-drop-title">Feldolgozás…</span>
                      <span className="dash-drop-sub">{uploadedFileName}</span>
                    </>
                  ) : (
                    <>
                      <Upload className="dash-drop-icon" />
                      <span className="dash-drop-title">Húzza ide a .xlsx fájlt</span>
                      <span className="dash-drop-sub">vagy kattintson ide a tallózáshoz</span>
                    </>
                  )}
                </label>
                <div className="dash-drop-nav">
                  <button type="button" className="dash-btn dash-btn-back" onClick={() => setStep(2)}>
                    <ArrowLeft /> Vissza
                  </button>
                </div>
              </div>
            )}

            {/* ── 4. Előnézet (a demo elrendezése: bal műveletek + jobb előnézet) ── */}
            {step === 4 && (
              <div className="dash-panel dash-panel-preview">
                {showConfetti && pdfDone && (
                  <div className="dash-confetti" aria-hidden="true">
                    {confetti.map((c, i) => (
                      <span
                        key={i}
                        style={{
                          left: `${c.left}%`,
                          background: c.color,
                          animationDelay: `${c.delay}s`,
                          animationDuration: `${c.dur}s`,
                          transform: `rotate(${c.rot}deg)`,
                        }}
                      />
                    ))}
                  </div>
                )}
                <div className="dash-preview-left">
                  <p className="dash-ok dash-ok-inline">
                    <CheckCircle2 /> {labelCount} címke elkészült
                  </p>
                  <div className="dash-logo-choice">
                    <span className="dash-logo-q">Melyik logó legyen a címkén?</span>
                    <div className="dash-logo-opts">
                      {logos.map((logo) => (
                        <label
                          key={logo.value}
                          className={`dash-logo${selectedLogoValue === logo.value ? " sel" : ""}`}
                        >
                          <input
                            type="radio"
                            name="labelType"
                            value={logo.value}
                            checked={selectedLogoValue === logo.value}
                            onChange={() => setSelectedLogoValue(logo.value)}
                          />
                          {logo.src && <img src={logo.src} alt="" className="dash-logo-img" />}
                          <span>{logo.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="dash-left-actions">
                    <p className="dash-edit-note">
                      <Pencil /> Dupla kattintás a címkére a szerkesztéshez
                    </p>
                    {pdfDone ? (
                      <div className="dash-done">
                        <p className="dash-ok">
                          <CheckCircle2 /> A PDF elkészült - a „Letöltések” mappában találja.
                        </p>
                        <button
                          type="button"
                          className="dash-btn dash-btn-primary"
                          onClick={onRestart}
                        >
                          <RotateCcw /> Új címkék generálása
                        </button>
                      </div>
                    ) : busy ? (
                      <div className="dash-progress" aria-live="polite">
                        <div className="dash-progress-bar" style={{ width: `${progress ?? 0}%` }} />
                        <span className="dash-progress-text">PDF készül…</span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="dash-btn dash-btn-primary"
                        id="downloadBtn"
                        onClick={onDownloadPdf}
                      >
                        <Download /> Töltse le a PDF-et
                      </button>
                    )}
                    <button
                      type="button"
                      className="dash-btn dash-btn-back dash-btn-newfile"
                      onClick={() => setStep(3)}
                      disabled={busy}
                    >
                      <ArrowLeft /> Új fájl
                    </button>
                    <button
                      type="button"
                      className="dash-link dash-link-center"
                      onClick={onOpenDataTable}
                      disabled={busy}
                    >
                      <Table2 /> Adatok megtekintése
                    </button>
                  </div>
                </div>

                <div className="dash-preview-right">
                  <div className="dash-preview">{labelsNode}</div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
