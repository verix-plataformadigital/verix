import type { AppState } from "../state/app-state";
import type { AppStore } from "../state/app-store";
import { MODULES, moduleById } from "../state/module-registry";

export interface AppShellOptions {
  readonly root: HTMLElement;
  readonly store: AppStore;
}

export class AppShell {
  private readonly root: HTMLElement;
  private readonly store: AppStore;
  private readonly workspace: HTMLElement;
  private readonly status: HTMLElement;
  private readonly navButtons = new Map<string, HTMLButtonElement>();
  private unsubscribe: (() => void) | null = null;

  constructor(options: AppShellOptions) {
    this.root = options.root;
    this.store = options.store;

    const shell = document.createElement("div");
    shell.className = "verix-shell";

    const header = document.createElement("header");
    header.className = "verix-header";

    const brand = document.createElement("div");
    brand.className = "verix-brand";
    brand.innerHTML = "<span class="verix-mark">V</span><div><strong>VÉRIX</strong><small>reengenharia 2</small></div>";

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
      button.innerHTML = "<span class="verix-nav-icon" aria-hidden="true">" +
        module.icon +
        "</span><span class="verix-nav-label">" +
        module.label +
        "</span>";
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
