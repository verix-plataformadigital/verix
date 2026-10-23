// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { InformationModule } from '../../src/modules/information/information-module';

describe('InformationModule', () => {
  it('renderiza informação, aviso legal e versão sem HTML dinâmico', () => {
    const root = document.createElement('main');
    const track = vi.fn();

    new InformationModule({ telemetry: { track } }).mount(root);

    expect(root.querySelectorAll('.information-card')).toHaveLength(3);
    expect(root.querySelector('.information-legal')).toBeTruthy();
    expect(root.textContent).toContain('Esta aplicação não está afiliada');
    expect(root.textContent).toContain('Versão 1.5');
    expect(root.textContent).toContain('O código publicado no navegador pode ser inspecionado');
    expect(track).toHaveBeenCalledWith('module_open', 'informacoes');
  });

  it('renderiza um link nativo seguro para a origem oficial', () => {
    const root = document.createElement('main');
    const track = vi.fn();

    new InformationModule({ telemetry: { track } }).mount(root);
    const source = root.querySelector<HTMLAnchorElement>('.information-source');

    expect(source).not.toBeNull();
    if (!source) return;

    expect(source.href).toBe('https://diariodarepublica.pt/');
    expect(source.target).toBe('_blank');
    expect(source.rel).toBe('noopener noreferrer');

    source.click();
    expect(track).toHaveBeenCalledWith('external_tool_open', 'informacoes', {
      source: 'diariodarepublica',
      requested: true
    });
  });
});
