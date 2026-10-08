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
    expect(track).toHaveBeenCalledWith('module_open', 'informacoes');
  });

  it('abre apenas a origem oficial configurada', () => {
    const root = document.createElement('main');
    const track = vi.fn();
    const openedWindow = { opener: window } as unknown as WindowProxy;
    const open = vi.spyOn(window, 'open').mockReturnValue(openedWindow);

    new InformationModule({ telemetry: { track } }).mount(root);
    root.querySelector<HTMLButtonElement>('.information-source')?.click();

    expect(open).toHaveBeenCalledWith('https://diariodarepublica.pt/', '_blank');
    expect(openedWindow.opener).toBeNull();
    expect(track).toHaveBeenCalledWith('external_tool_open', 'informacoes', {
      source: 'diariodarepublica',
      opened: true
    });

    open.mockRestore();
  });
});
