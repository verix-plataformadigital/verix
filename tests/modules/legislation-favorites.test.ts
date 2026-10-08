import { describe, expect, it } from 'vitest';
import {
  LEGISLATION_FAVORITES_KEY,
  LegislationFavorites,
  favoriteKey
} from '../../src/modules/legislation/legislation-favorites';
import type { LegislationItem } from '../../src/modules/legislation/legislation-data';

class MemoryStorage {
  private value: string | null = null;
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

describe('LegislationFavorites', () => {
  it('usa a chave persistente legada', () => {
    const storage = new MemoryStorage();
    const favorites = new LegislationFavorites(storage);

    expect(favorites.toggle(item)).toBe(true);
    expect(storage.getItem(LEGISLATION_FAVORITES_KEY)).toContain(favoriteKey(item));
  });

  it('recarrega favoritos persistidos e alterna corretamente', () => {
    const storage = new MemoryStorage();
    const first = new LegislationFavorites(storage);
    first.toggle(item);

    const second = new LegislationFavorites(storage);
    expect(second.has(item)).toBe(true);
    expect(second.toggle(item)).toBe(false);
    expect(second.has(item)).toBe(false);
  });
});
