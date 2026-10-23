export const ONLINE_TTL_MS = 5 * 60 * 1000;

export interface PresenceRecord {
  readonly installationId: string;
  readonly lastSeenMs: number;
}

/**
 * An installation is online when its latest server-observed activity is
 * inside the explicit TTL window. Client-side navigator.onLine is not part
 * of this decision.
 */
export function isOnline(
  lastSeenMs: number,
  nowMs: number,
  ttlMs: number = ONLINE_TTL_MS
): boolean {
  if (!Number.isFinite(lastSeenMs) || !Number.isFinite(nowMs) || !Number.isFinite(ttlMs)) {
    return false;
  }

  if (ttlMs < 0 || nowMs < 0 || lastSeenMs < 0) {
    return false;
  }

  const age = nowMs - lastSeenMs;
  return age >= 0 && age < ttlMs;
}

export function countOnline(
  records: readonly PresenceRecord[],
  nowMs: number,
  ttlMs: number = ONLINE_TTL_MS
): number {
  return new Set(
    records
      .filter((record) => isOnline(record.lastSeenMs, nowMs, ttlMs))
      .map((record) => record.installationId)
      .filter(Boolean)
  ).size;
}
