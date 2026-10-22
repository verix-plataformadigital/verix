const RETRY_DELAY_MS = 250;

export interface AsfUpstreamResult {
  status: number;
  statusText: string;
  body: string;
  contentType: string;
  retryAfter: string | null;
  elapsedMs: number;
  attempts: number;
  retriedTransientAvailability: boolean;
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type SleepLike = (ms: number) => Promise<void>;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeMessage(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Retry only the exact upstream failure already observed:
 * HTTP 200 with a GraphQL errors array and no usable data.
 *
 * Generic GraphQL errors, malformed JSON, HTTP errors, partial data,
 * and a server-supplied Retry-After header are never retried here.
 */
export function isTransientGraphqlUnavailable(status: number, body: string): boolean {
  if (status !== 200) return false;

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return false;
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const obj = payload as Record<string, unknown>;
  if (obj.data !== undefined && obj.data !== null) return false;
  if (!Array.isArray(obj.errors) || obj.errors.length === 0) return false;

  const knownMessages = new Set([
    "servico indisponivel",
    "servico temporariamente indisponivel",
    "service unavailable",
    "service temporarily unavailable",
    "temporarily unavailable",
    "the service is temporarily unavailable",
  ]);

  return obj.errors.some((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    return knownMessages.has(normalizeMessage((item as Record<string, unknown>).message));
  });
}

/**
 * A single, narrowly scoped recovery attempt for the known HTTP-200
 * GraphQL availability response. URL, query and result body stay unchanged;
 * this helper does not interpret insurance results.
 */
export async function fetchAsfWithTransientRetry(
  url: string,
  timeoutMs = 15_000,
  fetcher: FetchLike = fetch,
  wait: SleepLike = sleep,
): Promise<AsfUpstreamResult> {
  const startedAt = Date.now();
  let retriedTransientAvailability = false;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    let body: string;

    try {
      response = await fetcher(url, {
        method: "POST",
        headers: {
          "Accept": "application/json, text/plain, */*",
          "Cache-Control": "no-cache",
          "Pragma": "no-cache",
        },
        body: null,
        redirect: "follow",
        signal: controller.signal,
      });
      body = await response.text();
    } finally {
      clearTimeout(timeout);
    }

    const retryable = attempt === 1 &&
      !response.headers.get("retry-after") &&
      isTransientGraphqlUnavailable(response.status, body);

    if (retryable) {
      retriedTransientAvailability = true;
      await wait(RETRY_DELAY_MS);
      continue;
    }

    return {
      status: response.status,
      statusText: response.statusText || "",
      body,
      contentType: response.headers.get("content-type") || "application/json; charset=utf-8",
      retryAfter: response.headers.get("retry-after"),
      elapsedMs: Math.max(0, Date.now() - startedAt),
      attempts: attempt,
      retriedTransientAvailability,
    };
  }

  throw new Error("ASF retry loop ended unexpectedly");
}

export const ASF_TRANSIENT_RETRY_DELAY_MS = RETRY_DELAY_MS;
