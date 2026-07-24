import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Tiszta függvényeket tesztelünk - nem kell böngésző-környezet
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
