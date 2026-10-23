import { describe, expect, it } from 'vitest';
import {
  CINEMOMETER_OPERATOR_KEY,
  CINEMOMETER_PROFILES_KEY,
  CinemometerProfileService
} from '../../src/modules/cinemometer/cinemometer-profile-service';

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

const profile = {
  id: 'cin-1',
  marca: 'Marca',
  modelo: 'Modelo',
  serie: 'S123',
  ansr: 'A1',
  ipq: 'I1',
  dataipq: '08/10/2026',
  verificacao: 'periodica' as const,
  certtipo: 'certificado',
  cert: 'C1',
  nota: 'posto'
};

describe('CinemometerProfileService', () => {
  it('cria e persiste perfis na chave legada', () => {
    const storage = new MemoryStorage();
    const service = new CinemometerProfileService(storage, () => 'cin-new');

    expect(service.list()).toHaveLength(0);
    const created = service.create();

    expect(created.id).toBe('cin-new');
    expect(created.id).toBe('cin-new');
    const saved = { ...profile, id: created.id };
    service.save(saved);
    expect(service.list()[0]?.modelo).toBe('Modelo');
    expect(storage.getItem(CINEMOMETER_PROFILES_KEY)).toContain('cin-new');
  });

  it('recarrega, atualiza, duplica e remove perfis', () => {
    const storage = new MemoryStorage();
    const first = new CinemometerProfileService(storage, () => 'cin-2');
    first.create(profile);

    const second = new CinemometerProfileService(storage, () => 'cin-copy');
    expect(second.list()).toHaveLength(1);
    second.save({ ...profile, id: 'cin-1', nota: 'alterado' });
    expect(second.list()[0]?.nota).toBe('alterado');

    const duplicated = second.duplicate(second.list()[0]!);
    expect(duplicated.id).toBe('cin-copy');
    expect(second.list()).toHaveLength(2);

    expect(second.remove('cin-copy')).toBe(true);
    expect(second.list()).toHaveLength(1);
  });

  it('persiste e carrega a sessão do operador sem dados de servidor', () => {
    const storage = new MemoryStorage();
    const first = new CinemometerProfileService(storage);
    first.saveOperator({
      posto: 'POSTO',
      numero: '123',
      nome: 'Operador',
      modo: 'movimento',
      veiculo: 'ligeiros',
      regime: 'autoestrada',
      limite: '100'
    });

    const second = new CinemometerProfileService(storage);
    expect(storage.getItem(CINEMOMETER_OPERATOR_KEY)).toContain('Operador');
    expect(second.operatorSession()).toMatchObject({
      nome: 'Operador',
      modo: 'movimento',
      limite: '100'
    });

    second.clearOperator();
    expect(second.operatorSession()).toBeNull();
    expect(storage.getItem(CINEMOMETER_OPERATOR_KEY)).toBeNull();
  });

  it('normaliza perfis persistidos inválidos sem quebrar o carregamento', () => {
    const storage = new MemoryStorage();
    storage.setItem(CINEMOMETER_PROFILES_KEY, JSON.stringify([
      {},
      { id: 'valid', marca: 'M', verificacao: 'estranha' }
    ]));
    const service = new CinemometerProfileService(storage);

    expect(service.list()).toHaveLength(1);
    expect(service.list()[0]).toMatchObject({
      id: 'valid',
      marca: 'M',
      verificacao: 'primeira'
    });
  });
});
