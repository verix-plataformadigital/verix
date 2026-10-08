import { describe, expect, it, vi } from "vitest";
import { CinemometerModule } from "../../src/modules/cinemometer/cinemometer-module";

describe("CinemometerModule", () => {
  it("não escreve HTML diretamente e monta a estrutura principal", () => {
    const root = document.createElement("main");
    const telemetry = { track: vi.fn() };

    new CinemometerModule({ telemetry }).mount(root);

    expect(root.querySelector("form.cin-form")).toBeTruthy();
    expect(root.querySelectorAll("select")).toHaveLength(5);
    expect(root.querySelector('input[type="number"]')).toBeTruthy();
  });
});
