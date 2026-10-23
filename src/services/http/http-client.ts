import type { Result } from "../../shared/types/result";
import { err, ok } from "../../shared/types/result";

export type HttpError =
  | { readonly kind: "timeout"; readonly message: string }
  | { readonly kind: "network"; readonly message: string }
  | { readonly kind: "http"; readonly status: number; readonly message: string };

export interface HttpClientOptions {
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
}

export class HttpClient {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: HttpClientOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 15000;
  }

  async postJson<T>(
    url: string,
    body: unknown,
    headers: HeadersInit = {}
  ): Promise<Result<T, HttpError>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          ...headers
        },
        body: JSON.stringify(body),
        credentials: "omit",
        cache: "no-store",
        signal: controller.signal
      });

      if (!response.ok) {
        return err({
          kind: "http",
          status: response.status,
          message: `HTTP ${response.status}`
        });
      }

      try {
        return ok((await response.json()) as T);
      } catch {
        return err({
          kind: "http",
          status: response.status,
          message: "Resposta JSON inválida."
        });
      }
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return err({ kind: "timeout", message: "Tempo excedido." });
      }

      if (error instanceof TypeError) {
        return err({ kind: "network", message: "Falha de rede." });
      }

      return err({ kind: "network", message: "Falha de comunicação." });
    } finally {
      clearTimeout(timeout);
    }
  }
}
