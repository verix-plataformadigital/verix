export type CinemometerMode = "fixo" | "movimento" | "perseguicao" | "media";
export type VerificationType = "primeira" | "periodica";

export type CinemometerType =
  | "radar_fixo"
  | "radar_movimento"
  | "sensor_estatico"
  | "lidar_fixo"
  | "lidar_movimento"
  | "perseguicao"
  | "aeronave"
  | "video_secao"
  | "tratamento_imagem";

export type VehicleType =
  | "ligeiro_passageiros_sem"
  | "ligeiro_passageiros_com"
  | "ligeiro_mercadorias_sem"
  | "ligeiro_mercadorias_com"
  | "motociclo_mais50_sem"
  | "motociclo_mais50_com"
  | "motociclo_ate50"
  | "triciclo"
  | "ciclomotor"
  | "pesado_passageiros_sem"
  | "pesado_passageiros_com"
  | "pesado_mercadorias_sem"
  | "pesado_mercadorias_com"
  | "trator"
  | "maquina_agricola"
  | "maquina_industrial";

export type SpeedRegime =
  | "coexistencia"
  | "local_geral"
  | "restante"
  | "reservada"
  | "autoestrada"
  | "local_placas"
  | "fora_placas"
  | "auto_placas"
  | "especial"
  | "personalizado";

export type VehicleGroup = "light" | "other";
export type CodeFamily = "local_geral" | "local_placas" | "fora_geral" | "fora_placas";

export interface ExcessClassification {
  readonly gravidade: "Leve" | "Grave" | "Muito Grave";
  readonly coima: string;
  readonly pontos: string;
  readonly inibicao: string;
  readonly faixa: "leve" | "grave" | "muito" | "topo";
}

export const CIN_LIGHT_VEHICLES: ReadonlySet<VehicleType> = new Set([
  "ligeiro_passageiros_sem",
  "ligeiro_passageiros_com",
  "ligeiro_mercadorias_sem",
  "ligeiro_mercadorias_com",
  "motociclo_mais50_sem",
  "motociclo_mais50_com",
  "motociclo_ate50",
  "triciclo"
]);

export const CIN_VEHICLE_LIMITS: Readonly<
  Record<VehicleType, Partial<Record<SpeedRegime, number | null>>>
> = {
  ligeiro_passageiros_sem: { coexistencia: 20, local_geral: 50, autoestrada: 120, reservada: 100, restante: 90 },
  ligeiro_passageiros_com: { coexistencia: 20, local_geral: 50, autoestrada: 100, reservada: 80, restante: 70 },
  ligeiro_mercadorias_sem: { coexistencia: 20, local_geral: 50, autoestrada: 110, reservada: 90, restante: 80 },
  ligeiro_mercadorias_com: { coexistencia: 20, local_geral: 50, autoestrada: 90, reservada: 80, restante: 70 },
  motociclo_mais50_sem: { coexistencia: 20, local_geral: 50, autoestrada: 120, reservada: 100, restante: 90 },
  motociclo_mais50_com: { coexistencia: 20, local_geral: 50, autoestrada: 100, reservada: 80, restante: 70 },
  motociclo_ate50: { coexistencia: 20, local_geral: 40, autoestrada: null, reservada: null, restante: 60 },
  triciclo: { coexistencia: 20, local_geral: 50, autoestrada: 100, reservada: 90, restante: 80 },
  ciclomotor: { coexistencia: 20, local_geral: 40, autoestrada: null, reservada: null, restante: 45 },
  pesado_passageiros_sem: { coexistencia: 20, local_geral: 50, autoestrada: 100, reservada: 90, restante: 80 },
  pesado_passageiros_com: { coexistencia: 20, local_geral: 50, autoestrada: 90, reservada: 90, restante: 70 },
  pesado_mercadorias_sem: { coexistencia: 20, local_geral: 50, autoestrada: 90, reservada: 80, restante: 80 },
  pesado_mercadorias_com: { coexistencia: 20, local_geral: 40, autoestrada: 80, reservada: 70, restante: 70 },
  trator: { coexistencia: 20, local_geral: 30, autoestrada: null, reservada: null, restante: 40 },
  maquina_agricola: { coexistencia: 20, local_geral: 20, autoestrada: null, reservada: null, restante: 20 },
  maquina_industrial: { coexistencia: 20, local_geral: 40, autoestrada: 80, reservada: 70, restante: 70 }
};

const CIN_CODES = {
  light: {
    local_geral: { leve: "1860270109", grave: "2860270110", muito: "3860270111", topo: "3860270112" },
    local_placas: { leve: "1860280106", grave: "2860280107", muito: "3860280108", topo: "3860280109" },
    fora_geral: { leve: "1860270113", grave: "2860270114", muito: "3860270115", topo: "3860270116" },
    fora_placas: { leve: "1860280110", grave: "2860280111", muito: "3860280112", topo: "3860280113" }
  },
  other: {
    local_geral: { leve: "1860270117", grave: "2860270118", muito: "3860270119", topo: "3860270120" },
    local_placas: { leve: "1860280118", grave: "2860280119", muito: "3860280120", topo: "3860280121" },
    fora_geral: { leve: "1860270121", grave: "2860270122", muito: "3860270123", topo: "3860270124" },
    fora_placas: { leve: "1860280122", grave: "2860280123", muito: "3860280124", topo: "3860280125" }
  }
} as const;

export function vehicleGroup(vehicle: VehicleType): VehicleGroup {
  return CIN_LIGHT_VEHICLES.has(vehicle) ? "light" : "other";
}

export function codeFamily(regime: SpeedRegime): CodeFamily | null {
  if (regime === "coexistencia" || regime === "local_geral") return "local_geral";
  if (regime === "local_placas") return "local_placas";
  if (regime === "autoestrada" || regime === "reservada" || regime === "restante") return "fora_geral";
  if (regime === "fora_placas" || regime === "auto_placas") return "fora_placas";
  return null;
}

export function defaultSpeedLimit(vehicle: VehicleType, regime: SpeedRegime): number | null {
  if (regime === "especial" || regime === "personalizado" || regime === "local_placas" || regime === "fora_placas") {
    return null;
  }
  if (regime === "auto_placas") return 100;
  return CIN_VEHICLE_LIMITS[vehicle][regime] ?? null;
}

/**
 * Legacy V61 compatibility rule.
 * Kept only for characterization/backward comparison with the old runtime.
 * New V2 calculations must use emaForCinemometer().
 */
export function ema(mode: CinemometerMode, verification: VerificationType): number {
  if (mode === "movimento" || mode === "perseguicao") {
    return verification === "primeira" ? 0.05 : 0.07;
  }
  return verification === "primeira" ? 0.03 : 0.05;
}

const ROAD_EMA_PERCENT: Record<CinemometerType, readonly [number, number]> = {
  radar_fixo: [0.03, 0.05],
  radar_movimento: [0.05, 0.07],
  sensor_estatico: [0.03, 0.05],
  lidar_fixo: [0.03, 0.05],
  lidar_movimento: [0.05, 0.07],
  perseguicao: [0.03, 0.05],
  aeronave: [0.07, 0.10],
  video_secao: [0.03, 0.05],
  tratamento_imagem: [0.03, 0.05]
};

/**
 * Current Portuguese legal-metrological road EMA, based on Portaria 352/2023.
 * The first tuple item is the first-verification road value; the second is
 * the periodic/extraordinary road value. At or below 100 km/h the applicable
 * value is a fixed percentage of 1 km/h units; above 100 km/h it is applied
 * as a percentage to the recorded speed.
 */
export function emaForCinemometer(
  type: CinemometerType,
  verification: VerificationType
): number {
  const values = ROAD_EMA_PERCENT[type];
  return verification === "primeira" ? values[0] : values[1];
}

export function calculateDeducedSpeedForCinemometer(
  recordedSpeed: number,
  type: CinemometerType,
  verification: VerificationType
): number | null {
  if (!Number.isFinite(recordedSpeed) || recordedSpeed <= 0) return null;

  const error = emaForCinemometer(type, verification);
  const deduction = recordedSpeed <= 100
    ? Math.round(error * 100)
    : recordedSpeed * error;

  return roundDown(recordedSpeed - deduction);
}

export function roundDown(value: number): number {
  return Math.floor(value + 1e-9);
}

export function calculateDeducedSpeed(
  recordedSpeed: number,
  mode: CinemometerMode,
  verification: VerificationType
): number | null {
  if (!Number.isFinite(recordedSpeed) || recordedSpeed <= 0) return null;

  const error = ema(mode, verification);
  const deduction = recordedSpeed <= 100
    ? error * 100
    : recordedSpeed * error;

  return roundDown(recordedSpeed - deduction);
}

export function classifyExcess(
  excess: number,
  vehicle: VehicleType,
  regime: SpeedRegime
): ExcessClassification {
  const light = vehicleGroup(vehicle) === "light";
  const inside = regime === "coexistencia" || regime === "local_geral" || regime === "local_placas";
  const coexist = regime === "coexistencia";

  const serious = light ? (inside ? 20 : 30) : (inside ? 10 : 20);
  const verySerious = light ? (inside ? 40 : 60) : (inside ? 20 : 40);
  const top = light ? (inside ? 60 : 80) : (inside ? 40 : 60);

  if (excess <= serious) {
    return { gravidade: "Leve", coima: "60€ a 300€", pontos: "—", inibicao: "—", faixa: "leve" };
  }
  if (excess <= verySerious) {
    return {
      gravidade: "Grave",
      coima: "120€ a 600€",
      pontos: coexist ? "3" : "2",
      inibicao: "1 mês a 1 ano",
      faixa: "grave"
    };
  }
  if (excess <= top) {
    return {
      gravidade: "Muito Grave",
      coima: "300€ a 1500€",
      pontos: coexist ? "5" : "4",
      inibicao: "2 meses a 2 anos",
      faixa: "muito"
    };
  }
  return {
    gravidade: "Muito Grave",
    coima: "500€ a 2500€",
    pontos: coexist ? "5" : "4",
    inibicao: "2 meses a 2 anos",
    faixa: "topo"
  };
}

export function operationalCodeForVehicle(
  classification: ExcessClassification,
  vehicle: VehicleType,
  regime: SpeedRegime
): string {
  const family = codeFamily(regime);
  if (!family) return "—";
  return CIN_CODES[vehicleGroup(vehicle)][family][classification.faixa];
}
