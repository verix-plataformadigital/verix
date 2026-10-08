import type { AppState } from "../state/app-state";
import type { AppStore } from "../state/app-store";
import { MODULES, moduleById } from "../state/module-registry";
import type { VerixModule } from "../state/app-state";

export interface AppShellOptions {
  readonly root: HTMLElement;
  readonly store: AppStore;
  readonly moduleRenderer?: (workspace: HTMLElement, module: VerixModule, state: AppState) => boolean;
}

export class AppShell {
  private readonly root: HTMLElement;
  private readonly store: AppStore;
  private readonly workspace: HTMLElement;
  private readonly status: HTMLElement;
  private readonly navButtons = new Map<string, HTMLButtonElement>();
  private readonly moduleRenderer?: AppShellOptions["moduleRenderer"];
  private unsubscribe: (() => void) | null = null;
  private renderedModule: VerixModule | null = null;

  constructor(options: AppShellOptions) {
    this.root = options.root;
    this.store = options.store;
    this.moduleRenderer = options.moduleRenderer;

    const shell = document.createElement("div");
    shell.className = "verix-shell";

    const header = document.createElement("header");
    header.className = "verix-header";

    const brand = document.createElement("div");
    brand.className = "verix-brand";
    const mark = document.createElement("span");
    mark.className = "verix-mark";
    mark.textContent = "V";

    const brandText = document.createElement("div");
    const brandName = document.createElement("strong");
    brandName.textContent = "VÉRIX";
    const brandVersion = document.createElement("small");
    brandVersion.textContent = "v1.4";
    brandText.append(brandName, brandVersion);

    brand.append(mark, brandText);

    this.status = document.createElement("div");
    this.status.className = "verix-status";
    this.status.setAttribute("role", "status");
    this.status.setAttribute("aria-live", "polite");

    header.append(brand, this.status);

    const layout = document.createElement("div");
    layout.className = "verix-layout";

    const nav = document.createElement("nav");
    nav.className = "verix-nav";
    nav.setAttribute("aria-label", "Módulos VÉRIX");

    for (const module of MODULES) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "verix-nav-item";
      button.dataset.module = module.id;
      button.setAttribute("aria-label", module.label);
      const icon = document.createElement("span");
      icon.className = "verix-nav-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = module.icon;

      const label = document.createElement("span");
      label.className = "verix-nav-label";
      label.textContent = module.label;

      button.append(icon, label);
      button.addEventListener("click", () => this.store.setModule(module.id));
      this.navButtons.set(module.id, button);
      nav.append(button);
    }

    this.workspace = document.createElement("section");
    this.workspace.className = "verix-workspace";
    this.workspace.setAttribute("aria-label", "Área de trabalho");

    layout.append(nav, this.workspace);
    shell.append(header, layout);

    this.root.replaceChildren(shell);
  }

  mount(): void {
    this.unsubscribe?.();
    this.unsubscribe = this.store.subscribe((state) => this.render(state));
  }

  destroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private render(state: AppState): void {
    const current = moduleById(state.activeModule);
    const title = current?.label ?? "Início";
    const description = current?.description ?? "Núcleo operacional VÉRIX.";

    for (const [id, button] of this.navButtons) {
      const active = id === state.activeModule;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-current", active ? "page" : "false");
    }

    this.status.dataset.state = state.connectivity;
    this.status.textContent = this.statusLabel(state);

    if (this.renderedModule === state.activeModule && this.workspace.childElementCount > 0) {
      return;
    }

    this.renderedModule = state.activeModule;
    this.workspace.replaceChildren();

    const heading = document.createElement("div");
    heading.className = "verix-workspace-heading";

    const overline = document.createElement("span");
    overline.className = "verix-overline";
    overline.textContent = "MÓDULO";

    const h1 = document.createElement("h1");
    h1.textContent = title;

    const p = document.createElement("p");
    p.textContent = description;

    heading.append(overline, h1, p);

    if (
      this.moduleRenderer?.(
        this.workspace,
        state.activeModule,
        state
      )
    ) {
      return;
    }

    const card = document.createElement("div");
    card.className = "verix-placeholder";
    card.setAttribute("role", "region");
    card.setAttribute("aria-label", title);

    const badge = document.createElement("span");
    badge.className = "verix-badge";
    badge.textContent = state.isBusy ? "A PROCESSAR" : "V2 READY";

    const message = document.createElement("p");
    message.textContent =
      state.activeModule === "main"
        ? "Shell V2 ativa. Os módulos são integrados progressivamente através de adapters."
        : "O motor deste módulo será ligado nesta fase sem alterar a interface operacional."

    card.append(badge, message);
    this.workspace.append(heading, card);
  }

  private statusLabel(state: AppState): string {
    if (state.connectivity === "offline") return "SEM REDE";
    if (state.connectivity === "timeout") return "TIMEOUT";
    if (state.connectivity === "network-error") return "ERRO DE REDE";
    if (state.backendReachable === false || state.connectivity === "backend-offline") {
      return "BACKEND INDISPONÍVEL";
    }
    if (state.backendReachable === true) return "BACKEND ONLINE";
    if (state.connectivity === "online") return "REDE DISPONÍVEL";
    return "A VERIFICAR";
  }
}
