const ALLOWED_ERROR_CATEGORIES = new Set([
  "http_null","http_400","http_401","http_403","http_404","http_429","http_5xx",
  "security_auth","upstream_timeout","upstream_network","invalid_json","parse_error",
  "rate_limited","network_error","timeout","graphql_error","service_unavailable",
  "empty_response","unknown"
]);
function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
/** Reduce untrusted diagnostics to one bounded, allow-listed code. */
export function normalizeErrorCategory(metadata: unknown): string {
  if (!isRecord(metadata)) return "unknown";
  const diagnostic = isRecord(metadata.asfDiagnostic) ? metadata.asfDiagnostic : {};
  const raw = diagnostic.asfErrorType ?? diagnostic.errorType ??
    metadata.asfErrorType ?? metadata.errorType;
  if (typeof raw !== "string" || !raw.trim()) return "unknown";
  const normalized = raw.trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return ALLOWED_ERROR_CATEGORIES.has(normalized) ? normalized : "other";
}
