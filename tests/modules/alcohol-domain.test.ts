import { describe, expect, it } from 'vitest';
import { ALCOHOL_EMA_TABLE } from '../../src/modules/alcohol/alcohol-data';
import {
  alcoholRegime,
  lookupAlcoholTas,
  parseTasInput,
  tasFromTae,
  penaltyBands
} from '../../src/modules/alcohol/alcohol-domain';

describe('alcohol domain', () => {
  it('preserva os 441 valores da tabela EMA', () => {
    expect(ALCOHOL_EMA_TABLE).toHaveLength(441);
    expect(ALCOHOL_EMA_TABLE[0]).toMatchObject({
      tae: 0.08695652173913045,
      tas: 0.2,
      primeira: 0.154,
      periodica: 0.126
    });
    expect(ALCOHOL_EMA_TABLE.at(-1)?.tas).toBe(4.6);
  });

  it('aceita TAS com vírgula, ponto ou formato 50 = 0,50', () => {
    expect(parseTasInput('0,50')).toBe(0.5);
    expect(parseTasInput('0.50')).toBe(0.5);
    expect(parseTasInput('50')).toBe(0.5);
  });

  it('encontra o valor exato de TAS', () => {
    const rows = lookupAlcoholTas('0,50');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tas).toBe(0.5);
  });

  it('classifica corretamente os regimes legalmente definidos', () => {
    expect(alcoholRegime(0.19)).toBe('abaixo');
    expect(alcoholRegime(0.2)).toBe('especial');
    expect(alcoholRegime(0.49)).toBe('especial');
    expect(alcoholRegime(0.5)).toBe('geral');
  });

  it('mantém os escalões de coima e pontos do regime geral e especial', () => {
    expect(penaltyBands(false)).toEqual([
      { minTas: 0.5, maxTasExclusive: 0.8, fine: '250 € — 1250 €', points: 3, severity: 'grave' },
      { minTas: 0.8, maxTasExclusive: 1.2, fine: '500 € — 2500 €', points: 5, severity: 'muito-grave' }
    ]);
    expect(penaltyBands(true)).toEqual([
      { minTas: 0.2, maxTasExclusive: 0.5, fine: '250 € — 1250 €', points: 3, severity: 'grave' },
      { minTas: 0.5, maxTasExclusive: 1.2, fine: '500 € — 2500 €', points: 5, severity: 'muito-grave' }
    ]);
  });

  it('converte TAE para TAS pela relação 2,3', () => {
    expect(tasFromTae(1)).toBeCloseTo(2.3, 10);
    expect(tasFromTae(-1)).toBeNull();
  });
});
