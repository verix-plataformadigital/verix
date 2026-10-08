import type { TelemetryEventName } from "./telemetry-contract";

export interface TelemetrySchedulerClient {
  track(
    event: TelemetryEventName,
    module: string | null,
    metadata?: Readonly<Record<string, unknown>>
  ): unknown;
  flush(): Promise<
    | { readonly ok: true; readonly sent: number }
    | { readonly ok: false; readonly sent: 0; readonly retryAfterMs: number | null }
  >;
  flushBeacon(): number;
  shouldFlushImmediately(event: TelemetryEventName): boolean;
}

export interface TelemetrySchedulerOptions {
  readonly telemetry: TelemetrySchedulerClient;
  readonly lifecycle?: EventTarget | null;
  readonly heartbeatMs?: number;
  readonly flushMs?: number;
  readonly retryDelaysMs?: readonly number[];
}

type TimerHandle = ReturnType<typeof globalThis.setTimeout>;
type IntervalHandle = ReturnType<typeof globalThis.setInterval>;

export class TelemetryScheduler {
  private readonly lifecycle: EventTarget | null;
  private readonly heartbeatMs: number;
  private readonly flushMs: number;
  private readonly retryDelaysMs: readonly number[];
  private heartbeatTimer: IntervalHandle | null = null;
  private flushTimer: IntervalHandle | null = null;
  private retryTimer: TimerHandle | null = null;
  private started = false;
  private flushBusy = false;
  private retryIndex = 0;

  constructor(private readonly options: TelemetrySchedulerOptions) {
    this.lifecycle = options.lifecycle ?? null;
    this.heartbeatMs = options.heartbeatMs ?? 45_000;
    this.flushMs = options.flushMs ?? 15_000;
    this.retryDelaysMs = options.retryDelaysMs ?? [2_000, 5_000, 15_000, 30_000, 60_000];
  }

  start(): void {
    if (this.started) return;
    this.started = true;

    this.options.telemetry.track("app_open", "app");
    void this.tryFlush();

    this.heartbeatTimer = globalThis.setInterval(() => {
      this.options.telemetry.track("heartbeat", null);
      void this.tryFlush();
    }, this.heartbeatMs);

    this.flushTimer = globalThis.setInterval(() => {
      void this.tryFlush();
    }, this.flushMs);

    this.lifecycle?.addEventListener("pagehide", this.handlePageHide);
    this.lifecycle?.addEventListener("visibilitychange", this.handleVisibilityChange);
    this.lifecycle?.addEventListener("pageshow", this.handleResume);
    this.lifecycle?.addEventListener("focus", this.handleResume);
    this.lifecycle?.addEventListener("online", this.handleResume);
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;

    if (this.heartbeatTimer !== null) globalThis.clearInterval(this.heartbeatTimer);
    if (this.flushTimer !== null) globalThis.clearInterval(this.flushTimer);
    if (this.retryTimer !== null) globalThis.clearTimeout(this.retryTimer);

    this.heartbeatTimer = null;
    this.flushTimer = null;
    this.retryTimer = null;

    this.lifecycle?.removeEventListener("pagehide", this.handlePageHide);
    this.lifecycle?.removeEventListener("visibilitychange", this.handleVisibilityChange);
    this.lifecycle?.removeEventListener("pageshow", this.handleResume);
    this.lifecycle?.removeEventListener("focus", this.handleResume);
    this.lifecycle?.removeEventListener("online", this.handleResume);
  }

  async flushNow(): Promise<void> {
    await this.tryFlush();
  }

  private readonly handlePageHide = (): void => {
    this.options.telemetry.flushBeacon();
  };

  private readonly handleVisibilityChange = (): void => {
    this.options.telemetry.flushBeacon();
  };

  private readonly handleResume = (): void => {
    void this.tryFlush();
  };

  private async tryFlush(): Promise<void> {
    if (!this.started || this.flushBusy) return;

    this.flushBusy = true;
    try {
      const result = await this.options.telemetry.flush();

      if (result.ok) {
        this.retryIndex = 0;
        if (this.retryTimer !== null) {
          globalThis.clearTimeout(this.retryTimer);
          this.retryTimer = null;
        }
        return;
      }

      this.scheduleRetry(result.retryAfterMs);
    } catch {
      this.scheduleRetry(null);
    } finally {
      this.flushBusy = false;
    }
  }

  private scheduleRetry(serverDelayMs: number | null): void {
    if (!this.started || this.retryTimer !== null) return;

    const configuredDelay = this.retryDelaysMs[
      Math.min(this.retryIndex, Math.max(0, this.retryDelaysMs.length - 1))
    ] ?? 60_000;

    const delay = serverDelayMs !== null
      ? Math.max(0, serverDelayMs)
      : configuredDelay;

    this.retryIndex = Math.min(
      this.retryIndex + 1,
      Math.max(0, this.retryDelaysMs.length - 1)
    );

    this.retryTimer = globalThis.setTimeout(() => {
      this.retryTimer = null;
      void this.tryFlush();
    }, delay);
  }
}
