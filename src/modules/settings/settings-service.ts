export const SETTINGS_KEY = 'VÉRIX_PREFS_V1';

export type SettingsTheme = 'dark' | 'light';
export type SettingsDensity = 'compact' | 'normal' | 'comfortable';
export type SettingsScale = 'auto' | '80' | '90' | '100' | '110' | '120';
export type SettingsProfile = 'escudo' | 'fiscalizacao' | 'leitura' | 'posto';

export interface VerixSettings {
  readonly theme: SettingsTheme;
  readonly density: SettingsDensity;
  readonly scale: SettingsScale;
  readonly hud: boolean;
  readonly transitions: boolean;
  readonly history: boolean;
  readonly cinRadarCollapsed: boolean;
  readonly profile: SettingsProfile;
}

export interface SettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const DEFAULT_SETTINGS: VerixSettings = {
  theme: 'dark',
  density: 'compact',
  scale: 'auto',
  hud: true,
  transitions: true,
  history: true,
  cinRadarCollapsed: true,
  profile: 'escudo'
};

const PROFILES: Record<SettingsProfile, Partial<VerixSettings>> = {
  escudo: { density: 'compact', scale: 'auto', hud: true, transitions: true },
  fiscalizacao: { density: 'compact', scale: '90', hud: true, transitions: false },
  leitura: { density: 'comfortable', scale: '100', hud: false, transitions: true },
  posto: { density: 'compact', scale: '80', hud: false, transitions: false }
};

export class SettingsService {
  private settings: VerixSettings;

  constructor(private readonly storage: SettingsStorage | null) {
    this.settings = this.load();
  }

  snapshot(): VerixSettings {
    return this.settings;
  }

  update(patch: Partial<VerixSettings>): VerixSettings {
    this.settings = {
      ...this.settings,
      ...sanitize(patch)
    };
    this.persist();
    return this.settings;
  }

  setProfile(profile: SettingsProfile): VerixSettings {
    this.settings = {
      ...this.settings,
      ...PROFILES[profile],
      profile
    };
    this.persist();
    return this.settings;
  }

  reset(): VerixSettings {
    this.settings = DEFAULT_SETTINGS;
    this.persist();
    return this.settings;
  }

  localSummary(): string {
    const p = this.settings;
    return [
      `tema=${p.theme}`,
      `densidade=${p.density}`,
      `escala=${p.scale}`,
      `HUD=${p.hud ? 'on' : 'off'}`,
      `transições=${p.transitions ? 'on' : 'off'}`,
      `histórico=${p.history ? 'on' : 'off'}`
    ].join(' · ');
  }

  applyToDocument(doc: Document): void {
    const body = doc.body;
    body.classList.toggle('theme-light', this.settings.theme === 'light');
    body.classList.toggle('ui-compact', this.settings.density === 'compact');
    body.classList.toggle('ui-normal', this.settings.density === 'normal');
    body.classList.toggle('ui-comfortable', this.settings.density === 'comfortable');
    body.classList.toggle('no-hud', !this.settings.hud);
    body.classList.toggle('no-transitions', !this.settings.transitions);

    for (const scale of ['80', '90', '100', '110', '120'] as const) {
      body.classList.toggle(`ui-scale-${scale}`, this.settings.scale === scale);
    }
    body.classList.toggle('ui-scale-auto', this.settings.scale === 'auto');
    if (this.settings.scale === 'auto') {
      const width = Math.max(
        doc.documentElement.clientWidth || 0,
        (doc.defaultView?.innerWidth || 0)
      );
      const height = Math.max(
        doc.documentElement.clientHeight || 0,
        (doc.defaultView?.innerHeight || 0)
      );
      const zoom = Math.max(0.82, Math.min(1.08, Math.min(width / 1600, height / 900)));
      body.style.zoom = zoom.toFixed(3);
    } else {
      body.style.zoom = `${Number(this.settings.scale) / 100}`;
    }
  }

  private load(): VerixSettings {
    try {
      const raw = this.storage?.getItem(SETTINGS_KEY);
      if (!raw) return DEFAULT_SETTINGS;
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return DEFAULT_SETTINGS;
      }
      return { ...DEFAULT_SETTINGS, ...sanitize(parsed as Record<string, unknown>) };
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  private persist(): void {
    try {
      this.storage?.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      // Preferences remain available in memory.
    }
  }
}

type MutableSettingsPatch = {
  -readonly [K in keyof VerixSettings]?: VerixSettings[K];
};

function sanitize(
  patch: Record<string, unknown> | Partial<VerixSettings>
): MutableSettingsPatch {
  const p = patch as Record<string, unknown>;
  const result: Partial<VerixSettings> = {};

  if (p.theme === 'dark' || p.theme === 'light') result.theme = p.theme;
  if (p.density === 'compact' || p.density === 'normal' || p.density === 'comfortable') {
    result.density = p.density;
  }
  if (['auto', '80', '90', '100', '110', '120'].includes(String(p.scale))) {
    result.scale = String(p.scale) as SettingsScale;
  }
  for (const key of ['hud', 'transitions', 'history', 'cinRadarCollapsed'] as const) {
    if (typeof p[key] === 'boolean') result[key] = p[key];
  }
  if (p.profile === 'escudo' || p.profile === 'fiscalizacao' || p.profile === 'leitura' || p.profile === 'posto') {
    result.profile = p.profile;
  }

  return result;
}
