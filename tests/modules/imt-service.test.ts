// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { browserImtWindowAdapter, ImtService } from '../../src/modules/imt/imt-service';

describe('ImtService', () => {
  it('cria os dois destinos da consulta com a sequência corrente', () => {
    const open = vi.fn().mockReturnValue(true);
    const service = new ImtService({ open });

    const operation = service.createOperation('12-AB-34', 'VC-1234');

    expect(operation.sequence).toBe(1);
    expect(operation.inspectionUrl).toBe(
      'http://extranet.imtt.external.rnsi.local/veiculos/consulta_inspecao.php?Matricula=12AB34'
    );
    expect(operation.livreteUrl).toBe(
      'http://extranet.imtt.external.rnsi.local/veiculos/consulta_livrete.php?Matricula=VC1234'
    );
    expect(open).not.toHaveBeenCalled();
  });

  it('incrementa a sequência a cada operação', () => {
    const service = new ImtService({ open: () => true });
    expect(service.createOperation('12-AB-34', '').sequence).toBe(1);
    expect(service.createOperation('AA-11-AA', '').sequence).toBe(2);
  });

  it('isola a abertura externa atrás do adapter', () => {
    const open = vi.fn().mockReturnValue({});
    const service = new ImtService({ open });

    expect(service.open('inspecao', '12-AB-34')).toBe(true);
    expect(open).toHaveBeenCalledWith(
      'http://extranet.imtt.external.rnsi.local/veiculos/consulta_inspecao.php?Matricula=12AB34'
    );
  });

  it('devolve false quando o host bloqueia a janela', () => {
    const service = new ImtService({ open: () => false });
    expect(service.open('livrete', 'VC-1234')).toBe(false);
  });
});


describe('browser IMT window adapter', () => {
  it('reports successful opening without relying on the noopener return value', () => {
    const openedWindow = { opener: window } as unknown as WindowProxy;
    const open = vi.spyOn(window, 'open').mockReturnValue(openedWindow);

    try {
      const adapter = browserImtWindowAdapter();
      expect(adapter.open('http://extranet.imtt.external.rnsi.local/veiculos/consulta_inspecao.php?Matricula=12AB34')).toBe(true);
      expect(open).toHaveBeenCalledWith(
        'http://extranet.imtt.external.rnsi.local/veiculos/consulta_inspecao.php?Matricula=12AB34',
        '_blank'
      );
      expect(openedWindow.opener).toBeNull();
    } finally {
      open.mockRestore();
    }
  });

  it('reports a blocked popup when the browser returns null', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);

    try {
      expect(browserImtWindowAdapter().open('http://extranet.imtt.external.rnsi.local/veiculos/consulta_livrete.php?Matricula=VC1234')).toBe(false);
    } finally {
      open.mockRestore();
    }
  });
});
