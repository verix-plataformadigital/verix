export const CINEMOMETER_PROFILES_KEY = 'VÉRIX_CINEMOMETROS_V2';
export const CINEMOMETER_OPERATOR_KEY = 'VÉRIX_CINEMOMETRO_OPERADOR_V2';

export interface CinemometerProfile {
  readonly id: string;
  readonly marca: string;
  readonly modelo: string;
  readonly serie: string;
  readonly ansr: string;
  readonly ipq: string;
  readonly dataipq: string;
  readonly verificacao: 'primeira' | 'periodica';
  readonly certtipo: string;
  readonly cert: string;
  readonly nota: string;
}

export interface CinemometerOperatorSession {
  readonly posto: string;
  readonly numero: string;
  readonly nome: string;
  readonly modo: 'fixo' | 'movimento' | 'perseguicao' | 'media';
  readonly veiculo: string;
  readonly regime: string;
  readonly limite: string;
}

export interface ProfileStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class CinemometerProfileService {
  private profiles: CinemometerProfile[];
  private operator: CinemometerOperatorSession | null;

  constructor(
    private readonly storage: ProfileStorage | null,
    private readonly idFactory: () => string = () => {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return 'cin_' + crypto.randomUUID();
      return 'cin_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    }
  ) {
    this.profiles = this.loadProfiles();
    this.operator = this.loadOperator();
  }

  list(): readonly CinemometerProfile[] { return this.profiles; }
  operatorSession(): CinemometerOperatorSession | null { return this.operator; }

  create(seed?: Partial<CinemometerProfile>): CinemometerProfile {
    const profile: CinemometerProfile = {
      id: seed?.id || this.idFactory(),
      marca: seed?.marca ?? '',
      modelo: seed?.modelo ?? '',
      serie: seed?.serie ?? '',
      ansr: seed?.ansr ?? '',
      ipq: seed?.ipq ?? '',
      dataipq: seed?.dataipq ?? '',
      verificacao: seed?.verificacao === 'periodica' ? 'periodica' : 'primeira',
      certtipo: seed?.certtipo ?? '',
      cert: seed?.cert ?? '',
      nota: seed?.nota ?? ''
    };
    this.profiles = [...this.profiles, profile];
    this.persistProfiles();
    return profile;
  }

  save(profile: CinemometerProfile): void {
    const index = this.profiles.findIndex((item) => item.id === profile.id);
    this.profiles = index < 0
      ? [...this.profiles, profile]
      : this.profiles.map((item) => item.id === profile.id ? profile : item);
    this.persistProfiles();
  }

  duplicate(profile: CinemometerProfile): CinemometerProfile {
    const duplicate = this.create({ ...profile, id: this.idFactory() });
    return duplicate;
  }

  remove(id: string): boolean {
    const next = this.profiles.filter((item) => item.id !== id);
    if (next.length === this.profiles.length) return false;
    this.profiles = next;
    this.persistProfiles();
    return true;
  }

  saveOperator(session: CinemometerOperatorSession): void {
    this.operator = { ...session };
    try { this.storage?.setItem(CINEMOMETER_OPERATOR_KEY, JSON.stringify(this.operator)); } catch { /* memory remains usable */ }
  }

  clearOperator(): void {
    this.operator = null;
    try { this.storage?.removeItem(CINEMOMETER_OPERATOR_KEY); } catch { /* memory remains usable */ }
  }

  profileLabel(profile: CinemometerProfile): string {
    const values = [profile.marca, profile.modelo, profile.serie].map((value) => value.trim()).filter(Boolean);
    return values.length ? values.join(' — ') : 'Cinemómetro sem identificação';
  }

  private loadProfiles(): CinemometerProfile[] {
    try {
      const raw = this.storage?.getItem(CINEMOMETER_PROFILES_KEY);
      if (!raw) return [];
      const value: unknown = JSON.parse(raw);
      if (!Array.isArray(value)) return [];
      return value.map((item) => normalizeProfile(item)).filter((item): item is CinemometerProfile => item !== null);
    } catch { return []; }
  }

  private loadOperator(): CinemometerOperatorSession | null {
    try {
      const raw = this.storage?.getItem(CINEMOMETER_OPERATOR_KEY);
      if (!raw) return null;
      const value: unknown = JSON.parse(raw);
      return normalizeOperator(value);
    } catch { return null; }
  }

  private persistProfiles(): void {
    try { this.storage?.setItem(CINEMOMETER_PROFILES_KEY, JSON.stringify(this.profiles)); } catch { /* memory remains usable */ }
  }
}

function normalizeProfile(value: unknown): CinemometerProfile | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const id = String(item.id ?? '').trim();
  if (!id) return null;
  return {
    id,
    marca: String(item.marca ?? '').trim(),
    modelo: String(item.modelo ?? '').trim(),
    serie: String(item.serie ?? '').trim(),
    ansr: String(item.ansr ?? '').trim(),
    ipq: String(item.ipq ?? '').trim(),
    dataipq: String(item.dataipq ?? '').trim(),
    verificacao: item.verificacao === 'periodica' ? 'periodica' : 'primeira',
    certtipo: String(item.certtipo ?? '').trim(),
    cert: String(item.cert ?? '').trim(),
    nota: String(item.nota ?? '').trim()
  };
}

function normalizeOperator(value: unknown): CinemometerOperatorSession | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const mode = String(item.modo ?? 'fixo');
  return {
    posto: String(item.posto ?? '').trim(),
    numero: String(item.numero ?? '').trim(),
    nome: String(item.nome ?? '').trim(),
    modo: mode === 'movimento' || mode === 'perseguicao' || mode === 'media' ? mode : 'fixo',
    veiculo: String(item.veiculo ?? '').trim(),
    regime: String(item.regime ?? '').trim(),
    limite: String(item.limite ?? '').trim()
  };
}