import type { ConnectivitySnapshot } from "../../shared/types/connectivity";

export interface ConnectivityProbe {
  probe(): Promise<ConnectivitySnapshot>;
}

export interface ConnectivityServiceOptions {
  readonly probeUrl?: string;
  readonly probeMethod?: "HEAD" | "OPTIONS";
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
  readonly now?: () => number;
  readonly browserOnline?: () => boolean;
}

export class DefaultConnectivityService implements ConnectivityProbe {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly now: () => number;
  private readonly browserOnline: () => boolean;

  constructor(private readonly options: ConnectivityServiceOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 5000;
    this.now = options.now ?? Date.now;
    this.browserOnline = options.browserOnline ??
      (() => typeof navigator === "undefined" ? true : navigator.onLine);
  }

  async probe(): Promise<ConnectivitySnapshot> {
    const checkedAt = this.now();
    if (this.browserOnline() === false) {
      return {
        state: "offline",
        checkedAt,
        backendReachable: false
      };
    }

    const probeUrl = this.options.probeUrl;
    if (!probeUrl) {
      return {
        state: "online",
        checkedAt,
        backendReachable: null
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(probeUrl, {
        method: this.options.probeMethod ?? "HEAD",
        cache: "no-store",
        credentials: "omit",
        mode: "cors",
        signal: controller.signal
      });

      if (response.ok) {
        return {
          state: "online",
          checkedAt,
          backendReachable: true
        };
      }

      return {
        state: "backend-offline",
        checkedAt,
        backendReachable: false
      };
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return {
          state: "timeout",
          checkedAt,
          backendReachable: false
        };
      }

      if (error instanceof TypeError) {
        return {
          state: "network-error",
          checkedAt,
          backendReachable: false
        };
      }

      return {
        state: "unknown-error",
        checkedAt,
        backendReachable: false
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
