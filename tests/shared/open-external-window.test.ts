// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { openExternalWindow } from "../../src/shared/browser/open-external-window";

const URL = "https://erru.imt-ip.pt/ERRU/";

describe("openExternalWindow", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens a new context and severs its opener before reporting success", () => {
    const openedWindow = { opener: window, close: vi.fn() } as unknown as WindowProxy;
    const open = vi.spyOn(window, "open").mockReturnValue(openedWindow);

    expect(openExternalWindow(URL)).toBe(true);
    expect(open).toHaveBeenCalledOnce();
    expect(open).toHaveBeenCalledWith(URL, "_blank");
    expect(openedWindow.opener).toBeNull();
    expect(openedWindow.close).not.toHaveBeenCalled();
  });

  it("reports a blocked popup when the browser returns null", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);

    expect(openExternalWindow(URL)).toBe(false);
    expect(open).toHaveBeenCalledWith(URL, "_blank");
  });

  it("returns false when window.open throws", () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => {
      throw new Error("browser denied the request");
    });

    expect(openExternalWindow(URL)).toBe(false);
    expect(open).toHaveBeenCalledWith(URL, "_blank");
  });

  it("closes the new window and reports failure if opener cannot be severed", () => {
    const close = vi.fn();
    const openedWindow = { close } as unknown as WindowProxy;
    Object.defineProperty(openedWindow, "opener", {
      configurable: true,
      set() {
        throw new Error("opener setter failed");
      }
    });
    const open = vi.spyOn(window, "open").mockReturnValue(openedWindow);

    expect(openExternalWindow(URL)).toBe(false);
    expect(open).toHaveBeenCalledWith(URL, "_blank");
    expect(close).toHaveBeenCalledOnce();
  });
});
