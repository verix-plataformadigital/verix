import type { VerixSecurityIdentity } from "./gate-contract";

export interface GateServiceOptions {
  readonly endpoint: string;
  readonly identity: VerixSecurityIdentity;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => number;
  readonly refreshMarginMs?: number;
}

export type GateErrorKind = "timeout" | "network" | "http" | "invalid-response";

export interface GateError {
  readonly kind: GateErrorKind;
  readonly status?: number;
  readonly message: string;
}

export class GateService {
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly refreshMarginMs: number;
  private token: string | null = null;
  private expiresAtMs = 0;
  private inFlight: Promise<string> | null = null;

  constructor(private readonly options: GateServiceOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? Date.now;
    this.refreshMarginMs = options.refreshMarginMs ?? 30_000;
  }

  async getToken(forceRefresh = false): Promise<string> {
    if (
      !forceRefresh &&
      this.token &&
      this.now() < this.expiresAtMs - this.refreshMarginMs
    ) {
      return this.token;
    }

    if (this.inFlight) return this.inFlight;

    this.inFlight = this.requestToken().finally(() => {
      this.inFlight = null;
    });

    return this.inFlight;
  }

  getIdentity(): VerixSecurityIdentity {
    return this.options.identity;
  }

  clear(): void {
    this.token = null;
    this.expiresAtMs = 0;
  }

  private async requestToken(): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await this.fetchImpl(this.options.endpoint, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          build_id: this.options.identity.buildId,
          installation_id: this.options.identity.installationId,
          session_id: this.options.identity.sessionId,
          tab_id: this.options.identity.tabId
        }),
        cache: "no-store",
        credentials: "omit",
        mode: "cors",
        signal: controller.signal
      });

      if (!response.ok) {
        throw new GateServiceException({
          kind: "http",
          status: response.status,
          message: "VÉRIX gate HTTP " + response.status
        });
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new GateServiceException({
          kind: "invalid-response",
          message: "VÉRIX gate devolveu JSON inválido."
        });
      }

      if (
        !payload ||
        typeof payload !== "object" ||
        typeof (payload as Record<string, unknown>).token !== "string"
      ) {
        throw new GateServiceException({
          kind: "invalid-response",
          message: "VÉRIX gate não devolveu token."
        });
      }

      const expiresIn = Number((payload as Record<string, unknown>).expires_in ?? 0);
      this.token = (payload as Record<string, unknown>).token as string;
      this.expiresAtMs = this.now() + Math.max(0, expiresIn) * 1000;

      return this.token;
    } catch (error: unknown) {
      if (error instanceof GateServiceException) throw error;
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new GateServiceException({
          kind: "timeout",
          message: "Tempo excedido ao obter autorização VÉRIX."
        });
      }
      if (error instanceof TypeError) {
        throw new GateServiceException({
          kind: "network",
          message: "Falha de rede ao obter autorização VÉRIX."
        });
      }
      throw new GateServiceException({
        kind: "network",
        message: "Falha ao obter autorização VÉRIX."
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

export class GateServiceException extends Error {
  readonly kind: GateErrorKind;
  readonly status?: number;

  constructor(error: GateError) {
    super(error.message);
    this.name = "GateServiceException";
    this.kind = error.kind;
    if (error.status !== undefined) this.status = error.status;
  }
}
