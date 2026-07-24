import { defineConfig } from "@playwright/test";

/**
 * E2E a fő folyamatra. Előfeltétel: a backend fusson a 8000-es porton
 * (uvicorn vagy docker compose), és a Supabase-ben létezzen a DEMO user.
 * A Vite dev-szervert a Playwright maga indítja.
 *
 * Explicit 127.0.0.1: macOS-en a "localhost" a Chromiumban IPv6-ra (::1)
 * oldódhat fel, miközben a Vite IPv4-en figyel - ez néma kapcsolódási
 * beragadást okoz. A fix IPv4-cím ezt kizárja.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  use: {
    baseURL: "http://127.0.0.1:5173",
    headless: true,
    trace: "retain-on-failure",
    // A gépre telepített Google Chrome-ot használjuk a csomagolt Chromium
    // helyett - macOS-en a letöltött Chromium bináris Gatekeeper miatt
    // némán beragadhat, a rendszer-Chrome viszont megbízhatóan fut.
    channel: "chrome",
    launchOptions: {
      // Rendszer-proxy kikapcsolása: proxys környezetben a Chromium a
      // localhost-forgalmat is a proxyn át tolná, és némán beragadna.
      args: ["--no-proxy-server"],
    },
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 5173 --strictPort",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
