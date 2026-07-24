import { describe, expect, it } from "vitest";
import {
  applyUnitPrices,
  buildRawRow,
  computeNameLines,
  formatPrice,
  nameOf,
  normalizePrice,
  parseKiszereles,
  parsePrice,
  recalculateUnitPrice,
  splitName,
  validateEan13,
} from "./labelUtils";

describe("formatPrice", () => {
  it("ezres tagolás ponttal", () => {
    expect(formatPrice(8990)).toBe("8.990");
    expect(formatPrice("12345")).toBe("12.345");
    expect(formatPrice(999)).toBe("999");
  });
  it("üres/érvénytelen érték változatlan", () => {
    expect(formatPrice("")).toBe("");
    expect(formatPrice(null)).toBe("");
    expect(formatPrice("abc")).toBe("abc");
  });
});

describe("normalizePrice", () => {
  it("a 0 minden formája üres (kézzel írják rá az árat)", () => {
    expect(normalizePrice(0)).toBe("");
    expect(normalizePrice("0")).toBe("");
    expect(normalizePrice("0.00")).toBe("");
    expect(normalizePrice("0,00")).toBe("");
  });
  it("nem nulla ár változatlan", () => {
    expect(normalizePrice("8990")).toBe("8990");
    expect(normalizePrice(123)).toBe("123");
  });
});

describe("parsePrice", () => {
  it("szóközös és vesszős formátumok", () => {
    expect(parsePrice("8 990")).toBe(8990);
    expect(parsePrice("12,5")).toBe(12.5);
    expect(parsePrice("999")).toBe(999);
  });
  it("érvénytelen → null", () => {
    expect(parsePrice("")).toBeNull();
    expect(parsePrice("ár")).toBeNull();
  });
});

describe("recalculateUnitPrice (standard)", () => {
  it("ml → Ft/l", () => {
    expect(recalculateUnitPrice("400 ml", "1000")).toEqual({ ftl: "2500", ftkg: "", ftm2: "" });
  });
  it("l → Ft/l", () => {
    expect(recalculateUnitPrice("5 l", "12990")).toEqual({ ftl: "2598", ftkg: "", ftm2: "" });
  });
  it("g → Ft/kg", () => {
    expect(recalculateUnitPrice("500 g", "1500")).toEqual({ ftl: "", ftkg: "3000", ftm2: "" });
  });
  it("kg → Ft/kg", () => {
    expect(recalculateUnitPrice("5 kg", "3290")).toEqual({ ftl: "", ftkg: "658", ftm2: "" });
  });
  it("db / üres / hibás → üres egységárak", () => {
    expect(recalculateUnitPrice("db", "2490")).toEqual({ ftl: "", ftkg: "", ftm2: "" });
    expect(recalculateUnitPrice("", "100")).toEqual({ ftl: "", ftkg: "", ftm2: "" });
    expect(recalculateUnitPrice("5 l", "0")).toEqual({ ftl: "", ftkg: "", ftm2: "" });
  });
});

describe("recalculateUnitPrice (ditall)", () => {
  it("m2 → Ft/m2", () => {
    expect(recalculateUnitPrice("5 m2", "10000", "ditall")).toEqual({ ftl: "", ftkg: "", ftm2: "2000" });
  });
  it("standard módban a m2 nem értelmezett", () => {
    expect(recalculateUnitPrice("5 m2", "10000", "standard")).toEqual({ ftl: "", ftkg: "", ftm2: "" });
  });
  it("ditall módban az l is működik", () => {
    expect(recalculateUnitPrice("2 l", "5000", "ditall")).toEqual({ ftl: "2500", ftkg: "", ftm2: "" });
  });
});

describe("applyUnitPrices", () => {
  it("standard: Ft/m2 kulcs nem jön létre", () => {
    const row: Record<string, string | number | undefined> = {};
    applyUnitPrices(row, { ftl: "100", ftkg: "", ftm2: "" }, "standard");
    expect(row["Ft/l"]).toBe("100");
    expect("Ft/m2" in row).toBe(false);
  });
  it("ditall: Ft/m2 is íródik", () => {
    const row: Record<string, string | number | undefined> = {};
    applyUnitPrices(row, { ftl: "", ftkg: "", ftm2: "2000" }, "ditall");
    expect(row["Ft/m2"]).toBe("2000");
  });
});

describe("parseKiszereles", () => {
  it("ml: liter is számolódik", () => {
    expect(parseKiszereles("400 ml")).toMatchObject({ ml: "400", l: "0.4" });
  });
  it("kg: gramm is számolódik", () => {
    expect(parseKiszereles("2 kg")).toMatchObject({ kg: "2", g: "2000" });
  });
  it("csak 'db'", () => {
    expect(parseKiszereles("db")).toMatchObject({ db: "db" });
  });
  it("m2 (ditall mező)", () => {
    expect(parseKiszereles("5 m2")).toMatchObject({ m2: "5" });
  });
  it("üres bemenet", () => {
    expect(parseKiszereles("")).toMatchObject({ ml: "", l: "", kg: "", g: "", db: "" });
  });
});

describe("validateEan13", () => {
  it("érvényes check digit", () => {
    expect(validateEan13("5901234123457")).toBe(true);
    expect(validateEan13("4006381333931")).toBe(true);
  });
  it("hibás check digit", () => {
    expect(validateEan13("5901234123456")).toBe(false);
  });
  it("rossz hossz/formátum", () => {
    expect(validateEan13("12345")).toBe(false);
    expect(validateEan13("59012341234ab")).toBe(false);
  });
  it("üres = rendben (nincs vonalkód)", () => {
    expect(validateEan13("")).toBe(true);
    expect(validateEan13(undefined)).toBe(true);
  });
});

describe("splitName / computeNameLines", () => {
  it("szavanként tördel a limitig", () => {
    expect(splitName("Héra beltéri falfesték fehér", 3, 18)).toEqual([
      "Héra beltéri",
      "falfesték fehér",
      "",
    ]);
  });
  it("nagybetűs név szigorúbb limitet kap (18), kisbetűs lazábbat (20)", () => {
    const upper = computeNameLines("HOSSZÚ NAGYBETŰS TERMÉKNÉV PÉLDA");
    const lower = computeNameLines("hosszú kisbetűs terméknév példa");
    expect(upper[0]!.length).toBeLessThanOrEqual(18);
    expect(lower[0]!.length).toBeLessThanOrEqual(20);
  });
  it("a limitbe nem férő szavak levágódnak a maxLines után", () => {
    const lines = splitName("egy ketto harom negy ot hat het nyolc kilenc tiz", 3, 10);
    expect(lines).toHaveLength(3);
  });
});

describe("nameOf / buildRawRow", () => {
  it("a név a sor-mezőkből áll össze", () => {
    expect(nameOf({ Első_sor: "Héra beltéri", Második_sor: "falfesték", Harmadik_sor: "" })).toBe(
      "Héra beltéri falfesték",
    );
  });
  it("üres soroknál a Megnevezés a fallback", () => {
    expect(nameOf({ Megnevezés: "Termék" })).toBe("Termék");
  });
  it("buildRawRow: Szín csak ha kérjük (Ditall)", () => {
    const row = { Első_sor: "A", Kiszerelés: "1 l", Ár: "100", "EAN-13": "", Cikkszám: "X", Szín: "kék" };
    expect("Szín" in buildRawRow(row)).toBe(false);
    expect(buildRawRow(row, true)["Szín"]).toBe("kék");
  });
});
