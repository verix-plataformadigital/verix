import {
  ALCOHOL_EMA_TABLE,
  ALCOHOL_TAE_TO_TAS_FACTOR,
  type AlcoholEmaRow
} from "./alcohol-data";

export type AlcoholLookupInput = string | number;

export function parseTasInput(input: AlcoholLookupInput): number | null {
  const raw = String(input).trim().replace(",", ".");
  if (!raw) return null;

  const decimals = raw.includes(".") ? raw.split(".")[1]?.length ?? 0 : 0;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return null;

  if (decimals === 0 && value >= 0 && value <= 99) {
    return Math.round(value) / 100;
  }

  return value;
}

export function lookupAlcoholTas(
  input: AlcoholLookupInput
): readonly AlcoholEmaRow[] {
  const raw = String(input).trim();
  if (!raw) return [];

  const parsed = parseTasInput(raw);
  if (parsed !== null) {
    const exact = ALCOHOL_EMA_TABLE.filter(
      (row) => Math.abs(row.tas - parsed) < 0.000001
    );
    if (exact.length) return exact;
  }

  const normalized = raw.replace(",", ".");
  return ALCOHOL_EMA_TABLE.filter((row) =>
    row.tas.toFixed(2).startsWith(normalized)
  );
}

export function tasFromTae(tae: number): number | null {
  if (!Number.isFinite(tae) || tae < 0) return null;
  return tae * ALCOHOL_TAE_TO_TAS_FACTOR;
}

export function alcoholRegime(tas: number): "geral" | "especial" | "abaixo" {
  if (!Number.isFinite(tas) || tas < 0) return "abaixo";
  if (tas >= 0.2 && tas < 0.5) return "especial";
  if (tas >= 0.5) return "geral";
  return "abaixo";
}
