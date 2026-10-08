import { MODULES, type ModuleDefinition } from "../../app/state/module-registry";

export interface HomeModuleOptions {
  readonly onNavigate: (module: ModuleDefinition["id"]) => void;
}

/**
 * Operational landing page for the V2 shell.
 * All labels and descriptions are inserted as text nodes, never parsed as HTML.
 */
export class HomeModule {
  constructor(private readonly options: HomeModuleOptions) {}

  mount(root: HTMLElement): void {
    const section = document.createElement("section");
    section.className = "home-module";
    section.setAttribute("aria-label", "Centro operacional VÉRIX");

    const heading = document.createElement("header");
    heading.className = "home-module-heading";

    const overline = document.createElement("span");
    overline.className = "verix-overline";
    overline.textContent = "CENTRO OPERACIONAL";

    const title = document.createElement("h1");
    title.textContent = "Acesso operacional";

    const description = document.createElement("p");
    description.textContent =
      "Aceda às consultas e ferramentas de fiscalização a partir de um único espaço.";

    heading.append(overline, title, description);

    const primary = document.createElement("section");
    primary.className = "home-primary-card";
    primary.setAttribute("aria-label", "Consulta de veículo");

    const primaryCopy = document.createElement("div");
    primaryCopy.className = "home-primary-copy";

    const primaryOverline = document.createElement("span");
    primaryOverline.className = "home-primary-overline";
    primaryOverline.textContent = "CONSULTA PRINCIPAL";

    const primaryTitle = document.createElement("h2");
    primaryTitle.textContent = "Consulta de veículo";

    const primaryDescription = document.createElement("p");
    primaryDescription.textContent =
      "Consulte o estado do seguro e abra os canais IMT/RNSI autorizados.";

    primaryCopy.append(primaryOverline, primaryTitle, primaryDescription);

    const primaryAction = document.createElement("button");
    primaryAction.type = "button";
    primaryAction.className = "home-primary-action";
    primaryAction.dataset.module = "vehicle";
    primaryAction.textContent = "ABRIR CONSULTA";
    primaryAction.addEventListener("click", () => this.options.onNavigate("vehicle"));

    primary.append(primaryCopy, primaryAction);

    const toolsHeading = document.createElement("h2");
    toolsHeading.className = "home-tools-heading";
    toolsHeading.textContent = "Ferramentas de trabalho";

    const grid = document.createElement("div");
    grid.className = "home-module-grid";
    grid.setAttribute("aria-label", "Módulos operacionais");

    for (const module of MODULES) {
      if (module.id === "vehicle") continue;

      const button = document.createElement("button");
      button.type = "button";
      button.className = "home-module-card";
      button.dataset.module = module.id;
      button.setAttribute("aria-label", module.label + ": " + module.description);

      const icon = document.createElement("span");
      icon.className = "home-module-card-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = module.icon;

      const label = document.createElement("strong");
      label.textContent = module.label;

      const detail = document.createElement("span");
      detail.className = "home-module-card-description";
      detail.textContent = module.description;

      button.append(icon, label, detail);
      button.addEventListener("click", () => this.options.onNavigate(module.id));
      grid.append(button);
    }

    section.append(heading, primary, toolsHeading, grid);
    root.replaceChildren(section);
  }
}
