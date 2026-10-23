import { LEGISLATION_CATEGORIES, type LegislationItem } from './legislation-data';

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
    const key = favoriteKey(item);
    // New deployments use stable item IDs; recognize older title-based keys
    // so favorites saved by legacy VÉRIX releases remain visible.
    return this.values.has(key) || this.values.has(legacyFavoriteKey(item));
  }

  toggle(item: LegislationItem): boolean {
    const key = favoriteKey(item);
    const legacyKey = legacyFavoriteKey(item);
    const isActive = this.values.has(key) || this.values.has(legacyKey);

    if (isActive) {
      this.values.delete(key);
      this.values.delete(legacyKey);
    } else {
      this.values.add(key);
    }

    this.persist();
    return !isActive;
  }

  count(): number {
    const items = LEGISLATION_CATEGORIES.flatMap((category) => category.items);
    const recognized = new Set<string>();
    const favorites = new Set<string>();

    for (const item of items) {
      const key = favoriteKey(item);
      const legacyKey = legacyFavoriteKey(item);
      recognized.add(key);
      recognized.add(legacyKey);
      if (this.values.has(key) || this.values.has(legacyKey)) favorites.add(item.id);
    }

    // Preserve count visibility for entries from older/unknown catalog snapshots.
    const unknownEntries = [...this.values].filter((value) => !recognized.has(value)).length;
    return favorites.size + unknownEntries;
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
  // IDs are extracted from the legacy catalog and are stable across renders.
  return 'id:' + item.id;
}

export function legacyFavoriteKey(item: LegislationItem): string {
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
