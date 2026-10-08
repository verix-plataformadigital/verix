// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { ToolsModule } from "../../src/modules/tools/tools-module";

describe("ToolsModule external destinations", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders native allowlisted links with opener/referrer protection", () => {
    const track = vi.fn();
    const root = document.createElement("main");

    new ToolsModule({ telemetry: { track } }).mount(root);
    const link = root.querySelector<HTMLAnchorElement>(".tools-external-button");

    expect(link).not.toBeNull();
    if (!link) return;

    expect(link.href).toBe("https://erru.imt-ip.pt/ERRU/");
    expect(link.target).toBe("_blank");
    expect(link.rel).toBe("noopener noreferrer");

    link.click();
    expect(track).toHaveBeenCalledWith("external_tool_open", "ferramentas", {
      source: "IMT-ERRU",
      requested: true
    });
  });
});
