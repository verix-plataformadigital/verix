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
});
