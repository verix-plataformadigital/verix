import { describe, expect, it } from 'vitest';
import { buildCinemometerOperationalText } from '../../src/modules/cinemometer/cinemometer-text';

describe('cinemometer operational text', () => {
  it('reproduz a estrutura textual operacional do legado', () => {
    const text = buildCinemometerOperationalText({
      recordedSpeed: 130,
      deducedSpeed: 124,
      speedLimit: 120,
      mode: 'fixo',
      marca: 'Marca',
      modelo: 'Modelo',
      serie: '123',
      ansr: 'ANSR-01',
      ipq: 'IPQ-02',
      dataipq: '08/10/2026',
      certtipo: 'certificado',
      cert: 'CERT-03',
      operadorNumero: '42',
      operadorNome: 'Operador',
      operadorPosto: 'Posto'
    });

    expect(text).toContain(
      'O veículo circulava, pelo menos, à velocidade de 124 km/h correspondente à velocidade registada de 130 km/h'
    );
    expect(text).toContain('Cinemómetro - Marca, modelo Modelo n.º 123.');
    expect(text).toContain('Aprovado para controlo e fiscalização pela ANSR através de ANSR-01.');
    expect(text).toContain('Pelo IPQ através de IPQ-02.');
    expect(text).toContain('Verificado pelo IPQ em 08/10/2026, com certificado n.º CERT-03.');
    expect(text).toContain('Operador n.º 42 — Operador — Posto.');
  });

  it('gera mensagem segura para dados incompletos', () => {
    expect(buildCinemometerOperationalText({
      recordedSpeed: Number.NaN,
      deducedSpeed: 10,
      speedLimit: 10,
      mode: 'fixo'
    })).toBe(
      'Preencha a velocidade registada e o limite permitido para gerar o texto do auto.'
    );
  });
});
