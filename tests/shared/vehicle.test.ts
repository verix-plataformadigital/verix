import { describe, expect, it } from "vitest";
import { normalizeAsfDate, normalizePlate } from "../../src/shared/validators/vehicle";

describe("ASF input characterization", () => {
  it("normaliza matrículas como o relay atual", () => {
    expect(normalizePlate(" 12-AB-34 ")).toBe("12AB34");
    expect(normalizePlate("AA 00 BB")).toBe("AA00BB");
  });

  it("rejeita datas fora do formato operacional ASF", () => {
    expect(normalizeAsfDate("2026-10-08")).toBeNull();
    expect(normalizeAsfDate("08/10/2026")).toBeNull();
  });

  it("aceita apenas datas reais no formato YYYY/MM/DD", () => {
    expect(normalizeAsfDate("2026/10/08")).toBe("2026/10/08");
    expect(normalizeAsfDate("2026/02/29")).toBeNull();
    expect(normalizeAsfDate("2026/10/32")).toBeNull();
  });
});
