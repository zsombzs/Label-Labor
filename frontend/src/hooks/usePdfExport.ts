import { useCallback, useRef, useState } from "react";
import html2pdf from "html2pdf.js";
import type { LabelLayout } from "../types/config";

interface PdfExportState {
  /** 0–100, csak folyamatban lévő exportnál. */
  progress: number | null;
  /** A letöltés lezajlott → a gomb "Új címkék generálása" reload móddba vált. */
  reloadMode: boolean;
}

/**
 * html2pdf A4-export az LL generatePDF/createPDF portja:
 * - 6 mp-es progress-szimuláció,
 * - SVG vonalkódok képpé alakítása (html2canvas-kompatibilitás),
 * - oldalszám: 1. oldal alul, a 2. oldaltól a lap TETEJÉN (layout.pageNumberFromPage),
 * - képernyő-only elemek (sorszám, szerkesztés gomb) kizárása.
 */
export function usePdfExport(filename: string, layout: LabelLayout) {
  const [state, setState] = useState<PdfExportState>({ progress: null, reloadMode: false });
  const runningRef = useRef(false);

  const createPdf = useCallback(
    (labelsEl: HTMLElement) => {
      // Biztonsági rögzítés: az ablak görgetése eltolhatja a html2canvas felvételt
      // (a scrollY-t beleszámolja). A generátor oldal amúgy overflow:hidden, de ha
      // valaha görgethető layoutba kerülne, ez megóv az elcsúszott PDF-től.
      window.scrollTo(0, 0);
      // SVG → img csere (a régi kód is így csinálta; a reload úgyis helyreállít)
      labelsEl.querySelectorAll<SVGSVGElement>("svg.barcode").forEach((svg) => {
        const svgData = new XMLSerializer().serializeToString(svg);
        const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
        const url = URL.createObjectURL(svgBlob);
        const img = document.createElement("img");
        img.src = url;
        img.className = "barcode";
        svg.parentNode?.replaceChild(img, svg);
      });

      const opt = {
        margin: 0,
        filename,
        image: { type: "jpeg" as const, quality: 0.8 },
        html2canvas: {
          scale: 3,
          useCORS: true,
          backgroundColor: "#ffffff",
          ignoreElements: (el: Element) =>
            !!el.classList &&
            (el.classList.contains("cimbi-label-num") ||
              el.classList.contains("label-edit-btn") ||
              el.classList.contains("label-edit-actions")),
        },
        jsPDF: { unit: "mm" as const, format: "A4", orientation: "portrait" as const },
        pagebreak: { mode: ["avoid-all", "css", "legacy"] },
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: any = html2pdf().set(opt).from(labelsEl);
      void chain
        .toPdf()
        .get("pdf")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .then((pdf: any) => {
          const totalPages: number = pdf.internal.getNumberOfPages();
          for (let i = 1; i <= totalPages; i++) {
            pdf.setPage(i);
            pdf.setFontSize(10);
            pdf.setTextColor(100, 100, 100);
            const pageText = `${i} / ${totalPages}`;
            const pageWidth: number = pdf.internal.pageSize.getWidth();
            const pageHeight: number = pdf.internal.pageSize.getHeight();
            if (i < layout.pageNumberFromPage) {
              pdf.text(pageText, pageWidth / 2, pageHeight - 3, { align: "center" });
            } else {
              pdf.text(pageText, pageWidth / 2, 6, { align: "center" });
            }
          }
        })
        .save();
    },
    [filename, layout.pageNumberFromPage],
  );

  const exportPdf = useCallback(
    (labelsEl: HTMLElement, onDownloaded: () => void) => {
      if (runningRef.current) return;
      runningRef.current = true;
      setState({ progress: 0, reloadMode: false });

      const startTime = Date.now();
      const duration = 6000;
      const timer = setInterval(() => {
        const percent = Math.min(((Date.now() - startTime) / duration) * 100, 100);
        setState((s) => ({ ...s, progress: percent }));
        if (percent === 100) {
          clearInterval(timer);
          createPdf(labelsEl);
          onDownloaded();
          // 1 mp múlva gombállapot-váltás (a böngésző-letöltés lassabb a JS-nél)
          setTimeout(() => {
            runningRef.current = false;
            setState({ progress: null, reloadMode: true });
          }, 2000);
        }
      }, 50);
    },
    [createPdf],
  );

  return { progress: state.progress, reloadMode: state.reloadMode, exportPdf };
}
