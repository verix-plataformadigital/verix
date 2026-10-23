import { describe, expect, it } from 'vitest';
import {
  DISTRICT_REFERENCES,
  ROAD_ZONE_REFERENCES,
  TACHOGRAPH_REFERENCES
} from '../../src/modules/tools/tools-data';

describe('operational reference data', () => {
  it('preserva os 18 distritos', () => {
    expect(DISTRICT_REFERENCES).toHaveLength(18);
    expect(DISTRICT_REFERENCES.find(x => x.code === '16')?.name).toBe('VIANA DO CASTELO');
  });

  it('preserva as 44 zonas/estradas', () => {
    expect(ROAD_ZONE_REFERENCES).toHaveLength(44);
    expect(ROAD_ZONE_REFERENCES.some(x => x.via === 'A28')).toBe(true);
    expect(ROAD_ZONE_REFERENCES.some(x => x.unidade === 'PTER AVINTES')).toBe(true);
  });

  it('preserva as duas referências de tacógrafo do legado', () => {
    expect(TACHOGRAPH_REFERENCES).toHaveLength(2);
    expect(TACHOGRAPH_REFERENCES[0]?.result).toBe('4,1939711664 %');
    expect(TACHOGRAPH_REFERENCES[1]?.result).toBe('7,3608870968 %');
  });
});
