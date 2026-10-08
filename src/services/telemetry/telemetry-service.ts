import type { TelemetryBatch, TelemetryEvent, TelemetryEventName } from "./telemetry-contract";
import { SafeStorage, type StorageLike } from "./storage";
import { TelemetryQueue } from "./telemetry-queue";
import { createIdentity } from "./identity";

export type TelemetryFlushResult =
  | { readonly ok: true; readonly sent: number }
  | { readonly ok: false; readonly sent: 0; readonly retryAfterMs: number | null };

export interface TelemetryServiceOptions {
  readonly endpoint: string;
  readonly appVersion: string;
  readonly buildId: string;
  readonly localStorage?: StorageLike | null;
  readonly sessionStorage?: StorageLike | null;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => number;
  readonly createId?: () => string;
  readonly queueKey?: string;
  readonly batchSize?: number;
  readonly maxQueueSize?: number;
  readonly timeoutMs?: number;
  readonly sendBeacon?: (url: string, data: Blob) => boolean;
}

const CRITICAL_EVENTS = new Set<TelemetryEventName>([
  "app_open",
  "heartbeat",
  "vehicle_lookup"
]);

// Keep margin below browser keepalive/beacon payload limits.
const MAX_BEACON_BYTES = 60 * 1024;

export class TelemetryService {
  private readonly local: SafeStorage;
  private readonly queue: TelemetryQueue;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly createId: () => string;
  private readonly queueKey: string;
  private readonly batchSize: number;
  private readonly timeoutMs: number;
  private readonly identity;
  private readonly sendBeaconImpl: ((url: string, data: Blob) => boolean) | null;
  private flushBusy = false;

  constructor(private readonly options: TelemetryServiceOptions) {
    this.local = new SafeStorage(options.localStorage ?? null);
    this.queue = new TelemetryQueue({ maxSize: options.maxQueueSize ?? 300 });
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? Date.now;
    this.createId = options.createId ?? (() => {
      if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
      }
      return String(this.now()) + "-" + Math.random().toString(36).slice(2, 12);
    });
    this.queueKey = options.queueKey ?? "VERIX_T2_QUEUE";
    this.batchSize = options.batchSize ?? 25;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.sendBeaconImpl = options.sendBeacon
      ?? (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function"
        ? (url, data) => navigator.sendBeacon(url, data)
        : null);
    this.identity = createIdentity(
      options.localStorage ?? null,
      options.sessionStorage ?? null,
      { idFactory: this.createId }
    );
    this.queue.hydrate(this.local.get(this.queueKey));
  }

  get installationId(): string {
    return this.identity.installationId;
  }

  get sessionId(): string {
    return this.identity.sessionId;
  }

  get tabId(): string {
    return this.identity.tabId;
  }

  get queueSize(): number {
    return this.queue.size;
  }

  get endpoint(): string {
    return this.options.endpoint;
  }

  newQueryId(): string {
    return "q-" + this.createId();
  }

  track(
    event: TelemetryEventName,
    module: string | null,
    metadata?: Readonly<Record<string, unknown>>
  ): TelemetryEvent {
    const item: TelemetryEvent = {
      eventId: "e-" + this.createId(),
      installationId: this.identity.installationId,
      sessionId: this.identity.sessionId,
      tabId: this.identity.tabId,
      event,
      buildId: this.options.buildId,
      occurredAt: new Date(this.now()).toISOString(),
      appVersion: this.options.appVersion,
      ...(module ? { module: module.slice(0, 50) } : {}),
      ...(metadata ? { metadata } : {})
    };

    this.queue.enqueue(item);
    this.persist();

    // Presence and consultation events must reach the backend promptly.
    // The regular scheduler remains the reliability/retry fallback when this
    // best-effort immediate flush cannot be delivered.
    if (this.shouldFlushImmediately(event)) {
      void this.flush();
    }

    return item;
  }

  async flush(): Promise<TelemetryFlushResult> {
    if (this.flushBusy || this.queue.size === 0) {
      return { ok: true, sent: 0 };
    }

    this.flushBusy = true;
    try {
      const batch = this.queue.peek(this.batchSize);
      const body: TelemetryBatch = { events: batch };
      const response = await this.send(body, false);

      if (!response.ok) {
        return {
          ok: false,
          sent: 0,
          retryAfterMs: response.retryAfterMs
        };
      }

      const removed = this.queue.acknowledge(batch.map((event) => event.eventId));
      this.persist();
      return { ok: true, sent: removed };
    } finally {
      this.flushBusy = false;
    }
  }

  shouldFlushImmediately(event: TelemetryEventName): boolean {
    return CRITICAL_EVENTS.has(event);
  }

  flushBeacon(): number {
    if (this.flushBusy || this.queue.size === 0 || !this.sendBeaconImpl) return 0;

    const batch = this.takeBeaconBatch();
    if (batch.length === 0) return 0;

    const payload = new Blob(
      [JSON.stringify({ events: batch })],
      { type: "text/plain;charset=UTF-8" }
    );

    if (!this.sendBeaconImpl(this.options.endpoint, payload)) return 0;

    const removed = this.queue.acknowledge(batch.map((event) => event.eventId));
    this.persist();
    return removed;
  }

  private takeBeaconBatch(): readonly TelemetryEvent[] {
    const candidates = this.queue.peek(this.batchSize);
    const selected: TelemetryEvent[] = [];

    for (const event of candidates) {
      const next = selected.concat(event);
      const bytes = new TextEncoder().encode(
        JSON.stringify({ events: next })
      ).byteLength;

      if (bytes > MAX_BEACON_BYTES) break;
      selected.push(event);
    }

    return selected;
  }

  private persist(): void {
    this.local.set(this.queueKey, this.queue.serialize());
  }

  private async send(batch: TelemetryBatch, keepalive: boolean): Promise<
    { readonly ok: true; readonly retryAfterMs: null } |
    { readonly ok: false; readonly retryAfterMs: number | null }
  > {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(this.options.endpoint, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "text/plain;charset=UTF-8"
        },
        body: JSON.stringify(batch),
        mode: "cors",
        credentials: "omit",
        cache: "no-store",
        keepalive,
        signal: controller.signal
      });

      if (response.ok) return { ok: true, retryAfterMs: null };

      return {
        ok: false,
        retryAfterMs: parseRetryAfter(response.headers.get("Retry-After"))
      };
    } catch {
      return { ok: false, retryAfterMs: null };
    } finally {
      clearTimeout(timer);
    }
  }
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const date = Date.parse(value);
  if (Number.isNaN(date)) return null;
  return Math.max(0, date - Date.now());
}
