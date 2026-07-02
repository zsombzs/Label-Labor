// Lokális teszt (Live Server) esetén automatikusan a helyi backendet hívjuk
const API_URL = ["localhost", "127.0.0.1"].includes(window.location.hostname)
  ? "http://localhost:8000"
  : "https://labelgenerator-production.up.railway.app";
// ── Auth: bejelentkezés ellenőrzése ──
const AUTH_TOKEN = sessionStorage.getItem("llToken");
if (!AUTH_TOKEN || AUTH_TOKEN === "undefined") window.location.replace("/");

function authHeaders() {
  return { "Content-Type": "application/json", "Authorization": "Bearer " + AUTH_TOKEN };
}

function handleAuthFailure(response) {
  if (response.status === 401) {
    sessionStorage.removeItem("llToken");
    alert("A munkamenet lejárt, kérjük jelentkezzen be újra.");
    window.location.replace("/");
    return true;
  }
  return false;
}

const COMPANY_USERNAME = 'EA_HU';
let validatedData = null; // Validált adatok tárolása (logo-váltásnál ne fussanak újra)
let rawData = null; // Nyers Excel adatok (táblázat előnézethez)

function getUsername() {
  return COMPANY_USERNAME;
}

function getSelectedLogo() {
  const selectedType = document.querySelector('input[name="labelType"]:checked').value;
  return selectedType === "A" ? "assets/ea.png" : "assets/hg.png";
}

document.querySelectorAll('input[name="labelType"]').forEach(radio => {
  radio.addEventListener('change', () => {
    if (validatedData) {
      renderLabels(validatedData);
    }
    const downloadBtn = document.getElementById("downloadBtn");
    if (downloadBtn && downloadBtn.classList.contains('btn-reload')) {
      downloadBtn.classList.remove('btn-reload');
      downloadBtn.textContent = '3. PDF letöltése';
    }
  });
});

function updateUploadUI(file) {
  uploadedFileName = file.name;
  const labelText = document.querySelector('.upload-label-text');
  if (labelText) labelText.textContent = file.name;
  document.querySelector('.icon-before-upload')?.style.setProperty('display', 'none');
  document.querySelector('.icon-after-upload')?.style.setProperty('display', '');
  const tooltip = document.querySelector('.info-tooltip');
  if (tooltip) tooltip.textContent = file.name;
  const label = document.querySelector('label[for="excelFile"]');
  if (label) label.classList.add('upload-done');
}

document.getElementById("excelFile").addEventListener("change", function(e) {
  validatedData = null;
  const file = e.target.files[0];
  if (file) updateUploadUI(file);
  handleFile(file);
}, false);

// Drag & drop a bal panelen
(function() {
  const panel = document.querySelector('.left-panel');
  panel.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    panel.classList.add('drag-over');
  });
  panel.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!panel.contains(e.relatedTarget)) panel.classList.remove('drag-over');
  });
  panel.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    panel.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const fname = file.name.toLowerCase();
    if (!fname.endsWith('.xlsx') && !fname.endsWith('.xlsm')) {
      showAlert('Csak .xlsx vagy .xlsm fájl feltöltése támogatott!');
      return;
    }
    validatedData = null;
    updateUploadUI(file);
    handleFile(file);
  });
})();

function handleFile(file) {
  let reader = new FileReader();

  reader.onload = function(event) {
    let data = new Uint8Array(event.target.result);
    let workbook = XLSX.read(data, { type: 'array' });
    let sheet = workbook.Sheets[workbook.SheetNames[0]];
    let json = XLSX.utils.sheet_to_json(sheet, { defval: "", blankrows: true });
    // Oszlopfejlécek normalizálása (trim) – xlsm-ben lehetnek trailing space-es nevek
    json = json.map(row => {
      const normalized = {};
      for (const [k, v] of Object.entries(row)) normalized[k.trim()] = v;
      return normalized;
    });
    // Záró teljesen üres sorok eltávolítása
    while (json.length > 0 && Object.values(json[json.length - 1]).every(v => v === "")) json.pop();
    rawData = json.map(r => ({ ...r })); // Nyers adatok mentése előnézethez

    // Ellenőrizzük, hogy az Excel már tartalmazza-e a feldolgozott oszlopokat (makró által)
    if (json.length > 0 && json[0].hasOwnProperty("Első_sor")) {
      // RÉGI MÓDSZER: az Excel már tartalmazza a szortírozott adatokat (makróval feldolgozva)
      console.log("Excel már feldolgozott adatokat tartalmaz - régi módszer használata");
      validatedData = json; // Cache-eljük logo-váltáshoz
      renderLabels(json);
    } else {
      // ÚJ MÓDSZER: agent validáció (nyers adatok - Megnevezés oszloppal)
      console.log("Nyers adatok - agent validáció használata");
      validateWithAgent(json, (correctedData) => {
        validatedData = correctedData; // Eltároljuk, hogy logo-váltáskor ne validáljuk újra
        renderLabels(correctedData);
      });
    }
  };
  reader.readAsArrayBuffer(file);
}

// =============================================================================
// BACKEND FELDOLGOZÁS - makró logika + EAN validáció
// =============================================================================

async function validateWithAgent(data, onComplete) {
  // Betöltési animáció megjelenítése
  const loadingOverlay = document.getElementById("loadingOverlay");
  loadingOverlay.classList.add("active");

  try {
    // Elküldjük a nyers adatokat → backend elvégzi a makró munkáját
    // EA: 20 karakter/sor (LL: 22 karakter/sor)
    const response = await fetch(`${API_URL}/api/process-labels`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ rows: data, subpage: "ea" })
    });

    if (handleAuthFailure(response)) return;

    if (!response.ok) {
      // Ha a backend nem elérhető, simán renderelünk az eredeti adatokkal
      console.warn("Backend nem elérhető, feldolgozás kihagyva");
      loadingOverlay.classList.remove("active");
      onComplete(data);
      return;
    }

    const result = await response.json();

    // Animáció elrejtése
    loadingOverlay.classList.remove("active");

    // Ha vannak hibák → popup
    if (result.osszes_hiba > 0) {
      showValidationModal(result, onComplete);
    } else {
      // Minden rendben → renderel a feldolgozott adatokkal
      onComplete(result.processed_rows);
    }

  } catch (err) {
    console.warn("Feldolgozás hiba:", err);
    loadingOverlay.classList.remove("active");
    onComplete(data);
  }
}

// =============================================================================
// KORREKCIÓS NAPLÓ (Roadmap 0. fázis) — minden validációs döntést tanulási
// adatként elküldünk a backendnek. Fire-and-forget: nem blokkolja a folyamatot.
// =============================================================================
function logCorrections(subpage, fixes, finalData, mode) {
  if (!fixes || fixes.length === 0) return;
  try {
    const records = fixes.map(f => {
      const finalVal = mode === "skipped"
        ? (f.eredeti ?? "")
        : String((finalData[f.rowIndex] && finalData[f.rowIndex][f.oszlop]) ?? "");
      let action;
      if (mode === "skipped") {
        action = "skipped";
      } else if (f.ai_javaslat && finalVal === f.ai_javaslat) {
        action = "accepted";
      } else if (finalVal === (f.eredeti ?? "")) {
        action = "unchanged";
      } else {
        action = "edited";
      }
      return {
        oszlop: f.oszlop,
        eredeti: f.eredeti ?? "",
        ai_javaslat: f.ai_javaslat ?? "",
        vegso_ertek: finalVal,
        action: action,
        termek: f.termek ?? "",
        excel_sor: f.excel_sor ?? null,
        hiba_leiras: f.hiba_leiras ?? ""
      };
    });
    fetch(`${API_URL}/api/log-corrections`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ subpage: subpage, corrections: records })
    }).catch(() => {});
  } catch (e) {
    console.warn("Korrekciós napló hiba:", e);
  }
}

function showValidationModal(validationResult, onComplete) {
  const overlay = document.getElementById("validationOverlay");
  const summary = document.getElementById("validationSummary");
  const issuesList = document.getElementById("issuesList");

  // Debug: Log what we received
  console.log("🔍 DEBUG - Frontend received validation result:");
  if (validationResult.issues && validationResult.issues.length > 0) {
    const firstIssue = validationResult.issues[0];
    console.log("  First issue:", firstIssue);
    if (firstIssue.hibak && firstIssue.hibak.length > 0) {
      const firstHiba = firstIssue.hibak[0];
      console.log("  First hiba:", firstHiba);
      console.log("  javitott value:", firstHiba.javitott);
      console.log("  eredeti value:", firstHiba.eredeti);
    }
  }

  summary.innerHTML = `
    <strong>${validationResult.osszes_hiba} problémát találtunk ${validationResult.issues.length} terméknél.</strong>
    <br><br><small>Az alábbiakban javasolt javításokat talál. Ha szükséges, manuálisan is módosítható bármelyik érték. A "Javítások alkalmazása" gombra kattintva az összes javítás automatikusan érvénybe lép.</small>
  `;

  issuesList.innerHTML = "";

  // A megjelenített hibák gyűjtése a korrekciós naplóhoz
  const loggedFixes = [];

  // Soronként jelenítjük meg a hibákat (Excel sor sorrendben)
  validationResult.issues.forEach(issue => {
    const card = document.createElement("div");
    card.className = "issue-card";
    card.innerHTML = `<div class="product-name">${issue.excel_sor - 1}. termék — ${escapeAttr(issue.termek)}</div>`;

    issue.hibak.forEach((hiba, hibaIdx) => {
      const item = document.createElement("div");
      item.className = "issue-item";
      const inputId = `fix_${issue.row_index}_${hibaIdx}`;

      item.innerHTML = `
        <div class="field-label">${issue.excel_sor - 1}. termék, ${escapeAttr(hiba.oszlop)} oszlop</div>
        <div class="error-text">${escapeAttr(hiba.hiba)}</div>
        <div class="fix-row">
          <input type="text"
            value="${escapeAttr(hiba.javitott || hiba.eredeti)}"
            id="${inputId}"
            placeholder="Javított érték...">
          <button class="accept-btn"
            id="btn_${inputId}"
            onclick="acceptFix(${issue.row_index}, '${hiba.oszlop}', '${inputId}')">
            ✓
          </button>
        </div>
      `;

      // Auto-acceptance on blur (when user clicks out of input)
      const input = item.querySelector(`#${inputId}`);
      if (input) {
        const originalValue = hiba.javitott || hiba.eredeti;
        input.addEventListener('blur', () => {
          const currentValue = input.value.trim();
          // Only auto-accept if value changed and field is not already accepted (disabled)
          if (!input.disabled && currentValue !== originalValue) {
            window.acceptFix(issue.row_index, hiba.oszlop, inputId);
          }
        });
      }

      loggedFixes.push({
        rowIndex: issue.row_index,
        oszlop: hiba.oszlop,
        eredeti: hiba.eredeti ?? "",
        ai_javaslat: hiba.javitott ?? "",
        termek: issue.termek ?? "",
        excel_sor: issue.excel_sor ?? null,
        hiba_leiras: hiba.hiba ?? ""
      });

      card.appendChild(item);
    });

    issuesList.appendChild(card);
  });

  // A feldolgozott adatokat tároljuk (már normalizálva vannak)
  overlay._data = JSON.parse(JSON.stringify(validationResult.processed_rows));
  overlay._loggedFixes = loggedFixes;

  overlay.classList.add("active");

  document.getElementById("applyFixesBtn").onclick = () => {
    overlay.classList.remove("active");
    logCorrections("ea", overlay._loggedFixes, overlay._data, "applied");
    onComplete(overlay._data);
  };

  document.getElementById("skipValidationBtn").onclick = () => {
    overlay.classList.remove("active");
    logCorrections("ea", overlay._loggedFixes, validationResult.processed_rows, "skipped");
    onComplete(validationResult.processed_rows);
  };
}

// Egységár újraszámítás (Ár vagy Kiszerelés javítása után)
function recalculateUnitPrice(kiszereles, ar) {
  if (!kiszereles || !ar) return { ftl: "", ftkg: "" };
  const priceVal = parseFloat(String(ar).replace(",", "."));
  if (isNaN(priceVal) || priceVal <= 0) return { ftl: "", ftkg: "" };
  const packStr = String(kiszereles).trim().toLowerCase();
  const numMatch = packStr.match(/[\d.,]+/);
  if (!numMatch) return { ftl: "", ftkg: "" };
  const qty = parseFloat(numMatch[0].replace(",", "."));
  if (isNaN(qty) || qty <= 0) return { ftl: "", ftkg: "" };
  const unit = packStr.replace(/[\d.,\s]/g, "").trim();
  if (unit === "ml") return { ftl: String(Math.round(priceVal / (qty / 1000))), ftkg: "" };
  if (unit === "l")  return { ftl: String(Math.round(priceVal / qty)), ftkg: "" };
  if (unit === "g")  return { ftl: "", ftkg: String(Math.round(priceVal / (qty / 1000))) };
  if (unit === "kg") return { ftl: "", ftkg: String(Math.round(priceVal / qty)) };
  return { ftl: "", ftkg: "" };
}

// Javítás elfogadása - toggle: első kattintás elfogad (zöld), második visszavonja (kék)
// window-ra kell tenni mert type="module" script globális scope-ból nem érhető el inline onclick-ből
window.acceptFix = function acceptFix(rowIndex, oszlop, inputId) {
  const overlay = document.getElementById("validationOverlay");
  const input = document.getElementById(inputId);
  const item = input.closest(".issue-item");
  const btn = document.getElementById("btn_" + inputId);

  // Toggle: ha már el van fogadva, visszavonjuk
  if (item && item.dataset.accepted === "true") {
    item.dataset.accepted = "false";
    input.disabled = false;
    input.style.borderColor = "";
    item.style.backgroundColor = "";
    if (btn) btn.style.background = "";
    return;
  }

  const newValue = input.value.trim();
  if (overlay._data && overlay._data[rowIndex]) {
    overlay._data[rowIndex][oszlop] = newValue;

    // Ha Ár vagy Kiszerelés változott → újraszámoljuk az egységárat
    if (oszlop === "Ár" || oszlop === "Kiszerelés") {
      const row = overlay._data[rowIndex];
      const { ftl, ftkg } = recalculateUnitPrice(row["Kiszerelés"], row["Ár"]);
      row["Ft/l"] = ftl;
      row["Ft/kg"] = ftkg;
    }

    input.style.borderColor = "#4caf50";
    input.disabled = true;
    if (item) {
      item.style.backgroundColor = "rgba(76, 175, 80, 0.2)";
      item.dataset.accepted = "true";
      if (btn) btn.style.background = "#4caf50";
    }
  }
}

function formatPrice(price) {
  if (price === null || price === undefined || price === "") return "";
  const num = parseInt(price, 10);
  if (isNaN(num)) return price;
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

let totalLabelsGenerated = 0;
let uploadedFileName = null;

function renderLabels(data) {
    const container = document.getElementById("labels");
    container.innerHTML = "";
    const emptyState = document.getElementById("labelsEmptyState");
    if (emptyState) emptyState.style.display = "none";
    let pageDiv = null;

    totalLabelsGenerated = data.length; // Eltároljuk hány címkét generáltunk
  
    data.forEach((row, index) => {
      if (index % 21 === 0) {
        pageDiv = document.createElement("div");
        pageDiv.className = "page";
        container.appendChild(pageDiv);
      }
  
      const div = document.createElement("div");
      div.className = "label";

      const logoPath = getSelectedLogo();
  
      const line1 = (row["Első_sor"] || "").substring(0, 20);
      const secondLineText = (row["Második_sor"] || "").substring(0, 20);
      const thirdLineText = (row["Harmadik_sor"] || "").substring(0, 20);
      const kiszereles = row["Kiszerelés"] || "";
      const ar = row["Ár"] || "";
      const ftPerL = row["Ft/l"] || "";
      const ftPerKg = row["Ft/kg"] || "";

      let price = "";
      let pricePerUnit = "";
      let unitLabel = "";
      if (/db$/i.test(kiszereles)) {
        unitLabel = "Ft/db";
        if (ar !== "") {
          pricePerUnit = formatPrice(ar);
          price = formatPrice(ar);
        } else {
          pricePerUnit = "";
          price = "";
        }
      } else {
        if (ar !== "") {
          price = formatPrice(ar);
          if (ftPerL !== "") {
            pricePerUnit = formatPrice(ftPerL);
            unitLabel = "Ft/l";
          } else if (ftPerKg !== "") {
            pricePerUnit = formatPrice(ftPerKg);
            unitLabel = "Ft/kg";
          }
        } else {
          price = "";
          if (kiszereles.match(/ml|l/i)) {
            unitLabel = "Ft/l";
          } else if (kiszereles.match(/g|kg/i)) {
            unitLabel = "Ft/kg";
          }
        }
      }

      div.innerHTML = `
        <img src="${logoPath}" class="logo">
        <div class="line1" data-edit="Első_sor">${escapeAttr(line1)}</div>
        <div class="line2" data-edit="Második_sor">${escapeAttr(secondLineText)}</div>
        <div class="line3" data-edit="Harmadik_sor">${escapeAttr(thirdLineText)}</div>
        <div class="kiszereles" data-edit="Kiszerelés">${escapeAttr(kiszereles)}</div>
        <div class="line4">cikkszám: <span data-edit="Cikkszám">${escapeAttr((row["Cikkszám"] || "").substring(0, 14))}</span></div>
        <div class="barcode-container">
          <svg class="barcode"></svg>
        </div>
        <div class="bottom">
            <div class="price-box1">
            <span class="amount" data-edit="Ár">${escapeAttr(price)}</span>
            <span class="unit">,- Ft</span>
            </div>
            <div class="price-box2">
              <span class="amount">${escapeAttr(pricePerUnit)}</span>
              <span class="unit">${unitLabel ? ",- " + escapeAttr(unitLabel) : ""}</span>
            </div>
        </div>
      `;
  
      pageDiv.appendChild(div);
      
      const barcodeSVG = div.querySelector(".barcode");
      const eanCode = row["EAN-13"];
      if (eanCode) {
        try {
          JsBarcode(barcodeSVG, eanCode.toString(), {
            format: "EAN13",
            lineColor: "#000",
            width: 1,
            height: 20,
            displayValue: true,
            fontSize: 14,
          });
        } catch (e) {
          console.warn(`Hibás vonalkód (${eanCode}), kihagyva`);
          barcodeSVG.remove();
        }
      } else {
        // Nincs EAN → töröljük az üres SVG-t, különben alapméretre (~300×150) tágul, és
        // letakarja a bal oldali szövegmezőket (megnevezés sorok, cikkszám) → nem kattinthatók.
        barcodeSVG.remove();
      }

      // Cimbi: sorszám-jelvény (csak képernyőn; PDF-ből kizárva – lásd createPDF ignoreElements)
      const numBadge = document.createElement("span");
      numBadge.className = "cimbi-label-num";
      numBadge.textContent = index + 1;
      div.appendChild(numBadge);

      // Látható "Szerkesztés" gomb (hoverre jelenik meg; PDF-ből kizárva)
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "label-edit-btn";
      editBtn.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg><span>Szerkesztés</span>';
      div.appendChild(editBtn);
    });

  const labelText = document.querySelector('.upload-label-text');
  if (labelText && uploadedFileName) {
    labelText.textContent = uploadedFileName + ' — ' + totalLabelsGenerated + ' polccímke';
  }

  document.getElementById("downloadBtn").disabled = false;
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("downloadBtn").disabled = true;
  document.querySelector("#downloadBtn").addEventListener("click", generatePDF);
  document.getElementById("sablonBtnOld").addEventListener("click", downloadTemplate);
  document.getElementById("sablonBtnNew").addEventListener("click", () => {
    const link = document.createElement("a");
    link.href = "new_ea_sablon.xlsx";
    link.download = "new_ea_sablon.xlsx";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });
  document.getElementById("tablePreviewBtn").addEventListener("click", openDataTable);
document.getElementById("dataTableCloseBtn").addEventListener("click", closeDataTable);
  document.getElementById("dataTableSaveBtn").addEventListener("click", saveAndGenerate);

  // Cella változás figyelése – újraszámítja a függő értékeket
  document.getElementById("dataTableBody").addEventListener("change", (e) => {
    const input = e.target;
    if (!input.classList.contains("table-cell-input")) return;
    const rowIndex = parseInt(input.dataset.row);
    const colKey = input.dataset.col;
    handleCellChange(rowIndex, colKey, input.value.trim(), input);
  });

  // Betöltjük a cég címkeszámát, ha van username
  loadCompanyLabelCount();
});

async function updateLabelCount(count) {
  const username = getUsername();
  if (!username) return;
  
  try {
    const response = await fetch(`${API_URL}/api/update-label-count`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ count }),
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log(`Címkeszám frissítve: ${data.new_count}`);
      updateDisplayedCount(data.new_count);
    }
  } catch (error) {
    console.error("Hiba a címkeszám frissítésekor:", error);
  }
}

function updateDisplayedCount(count) {
  const countElement = document.getElementById("companyLabelCount");
  if (countElement) {
    countElement.textContent = count.toLocaleString('hu-HU');
  }
}

async function loadCompanyLabelCount() {
  const username = getUsername();
  if (!username) return;
  
  try {
    const response = await fetch(`${API_URL}/api/company-label-count`, { headers: authHeaders() });
    if (response.ok) {
      const data = await response.json();
      updateDisplayedCount(data.count);
    }
  } catch (error) {
    console.error("Hiba a címkeszám betöltésekor:", error);
  }
}

function generatePDF() {
  const downloadBtn = document.getElementById("downloadBtn");
  if (downloadBtn.classList.contains('btn-reload')) { location.reload(); return; }
  const progressContainer = document.getElementById("progressContainer");
  const progressBar = document.getElementById("progressBar");

  document.querySelectorAll("button").forEach(btn => btn.disabled = true);

  progressContainer.style.display = "block";
  progressBar.style.width = "0%";

  let startTime = Date.now();
  const duration = 6000;
  const interval = 50;

  const timer = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const percent = Math.min((elapsed / duration) * 100, 100);
    progressBar.style.width = percent + "%";

    if (percent === 100) {
      clearInterval(timer);

      createPDF();
      
      // Frissítjük a címkeszámot
      updateLabelCount(totalLabelsGenerated);

      progressBar.style.backgroundColor = "#f6bd60";
      progressBar.style.width = "0%";

      setTimeout(() => {
        document.querySelectorAll("button").forEach(btn => btn.disabled = false);
        setTimeout(() => {
          downloadBtn.innerHTML = '<i data-lucide="rotate-ccw" class="reload-icon"></i> Új címkék generálása <i data-lucide="rotate-ccw" class="reload-icon"></i>';
          downloadBtn.classList.add('btn-reload');
          lucide.createIcons();
        }, 1000);
      }, 1000);
    }
  }, interval);
}

function createPDF() {
  if (typeof window.inlineEditFlush === "function") window.inlineEditFlush(); // nyitott helyben-szerkesztés lezárása
  document.querySelectorAll("svg.barcode").forEach(svg => {
    const svgData = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);

    const img = document.createElement("img");
    img.src = url;
    img.className = svg.className;
    svg.parentNode.replaceChild(img, svg);
  });

  let element = document.getElementById("labels");
  let opt = {
    margin: 0,
    filename: "ea_cimkek.pdf",
    image: { type: 'jpeg', quality: 0.8 },
    html2canvas: { scale: 3, useCORS: true, backgroundColor: '#ffffff', ignoreElements: (el) => el.classList && (el.classList.contains('cimbi-label-num') || el.classList.contains('label-edit-btn') || el.classList.contains('label-edit-actions')) },
    jsPDF: { unit: 'mm', format: 'A4', orientation: 'portrait' },
    pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
  };
  html2pdf()
    .set(opt)
    .from(element)
    .toPdf()
    .get('pdf')
    .then(function(pdf) {
      const totalPages = pdf.internal.getNumberOfPages();
      
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        pdf.setFontSize(10);
        pdf.setTextColor(100, 100, 100);
        
        const pageText = `${i} / ${totalPages}`;
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();

        if (i === 1) {
          pdf.text(pageText, pageWidth / 2, pageHeight - 3, { align: 'center' });
        } else {
          pdf.text(pageText, pageWidth / 2, 6, { align: 'center' });
        }
      }
    })
    .save();
}

function downloadTemplate() {
    const link = document.createElement("a");
    link.href = "ea_excel_sablon.xlsm";
    link.download = "ea_excel_sablon.xlsm";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
// =============================================================================
// ADATOK ELŐNÉZETE - szerkeszthető táblázat
// =============================================================================

const TABLE_COLUMNS = [
  { key: "Cikkszám",     editable: true  },
  { key: "EAN-13",       editable: true  },
  { key: "Megnevezés",   editable: false },
  { key: "Kiszerelés",   editable: true  },
  { key: "Első_sor",     editable: true  },
  { key: "Második_sor",  editable: true  },
  { key: "Harmadik_sor", editable: true  },
  { key: "Ár",           editable: true  },
  { key: "ml",           editable: false },
  { key: "l",            editable: false },
  { key: "kg",           editable: false },
  { key: "g",            editable: false },
  { key: "Ft/l",         editable: false },
  { key: "Ft/kg",        editable: false },
  { key: "db",           editable: false },
];

function getTableCellValue(colKey, rowIndex) {
  const pRow = validatedData ? validatedData[rowIndex] : null;
  const rRow = rawData ? rawData[rowIndex] : null;

  if (colKey === "Megnevezés") {
    if (rRow && rRow["Megnevezés"]) return String(rRow["Megnevezés"]);
    if (pRow) {
      return [pRow["Első_sor"] || "", pRow["Második_sor"] || "", pRow["Harmadik_sor"] || ""]
        .join(" ").trim();
    }
    return "";
  }

  if (["ml", "l", "kg", "g", "db"].includes(colKey)) {
    if (pRow && pRow[colKey] !== undefined && pRow[colKey] !== "") return String(pRow[colKey]);
    if (rRow && rRow[colKey] !== undefined && rRow[colKey] !== "") return String(rRow[colKey]);
    const kiszereles = (pRow && pRow["Kiszerelés"]) || (rRow && rRow["Kiszerelés"]) || "";
    return parseKiszereles(kiszereles)[colKey] || "";
  }

  if (colKey === "Ft/l" || colKey === "Ft/kg") {
    if (pRow && pRow[colKey] !== undefined && pRow[colKey] !== "") return String(pRow[colKey]);
    if (rRow && rRow[colKey] !== undefined && rRow[colKey] !== "") return String(rRow[colKey]);
    const kiszereles = (pRow && pRow["Kiszerelés"]) || (rRow && rRow["Kiszerelés"]) || "";
    const ar = (pRow && pRow["Ár"]) || (rRow && rRow["Ár"]) || "";
    const { ftl, ftkg } = recalculateUnitPrice(kiszereles, ar);
    return colKey === "Ft/l" ? ftl : ftkg;
  }

  if (pRow && pRow[colKey] !== undefined && pRow[colKey] !== "") return String(pRow[colKey]);
  if (rRow && rRow[colKey] !== undefined && rRow[colKey] !== "") return String(rRow[colKey]);
  return "";
}

function escapeAttr(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function openDataTable() {
  if (!validatedData || validatedData.length === 0) {
    showAlert("Nincs megjeleníthető adat. Töltse fel az Excel fájlt először!");
    return;
  }

  const thead = document.getElementById("dataTableHead");
  const tbody = document.getElementById("dataTableBody");

  thead.innerHTML = "<tr>" + TABLE_COLUMNS.map(col =>
    `<th class="${col.editable ? "" : "col-readonly"}">${col.key}</th>`
  ).join("") + "</tr>";

  tbody.innerHTML = "";
  validatedData.forEach((row, rowIndex) => {
    const tr = document.createElement("tr");
    TABLE_COLUMNS.forEach(col => {
      const td = document.createElement("td");
      const val = getTableCellValue(col.key, rowIndex);
      if (col.editable) {
        td.innerHTML = `<input type="text" class="table-cell-input" data-row="${rowIndex}" data-col="${col.key}" value="${escapeAttr(val)}">`;
      } else {
        td.className = "cell-readonly";
        td.dataset.row = rowIndex;
        td.dataset.col = col.key;
        td.textContent = val;
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  document.getElementById("dataTableOverlay").classList.add("active");
}

function closeDataTable() {
  document.getElementById("dataTableOverlay").classList.remove("active");
}

function saveAndGenerate() {
  if (!validatedData) return;

  // Beolvassuk az aktuális táblázat értékeit a validatedData-ba
  document.querySelectorAll("#dataTableBody .table-cell-input").forEach(input => {
    const rowIdx = parseInt(input.dataset.row);
    const colKey = input.dataset.col;
    if (validatedData[rowIdx] !== undefined) {
      validatedData[rowIdx][colKey] = input.value.trim();
    }
  });

  // Összerakjuk a nyers adatokat az agent számára (Megnevezés = összerakott sorok)
  const rawForValidation = validatedData.map(row => ({
    "Megnevezés": [row["Első_sor"] || "", row["Második_sor"] || "", row["Harmadik_sor"] || ""]
      .filter(s => s).join(" ").trim(),
    "Kiszerelés": row["Kiszerelés"] || "",
    "Ár": row["Ár"] || "",
    "EAN-13": row["EAN-13"] || "",
    "Cikkszám": row["Cikkszám"] || "",
  }));

  closeDataTable();

  validateWithAgent(rawForValidation, (correctedData) => {
    validatedData = correctedData;
    renderLabels(correctedData);
  });
}

// =============================================================================
// TÁBLÁZAT CELLA ÚJRASZÁMÍTÁS
// =============================================================================

// EAN-13 formátum és check digit validáció
function validateEan13(ean) {
  if (!ean || ean === "") return true;
  const str = String(ean).replace(/\s/g, "");
  if (!/^\d{13}$/.test(str)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(str[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return (10 - (sum % 10)) % 10 === parseInt(str[12]);
}

// Kiszerelés szövegéből ml / l / kg / g / db értékek kiszámítása
function parseKiszereles(kiszereles) {
  const result = { ml: "", l: "", kg: "", g: "", db: "" };
  if (!kiszereles) return result;
  const str = String(kiszereles).trim().toLowerCase();
  if (str === "db") { result.db = "db"; return result; }
  const numMatch = str.match(/([\d.,]+)/);
  if (!numMatch) return result;
  const qty = parseFloat(numMatch[1].replace(",", "."));
  if (isNaN(qty) || qty <= 0) return result;
  const unit = str.replace(/[\d.,\s]/g, "").trim();
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
  }
  return result;
}

// Egy cella értékének frissítése a táblázatban (input vagy readonly td)
function updateTableCell(rowIndex, colKey, value) {
  const input = document.querySelector(
    `#dataTableBody input[data-row="${rowIndex}"][data-col="${colKey}"]`
  );
  if (input) { input.value = value; return; }
  const td = document.querySelector(
    `#dataTableBody td[data-row="${rowIndex}"][data-col="${colKey}"]`
  );
  if (td) td.textContent = value;
}

// Cella módosítás kezelése: EAN-13 validáció + függő mezők újraszámítása
function handleCellChange(rowIndex, colKey, newValue, inputEl) {
  if (!validatedData || validatedData[rowIndex] === undefined) return;
  validatedData[rowIndex][colKey] = newValue;

  if (colKey === "EAN-13") {
    inputEl.style.borderColor = validateEan13(newValue) ? "" : "#e53935";
    return;
  }

  if (colKey === "Kiszerelés") {
    const parsed = parseKiszereles(newValue);
    ["ml", "l", "kg", "g", "db"].forEach(k => {
      validatedData[rowIndex][k] = parsed[k];
      updateTableCell(rowIndex, k, parsed[k]);
    });
    const { ftl, ftkg } = recalculateUnitPrice(newValue, validatedData[rowIndex]["Ár"]);
    validatedData[rowIndex]["Ft/l"] = ftl;
    validatedData[rowIndex]["Ft/kg"] = ftkg;
    updateTableCell(rowIndex, "Ft/l", ftl);
    updateTableCell(rowIndex, "Ft/kg", ftkg);
    return;
  }

  if (colKey === "Ár") {
    const { ftl, ftkg } = recalculateUnitPrice(validatedData[rowIndex]["Kiszerelés"], newValue);
    validatedData[rowIndex]["Ft/l"] = ftl;
    validatedData[rowIndex]["Ft/kg"] = ftkg;
    updateTableCell(rowIndex, "Ft/l", ftl);
    updateTableCell(rowIndex, "Ft/kg", ftkg);
    return;
  }
}

// =============================================================================
// CUSTOM ALERT MODAL
// =============================================================================

function showAlert(message, title) {
  document.getElementById("customAlertTitle").textContent = title || "Figyelmeztetés";
  document.getElementById("customAlertMessage").textContent = message;
  document.getElementById("customAlertOverlay").classList.add("active");
}

function closeAlert() {
  document.getElementById("customAlertOverlay").classList.remove("active");
}

document.addEventListener("DOMContentLoaded", function () {
  document.getElementById("customAlertClose").addEventListener("click", closeAlert);
  document.getElementById("customAlertOk").addEventListener("click", closeAlert);
  document.getElementById("customAlertOverlay").addEventListener("click", function (e) {
    if (e.target === this) closeAlert();
  });
});

// =============================================================================
// CIMBI CHAT (1. fázis) — természetes nyelvű tömeges árműveletek
// Backend: NL → intent (/api/label-command). A frontend alkalmazza (előnézet + undo).
// =============================================================================
(function initCimbi() {
  const SUBPAGE = "ea";
  const HAS_SALE = false; // van-e akciós címke-formátum ezen az oldalon
  const launcher = document.getElementById("cimbiLauncher");
  const panel = document.getElementById("cimbiPanel");
  const closeBtn = document.getElementById("cimbiClose");
  const thread = document.getElementById("cimbiThread");
  const form = document.getElementById("cimbiForm");
  const input = document.getElementById("cimbiInput");
  const chips = document.getElementById("cimbiChips");
  if (!launcher || !panel) return;

  let undoSnapshot = null;
  const HELP = 'Segítek a betöltött címkéken — mindig előnézettel, és bármit vissza tudsz vonni. Tudok: árat emelni/csökkenteni %-kal, árat kerekíteni (akár x90/x99 végződésre), egy adott címke árát konkrét értékre állítani, akciót be- vagy kikapcsolni, és a címke szövegét szerkeszteni (átnevezés, csere, rövidítés). Hivatkozhatsz a címke SORSZÁMÁRA (a kék szám a címke bal sarkában), a termék nevére/márkájára, a kiszerelésre vagy ársávra. Pl.: „a 3-as ára legyen 5990”, „emeld a Dulux 5 literesek árát 10%-kal”, „tedd akcióba a beltéri festékeket 15%-kal”, „kerekíts minden árat 90-re”.';

  function scrollDown() { thread.scrollTop = thread.scrollHeight; }
  function addUser(text) { const d = document.createElement("div"); d.className = "cimbi-msg cimbi-user"; d.textContent = text; thread.appendChild(d); scrollDown(); }
  function addBot(text) { const d = document.createElement("div"); d.className = "cimbi-msg cimbi-bot"; d.textContent = text; thread.appendChild(d); scrollDown(); return d; }
  function showHelp() {
    const d = document.createElement("div");
    d.className = "cimbi-msg cimbi-bot cimbi-help";
    d.innerHTML =
      '<b>Ezt tudom:</b>' +
      '<ul class="cimbi-help-list">' +
      '<li>Áremelés / csökkentés %-kal</li>' +
      '<li>Árak kerekítése (x10 / x90 / x99)</li>' +
      '<li>Egy címke árának beállítása</li>' +
      (HAS_SALE ? '<li>Akció be- és kikapcsolása</li>' : '') +
      '<li>Tartalom: név, cikkszám, kiszerelés</li>' +
      '<li>Szöveg: csere, nagybetű, rövidítés</li>' +
      '<li>Egyedi kérések: pl. „tördeld a nevet 3 sorba"</li>' +
      '<li>Átnézés: hibák keresése a címkéken</li>' +
      '<li>Gyors kérdések: átlagár, legdrágább, darabszám</li>' +
      '</ul>' +
      '<span class="cimbi-help-foot">Hivatkozhatsz sorszámra, névre, márkára vagy kiszerelésre.</span>';
    thread.appendChild(d); scrollDown(); return d;
  }

  function greet() {
    if (!validatedData || validatedData.length === 0) {
      addBot("Szia! Tölts fel egy Excelt, és segítek az árváltozásban és a címkék szerkesztésében.");
    } else {
      addBot("Szia! Miben segítsek? Hivatkozhatsz a címkék sorszámára (a sarokban lévő kék szám) vagy a címkeadatokra.");
    }
  }

  function openPanel() {
    panel.classList.add("open"); panel.setAttribute("aria-hidden", "false");
    document.body.classList.add("cimbi-open"); // a címke-sorszámok csak nyitott chatnél látszanak
    if (!thread.dataset.greeted) { greet(); thread.dataset.greeted = "1"; }
    input.focus();
  }
  function closePanel() { if (panel.contains(document.activeElement)) launcher.focus(); panel.classList.remove("open"); panel.setAttribute("aria-hidden", "true"); document.body.classList.remove("cimbi-open"); clearHighlight("cimbi-diff"); clearHighlight("cimbi-diff-applied"); clearHighlight("cimbi-review"); }
  launcher.addEventListener("click", openPanel);
  closeBtn.addEventListener("click", closePanel);

  // ---- panel mozgatása a fejlécnél (teljes képernyőn) ----
  const header = panel.querySelector(".cimbi-header");
  let drag = null;
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  if (header) {
    header.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".cimbi-close")) return;
      const r = panel.getBoundingClientRect();
      drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
      panel.style.left = r.left + "px"; panel.style.top = r.top + "px";
      panel.style.right = "auto"; panel.style.bottom = "auto";
      panel.classList.add("cimbi-dragging");
      try { header.setPointerCapture(e.pointerId); } catch (_) {}
    });
    header.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const nx = clamp(e.clientX - drag.dx, 4, window.innerWidth - panel.offsetWidth - 4);
      const ny = clamp(e.clientY - drag.dy, 4, window.innerHeight - panel.offsetHeight - 4);
      panel.style.left = nx + "px"; panel.style.top = ny + "px";
    });
    const endDrag = (e) => { if (!drag) return; drag = null; panel.classList.remove("cimbi-dragging"); try { header.releasePointerCapture(e.pointerId); } catch (_) {} };
    header.addEventListener("pointerup", endDrag);
    header.addEventListener("pointercancel", endDrag);
  }

  // ---- segédfüggvények ----
  const PRICE_OPS = ["price_multiply", "price_round", "price_psychological", "set_price"];
  const KNOWN_OPS = PRICE_OPS.concat(["set_sale", "clear_sale", "set_field", "edit_text", "custom_edit"]);
  const TEXT_COLS = ["Első_sor", "Második_sor", "Harmadik_sor"];
  // set_field: a címkén megjelenő, szerkeszthető mezők. A "Megnevezés"/név külön kezelt (__NAME__),
  // mert a címke a sor-mezőkből renderel → a nevet szét kell tördelni.
  const FIELD_COLS = ["Cikkszám", "EAN-13", "Kiszerelés", "Első_sor", "Második_sor", "Harmadik_sor", "Ár", "Akciós_ár"];
  const FIELD_ALIASES = {
    "cikkszám": "Cikkszám", "cikkszam": "Cikkszám", "cikk": "Cikkszám", "cikkszám:": "Cikkszám",
    "ean": "EAN-13", "ean-13": "EAN-13", "ean13": "EAN-13", "vonalkód": "EAN-13", "vonalkod": "EAN-13",
    "kiszerelés": "Kiszerelés", "kiszereles": "Kiszerelés", "kiszer": "Kiszerelés",
    "ár": "Ár", "ar": "Ár", "price": "Ár",
    "akciós_ár": "Akciós_ár", "akcios_ar": "Akciós_ár", "akciós ár": "Akciós_ár", "akciós": "Akciós_ár", "akcios": "Akciós_ár",
    "első_sor": "Első_sor", "elso_sor": "Első_sor", "első sor": "Első_sor",
    "második_sor": "Második_sor", "masodik_sor": "Második_sor",
    "harmadik_sor": "Harmadik_sor", "negyedik_sor": "Negyedik_sor",
    "szín": "Szín", "szin": "Szín", "color": "Szín"
  };
  function resolveFieldCol(field) {
    if (!field) return null;
    const f = String(field).trim().toLowerCase();
    if (/^(megnevez|név|nev|termék|termek|name)/.test(f)) return "__NAME__";
    const mapped = FIELD_ALIASES[f];
    if (mapped) return FIELD_COLS.includes(mapped) ? mapped : null;
    return FIELD_COLS.includes(field) ? field : null;
  }
  // A backend `split_name` JS-tükre: szavanként tördel max sorra, a sor-limitekkel.
  function isUpperName(s) { s = String(s == null ? "" : s); return s === s.toUpperCase() && s !== s.toLowerCase(); }
  function splitName(name, maxLines, maxChars, maxCharsLine3) {
    const l3 = (maxCharsLine3 != null) ? maxCharsLine3 : maxChars;
    const limits = []; for (let k = 0; k < maxLines; k++) limits.push(k < 2 ? maxChars : l3);
    const out = new Array(maxLines).fill("");
    const words = String(name == null ? "" : name).trim().split(/\s+/).filter(Boolean);
    let cur = 0;
    for (const w of words) {
      if (cur >= maxLines) break;
      if (out[cur] === "") out[cur] = w;
      else if ((out[cur] + " " + w).length <= limits[cur]) out[cur] = out[cur] + " " + w;
      else { cur++; if (cur >= maxLines) break; out[cur] = w; }
    }
    return out;
  }
  // Standard oldal: a név 3 sorra tördelődik (max 18, kisbetűsnél +2).
  function computeNameLines(value, row) {
    const mc = isUpperName(value) ? 18 : 20;
    return splitName(value, 3, mc, mc);
  }
  function applyNameToRow(row, value) {
    row["Megnevezés"] = value;
    const lines = computeNameLines(value, row);
    row["Első_sor"] = lines[0] || ""; row["Második_sor"] = lines[1] || ""; row["Harmadik_sor"] = lines[2] || "";
  }
  // A címkén megjelenő név a sor-mezőkből áll → az a forrásigazság (a Megnevezés elavulhat).
  function nameOf(row) {
    const joined = NAME_LINE_COLS.map(c => row[c]).filter(Boolean).join(" ").trim();
    if (joined) return joined;
    return String(row["Megnevezés"] == null ? "" : row["Megnevezés"]).trim();
  }

  function parsePrice(v) { const n = parseFloat(String(v == null ? "" : v).replace(/\s/g, "").replace(",", ".")); return isNaN(n) ? null : n; }
  function cut(s, n) { s = String(s == null ? "" : s); return s.length > n ? s.slice(0, n - 1) + "…" : s; }
  function rowText(row) {
    return [row["Első_sor"], row["Második_sor"], row["Harmadik_sor"], row["Megnevezés"], row["Cikkszám"]]
      .filter(Boolean).join(" ").toLowerCase();
  }
  // Kiszerelés "5 l" / "5 literes" / "750 ml" → {qty, unit} a pontos méret-szűréshez.
  function normUnit(u) {
    u = String(u || "").toLowerCase();
    if (/^ml/.test(u)) return "ml";
    if (/^(l|liter)/.test(u)) return "l";
    if (/^(kg|kilo)/.test(u)) return "kg";
    if (/^(dkg|deka)/.test(u)) return "dkg";
    if (/^(g|gramm)/.test(u)) return "g";
    if (/^(db|darab)/.test(u)) return "db";
    if (/^(m2|m²|négyz|negyz)/.test(u)) return "m2";
    return u;
  }
  function parsePack(s) {
    s = String(s == null ? "" : s).toLowerCase().trim();
    const m = s.match(/([\d]+(?:[.,][\d]+)?)\s*([a-zá-ű²2]*)/);
    if (!m) return null;
    const qty = parseFloat(m[1].replace(",", "."));
    if (isNaN(qty)) return null;
    return { qty, unit: normUnit(m[2]) };
  }
  function sizeMatch(filterSize, kiszereles) {
    const fp = parsePack(filterSize); if (!fp) return false;
    const rp = parsePack(kiszereles); if (!rp) return false;
    if (Math.abs(rp.qty - fp.qty) > 1e-9) return false;
    if (fp.unit && rp.unit && fp.unit !== rp.unit) return false;
    return true;
  }

  // Egy ár új értéke a kért ár-művelet szerint.
  function computePrice(val, intent) {
    let r;
    if (intent.operation === "price_multiply") {
      const f = Number(intent.factor);
      if (!isFinite(f) || f <= 0) return null;
      r = Math.round(val * f / 10) * 10;
    } else if (intent.operation === "price_round") {
      const step = Number(intent.round_to) || 10;
      const m = intent.round_mode;
      r = m === "up" ? Math.ceil(val / step) * step : m === "down" ? Math.floor(val / step) * step : Math.round(val / step) * step;
    } else if (intent.operation === "price_psychological") {
      const e = (Number(intent.psych_ending) === 99) ? 99 : 90;
      const h = Math.round(val / 100) * 100;
      r = h - (100 - e);
      if (r <= 0) r = e;
    } else if (intent.operation === "set_price") {
      const v = Number(intent.price_value);
      if (!isFinite(v) || v < 0) return null;
      r = v;
    } else { return null; }
    r = Math.round(r);
    if (r > 99999) r = 99999;
    if (r < 0) r = 0;
    return r;
  }

  // Mely címkék (indexek) érintettek a target alapján.
  function resolveTargets(intent) {
    const data = validatedData || [];
    const t = (intent && intent.target) || { mode: "all" };
    let idx = data.map((_, i) => i);
    if (t.mode === "numbers" && Array.isArray(t.numbers)) {
      const set = new Set(t.numbers.map(n => Number(n) - 1));
      idx = idx.filter(i => set.has(i));
    } else if (t.mode === "filter" && t.filter) {
      const f = t.filter;
      const brand = f.brand ? String(f.brand).toLowerCase() : null;
      const keyword = f.keyword ? String(f.keyword).toLowerCase() : null;
      const size = f.size ? String(f.size) : null;
      const pmin = (f.price_min != null) ? Number(f.price_min) : null;
      const pmax = (f.price_max != null) ? Number(f.price_max) : null;
      idx = idx.filter(i => {
        const row = data[i];
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

  // Egy szöveg átalakítása a kért text_op szerint.
  function transformText(cur, intent) {
    const op = intent.text_op;
    const addText = (intent.replace != null && intent.replace !== "") ? String(intent.replace)
      : (intent.find != null ? String(intent.find) : "");
    if (op === "uppercase") return cur.toUpperCase();
    if (op === "lowercase") return cur.toLowerCase();
    if (op === "truncate") { const ml = Number(intent.max_len) || 20; return cur.slice(0, ml).trim(); }
    if (op === "append") { if (!addText) return cur; const sep = (cur && !/\s$/.test(cur) && !/^[\s.,!?;:)\-]/.test(addText)) ? " " : ""; return cur + sep + addText; }
    if (op === "prepend") { if (!addText) return cur; const sep = (cur && !/^\s/.test(cur) && !/\s$/.test(addText)) ? " " : ""; return addText + sep + cur; }
    if (op === "remove" && intent.find) return cur.split(intent.find).join("").replace(/\s+/g, " ").trim();
    if (op === "replace" && intent.find != null) return cur.split(intent.find).join(intent.replace || "");
    return cur;
  }
  // edit_text: alapból a TELJES néven dolgozik; csak konkrét sor-mező megadásakor egy soron.
  function planText(row, intent) {
    const col = intent.text_column;
    if (col && TEXT_COLS.includes(col)) {
      const cur = String(row[col] == null ? "" : row[col]);
      const next = transformText(cur, intent);
      if (next === cur) return null;
      return { kind: "line", col, before: cur || "—", after: next || "—", value: next };
    }
    const cur = nameOf(row);
    const next = transformText(cur, intent);
    if (next === cur) return null;
    return { kind: "name", before: cur || "—", after: next || "—", value: next };
  }

  // A teljes terv: érintett indexek + soronkénti változás (before/after + apply).
  function planChanges(intent) {
    const data = validatedData || [];
    const op = intent.operation;
    const changes = [];

    // custom_edit (szabad mezőszerkesztés): a modell adja a kívánt mező-értékeket címkénként.
    // A kód whitelist-szűr, validál, ÉS NEM tördel újra (a modell sorait megtartjuk).
    if (op === "custom_edit") {
      const arr = Array.isArray(intent.edits) ? intent.edits.slice(0, 200) : [];
      arr.forEach(ed => {
        const i = Number(ed && ed.n) - 1;
        const row = data[i];
        if (!row || !ed.fields || typeof ed.fields !== "object") return;
        const fields = ed.fields;
        const hasLines = NAME_LINE_COLS.some(c => c in fields);
        // Megnevezés CSAK akkor, ha nincs explicit sor-mező (különben a sorok nyernek).
        if (("Megnevezés" in fields) && !hasLines) {
          const val = String(fields["Megnevezés"] == null ? "" : fields["Megnevezés"]);
          const cur = nameOf(row);
          if (cur !== val) changes.push({ i, rowLabel: (i + 1) + ". · név", before: cut(cur || "—", 26), after: cut(val || "—", 26), apply: r => applyNameToRow(r, val) });
        }
        Object.keys(fields).forEach(col => {
          if (col === "Megnevezés") return;
          if (!FIELD_COLS.includes(col)) return; // csak engedélyezett mezők
          let val = fields[col]; val = (val == null) ? "" : String(val);
          if ((col === "Ár" || col === "Akciós_ár") && val !== "" && parsePrice(val) === null) return; // ár csak szám
          const cur = String(row[col] == null ? "" : row[col]);
          if (cur === val) return;
          changes.push({ i, rowLabel: (i + 1) + ". · " + col, before: cut(cur || "—", 26), after: cut(val || "—", 26), apply: r => { r[col] = val; } });
        });
      });
      return { indices: [...new Set(changes.map(c => c.i))], changes, needsReprocess: false };
    }

    const indices = resolveTargets(intent);
    indices.forEach(i => {
      const row = data[i];
      if (op === "set_price") {
        // Konkrét ár beállítása — akkor is, ha eddig NEM volt ár a címkén.
        const np = computePrice(0, intent);
        if (np === null) return;
        const val = parsePrice(row["Ár"]);
        if (val !== null && Math.round(val) === np) return;
        const before = (val !== null && val > 0) ? formatPrice(String(Math.round(val))) + " Ft" : "nincs ár";
        changes.push({ i, before, after: formatPrice(String(np)) + " Ft", apply: r => { r["Ár"] = String(np); } });
      } else if (PRICE_OPS.includes(op)) {
        // Szorzás / kerekítés / lélektani ár — ezekhez kell meglévő érvényes ár.
        const val = parsePrice(row["Ár"]);
        if (val === null || val <= 0) return;
        const np = computePrice(val, intent);
        if (np === null || np === Math.round(val)) return;
        changes.push({ i, before: formatPrice(String(Math.round(val))) + " Ft", after: formatPrice(String(np)) + " Ft", apply: r => { r["Ár"] = String(np); } });
      } else if (op === "set_sale") {
        const base = parsePrice(row["Ár"]);
        let sv = null;
        if (intent.sale_value != null) sv = Math.round(Number(intent.sale_value));
        else if (intent.sale_factor != null && base !== null) sv = Math.round(base * Number(intent.sale_factor) / 10) * 10;
        if (sv === null || !isFinite(sv) || sv <= 0) return;
        const curS = parsePrice(row["Akciós_ár"]);
        if (curS !== null && Math.round(curS) === sv) return;
        changes.push({ i, before: curS ? formatPrice(String(Math.round(curS))) + " Ft" : "nincs akció", after: formatPrice(String(sv)) + " Ft akció", apply: r => { r["Akciós_ár"] = String(sv); } });
      } else if (op === "clear_sale") {
        const curS = parsePrice(row["Akciós_ár"]);
        if (curS === null) return;
        changes.push({ i, before: formatPrice(String(Math.round(curS))) + " Ft", after: "nincs akció", apply: r => { r["Akciós_ár"] = ""; } });
      } else if (op === "set_field") {
        const col = resolveFieldCol(intent.field);
        if (!col) return;
        const val = (intent.field_value == null) ? "" : String(intent.field_value);
        if (col === "__NAME__") {
          const cur = nameOf(row);
          if (cur === val) return;
          changes.push({ i, before: cut(cur || "—", 22), after: cut(val || "—", 22), apply: r => applyNameToRow(r, val) });
        } else {
          const cur = String(row[col] == null ? "" : row[col]);
          if (cur === val) return;
          changes.push({ i, before: cut(cur || "—", 22), after: cut(val || "—", 22), apply: r => { r[col] = val; } });
        }
      } else if (op === "edit_text") {
        const res = planText(row, intent);
        if (res === null) return;
        if (res.kind === "name") {
          changes.push({ i, before: cut(res.before, 22), after: cut(res.after, 22), apply: r => applyNameToRow(r, res.value) });
        } else {
          changes.push({ i, before: cut(res.before, 22), after: cut(res.after, 22), apply: r => { r[res.col] = res.value; } });
        }
      }
    });
    // Tartalmi módosításnál (név/cikkszám/kiszerelés/szöveg) a backend újratördel/normalizál,
    // ezért ugyanazon az úton megyünk, mint az adattábla „Mentés és generálás" gombja.
    const needsReprocess = (op === "set_field" || op === "edit_text");
    return { indices: changes.map(c => c.i), changes, needsReprocess };
  }

  function highlightLabels(indices, cls) {
    const els = document.querySelectorAll("#labels .label");
    indices.forEach(i => { if (els[i]) els[i].classList.add(cls); });
    if (indices.length && els[indices[0]]) els[indices[0]].scrollIntoView({ behavior: "smooth", block: "center" });
  }
  function clearHighlight(cls) {
    document.querySelectorAll("#labels ." + cls).forEach(el => el.classList.remove(cls));
  }
  // A névsorok, amikből a backend a Megnevezést újraépíti (Ditallnál + Negyedik_sor).
  const NAME_LINE_COLS = ["Első_sor", "Második_sor", "Harmadik_sor"];
  function buildRawRow(row) {
    return {
      "Megnevezés": NAME_LINE_COLS.map(c => row[c] || "").filter(s => s).join(" ").trim(),
      "Kiszerelés": row["Kiszerelés"] || "",
      "Ár": row["Ár"] || "",
      "Akciós_ár": row["Akciós_ár"] || "",
      "EAN-13": row["EAN-13"] || "",
      "Cikkszám": row["Cikkszám"] || "",
    };
  }
  // Ugyanaz az út, mint az adattábla „Mentés és generálás" gombja: a backend
  // (`/api/process-labels`) újratördeli a nevet, normalizál és újraszámol.
  function cimbiReprocess(onDone) {
    if (typeof validateWithAgent !== "function") { renderLabels(validatedData); if (onDone) onDone(); return; }
    const raw = (validatedData || []).map(buildRawRow);
    validateWithAgent(raw, (correctedData) => {
      validatedData = correctedData;
      renderLabels(correctedData);
      if (typeof onDone === "function") onDone();
    });
  }
  function applyPlan(plan, onDone) {
    undoSnapshot = JSON.parse(JSON.stringify(validatedData));
    plan.changes.forEach(c => { c.apply(validatedData[c.i]); });
    if (plan.needsReprocess) {
      // Tartalmi módosítás → a backend feldolgozó úton (név-tördelés, normalizálás).
      cimbiReprocess(onDone);
      return;
    }
    // Csak ár változott → gyors helyi újraszámolás + render (nincs hálózati kör).
    plan.changes.forEach(c => {
      const r = validatedData[c.i];
      if (typeof recalculateUnitPrice === "function") {
        const u = recalculateUnitPrice(r["Kiszerelés"], r["Ár"]);
        r["Ft/l"] = u.ftl; r["Ft/kg"] = u.ftkg;
        if ("ftm2" in u) r["Ft/m2"] = u.ftm2;
      }
    });
    renderLabels(validatedData);
    if (typeof onDone === "function") onDone();
  }
  function undo() {
    if (!undoSnapshot) return;
    validatedData = undoSnapshot; undoSnapshot = null;
    renderLabels(validatedData);
  }

  function iconFor(op) {
    if (op === "price_round" || op === "price_psychological") return "rotate-ccw";
    if (op === "price_multiply") return "trending-up";
    if (op === "set_price") return "pencil";
    if (op === "set_field") return "square-pen";
    if (op === "set_sale") return "badge-percent";
    if (op === "clear_sale") return "circle-x";
    if (op === "edit_text") return "type";
    return "wand-2";
  }

  function buildActionCard(intent, plan) {
    const affected = plan.changes.length;
    const labelCount = new Set(plan.changes.map(c => c.i)).size; // hány külön címke érintett
    const card = document.createElement("div");
    card.className = "cimbi-card";
    let rows = '<div class="cimbi-card-row"><span>Érintett címkék</span><b>' + labelCount + ' db</b></div>';
    plan.changes.slice(0, 3).forEach(c => {
      rows += '<div class="cimbi-card-row"><span>' + escapeAttr(String(c.rowLabel || ((c.i + 1) + '. címke'))) + '</span><b>' + escapeAttr(String(c.before)) + ' → ' + escapeAttr(String(c.after)) + '</b></div>';
    });
    if (affected > 3) rows += '<div class="cimbi-card-row cimbi-card-more"><span></span><b>…és még ' + (affected - 3) + '</b></div>';
    card.innerHTML =
      '<div class="cimbi-card-head"><i data-lucide="' + iconFor(intent.operation) + '"></i><span class="cimbi-card-title"></span><span class="cimbi-card-tag">előnézet</span></div>' +
      rows +
      '<div class="cimbi-card-actions"><button class="cimbi-apply">Alkalmaz a ' + labelCount + ' címkén</button><button class="cimbi-cancel">Mégse</button></div>';
    card.querySelector(".cimbi-card-title").textContent = intent.summary || "Módosítás";
    thread.appendChild(card);
    if (window.lucide) lucide.createIcons();
    scrollDown();
    clearHighlight("cimbi-diff");
    highlightLabels(plan.indices, "cimbi-diff");

    card.querySelector(".cimbi-apply").addEventListener("click", () => {
      const applyBtn = card.querySelector(".cimbi-apply");
      const cancelBtn = card.querySelector(".cimbi-cancel");
      if (applyBtn.disabled) return;
      applyBtn.disabled = true; if (cancelBtn) cancelBtn.disabled = true;
      applyBtn.textContent = plan.needsReprocess ? "Generálás…" : "Alkalmazás…";
      applyPlan(plan, () => {
        clearHighlight("cimbi-diff");
        highlightLabels(plan.indices, "cimbi-diff-applied");
        setTimeout(() => clearHighlight("cimbi-diff-applied"), 1800);
        card.className = "cimbi-msg cimbi-bot cimbi-done";
        card.innerHTML = '<i data-lucide="circle-check"></i><span>Kész — ' + labelCount + ' címke frissítve</span><button class="cimbi-undo"><i data-lucide="rotate-ccw"></i>Visszavonás</button>';
        if (window.lucide) lucide.createIcons();
        card.querySelector(".cimbi-undo").addEventListener("click", () => {
          undo();
          clearHighlight("cimbi-diff-applied");
          card.innerHTML = '<i data-lucide="arrow-back-up"></i><span>Visszavonva.</span>';
          if (window.lucide) lucide.createIcons();
        });
        scrollDown();
      });
    });
    card.querySelector(".cimbi-cancel").addEventListener("click", () => {
      card.remove();
      clearHighlight("cimbi-diff");
      addBot("Rendben, nem módosítok semmit.");
    });
  }

  // ---- Átnézés (lektor) + statisztika: CSAK OLVAS, nem módosít ----
  function eanValid(v) {
    if (typeof validateEan13 === "function") return validateEan13(v);
    const s = String(v == null ? "" : v).replace(/\s/g, "");
    if (!/^\d{13}$/.test(s)) return false;
    let sum = 0; for (let k = 0; k < 12; k++) sum += parseInt(s[k]) * (k % 2 === 0 ? 1 : 3);
    return (10 - (sum % 10)) % 10 === parseInt(s[12]);
  }
  function median(arr) {
    if (!arr.length) return null;
    const a = arr.slice().sort((x, y) => x - y);
    const m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }
  function wordCount(s) { return String(s || "").trim().split(/\s+/).filter(Boolean).length; }

  function runReview(intent) {
    const data = validatedData || [];
    const idx = resolveTargets(intent);
    const noPrice = [], badEan = [], overflow = [];
    const dupCikk = [], oddPrice = [];
    let missingEan = 0;
    const flagged = new Set();

    // dupla cikkszám
    const cikkMap = {};
    idx.forEach(i => {
      const c = String(data[i]["Cikkszám"] == null ? "" : data[i]["Cikkszám"]).trim();
      if (c) (cikkMap[c] = cikkMap[c] || []).push(i);
    });
    Object.keys(cikkMap).forEach(c => {
      if (cikkMap[c].length > 1) { dupCikk.push({ c, nums: cikkMap[c].map(i => i + 1) }); cikkMap[c].forEach(i => flagged.add(i)); }
    });

    // gyanús ár: kiszerelés-csoporton belül kiugró (≥6× / ≤1/6× a medián)
    const groups = {};
    idx.forEach(i => {
      const p = parsePrice(data[i]["Ár"]); if (p == null || p <= 0) return;
      const k = String(data[i]["Kiszerelés"] || "").toLowerCase().replace(/\s/g, ""); if (!k) return;
      (groups[k] = groups[k] || []).push({ i, p });
    });
    Object.values(groups).forEach(g => {
      if (g.length < 3) return;
      const med = median(g.map(x => x.p)); if (!med) return;
      g.forEach(x => { if (x.p >= med * 6 || x.p <= med / 6) { oddPrice.push({ n: x.i + 1, kisz: data[x.i]["Kiszerelés"], ar: formatPrice(String(Math.round(x.p))) }); flagged.add(x.i); } });
    });

    idx.forEach(i => {
      const row = data[i];
      const p = parsePrice(row["Ár"]); const ap = parsePrice(row["Akciós_ár"]);
      if ((p == null || p <= 0) && (ap == null || ap <= 0)) { noPrice.push(i + 1); flagged.add(i); }
      const ean = String(row["EAN-13"] == null ? "" : row["EAN-13"]).trim();
      if (ean === "") { missingEan++; }
      else if (!eanValid(ean)) { badEan.push(i + 1); flagged.add(i); }
      const name = nameOf(row);
      if (name && typeof computeNameLines === "function") {
        const kept = wordCount(computeNameLines(name, row).join(" "));
        if (kept < wordCount(name)) { overflow.push(i + 1); flagged.add(i); }
      }
    });

    const fmtNums = ns => ns.slice(0, 12).join(", ") + (ns.length > 12 ? " …" : "");
    const lines = [];
    if (noPrice.length) lines.push("<li><b>Hiányzó ár</b> (" + noPrice.length + "): " + fmtNums(noPrice) + ". címke</li>");
    if (badEan.length) lines.push("<li><b>Hibás vonalkód</b> (" + badEan.length + "): " + fmtNums(badEan) + ". címke</li>");
    if (dupCikk.length) lines.push("<li><b>Dupla cikkszám</b>: " + dupCikk.slice(0, 6).map(d => escapeAttr(String(d.c)) + " → " + d.nums.join(", ")).join("; ") + "</li>");
    if (oddPrice.length) lines.push("<li><b>Gyanús ár</b> (lehet elgépelt): " + oddPrice.slice(0, 6).map(o => o.n + ". (" + escapeAttr(String(o.kisz || "?")) + ", " + escapeAttr(String(o.ar)) + " Ft)").join("; ") + "</li>");
    if (overflow.length) lines.push("<li><b>Nem fér ki a név</b> (" + overflow.length + "): " + fmtNums(overflow) + ". címke</li>");
    if (missingEan) lines.push("<li><b>Hiányzó vonalkód</b>: " + missingEan + " db (ha szándékos, hagyd figyelmen kívül)</li>");

    clearHighlight("cimbi-review");
    const d = document.createElement("div");
    d.className = "cimbi-msg cimbi-bot cimbi-help";
    if (!lines.length) {
      d.innerHTML = "<b>Átnéztem a " + idx.length + " címkét</b> — nem találtam hibát, minden rendben.";
    } else {
      d.innerHTML = "<b>Átnéztem a " + idx.length + " címkét, ezeket találtam:</b>" +
        '<ul class="cimbi-help-list">' + lines.join("") + "</ul>" +
        (flagged.size ? '<span class="cimbi-help-foot">A megjelölt címkék sárgán villognak. Szólj, ha javítsam valamelyiket.</span>' : "");
      if (flagged.size) highlightLabels([...flagged], "cimbi-review");
    }
    thread.appendChild(d); scrollDown();
  }

  function runStats(intent) {
    const data = validatedData || [];
    const idx = resolveTargets(intent);
    const priced = idx.map(i => ({ i, p: parsePrice(data[i]["Ár"]) })).filter(x => x.p != null && x.p > 0);
    const metric = intent.metric || "count";
    const nm = i => { const n = nameOf(data[i]); return (i + 1) + ". " + (n ? cut(n, 30) : "címke"); };
    let msg;
    if (metric === "count") {
      msg = "Összesen " + idx.length + " címke" + (idx.length !== data.length ? " (a szűrésnek megfelelő)" : "") + ".";
    } else if (metric === "on_sale_count") {
      const n = idx.filter(i => { const a = parsePrice(data[i]["Akciós_ár"]); return a != null && a > 0; }).length;
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
      const best = priced.reduce((a, b) => b.p < a.p ? b : a);
      msg = "A legolcsóbb a " + nm(best.i) + " — " + formatPrice(String(Math.round(best.p))) + " Ft.";
    } else if (metric === "max_price") {
      const best = priced.reduce((a, b) => b.p > a.p ? b : a);
      msg = "A legdrágább a " + nm(best.i) + " — " + formatPrice(String(Math.round(best.p))) + " Ft.";
    } else {
      msg = "Ezt nem tudom kiszámolni.";
    }
    addBot(msg);
  }

  function renderIntent(intent) {
    if (intent.operation === "review") { runReview(intent); return; }
    if (intent.operation === "stats") { runStats(intent); return; }
    if (!KNOWN_OPS.includes(intent.operation)) {
      if (intent.summary) { addBot(intent.summary); } else { showHelp(); }
      return;
    }
    const plan = planChanges(intent);
    if (plan.changes.length === 0) {
      addBot(intent.summary ? ("Ehhez nem találtam módosítható címkét: " + intent.summary) : "Nem találtam módosítható címkét ehhez a kéréshez.");
      return;
    }
    buildActionCard(intent, plan);
  }

  // A betöltött címkék tömör listája a backendnek (sorszám/név feloldáshoz).
  function labelContext() {
    return (validatedData || []).slice(0, 150).map((row, i) => ({
      n: i + 1,
      nev: cut(nameOf(row), 60),
      kisz: String(row["Kiszerelés"] || "").slice(0, 20),
      ar: parsePrice(row["Ár"]),
      akcio: parsePrice(row["Akciós_ár"])
    }));
  }

  async function handleCommand(text) {
    addUser(text);
    clearHighlight("cimbi-review");
    if (text.trim() === "__help__" || /mit tudsz/i.test(text)) { showHelp(); return; }
    if (!validatedData || validatedData.length === 0) { addBot("Előbb tölts fel egy Excelt, utána tudok segíteni."); return; }

    const thinking = addBot("Cimbi gondolkodik…");
    thinking.classList.add("cimbi-thinking");
    try {
      const res = await fetch(`${API_URL}/api/label-command`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ subpage: SUBPAGE, message: text, labels: labelContext() })
      });
      if (typeof handleAuthFailure === "function" && handleAuthFailure(res)) { thinking.remove(); return; }
      if (!res.ok) { thinking.classList.remove("cimbi-thinking"); thinking.textContent = "Most nem értem el a szervert. Próbáld újra."; return; }
      const data = await res.json();
      thinking.remove();
      renderIntent((data && data.intent) || { operation: "unknown", summary: HELP });
    } catch (e) {
      thinking.classList.remove("cimbi-thinking");
      thinking.textContent = "Hiba történt. Próbáld újra.";
    }
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const t = input.value.trim(); if (!t) return;
    input.value = "";
    handleCommand(t);
  });
  chips.addEventListener("click", (e) => {
    const b = e.target.closest(".cimbi-chip"); if (!b) return;
    const cmd = b.dataset.cmd;
    if (cmd === "__help__") { addUser("Mit tudsz?"); showHelp(); }
    else { handleCommand(cmd); }
  });
})();

// =============================================================================
// HELYBEN SZERKESZTÉS – dupla katt egy címkén → a mezők szerkeszthetők (EAN-13 kivételével)
// Ugyanazt a validatedData-t írja, mint a data-tábla és Cimbi. Előnézet helyett azonnal,
// de van undo (snapshot). Ár/Kiszerelés módosításnál újraszámolja az egységárat.
// (Az EA oldalon nincs akciós címke, ezért az Akciós_ár mező egyszerűen nem fordul elő.)
// =============================================================================
(function initInlineEdit() {
  const labelsEl = document.getElementById("labels");
  if (!labelsEl) return;
  const PRICE_FIELDS = ["Ár", "Akciós_ár"];
  const RECALC_FIELDS = ["Ár", "Akciós_ár", "Kiszerelés"];
  let editingIndex = null;
  let undoSnapshot = null;

  function parsePriceLocal(v) { const n = parseFloat(String(v == null ? "" : v).replace(/\s/g, "").replace(",", ".")); return isNaN(n) ? null : n; }
  function labelEls() { return labelsEl.querySelectorAll(".label"); }
  function placeCaretEnd(el) { try { const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); } catch (_) {} }

  function enterEdit(labelEl) {
    if (editingIndex !== null) commitEdit();
    const idx = Array.prototype.indexOf.call(labelEls(), labelEl);
    if (idx < 0 || !validatedData || !validatedData[idx]) return;
    undoSnapshot = JSON.parse(JSON.stringify(validatedData));
    editingIndex = idx;
    labelEl.classList.add("label-editing");
    labelEl.querySelectorAll("[data-edit]").forEach(el => {
      el.setAttribute("contenteditable", "true");
      el.spellcheck = false;
      const field = el.dataset.edit;
      if (PRICE_FIELDS.includes(field)) {
        const raw = parsePriceLocal(validatedData[idx][field]);
        el.textContent = raw == null ? "" : String(Math.round(raw));
      }
    });
    labelEl.addEventListener("keydown", onKeydown);
    labelEl.addEventListener("paste", onPaste);
    labelEl.addEventListener("mousedown", onFieldMouseDown);
    document.addEventListener("mousedown", onDocMouseDown, true);
    addActionBar(labelEl);
  }

  // Látható Kész / Mégse gombok a szerkesztett címkén (a rejtett Enter/Escape mellé)
  function addActionBar(labelEl) {
    if (labelEl.querySelector(".label-edit-actions")) return;
    const bar = document.createElement("div");
    bar.className = "label-edit-actions";
    bar.innerHTML = '<button type="button" class="lea-done">✓ Kész</button><button type="button" class="lea-cancel">✕ Mégse</button>';
    bar.querySelector(".lea-done").addEventListener("click", () => commitEdit());
    bar.querySelector(".lea-cancel").addEventListener("click", () => cancelEdit());
    labelEl.appendChild(bar);
  }

  function readInto(idx, labelEl) {
    let changed = false, recalc = false;
    labelEl.querySelectorAll("[data-edit]").forEach(el => {
      const field = el.dataset.edit;
      let val = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (PRICE_FIELDS.includes(field)) {
        if (val !== "") { const p = parsePriceLocal(val); val = (p == null) ? String(validatedData[idx][field] == null ? "" : validatedData[idx][field]) : String(Math.round(p)); }
      }
      const cur = String(validatedData[idx][field] == null ? "" : validatedData[idx][field]);
      if (cur !== val) { validatedData[idx][field] = val; changed = true; if (RECALC_FIELDS.includes(field)) recalc = true; }
    });
    if (recalc && typeof recalculateUnitPrice === "function") {
      const u = recalculateUnitPrice(validatedData[idx]["Kiszerelés"], validatedData[idx]["Ár"]);
      validatedData[idx]["Ft/l"] = u.ftl; validatedData[idx]["Ft/kg"] = u.ftkg;
      if ("ftm2" in u) validatedData[idx]["Ft/m2"] = u.ftm2;
    }
    return changed;
  }

  function cleanup(labelEl) {
    if (!labelEl) return;
    labelEl.removeEventListener("keydown", onKeydown);
    labelEl.removeEventListener("paste", onPaste);
    labelEl.removeEventListener("mousedown", onFieldMouseDown);
    document.removeEventListener("mousedown", onDocMouseDown, true);
    const bar = labelEl.querySelector(".label-edit-actions");
    if (bar) bar.remove();
  }

  function commitEdit() {
    if (editingIndex === null) return;
    const idx = editingIndex; editingIndex = null;
    const labelEl = labelEls()[idx];
    if (!labelEl) return;
    cleanup(labelEl);
    const changed = readInto(idx, labelEl);
    renderLabels(validatedData);
    if (changed) { showUndoToast(); flashEdited(idx); } else undoSnapshot = null;
  }

  function cancelEdit() {
    if (editingIndex === null) return;
    const labelEl = labelEls()[editingIndex];
    cleanup(labelEl); editingIndex = null; undoSnapshot = null;
    renderLabels(validatedData);
  }

  function onKeydown(e) {
    if (e.key === "Enter") { e.preventDefault(); commitEdit(); }
    else if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
  }
  // Üres mezőbe (ahol csak a ::before placeholder látszik) kattintva a böngésző nem
  // mindig teszi be a kurzort – ezért üres mezőnél kézzel fókuszálunk és a végére állunk.
  function onFieldMouseDown(e) {
    const el = e.target.closest("[data-edit]");
    if (!el) return;
    if ((el.textContent || "").trim() === "") {
      e.preventDefault();
      el.focus();
      placeCaretEnd(el);
    }
  }
  // A szerkesztésből CSAK akkor lépünk ki, ha a címkén KÍVÜL kattintunk.
  // A címkén belüli kattintás (akár nem szerkeszthető részre is) edit módban tart.
  function onDocMouseDown(e) {
    if (editingIndex === null) return;
    const labelEl = labelEls()[editingIndex];
    if (labelEl && labelEl.contains(e.target)) return;
    commitEdit();
  }
  function onPaste(e) {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData("text");
    document.execCommand("insertText", false, text.replace(/\s+/g, " "));
  }

  labelsEl.addEventListener("dblclick", (e) => {
    const labelEl = e.target.closest(".label");
    if (!labelEl || !labelsEl.contains(labelEl)) return;
    const idx = Array.prototype.indexOf.call(labelEls(), labelEl);
    if (editingIndex !== idx) enterEdit(labelEl);
    const editEl = e.target.closest("[data-edit]");
    const focusEl = editEl || labelEl.querySelector("[data-edit]");
    if (focusEl) { focusEl.focus(); placeCaretEnd(focusEl); }
  });

  // Egy kattintás a látható "Szerkesztés" gombra → szerkesztés indítása
  labelsEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".label-edit-btn");
    if (!btn) return;
    const labelEl = btn.closest(".label");
    if (!labelEl || !labelsEl.contains(labelEl)) return;
    const idx = Array.prototype.indexOf.call(labelEls(), labelEl);
    if (editingIndex !== idx) enterEdit(labelEl);
    const focusEl = labelEl.querySelector("[data-edit]");
    if (focusEl) { focusEl.focus(); placeCaretEnd(focusEl); }
  });

  // ---- Undo toast ----
  let toast = null, toastTimer = null;
  function hideToast() { if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; } if (toast) { toast.remove(); toast = null; } }
  function showUndoToast() {
    hideToast();
    toast = document.createElement("div");
    toast.className = "inline-edit-toast";
    toast.innerHTML = '<span>Címke frissítve</span><button type="button">Visszavonás</button>';
    toast.querySelector("button").addEventListener("click", () => {
      if (undoSnapshot) { validatedData = undoSnapshot; undoSnapshot = null; renderLabels(validatedData); }
      hideToast();
    });
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("show"));
    toastTimer = setTimeout(hideToast, 6000);
  }

  // Zöld "Cimbi" effekt a sikeresen szerkesztett címke körül (mint amikor Cimbi módosít)
  function flashEdited(idx) {
    const el = labelEls()[idx];
    if (!el) return;
    el.classList.add("cimbi-diff-applied");
    setTimeout(() => { const e2 = labelEls()[idx]; if (e2) e2.classList.remove("cimbi-diff-applied"); }, 1500);
  }

  // PDF előtt zárjuk le a nyitott szerkesztést
  window.inlineEditFlush = () => { if (editingIndex !== null) commitEdit(); };
})();
