import { useMemo } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  PartyPopper,
  RotateCcw,
  Send,
  Table2,
  Upload,
} from "lucide-react";
import type { LogoOption, SubpageConfig } from "../types/config";

/**
 * DEMO WIZARD - lépésről lépésre végigvezeti a felhasználót egy polccímke
 * PDF letöltéséig. Progresszív feltárás: mindig csak az aktuális lépés látszik.
 *
 * FONTOS: a #labels / .page / .label DOM-hoz nem nyúlunk - a `labelsNode`-ot
 * a GeneratorPage adja át készen (a labelsRef is ott van rajta), így a PDF
 * ugyanabból a DOM-ból készül. A wizard csak a köré épített héj.
 *
 * A görgetés a színpadon belül történik, az ablak fix marad (scrollY=0) -
 * ez tartja helyesen a html2canvas felvételt. A 2. és 4. lépésben a színpad
 * sem görög: kétoszlopos, a magasságot kitöltő kártya, és csak a jobb oszlop
 * (fields / címke-előnézet) görgethető.
 */

const STEP_LABELS = ["Sablon", "Kitöltés", "Feltöltés", "Előnézet", "Kész"];

interface DemoWizardProps {
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
  onRestart: () => void;
  onRequestQuote: () => void;
}

export function DemoWizard({
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
  onRestart,
  onRequestQuote,
}: DemoWizardProps) {
  const confetti = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        left: Math.round((i / 18) * 96) + 2,
        delay: (Math.random() * 0.45).toFixed(2),
        dur: (1.1 + Math.random() * 0.8).toFixed(2),
        color: ["#1D4ED8", "#D97706", "#059669", "#DBEAFE", "#FCD34D"][i % 5],
        rot: Math.round(Math.random() * 360),
      })),
    [],
  );

  // Lépés-navigáció logikus korlátokkal:
  // - 4./5. lépés csak feltöltött Excellel érhető el, különben a 3. lépésre dob;
  // - 5. lépés csak letöltött PDF után, különben a 4. lépésre dob.
  const goTo = (n: number) => {
    if ((n === 4 || n === 5) && !hasData) {
      setStep(3);
      return;
    }
    if (n === 5 && !pdfDone) {
      setStep(4);
      return;
    }
    setStep(n);
  };

  const shownStep = step > 5 ? 5 : step;
  const stageClass = step === 2 || step === 4 ? "wiz-stage wiz-stage-fixed" : "wiz-stage";

  return (
    <div className="demo-wiz">
      {/* ── Mindig látható fejléc: cím (bal) · nagy lépésszámláló (közép) · lépésjelző (jobb) ── */}
      <header className="wiz-header">
        <div className="wiz-header-id">
          <h1 className="wiz-title">{config.uiTexts.focim}</h1>
          {companyCount > 0 && (
            <p className="wiz-stat">
              Összesen eddig <b>{companyCount.toLocaleString("hu-HU")}</b> polccímkét generáltak a DEMO
              oldalon
            </p>
          )}
        </div>
        <div className="wiz-header-count">
          <span key={shownStep} className="wiz-count-big">
            {shownStep}
            <span className="wiz-count-sep">/</span>5<small>lépés</small>
          </span>
        </div>
        <div className="wiz-header-steps">
          <ol className="wiz-stepper" aria-label="Lépések">
            {STEP_LABELS.map((label, i) => {
              const n = i + 1;
              const state = n < step ? "done" : n === step ? "current" : "todo";
              return (
                <li key={label} className={`wiz-node wiz-node-${state}`}>
                  <button
                    type="button"
                    className="wiz-node-btn"
                    onClick={() => goTo(n)}
                    aria-current={state === "current" ? "step" : undefined}
                    aria-label={`${n}. lépés: ${label}`}
                  >
                    <span className="wiz-dot">{state === "done" ? <Check /> : n}</span>
                    <span className="wiz-node-label">{label}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </header>

      {/* ── Aktuális lépés ── */}
      <main className={stageClass}>
        {step === 1 && (
          <section className="wiz-card">
            <span className="wiz-badge">1</span>
            <h2 className="wiz-h">Töltse le a sablon táblázatot</h2>
            <p className="wiz-lead">
              Ebbe az Excel-táblázatba kerülnek a termékek. Nyissa meg Excellel vagy bármelyik
              ingyenes táblázatkezelővel.
            </p>
            <button type="button" className="wiz-btn wiz-btn-primary" onClick={onDownloadTemplate}>
              <Download /> Sablon letöltése
            </button>
            {templateDownloaded && (
              <p className="wiz-ok">
                <CheckCircle2 /> Szuper, megvan a sablon!
              </p>
            )}
            <div className="wiz-nav">
              <span />
              <button
                type="button"
                className={`wiz-btn wiz-btn-next${templateDownloaded ? " pulse" : " ghost"}`}
                onClick={() => setStep(2)}
              >
                {templateDownloaded ? "Tovább" : "Már megvan"} <ArrowRight />
              </button>
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="wiz-card wiz-card-wide wiz-card-guide">
            <div className="wiz-col-left">
              <span className="wiz-badge">2</span>
              <h2 className="wiz-h">A termékek megadása</h2>
              <p className="wiz-lead">
                Nyissa meg a letöltött táblázatot, és az „1. Termékek” fülön írja be a termékeit -
                soronként egyet. A jobb oldalon látható, milyen adatokat kérnek az egyes mezők.
              </p>
              <div className="wiz-col-actions">
                <p className="wiz-note">
                  <b>Akciós címkéhez:</b> ki kell tölteni az <b>Árat</b> ÉS az <b>Akciós árat</b> is.
                  Egy sor = egy címke. Legfeljebb 21 termék, a színes fejléc sor maradjon változatlan.
                </p>
                <div className="wiz-nav">
                  <button type="button" className="wiz-btn wiz-btn-back" onClick={() => setStep(1)}>
                    <ArrowLeft /> Vissza
                  </button>
                  <button type="button" className="wiz-btn wiz-btn-next pulse" onClick={() => setStep(3)}>
                    Tovább a feltöltéshez <ArrowRight />
                  </button>
                </div>
              </div>
            </div>
            <div className="wiz-col-right">
              <div className="wiz-fields wiz-fields-panel">
                <div className="wiz-field">
                  <b>Cikkszám</b> <span>belső azonosító, nem kötelező</span> <i>pl. 100234</i>
                </div>
                <div className="wiz-field">
                  <b>EAN-13</b> <span>a vonalkód 13 számjegye</span> <i>pl. 5998200912345</i>
                </div>
                <div className="wiz-field">
                  <b>Megnevezés</b> <span>a termék neve, ahogy a címkén megjelenik</span>{" "}
                  <i>pl. Prémium falfesték fehér</i>
                </div>
                <div className="wiz-field">
                  <b>Kiszerelés</b> <span>mennyiség + mértékegység</span> <i>pl. 5 l · 25 kg · 500 ml</i>
                </div>
                <div className="wiz-field">
                  <b>Ár</b> <span>normál ár forintban, csak szám</span> <i>pl. 4990</i>
                </div>
                <div className="wiz-field">
                  <b>Akciós ár</b> <span>ha van akció, egyébként üres</span> <i>pl. 3990</i>
                </div>
              </div>
            </div>
          </section>
        )}

        {step === 3 && (
          <section className="wiz-card">
            <span className="wiz-badge">3</span>
            <h2 className="wiz-h">Töltse fel a kész táblázatot</h2>
            <p className="wiz-lead">
              Húzza ide a kitöltött fájlt, vagy kattintson a tallózáshoz. A rendszer automatikusan
              feldolgozza.
            </p>
            <label
              htmlFor="excelFile"
              className={`wiz-drop${dragOver ? " over" : ""}${processing ? " busy" : ""}`}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
            >
              {processing ? (
                <>
                  <span className="wiz-drop-spinner" aria-hidden="true" />
                  <span className="wiz-drop-title">Feldolgozás…</span>
                  <span className="wiz-drop-sub">{uploadedFileName}</span>
                </>
              ) : (
                <>
                  <Upload className="wiz-drop-icon" />
                  <span className="wiz-drop-title">Húzza ide a .xlsx fájlt</span>
                  <span className="wiz-drop-sub">vagy kattintson a tallózáshoz · legfeljebb 21 termék</span>
                </>
              )}
            </label>
            <div className="wiz-nav">
              <button type="button" className="wiz-btn wiz-btn-back" onClick={() => setStep(2)}>
                <ArrowLeft /> Vissza
              </button>
              <span />
            </div>
          </section>
        )}

        {step === 4 && (
          <section className="wiz-card wiz-card-wide wiz-card-preview">
            <div className="wiz-col-left">
              <span className="wiz-badge">4</span>
              <h2 className="wiz-h">A címkék előnézete</h2>
              <p className="wiz-ok wiz-ok-inline">
                <CheckCircle2 /> {labelCount} címke elkészült
              </p>
              <div className="wiz-logo-choice">
                <span className="wiz-logo-q">Melyik logó legyen a címkén?</span>
                <div className="wiz-logo-opts">
                  {logos.map((logo) => (
                    <label
                      key={logo.value}
                      className={`wiz-logo${selectedLogoValue === logo.value ? " sel" : ""}`}
                    >
                      <input
                        type="radio"
                        name="labelType"
                        value={logo.value}
                        checked={selectedLogoValue === logo.value}
                        onChange={() => setSelectedLogoValue(logo.value)}
                      />
                      {logo.src && <img src={logo.src} alt="" className="wiz-logo-img" />}
                      <span>{logo.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="wiz-col-actions">
                <p className="wiz-watermark-note">
                  Ez egy DEMO - a címkék <b>MINTACÍMKÉK</b> vízjelet kapnak.
                </p>
                {busy ? (
                  <div className="wiz-progress" aria-live="polite">
                    <div className="wiz-progress-bar" style={{ width: `${progress ?? 0}%` }} />
                    <span className="wiz-progress-text">PDF készül…</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="wiz-btn wiz-btn-primary wiz-btn-download"
                    id="downloadBtn"
                    onClick={onDownloadPdf}
                  >
                    <Download /> Töltse le a PDF-et
                  </button>
                )}
                <div className="wiz-nav">
                  <button
                    type="button"
                    className="wiz-btn wiz-btn-back"
                    onClick={() => setStep(3)}
                    disabled={busy}
                  >
                    <ArrowLeft /> Új fájl
                  </button>
                  <button type="button" className="wiz-link" onClick={onOpenDataTable} disabled={busy}>
                    <Table2 /> Adatok ellenőrzése
                  </button>
                </div>
              </div>
            </div>
            <div className="wiz-col-right">
              <div className="wiz-preview">{labelsNode}</div>
            </div>
          </section>
        )}

        {step === 5 && (
          <section className="wiz-card wiz-done">
            <div className="wiz-confetti" aria-hidden="true">
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
            <span className="wiz-done-check">
              <PartyPopper />
            </span>
            <h2 className="wiz-h">Elkészült a címke PDF!</h2>
            <p className="wiz-lead">
              A böngésző letöltötte a fájlt - a „Letöltések" mappában található. Ez egy DEMO, ezért a
              címkék MINTACÍMKÉK vízjelet kapnak.
            </p>
            <p className="wiz-done-cta-lead">
              Tetszik? Kérjen személyre szabott árajánlatot vízjel nélküli, saját logós címkékre.
            </p>
            <div className="wiz-done-actions">
              <button type="button" className="wiz-btn wiz-btn-quote" onClick={onRequestQuote}>
                <Send /> Árajánlatot kérek
              </button>
              <button type="button" className="wiz-btn wiz-btn-primary" onClick={onRestart}>
                <RotateCcw /> Új címkék generálása
              </button>
            </div>
            <div className="wiz-nav">
              <button type="button" className="wiz-btn wiz-btn-back" onClick={() => setStep(4)}>
                <ArrowLeft /> Vissza az előnézethez
              </button>
              <span className="wiz-brand">
                <FileSpreadsheet /> Label Labor
              </span>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
