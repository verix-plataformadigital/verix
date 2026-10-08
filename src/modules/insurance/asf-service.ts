import type { AsfGraphqlResponse } from "./asf-contract";
import { classifyAsfResponse, type AsfOutcome } from "./asf-classifier";
import type { Result } from "../../shared/types/result";
import { err, ok } from "../../shared/types/result";
import { normalizeAsfDate, normalizePlate } from "../../shared/validators/vehicle";
import { GateService, GateServiceException } from "../../services/security/gate-service";

export type AsfServiceError =
  | { readonly kind: "invalid-input"; readonly message: string }
  | { readonly kind: "timeout"; readonly message: string }
  | { readonly kind: "network"; readonly message: string }
  | { readonly kind: "auth"; readonly message: string }
  | { readonly kind: "http"; readonly status: number; readonly message: string }
  | { readonly kind: "rate-limited"; readonly status: number; readonly retryAfterMs: number | null; readonly message: string }
  | { readonly kind: "invalid-json"; readonly message: string }
  | { readonly kind: "graphql"; readonly messages: readonly string[] }
  | { readonly kind: "invalid-response"; readonly message: string };

export interface AsfServiceRequest {
  readonly matricula: string;
  readonly date: string;
}

export interface AsfServiceOptions {
  readonly relayUrl: string;
  readonly gate: GateService;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
  readonly classify?: (response: AsfGraphqlResponse) => AsfOutcome;
}

export type AsfServiceResult = Result<AsfOutcome, AsfServiceError>;

export class AsfService {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly classify: (response: AsfGraphqlResponse) => AsfOutcome;

  constructor(private readonly options: AsfServiceOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 15000;
    this.classify = options.classify ?? classifyAsfResponse;
  }

  async query(request: AsfServiceRequest): Promise<AsfServiceResult> {
    const matricula = normalizePlate(request.matricula);
    const date = normalizeAsfDate(request.date);

    if (!/^[A-Z0-9]{6,8}$/.test(matricula)) {
      return err({ kind: "invalid-input", message: "Matrícula inválida." });
    }
    if (!date) {
      return err({ kind: "invalid-input", message: "Data ASF inválida." });
    }

    let clientToken: string;
    try {
      clientToken = await this.options.gate.getToken();
    } catch (error: unknown) {
      if (error instanceof GateServiceException) {
        if (error.kind === "timeout") {
          return err({ kind: "timeout", message: error.message });
        }
        if (error.kind === "network") {
          return err({ kind: "network", message: error.message });
        }
        return err({ kind: "auth", message: error.message });
      }
      return err({ kind: "auth", message: "Não foi possível obter autorização VÉRIX." });
    }

    const identity = this.options.gate.getIdentity();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(this.options.relayUrl, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Verix-Build-Id": identity.buildId,
          "X-Verix-Client-Token": clientToken
        },
        body: JSON.stringify({
          matricula,
          date,
          installationId: identity.installationId
        }),
        credentials: "omit",
        cache: "no-store",
        signal: controller.signal
      });

      const raw = await response.text();

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          this.options.gate.clear();
          return err({
            kind: "auth",
            message: "A autorização VÉRIX foi recusada pelo relay."
          });
        }

        if (response.status === 429) {
          return err({
            kind: "rate-limited",
            status: response.status,
            retryAfterMs: parseRetryAfter(response.headers.get("Retry-After")),
            message: "O serviço ASF limitou temporariamente o pedido."
          });
        }

        return err({
          kind: "http",
          status: response.status,
          message: "HTTP " + response.status
        });
      }

      let payload: AsfGraphqlResponse;
      try {
        payload = JSON.parse(raw) as AsfGraphqlResponse;
      } catch {
        return err({ kind: "invalid-json", message: "Resposta ASF inválida." });
      }

      const outcome = this.classify(payload);
      if (outcome.kind === "graphql-error") {
        return err({ kind: "graphql", messages: outcome.messages });
      }
      if (outcome.kind === "invalid-response") {
        return err({ kind: "invalid-response", message: outcome.reason });
      }

      return ok(outcome);
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return err({ kind: "timeout", message: "Tempo excedido na comunicação ASF." });
      }
      if (error instanceof TypeError) {
        return err({ kind: "network", message: "Falha de rede na comunicação ASF." });
      }
      return err({ kind: "network", message: "Falha de comunicação ASF." });
    } finally {
      clearTimeout(timeout);
    }
  }
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}
