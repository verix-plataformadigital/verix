import { describe, expect, it } from 'vitest';
import {
  LEGISLATION_FAVORITES_KEY,
  LegislationFavorites,
  favoriteKey,
  legacyFavoriteKey
} from '../../src/modules/legislation/legislation-favorites';
import type { LegislationItem } from '../../src/modules/legislation/legislation-data';

class MemoryStorage {
  value: string | null = null;
  getItem(key: string): string | null {
    return key === LEGISLATION_FAVORITES_KEY ? this.value : null;
  }
  setItem(key: string, value: string): void {
    if (key === LEGISLATION_FAVORITES_KEY) this.value = value;
  }
}

const item: LegislationItem = {
  id: 'leg-001',
  categoryId: 'legAutoX1',
  title: 'CINTO DE SEGURANÇA',
  code: '1900820101',
  fine: '120€ 600€',
  description: 'Descrição de teste.'
};

const otherItem: LegislationItem = {
  ...item,
  id: 'leg-002',
  title: 'OUTRO REGISTO',
  description: 'Outra descrição.'
};

describe('LegislationFavorites', () => {
  it('uses a stable catalog ID for new keys', () => {
    expect(favoriteKey(item)).toBe('id:leg-001');
    expect(favoriteKey(item)).not.toBe(legacyFavoriteKey(item));
  });

  it('continues to recognize the persisted legacy normalized key', () => {
    const storage = new MemoryStorage();
    storage.value = JSON.stringify([legacyFavoriteKey(item)]);
    const favorites = new LegislationFavorites(storage);

    expect(favorites.has(item)).toBe(true);
    expect(favorites.toggle(item)).toBe(false);
    expect(favorites.has(item)).toBe(false);
  });

  it('persists and reloads new ID-based favorites', () => {
    const storage = new MemoryStorage();
    const first = new LegislationFavorites(storage);

    expect(first.toggle(item)).toBe(true);
    expect(storage.getItem(LEGISLATION_FAVORITES_KEY)).toContain('"id:leg-001"');

    const second = new LegislationFavorites(storage);
    expect(second.has(item)).toBe(true);
    expect(second.toggle(item)).toBe(false);
    expect(second.has(item)).toBe(false);
  });

  it('does not collide when records share the same normalized legacy key', () => {
    const longPrefix = 'a'.repeat(600);
    const firstItem = { ...item, code: longPrefix, title: 'A', description: 'B' };
    const secondItem = { ...otherItem, code: longPrefix, title: 'A', description: 'C' };
    expect(legacyFavoriteKey(firstItem)).toBe(legacyFavoriteKey(secondItem));
    expect(favoriteKey(firstItem)).not.toBe(favoriteKey(secondItem));
  });
});
