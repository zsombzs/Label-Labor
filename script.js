function getSelectedLogo() {
  const selectedType = document.querySelector('input[name="labelType"]:checked').value;
  return selectedType === "A" ? "ea.png" : "hg.png";
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
      if (index % 24 === 0) {
        pageDiv = document.createElement("div");
        pageDiv.className = "page";
        container.appendChild(pageDiv);
      }
  
      const div = document.createElement("div");
      div.className = "label";

      const logoPath = getSelectedLogo();
  
      const line1 = (row["Első_sor"] || "").substring(0, 20);
      const secondLineText = (row["Második_sor"] || "").substring(0, 10);
      const kiszereles = row["Kiszerelés"] || "";
      const ar = row["Ár"] || "";
      const ftPerL = row["Ft/l"] || "";
      const ftPerKg = row["Ft/kg"] || "";

      // Árak formázása és egységár címke meghatározása
      let price = "";
      let pricePerUnit = "";
      let unitLabel = "";
      if (ar !== "") {
        // Ha van ár
        price = formatPrice(ar);
        if (ftPerL !== "") {
          pricePerUnit = formatPrice(ftPerL);
          unitLabel = "Ft/l";
        } else if (ftPerKg !== "") {
          pricePerUnit = formatPrice(ftPerKg);
          unitLabel = "Ft/kg";
        }
      } else {
        // Ha nincs ár
        price = "";
        if (kiszereles.match(/ml|l/i)) {
          unitLabel = "Ft/l";
        } else if (kiszereles.match(/g|kg/i)) {
          unitLabel = "Ft/kg";
        }
      }

      div.innerHTML = `
        <img src="${logoPath}" class="logo">
        <div class="line1">${line1}</div>
        <div class="line2">
          <span class="left">${secondLineText}</span>
        </div>
        <div class="kiszereles">${kiszereles}</div>
        <div class="line3">${("cikkszám: " + (row["Cikkszám"] || "")).substring(0, 20)}</div>
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
      image: { type: 'jpeg', quality: 1 },
      html2canvas: { scale: 4, useCORS: true, backgroundColor: '#ffffff' },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    html2pdf().set(opt).from(element).save();
}

function downloadTemplate() {
    const link = document.createElement("a");
    link.href = "excel_sablon.xlsm";
    link.download = "excel_sablon.xlsm";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
