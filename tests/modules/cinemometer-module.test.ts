// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { CinemometerModule } from "../../src/modules/cinemometer/cinemometer-module";
import { CinemometerProfileService } from "../../src/modules/cinemometer/cinemometer-profile-service";

describe("CinemometerModule", () => {
  it("não escreve HTML diretamente e monta a estrutura principal", () => {
    const root = document.createElement("main");
    const telemetry = { track: vi.fn() };
    const storage = new Map<string, string>();
    const profiles = new CinemometerProfileService({
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value); },
      removeItem: (key: string) => { storage.delete(key); }
    });

    new CinemometerModule({ telemetry, profiles }).mount(root);

    expect(root.querySelector("form.cin-form")).toBeTruthy();
    expect(root.querySelector(".cin-context")).toBeTruthy();
    expect(root.querySelectorAll("select")).toHaveLength(7);
    expect(root.querySelector('input[type="number"]')).toBeTruthy();
  });
});


it('inclui o aparelho e a sessão do operador no evento de cálculo', () => {
  const root = document.createElement('main');
  const telemetry = { track: vi.fn() };
  const values = new Map<string, string>();
  const profiles = new CinemometerProfileService({
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key)
  });

  const saved = profiles.create({
    marca: 'M',
    modelo: 'X',
    serie: '123',
    ansr: 'ANSR',
    ipq: 'IPQ',
    verificacao: 'periodica'
  });
  expect(saved.marca).toBe('M');

  profiles.saveOperator({
    posto: 'POSTO',
    numero: '42',
    nome: 'Operador',
    modo: 'fixo',
    veiculo: '',
    regime: 'autoestrada',
    limite: ''
  });

  new CinemometerModule({ telemetry, profiles }).mount(root);

  const speed = root.querySelector<HTMLInputElement>('input[type="number"][required]');
  expect(speed).not.toBeNull();
  if (!speed) return;

  speed.value = '130';
  root.querySelector('form.cin-form')?.dispatchEvent(
    new Event('submit', { bubbles: true, cancelable: true })
  );

  expect(telemetry.track).toHaveBeenCalledWith(
    'cinemometer_calculation',
    'cinemometro',
    expect.objectContaining({
      aparelho_marca: 'M',
      aparelho_modelo: 'X',
      aparelho_serie: '123',
      verificacao: 'periodica',
      tipo_cinemometro: 'radar_fixo',
      velocidade_registada: 130,
      velocidade_deduzida: 123,
      limite: 120,
      excesso: 3,
      gravidade: expect.any(String),
      codigo: expect.any(String),
      aparelho_configurado: true,
      operador_nome: 'Operador',
      operador_numero: '42',
      operador_posto: 'POSTO',
      operador_identificado: true
    })
  );

  expect(profiles.operatorSession()).toMatchObject({
    modo: 'fixo',
    regime: 'autoestrada',
    limite: '120'
  });
});


it('mostra o texto operacional e regista cópia quando a API Clipboard aceita', async () => {
  const root = document.createElement('main');
  const telemetry = { track: vi.fn() };
  const clipboard = { writeText: vi.fn(async () => undefined) };
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: clipboard
  });

  new CinemometerModule({ telemetry }).mount(root);

  const speed = root.querySelector<HTMLInputElement>('input[type="number"][required]');
  const form = root.querySelector<HTMLFormElement>('form.cin-form');
  if (!speed || !form) return;

  speed.value = '130';
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

  const text = root.querySelector<HTMLTextAreaElement>('.cin-operational-text');
  const copy = root.querySelector<HTMLButtonElement>('.cin-copy-button:not(:disabled)');
  expect(text?.value).toContain('O veículo circulava, pelo menos');
  expect(copy).not.toBeNull();

  copy?.click();
  await Promise.resolve();

  expect(clipboard.writeText).toHaveBeenCalled();
  expect(telemetry.track).toHaveBeenCalledWith(
    'cinemometer_copy_code',
    'cinemometro',
    { copied: true }
  );
});
