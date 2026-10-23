import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

describe("V2 shell security", () => {
  const html = fs.readFileSync(path.join(root, "v2", "index.html"), "utf8");

  it("usa apenas um entrypoint local como módulo", () => {
    expect(html).toContain('<script type="module" src="./main.ts"></script>');
    expect(html).not.toMatch(/<script\b[^>]*src=["']https?:/i);
  });

  it("mantém CSP restritiva", () => {
    expect(html).toMatch(/Content-Security-Policy/i);
    expect(html).toContain("default-src 'self'");
    expect(html).toContain("object-src 'none'");
    expect(html).toContain("base-uri 'none'");
    expect(html).toContain("form-action 'self'");
    expect(html).toContain("connect-src 'self' https://onilkakbgpklxvxuxmks.supabase.co");
  });

  it("não reintroduz padrões inline perigosos na shell HTML", () => {
    expect(html).not.toMatch(/\bon(?:click|input|change|submit|load|error|keydown|keyup)\s*=/i);
    expect(html).not.toMatch(/javascript\s*:/i);
    expect(html).not.toMatch(/<script\b(?![^>]*type=["']module["'])/i);
  });
});
