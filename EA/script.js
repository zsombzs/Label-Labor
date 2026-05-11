const API_URL = "https://labelgenerator-production.up.railway.app";

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
      // Ha már validált adatok vannak, csak újra renderelünk
      renderLabels(validatedData);
    }
  });
});

document.getElementById("excelFile").addEventListener("change", function(e) {
  validatedData = null;
  handleFile(e.target.files[0]);
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: data, subpage: "ea" })
    });

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

  summary.textContent = `${validationResult.osszes_hiba} problémát találtunk ${validationResult.issues.length} terméknél. Az alábbiakban javasolt javításokat talál. A kisebb hibákat a rendszer automatikusan kijavítja — a pipa ikonnal lehet jóváhagyni. Ha szükséges, manuálisan is módosítható bármelyik adat. Az összes mező jóváhagyása után kattintson a "Javítások alkalmazása" gombra.`;

  issuesList.innerHTML = "";

  // Soronként jelenítjük meg a hibákat (Excel sor sorrendben)
  validationResult.issues.forEach(issue => {
    const card = document.createElement("div");
    card.className = "issue-card";
    card.innerHTML = `<div class="product-name">${issue.excel_sor}. sor — ${issue.termek}</div>`;

    issue.hibak.forEach((hiba, hibaIdx) => {
      const item = document.createElement("div");
      item.className = "issue-item";
      const inputId = `fix_${issue.row_index}_${hibaIdx}`;

      item.innerHTML = `
        <div class="field-label">${issue.excel_sor}. sor, ${hiba.oszlop} oszlop</div>
        <div class="error-text">${hiba.hiba}</div>
        <div class="fix-row">
          <input type="text"
            value="${hiba.javitott || hiba.eredeti}"
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

      card.appendChild(item);
    });

    issuesList.appendChild(card);
  });

  // A feldolgozott adatokat tároljuk (már normalizálva vannak)
  overlay._data = JSON.parse(JSON.stringify(validationResult.processed_rows));

  overlay.classList.add("active");

  document.getElementById("applyFixesBtn").onclick = () => {
    overlay.classList.remove("active");
    onComplete(overlay._data);
  };

  document.getElementById("skipValidationBtn").onclick = () => {
    overlay.classList.remove("active");
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

function renderLabels(data) {
    const container = document.getElementById("labels");
    container.innerHTML = "";
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
        <div class="line1">${line1}</div>
        <div class="line2">${secondLineText}</div>
        <div class="line3">${thirdLineText}</div> 
        <div class="kiszereles">${kiszereles}</div>
        <div class="line4">${("cikkszám: " + (row["Cikkszám"] || "")).substring(0, 24)}</div>
        <div class="barcode-container">
          <svg class="barcode"></svg>
        </div>
        <div class="bottom">
            <div class="price-box1">
            <span class="amount">${price}</span>
            <span class="unit">,- Ft</span>
            </div>
            <div class="price-box2">
              <span class="amount">${pricePerUnit}</span>
              <span class="unit">${unitLabel ? ",- " + unitLabel : ""}</span>
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
      }
    });
}
  
document.addEventListener("DOMContentLoaded", () => {
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
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, count }),
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
    const response = await fetch(`${API_URL}/api/company-label-count/${username}`);
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

      document.querySelectorAll("button").forEach(btn => btn.disabled = false);
    }
  }, interval);
}

function createPDF() {
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
    html2canvas: { scale: 3, useCORS: true, backgroundColor: '#ffffff' },
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
  { key: "Ár",           editable: true  },
  { key: "Első_sor",     editable: true  },
  { key: "Második_sor",  editable: true  },
  { key: "Harmadik_sor", editable: true  },
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
    .replace(/"/g, "&quot;");
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
