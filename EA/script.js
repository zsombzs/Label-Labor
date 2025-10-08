function getSelectedLogo() {
  const selectedType = document.querySelector('input[name="labelType"]:checked').value;
  return selectedType === "A" ? "assets/ea.png" : "assets/hg.png";
}

document.querySelectorAll('input[name="labelType"]').forEach(radio => {
  radio.addEventListener('change', () => {
    const fileInput = document.getElementById("excelFile");
    if (fileInput.files.length > 0) {
      handleFile({ target: fileInput }); // újrarendereli a címkéket a friss logóval
    }
  });
});

document.getElementById("excelFile").addEventListener("change", handleFile, false);

function handleFile(e) {
  let file = e.target.files[0];
  let reader = new FileReader();
  
  reader.onload = function(event) {
    let data = new Uint8Array(event.target.result);
    let workbook = XLSX.read(data, { type: 'array' });
    let sheet = workbook.Sheets[workbook.SheetNames[0]];
    let json = XLSX.utils.sheet_to_json(sheet);

    renderLabels(json);
  };
  reader.readAsArrayBuffer(file);
}

function formatPrice(price) {
  if (price === null || price === undefined || price === "") return "";
  const num = parseInt(price, 10);
  if (isNaN(num)) return price;
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function renderLabels(data) {
    const container = document.getElementById("labels");
    container.innerHTML = "";
    let pageDiv = null;
  
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
      const thirdLineText = (row["Harmadik_sor"] || "").substring(0, 15);
      const kiszereles = row["Kiszerelés"] || "";
      const ar = row["Ár"] || "";
      const ftPerL = row["Ft/l"] || "";
      const ftPerKg = row["Ft/kg"] || "";

      // Árak formázása és egységár címke meghatározása
      let price = "";
      let pricePerUnit = "";
      let unitLabel = "";
      if (/db$/i.test(kiszereles)) {
        // DB kiszerelés
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
      `;``
  
      pageDiv.appendChild(div);
      // "EAN-13"
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
  });


function generatePDF() {
  const downloadBtn = document.getElementById("downloadBtn");
  const progressContainer = document.getElementById("progressContainer");
  const progressBar = document.getElementById("progressBar");

  // Gomb tiltása
  document.querySelectorAll("button").forEach(btn => btn.disabled = true);

  // Progress bar megjelenítése
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

      // PDF generálás
      createPDF();

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
    filename: "cimkek.pdf",
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
      
      // Minden oldalra oldalszám hozzáadása - középen
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        pdf.setFontSize(10);
        pdf.setTextColor(100, 100, 100);
        
        // Oldalszám középen, alul
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
    link.href = "ea_excel_sablon.xlsm";
    link.download = "ea_excel_sablon.xlsm";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}