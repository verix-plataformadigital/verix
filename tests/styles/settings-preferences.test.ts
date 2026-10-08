import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(new URL("../../v2/styles.css", import.meta.url), "utf8");

describe("V2 persisted presentation preferences", () => {
  it("defines responsive layout rules for every density option", () => {
    expect(stylesheet).toContain("body.ui-compact .verix-workspace");
    expect(stylesheet).toContain("body.ui-normal .verix-workspace");
    expect(stylesheet).toContain("body.ui-comfortable .verix-workspace");
  });

  it("binds HUD and transition preferences to visible presentation", () => {
    expect(stylesheet).toContain("body.no-hud .verix-status");
    expect(stylesheet).toContain("body.no-transitions *");
    expect(stylesheet).toContain("transition: none !important");
  });

  it("keeps light theme controls readable and uses the light native control scheme", () => {
    expect(stylesheet).toContain("body.theme-light");
    expect(stylesheet).toContain("color-scheme: light");
    expect(stylesheet).toContain("body.theme-light .verix-workspace input");
  });
});
