// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { SettingsModule } from "../../src/modules/settings/settings-module";
import { SETTINGS_KEY, SettingsService } from "../../src/modules/settings/settings-service";

describe("SettingsModule", () => {
  it("restores saved values in all select controls on mount", () => {
    const values = new Map<string, string>([
      [SETTINGS_KEY, JSON.stringify({
        profile: "leitura",
        theme: "light",
        density: "comfortable",
        scale: "110",
        hud: false,
        transitions: false,
        history: false,
        cinRadarCollapsed: false
      })]
    ]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); }
    };
    const settings = new SettingsService(storage);
    const root = document.createElement("main");

    new SettingsModule({ settings }).mount(root);

    const selects = Array.from(
      root.querySelectorAll<HTMLSelectElement>(".settings-control select")
    );

    expect(selects.map((select) => select.value)).toEqual([
      "leitura",
      "light",
      "comfortable",
      "110"
    ]);
  });

  it("keeps a changed select value after rerendering the module", () => {
    const values = new Map<string, string>();
    const settings = new SettingsService({
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); }
    });
    const root = document.createElement("main");

    new SettingsModule({ settings }).mount(root);
    const theme = root.querySelector<HTMLSelectElement>(".settings-control select");
    expect(theme).not.toBeNull();
    if (!theme) return;

    theme.value = "light";
    theme.dispatchEvent(new Event("change", { bubbles: true }));

    expect(settings.snapshot().profile).toBe("escudo");
    expect(settings.snapshot().theme).toBe("light");
    expect(root.querySelector<HTMLSelectElement>(".settings-control select")?.value).toBe("escudo");
    expect(root.querySelectorAll<HTMLSelectElement>(".settings-control select")[1]?.value).toBe("light");
  });
});
