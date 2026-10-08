// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { AppShell } from "../../src/app/ui/app-shell";
import { AppStore } from "../../src/app/state/app-store";

describe("AppShell", () => {
  it("deixa o módulo personalizado controlar o conteúdo da área de trabalho", () => {
    const root = document.createElement("main");
    const store = new AppStore();

    const shell = new AppShell({
      root,
      store,
      moduleRenderer: (workspace, module) => {
        const custom = document.createElement("article");
        custom.className = "custom-module";
        custom.textContent = module;
        workspace.append(custom);
        return true;
      }
    });

    shell.mount();

    expect(root.querySelector(".custom-module")?.textContent).toBe("main");
    expect(root.querySelector(".verix-placeholder")).toBeNull();

    shell.destroy();
  });
  it("permite regressar ao Início depois de abrir outro módulo", () => {
    const root = document.createElement("main");
    const store = new AppStore();
    const shell = new AppShell({
      root,
      store,
      moduleRenderer: (workspace, module) => {
        const content = document.createElement("article");
        content.className = "active-module";
        content.textContent = module;
        workspace.append(content);
        return true;
      }
    });

    shell.mount();

    const vehicleButton = root.querySelector<HTMLButtonElement>(
      '.verix-nav-item[data-module="vehicle"]'
    );
    const homeButton = root.querySelector<HTMLButtonElement>(
      '.verix-nav-item[data-module="main"]'
    );
    expect(vehicleButton).not.toBeNull();
    expect(homeButton).not.toBeNull();
    if (!vehicleButton || !homeButton) {
      shell.destroy();
      return;
    }

    vehicleButton.click();
    expect(root.querySelector(".active-module")?.textContent).toBe("vehicle");

    homeButton.click();
    expect(root.querySelector(".active-module")?.textContent).toBe("main");
    expect(homeButton.getAttribute("aria-current")).toBe("page");

    shell.destroy();
  });

});
