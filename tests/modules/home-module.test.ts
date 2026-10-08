// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { HomeModule } from "../../src/modules/home/home-module";
import { MODULES } from "../../src/app/state/module-registry";

describe("HomeModule", () => {
  it("expõe todos os módulos registados e não mostra o placeholder genérico", () => {
    const root = document.createElement("main");
    const selected: string[] = [];

    new HomeModule({
      onNavigate: (module) => selected.push(module)
    }).mount(root);

    const buttons = Array.from(
      root.querySelectorAll<HTMLButtonElement>("button[data-module]")
    );
    const rendered = new Set(buttons.map((button) => button.dataset.module));
    const registered = new Set(MODULES.map((module) => module.id));

    expect(rendered).toEqual(registered);
    expect(root.querySelector(".verix-placeholder")).toBeNull();
    expect(root.textContent).toContain("Consulta de veículo");
  });

  it("navega para o módulo selecionado", () => {
    const root = document.createElement("main");
    const selected: string[] = [];

    new HomeModule({
      onNavigate: (module) => selected.push(module)
    }).mount(root);

    root.querySelector<HTMLButtonElement>('[data-module="vehicle"]')?.click();
    root.querySelector<HTMLButtonElement>('[data-module="legislation"]')?.click();

    expect(selected).toEqual(["vehicle", "legislation"]);
  });
});
