// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { CinemometerModule } from "../../src/modules/cinemometer/cinemometer-module";
import { CinemometerProfileService } from "../../src/modules/cinemometer/cinemometer-profile-service";

describe("CinemometerModule", () => {
  it("não escreve HTML diretamente e monta a estrutura principal", () => {
    const root = document.createElement("main");
    const telemetry = { track: vi.fn() };
    const storage = new Map<string, string>();
    const profiles = new CinemometerProfileService({
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value); },
      removeItem: (key: string) => { storage.delete(key); }
    });

    new CinemometerModule({ telemetry, profiles }).mount(root);

    expect(root.querySelector("form.cin-form")).toBeTruthy();
    expect(root.querySelector(".cin-context")).toBeTruthy();
    expect(root.querySelectorAll("select")).toHaveLength(6);
    expect(root.querySelector('input[type="number"]')).toBeTruthy();
  });
});
