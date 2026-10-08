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
    expect(block).not.toContain("diag.asfErrorType = 'http_' + httpStatus");
  });
});
