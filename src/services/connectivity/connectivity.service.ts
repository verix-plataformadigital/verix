import type { ConnectivitySnapshot } from "../../shared/types/connectivity";

export interface ConnectivityProbe {
  probe(): Promise<ConnectivitySnapshot>;
}

export interface ConnectivityServiceOptions {
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
  readonly now?: () => number;
}

export class DefaultConnectivityService implements ConnectivityProbe {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly now: () => number;

  constructor(options: ConnectivityServiceOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 5000;
    this.now = options.now ?? Date.now;
  }

  async probe(): Promise<ConnectivitySnapshot> {
    const checkedAt = this.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      await this.fetchImpl(location.origin + "/favicon.ico", {
        method: "HEAD",
        cache: "no-store",
        credentials: "omit",
        signal: controller.signal
      });

      return {
        state: "online",
        checkedAt,
        backendReachable: true
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
          state: navigator.onLine === false ? "offline" : "network-error",
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
