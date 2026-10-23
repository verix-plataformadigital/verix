// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import {
  LEGISLATION_CATEGORIES,
  LEGISLATION_ITEM_COUNT
} from "../../src/modules/legislation/legislation-data";
import { searchLegislation } from "../../src/modules/legislation/legislation-search";
import { LegislationModule } from "../../src/modules/legislation/legislation-module";

describe("legislation domain", () => {
  it("preserva as 19 categorias e 279 entradas extraídas do legado", () => {
    expect(LEGISLATION_CATEGORIES).toHaveLength(19);
    expect(LEGISLATION_ITEM_COUNT).toBe(279);
    expect(
      LEGISLATION_CATEGORIES.reduce((total, category) => total + category.items.length, 0)
    ).toBe(279);
  });

  it("pesquisa por código e encontra os três registos correspondentes", () => {
    const results = searchLegislation(LEGISLATION_CATEGORIES, "1900820101");
    expect(results).toHaveLength(3);
    expect(new Set(results.map((result) => result.category.id))).toEqual(
      new Set(["legAutoX1"])
    );
  });

  it("a pesquisa é case-insensitive e atravessa descrição", () => {
    const results = searchLegislation(LEGISLATION_CATEGORIES, "pré-tensor");
    expect(results.length).toBeGreaterThan(0);
    expect(
      results.some((result) =>
        result.item.title.includes("CINTO SEGURANÇA AVARIADO")
      )
    ).toBe(true);
  });

  it("renderiza a interface sem recorrer a HTML dinâmico", () => {
    const root = document.createElement("main");
    const track = vi.fn();
    const module = new LegislationModule({ telemetry: { track } });

    module.mount(root);

    expect(root.querySelectorAll(".legislation-category")).toHaveLength(19);
    expect(root.querySelector(".legislation-search")).toBeInstanceOf(HTMLInputElement);
    expect(track).toHaveBeenCalledWith("module_open", "legislacao");

    const first = root.querySelector<HTMLButtonElement>(".legislation-category-button");
    expect(first).not.toBeNull();
    first?.click();

    expect(root.querySelectorAll(".legislation-item")).toHaveLength(11);
  });
});
