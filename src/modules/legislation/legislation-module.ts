import {
  LEGISLATION_CATEGORIES,
  LEGISLATION_ITEM_COUNT,
  type LegislationCategory,
  type LegislationItem
} from "./legislation-data";
import { searchLegislation } from "./legislation-search";
import type { TelemetryService } from "../../services/telemetry/telemetry-service";

export interface LegislationModuleOptions {
  readonly telemetry?: Pick<TelemetryService, "track">;
}

export class LegislationModule {
  private root: HTMLElement | null = null;
  private query = "";
  private openCategory: string | null = null;
  private lastTrackedQuery = "";

  constructor(private readonly options: LegislationModuleOptions = {}) {}

  mount(root: HTMLElement): void {
    this.root = root;
    this.options.telemetry?.track("module_open", "legislacao");
    this.render();
  }

  private render(): void {
    if (!this.root) return;

    const section = document.createElement("section");
    section.className = "legislation-module";
    section.setAttribute("aria-label", "Legislação operacional");

    const head = document.createElement("div");
    head.className = "legislation-head";

    const kicker = document.createElement("span");
    kicker.className = "verix-overline";
    kicker.textContent = "BASE OPERACIONAL";

    const title = document.createElement("h2");
    title.textContent = "Legislação";

    const description = document.createElement("p");
    description.textContent =
      "Pesquisa rápida por infração, artigo, código, palavra-chave ou descrição.";

    head.append(kicker, title, description);

    const searchRow = document.createElement("div");
    searchRow.className = "legislation-search-row";

    const input = document.createElement("input");
    input.type = "search";
    input.className = "legislation-search";
    input.placeholder = "Pesquisar infração, código ou descrição…";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.value = this.query;
    input.setAttribute("aria-label", "Pesquisar legislação");
    input.addEventListener("input", () => {
      this.query = input.value;
      this.openCategory = null;
      this.render();
      const next = this.root?.querySelector<HTMLInputElement>(".legislation-search");
      if (next) {
        next.focus();
        next.setSelectionRange(this.query.length, this.query.length);
      }
    });

    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "legislation-clear";
    clear.textContent = "LIMPAR";
    clear.disabled = !this.query;
    clear.addEventListener("click", () => {
      this.query = "";
      this.openCategory = null;
      this.render();
      this.root?.querySelector<HTMLInputElement>(".legislation-search")?.focus();
    });

    searchRow.append(input, clear);

    const count = document.createElement("div");
    count.className = "legislation-count";

    const results = searchLegislation(LEGISLATION_CATEGORIES, this.query);
    if (this.query.trim()) {
      count.textContent = `${results.length} resultado${results.length === 1 ? "" : "s"} em ${LEGISLATION_ITEM_COUNT} registos`;
      if (this.query.trim() !== this.lastTrackedQuery) {
        this.lastTrackedQuery = this.query.trim();
        this.options.telemetry?.track("legislation_search", "legislacao", {
          queryLength: this.query.trim().length,
          results: results.length
        });
      }
    } else {
      count.textContent = `${LEGISLATION_ITEM_COUNT} registos · ${LEGISLATION_CATEGORIES.length} categorias`;
    }

    section.append(head, searchRow, count);

    if (this.query.trim()) {
      section.append(this.renderResults(results));
    } else {
      section.append(this.renderCategories());
    }

    this.root.replaceChildren(section);
  }

  private renderCategories(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "legislation-categories";

    for (const category of LEGISLATION_CATEGORIES) {
      const card = document.createElement("section");
      card.className = "legislation-category";

      const button = document.createElement("button");
      button.type = "button";
      button.className = "legislation-category-button";
      button.setAttribute("aria-expanded", String(this.openCategory === category.id));

      const textWrap = document.createElement("span");
      textWrap.className = "legislation-category-copy";

      const strong = document.createElement("strong");
      strong.textContent = category.title;

      const small = document.createElement("small");
      small.textContent = `${category.subtitle} · ${category.items.length} registos`;

      textWrap.append(strong, small);

      const arrow = document.createElement("span");
      arrow.className = "legislation-category-arrow";
      arrow.textContent = this.openCategory === category.id ? "−" : "+";

      button.append(textWrap, arrow);
      button.addEventListener("click", () => {
        this.openCategory =
          this.openCategory === category.id ? null : category.id;
        this.options.telemetry?.track("legislation_category_open", "legislacao", {
          category: category.id,
          open: this.openCategory === category.id
        });
        this.render();
      });

      card.append(button);

      if (this.openCategory === category.id) {
        card.append(this.renderItems(category.items));
      }

      wrap.append(card);
    }

    return wrap;
  }

  private renderResults(
    results: readonly { item: LegislationItem; category: LegislationCategory }[]
  ): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "legislation-results";

    if (!results.length) {
      const empty = document.createElement("div");
      empty.className = "legislation-empty";
      empty.textContent = "Não foram encontrados registos para essa pesquisa.";
      wrap.append(empty);
      return wrap;
    }

    for (const result of results) {
      wrap.append(this.renderItem(result.item, result.category));
    }

    return wrap;
  }

  private renderItems(items: readonly LegislationItem[]): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "legislation-items";

    for (const item of items) {
      wrap.append(
        this.renderItem(
          item,
          LEGISLATION_CATEGORIES.find((category) => category.id === item.categoryId)!
        )
      );
    }

    return wrap;
  }

  private renderItem(
    item: LegislationItem,
    category: LegislationCategory
  ): HTMLElement {
    const article = document.createElement("article");
    article.className = "legislation-item";

    const top = document.createElement("div");
    top.className = "legislation-item-top";

    const title = document.createElement("h3");
    title.textContent = item.title;

    const codeWrap = document.createElement("div");
    codeWrap.className = "legislation-code";

    const code = document.createElement("strong");
    code.textContent = item.code;

    const copyCode = document.createElement("button");
    copyCode.type = "button";
    copyCode.textContent = "COPIAR CÓDIGO";
    copyCode.addEventListener("click", () => {
      void this.copy(item.code, "legislation_copy", item, category);
    });

    codeWrap.append(code, copyCode);
    top.append(title, codeWrap);

    const meta = document.createElement("div");
    meta.className = "legislation-meta";
    meta.textContent = `COIMA / LIMITE: ${item.fine || "—"}`;

    const descLabel = document.createElement("span");
    descLabel.className = "legislation-desc-label";
    descLabel.textContent = "DESCRIÇÃO DO AUTO";

    const description = document.createElement("p");
    description.className = "legislation-description";
    description.textContent = item.description || "—";

    const copyDescription = document.createElement("button");
    copyDescription.type = "button";
    copyDescription.className = "legislation-copy-description";
    copyDescription.textContent = "COPIAR DESCRIÇÃO";
    copyDescription.addEventListener("click", () => {
      void this.copy(item.description, "legislation_copy", item, category);
    });

    article.append(
      top,
      meta,
      descLabel,
      description,
      copyDescription
    );

    return article;
  }

  private async copy(
    value: string,
    event: "legislation_copy",
    item: LegislationItem,
    category: LegislationCategory
  ): Promise<void> {
    let copied = false;

    try {
      await navigator.clipboard.writeText(value);
      copied = true;
    } catch {
      copied = this.copyFallback(value);
    }

    this.options.telemetry?.track(event, "legislacao", {
      category: category.id,
      itemId: item.id,
      kind: value === item.code ? "code" : "description",
      copied
    });
  }

  private copyFallback(value: string): boolean {
    const area = document.createElement("textarea");
    area.value = value;
    area.setAttribute("readonly", "true");
    area.className = "legislation-copy-buffer";
    document.body.append(area);
    area.select();

    try {
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      area.remove();
    }
  }
}
