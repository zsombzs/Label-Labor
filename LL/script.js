const API_URL = "https://labelgenerator-production.up.railway.app";

const COMPANY_USERNAME = 'L_L';
let validatedData = null; // Validált adatok tárolása (logo-váltásnál ne fussanak újra)

function getUsername() {
  return COMPANY_USERNAME;
}

function getSelectedLogo() {
  const selectedType = document.querySelector('input[name="labelType"]:checked').value;
  return selectedType === "A" ? "assets/icon.png" : "assets/kek.png";
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
  validatedData = null; // Új fájl → reset validált adatok
  handleFile(e);
}, false);

function handleFile(e) {
  let file = e.target.files[0];
  let reader = new FileReader();

  reader.onload = function(event) {
    let data = new Uint8Array(event.target.result);
    let workbook = XLSX.read(data, { type: 'array' });
    let sheet = workbook.Sheets[workbook.SheetNames[0]];
    let json = XLSX.utils.sheet_to_json(sheet);

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
    const response = await fetch(`${API_URL}/api/process-labels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: data })
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

  summary.textContent = `${validationResult.osszes_hiba} problémát találtunk ${validationResult.issues.length} terméknél. Az alábbiakban javasolt megoldásokat talál. Ha egyetért velük, kattintson a pipa ikonra. A zöld hátterű mezők nem módosíthatók, a kék hátterű mezők szerkeszthetők, ezt a pipa ikon segítségével állíthatja. Ha készen van a módosításokkal, ügyeljen arra, hogy az összes mező háttere zöld legyen.`;

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

      // Auto-javított hibáknál zölden mutatjuk (már alkalmazva)
      const isAutoFixed = hiba.auto_javitott === true;

      item.innerHTML = `
        <div class="field-label">${issue.excel_sor}. sor, ${hiba.oszlop} oszlop</div>
        <div class="error-text">${hiba.hiba}</div>
        <div class="fix-row">
          <input type="text"
            value="${hiba.javitott || hiba.eredeti}"
            id="${inputId}"
            placeholder="Javított érték..."
            ${isAutoFixed ? 'disabled style="border-color: #4caf50"' : ''}>
          <button class="accept-btn"
            id="btn_${inputId}"
            onclick="acceptFix(${issue.row_index}, '${hiba.oszlop}', '${inputId}')">
            ✓
          </button>
        </div>
      `;

      if (isAutoFixed) {
        item.style.backgroundColor = "rgba(76, 175, 80, 0.2)";
        item.dataset.accepted = "true"; // Auto-fix is már elfogadott, de togglelhető
      }

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

  // Toggle: ha már el van fogadva, visszavonjuk
  if (item && item.dataset.accepted === "true") {
    item.dataset.accepted = "false";
    input.disabled = false;
    input.style.borderColor = "";
    item.style.backgroundColor = "";
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
  
      const line1 = (row["Első_sor"] || "").substring(0, 22);
      const secondLineText = (row["Második_sor"] || "").substring(0, 22);
      const thirdLineText = (row["Harmadik_sor"] || "").substring(0, 22);
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
        JsBarcode(barcodeSVG, eanCode.toString(), {
          format: "EAN13",
          lineColor: "#000",
          width: 1,
          height: 20,
          displayValue: true,
          fontSize: 14,
        });
      }
    });
}
  
document.addEventListener("DOMContentLoaded", () => {
  document.querySelector("#downloadBtn").addEventListener("click", generatePDF);
  document.querySelector("#sablonBtn").addEventListener("click", downloadTemplate);
  
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
    filename: "ll_cimkek.pdf",
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
        
        pdf.text(pageText, pageWidth / 2, pageHeight - 3, { align: 'center' });
      }
    })
    .save();
}

function downloadTemplate() {
    const link = document.createElement("a");
    link.href = "ll_excel_sablon.xlsm";
    link.download = "ll_excel_sablon.xlsm";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}