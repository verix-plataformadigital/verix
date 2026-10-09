// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  SettingsService
} from '../../src/modules/settings/settings-service';

class MemoryStorage {
  private value: string | null = null;
  getItem(key: string): string | null {
    return key === SETTINGS_KEY ? this.value : null;
  }
  setItem(key: string, value: string): void {
    if (key === SETTINGS_KEY) this.value = value;
  }
}

describe('SettingsService', () => {
  it('carrega valores padrão quando não existe persistência', () => {
    const service = new SettingsService(new MemoryStorage());
    expect(service.snapshot()).toEqual(DEFAULT_SETTINGS);
  });

  it('persiste alterações e recarrega os valores', () => {
    const storage = new MemoryStorage();
    const first = new SettingsService(storage);
    first.update({ theme: 'light', scale: '90', history: false });

    const second = new SettingsService(storage);
    expect(second.snapshot()).toMatchObject({
      theme: 'light',
      scale: '90',
      history: false
    });
  });

  it('aplica perfis completos sem perder preferências não abrangidas', () => {
    const service = new SettingsService(new MemoryStorage());
    service.update({ theme: 'light' });
    service.setProfile('posto');

    expect(service.snapshot()).toMatchObject({
      theme: 'light',
      profile: 'posto',
      density: 'compact',
      scale: '80',
      hud: false,
      transitions: false
    });
  });

  it('uses the full CSS viewport for mobile and tablet auto scale', () => {
    const service = new SettingsService(new MemoryStorage());
    service.update({ scale: 'auto' });

    const body = document.body;
    const oldZoom = body.style.zoom;
    const oldInnerWidth = window.innerWidth;
    const oldInnerHeight = window.innerHeight;
    const oldClientWidth = document.documentElement.clientWidth;
    const oldClientHeight = document.documentElement.clientHeight;

    try {
      for (const viewport of [
        { width: 320, height: 568 },
        { width: 390, height: 844 },
        { width: 768, height: 1024 },
        { width: 1024, height: 768 }
      ]) {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: viewport.width });
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: viewport.height });
        Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: viewport.width });
        Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, value: viewport.height });
        service.applyToDocument(document);
        expect(body.style.zoom, `${viewport.width}x${viewport.height}`).toBe('1.000');
      }
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: oldInnerWidth });
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: oldInnerHeight });
      Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: oldClientWidth });
      Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, value: oldClientHeight });
      body.style.zoom = oldZoom;
    }
  });

  it('retains automatic downscaling on larger desktop viewports', () => {
    const service = new SettingsService(new MemoryStorage());
    service.update({ scale: 'auto' });

    const body = document.body;
    const oldZoom = body.style.zoom;
    const oldInnerWidth = window.innerWidth;
    const oldInnerHeight = window.innerHeight;
    const oldClientWidth = document.documentElement.clientWidth;
    const oldClientHeight = document.documentElement.clientHeight;

    try {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });
      Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: 1440 });
      Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, value: 900 });
      service.applyToDocument(document);
      expect(body.style.zoom).toBe('0.900');
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: oldInnerWidth });
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: oldInnerHeight });
      Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: oldClientWidth });
      Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, value: oldClientHeight });
      body.style.zoom = oldZoom;
    }
  });

  it('rejeita valores persistidos inválidos', () => {
    const storage = new MemoryStorage();
    storage.setItem(SETTINGS_KEY, JSON.stringify({
      theme: 'something',
      density: 'broken',
      scale: '999',
      history: 'yes'
    }));

    const service = new SettingsService(storage);
    expect(service.snapshot()).toEqual(DEFAULT_SETTINGS);
  });

  it('applies the persisted visual preferences to the document body', () => {
    const service = new SettingsService(new MemoryStorage());
    service.update({
      theme: 'light',
      density: 'comfortable',
      scale: '110',
      hud: false,
      transitions: false
    });

    const body = document.body;
    const oldClassName = body.className;
    const oldZoom = body.style.zoom;
    try {
      service.applyToDocument(document);
      expect(body.classList.contains('theme-light')).toBe(true);
      expect(body.classList.contains('ui-comfortable')).toBe(true);
      expect(body.classList.contains('no-hud')).toBe(true);
      expect(body.classList.contains('no-transitions')).toBe(true);
      expect(body.classList.contains('ui-scale-110')).toBe(true);
      expect(body.style.zoom).toBe('1.1');
    } finally {
      body.className = oldClassName;
      body.style.zoom = oldZoom;
    }
  });

});
