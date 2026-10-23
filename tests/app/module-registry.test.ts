import { describe, expect, it } from 'vitest';
import { MODULES, moduleById } from '../../src/app/state/module-registry';

describe('V2 module registry', () => {
  it('não tem ids duplicados', () => {
    const ids = MODULES.map((module) => module.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('resolve todas as entradas registadas', () => {
    for (const module of MODULES) {
      expect(moduleById(module.id)).toEqual(module);
    }
  });

  it('expõe todas as superfícies operacionais migradas', () => {
    expect(MODULES.map((module) => module.id)).toEqual([
      'vehicle',
      'history',
      'cinemometer',
      'legislation',
      'alcohol',
      'settings',
      'tools',
      'information'
    ]);
  });
});
