import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("legacy ASF diagnostic regression", () => {
  it("preserves the transport error when HTTP status is null", () => {
    const source = readFileSync("verix-app.html", "utf8");
    const marker = "if (httpStatus === null)";
    const start = source.indexOf(marker);

    expect(start).toBeGreaterThanOrEqual(0);

    const block = source.slice(start, start + 1400);

    expect(block).toContain("diag.asfAttempts");
    expect(block).toContain("lastAttempt.errorType");
    const nullStatusEnd = block.indexOf("if (httpStatus < 200 || httpStatus >= 300)");
    expect(nullStatusEnd).toBeGreaterThan(0);
    expect(block.slice(0, nullStatusEnd)).not.toContain(
      "diag.asfErrorType = 'http_' + httpStatus"
    );
  });
});
