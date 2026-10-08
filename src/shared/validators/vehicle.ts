export function normalizePlate(value: unknown): string {
  return String(value ?? "")
    .trim()
    .slice(0, 20)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function normalizeAsfDate(value: unknown): string | null {
  const input = String(value ?? "").trim().slice(0, 10);
  const match = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(input);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return input;
}
