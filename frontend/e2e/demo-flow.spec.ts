import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import * as XLSX from "xlsx";

/**
 * Fő folyamat: főoldal → demo-belépés → sablon-feltöltés → címkék → PDF-gomb.
 * Az elvárt címkeszámot a demo sablonból számoljuk, így a sablon szerkesztése
 * nem töri el a tesztet.
 */
const SABLON = "public/subpage-assets/demo/demo_sablon.xlsx";

function expectedCounts() {
  // Az xlsx ESM-buildjében nincs readFile (fs-függő) - Node-dal olvasunk
  const wb = XLSX.read(readFileSync(SABLON), { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]!]!;
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", blankrows: true });
  const dataRows = rows.filter((r) => Object.values(r).some((v) => String(v ?? "").trim() !== ""));
  const num = (v: unknown) => parseFloat(String(v ?? "").replace(",", "."));
  const saleRows = dataRows.filter((r) => num(r["Ár"]) > 0 && num(r["Akciós_ár"]) > 0);
  return { labels: dataRows.length, sales: saleRows.length };
}

test("demo: belépés, feltöltés, címkék, PDF-gomb", async ({ page }) => {
  const { labels, sales } = expectedCounts();

  // A YouTube-beágyazás headless módban beragadhat - blokkoljuk, nem azt teszteljük
  await page.route("**://*.youtube.com/**", (route) => route.abort());
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".hero-title")).toBeVisible();

  // Belépés a login modallal (a demo nyilvános fiókjával - CAPTCHA nélküli út)
  await page.click(".btn-login");
  await page.fill('input[name="username"]', "DEMO");
  await page.fill('input[name="password"]', "labellabor2026");
  await page.click(".login-button");
  await page.waitForURL("**/demo", { timeout: 15_000 });

  // Demo-sáv látszik
  await expect(page.locator(".demo-banner")).toBeVisible();

  // Excel feltöltése
  await page.setInputFiles("#excelFile", SABLON);

  // Ha a validációs modal megjelenik, fogadjuk el a javításokat
  const applyBtn = page.locator(".apply-btn");
  try {
    await applyBtn.waitFor({ state: "visible", timeout: 20_000 });
    await applyBtn.click();
  } catch {
    /* nem volt hiba - nincs modal */
  }

  // Címkék a sablon adatsorai szerint, vízjellel
  await expect(page.locator("#labels .label")).toHaveCount(labels, { timeout: 30_000 });
  await expect(page.locator(".label-watermark").first()).toBeVisible();

  // Akciós címkék (Ár + Akciós_ár együtt kitöltve a sablonban)
  await expect(page.locator(".label-sale")).toHaveCount(sales);

  // A PDF-gomb aktívvá vált
  await expect(page.locator("#downloadBtn")).toBeEnabled();
});
