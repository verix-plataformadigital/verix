/**
 * Opens an external destination while preserving a reliable popup result.
 *
 * The V2 document sets Referrer-Policy: no-referrer. Avoid the "noopener"
 * feature token here because browsers return null for window.open when that
 * token is requested, even when the new window opened successfully.
 */
export function openExternalWindow(url: string): boolean {
  if (typeof window === "undefined") return false;

  let opened: WindowProxy | null;
  try {
    opened = window.open(url, "_blank");
  } catch {
    return false;
  }

  if (!opened) return false;

  try {
    // Detach synchronously to prevent the destination navigating its opener.
    opened.opener = null;
    return true;
  } catch {
    try {
      opened.close();
    } catch {
      // Best-effort cleanup; report failure rather than an unsafe success.
    }
    return false;
  }
}
