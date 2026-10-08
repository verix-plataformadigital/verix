import { describe, expect, it, vi } from "vitest";
import { HttpClient } from "../../src/services/http/http-client";

describe("HttpClient", () => {
  it("distingue respostas HTTP com erro", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ok: false }), { status: 429 })
    );

    const result = await new HttpClient({ fetchImpl }).postJson("/test", {});

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("http");
      expect(result.error.status).toBe(429);
    }
  });

  it("não converte timeout em erro HTTP", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        })
    );

    const result = await new HttpClient({ fetchImpl, timeoutMs: 1 }).postJson("/test", {});

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("timeout");
    }
  });
});
