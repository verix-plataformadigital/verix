// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { ToolsModule } from "../../src/modules/tools/tools-module";

describe("ToolsModule external destinations", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("records successful opening for an isolated external destination", () => {
    const track = vi.fn();
    const openedWindow = { opener: window } as unknown as WindowProxy;
    const open = vi.spyOn(window, "open").mockReturnValue(openedWindow);
    const root = document.createElement("main");

    new ToolsModule({ telemetry: { track } }).mount(root);
    root.querySelector<HTMLButtonElement>(".tools-external-button")?.click();

    expect(open).toHaveBeenCalledWith("https://erru.imt-ip.pt/ERRU/", "_blank");
    expect(openedWindow.opener).toBeNull();
    expect(track).toHaveBeenCalledWith("external_tool_open", "ferramentas", {
      source: "IMT-ERRU",
      opened: true
    });
  });

  it("records a blocked popup accurately", () => {
    const track = vi.fn();
    vi.spyOn(window, "open").mockReturnValue(null);
    const root = document.createElement("main");

    new ToolsModule({ telemetry: { track } }).mount(root);
    root.querySelector<HTMLButtonElement>(".tools-external-button")?.click();

    expect(track).toHaveBeenCalledWith("external_tool_open", "ferramentas", {
      source: "IMT-ERRU",
      opened: false
    });
  });
});
