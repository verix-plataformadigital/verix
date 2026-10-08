import type { LegislationItem } from './legislation-data';

export const LEGISLATION_FAVORITES_KEY = 'VÉRIX_LEGISLACAO_FAVORITOS_V1';

export interface FavoritesStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export class LegislationFavorites {
  private values: Set<string>;

  constructor(private readonly storage: FavoritesStorage | null) {
    this.values = this.load();
  }

  has(item: LegislationItem): boolean {
    return this.values.has(favoriteKey(item));
  }

  toggle(item: LegislationItem): boolean {
    const key = favoriteKey(item);
    if (this.values.has(key)) {
      this.values.delete(key);
    } else {
      this.values.add(key);
    }
    this.persist();
    return this.values.has(key);
  }

  count(): number {
    return this.values.size;
  }

  key(item: LegislationItem): string {
    return favoriteKey(item);
  }

  private load(): Set<string> {
    try {
      const raw = this.storage?.getItem(LEGISLATION_FAVORITES_KEY);
      const parsed: unknown = JSON.parse(raw || '[]');
      return Array.isArray(parsed)
        ? new Set(parsed.filter((value): value is string => typeof value === 'string'))
        : new Set();
    } catch {
      return new Set();
    }
  }

  private persist(): void {
    try {
      this.storage?.setItem(
        LEGISLATION_FAVORITES_KEY,
        JSON.stringify([...this.values])
      );
    } catch {
      // Keep favorites available in memory.
    }
  }
}

export function favoriteKey(item: LegislationItem): string {
  return normalizeFavorite(
    item.code + '|' + item.title + '|' + item.description
  ).slice(0, 500);
}

export function normalizeFavorite(value: string): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
