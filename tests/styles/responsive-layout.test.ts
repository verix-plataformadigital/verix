import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(new URL("../../v2/styles.css", import.meta.url), "utf8");
const entrypoint = readFileSync(new URL("../../v2/index.html", import.meta.url), "utf8");

describe("V2 responsive contract", () => {
  it("uses the device viewport and keeps zoom available", () => {
    expect(entrypoint).toMatch(/<meta[^>]+name=["']viewport["'][^>]+width=device-width/);
    expect(entrypoint).not.toMatch(/user-scalable\s*=\s*no|maximum-scale\s*=\s*1/i);
  });

  it("collapses the desktop sidebar and provides a touch-scrollable navigation for tablets", () => {
    expect(stylesheet).toContain("@media (max-width: 1024px)");
    expect(stylesheet).toContain("grid-template-columns: minmax(0, 1fr)");
    expect(stylesheet).toContain("overflow-x: auto");
    expect(stylesheet).toContain("overscroll-behavior-x: contain");
  });

  it("reflows phone forms and avoids iOS input auto-zoom", () => {
    expect(stylesheet).toContain("@media (max-width: 760px)");
    expect(stylesheet).toContain("grid-template-columns: minmax(0, 1fr)");
    expect(stylesheet).toContain("font-size: 16px");
  });

  it("provides local table scrolling and keyboard access instead of page-wide overflow", () => {
    expect(stylesheet).toContain(".tools-table-wrap");
    expect(stylesheet).toContain("max-width: 100%");
    expect(stylesheet).toContain("min-width: 560px");
  });

  it("supports large touch targets, visible focus and reduced-motion preferences", () => {
    expect(stylesheet).toContain("@media (pointer: coarse)");
    expect(stylesheet).toContain("min-height: 44px");
    expect(stylesheet).toContain(":focus-visible");
    expect(stylesheet).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("keeps phone home/district grids readable and uses generous touch targets", () => {
    expect(stylesheet).toContain(".home-module-grid { grid-template-columns: minmax(0, 1fr); }");
    expect(stylesheet).toContain(".tools-district-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }");
    expect(stylesheet).toContain("min-height: 48px;");
    expect(stylesheet).toContain("width: 48px;");
  });


  it("prevents root and shell grid tracks from widening narrow viewports", () => {
    expect(stylesheet).toContain("Keep the shell and its containing blocks bounded by the device viewport.");
    expect(stylesheet).toContain(".verix-shell {\n  width: 100%;\n  max-width: 100%;\n  min-width: 0;\n  grid-template-columns: minmax(0, 1fr);\n  overflow-x: clip;\n}");
    expect(stylesheet).toContain(".verix-nav {\n  width: 100%;\n  max-width: 100%;\n}");
  });


  it("bounds root and shell containing blocks and clips page-level horizontal overflow", () => {
    expect(stylesheet).toContain("Keep the shell and its containing blocks bounded by the device viewport.");
    expect(stylesheet).toContain("#app-root {\n  display: block;\n  width: 100%;\n  max-width: 100%;\n  min-width: 0;\n  overflow-x: clip;\n}");
    expect(stylesheet).toContain("  grid-template-columns: minmax(0, 1fr);\n  overflow-x: clip;\n}");
  });

});