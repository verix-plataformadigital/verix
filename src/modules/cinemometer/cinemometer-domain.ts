export type CinemometerMode =
  | "fixo"
  | "movimento"
  | "perseguicao"
  | "media";

export type VerificationType = "primeira" | "periodica";

export type VehicleType =
  | "ligeiro_passageiros_sem"
  | "ligeiro_passageiros_com"
  | "ligeiro_mercadorias_sem"
  | "ligeiro_mercadorias_com"
  | "motociclo_sem"
  | "motociclo_com"
  | "triciclo"
  | "ciclomotor"
  | "pesado_passageiros_sem"
  | "pesado_passageiros_com"
  | "pesado_mercadorias_sem"
  | "pesado_mercadorias_com"
  | "trator"
  | "maquina_agricola"
  | "maquina_industrial_sem"
  | "maquina_industrial_com";

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

export type VehicleGroup = "ligeiros" | "pesados";

export interface ExcessClassification {
  readonly gravidade: "Leve" | "Grave" | "Muito Grave";
  readonly coima: string;
  readonly pontos: string;
  readonly inibicao: string;
  readonly faixa: "leve" | "grave" | "muito" | "topo";
}

export const CIN_VEHICLE_LIMITS: Readonly<
  Record<VehicleType, Partial<Record<SpeedRegime, number | null>>>
> = {
  ligeiro_passageiros_sem: { coexistencia: 20, local_geral: 50, autoestrada: 120, reservada: 100, restante: 90 },
  ligeiro_passageiros_com: { coexistencia: 20, local_geral: 50, autoestrada: 100, reservada: 80, restante: 70 },
  ligeiro_mercadorias_sem: { coexistencia: 20, local_geral: 50, autoestrada: 110, reservada: 90, restante: 80 },
  ligeiro_mercadorias_com: { coexistencia: 20, local_geral: 50, autoestrada: 90, reservada: 80, restante: 70 },
  motociclo_sem: { coexistencia: 20, local_geral: 50, autoestrada: 120, reservada: 100, restante: 90 },
  motociclo_com: { coexistencia: 20, local_geral: 50, autoestrada: 100, reservada: 80, restante: 70 },
  triciclo: { coexistencia: 20, local_geral: 50, autoestrada: 100, reservada: 90, restante: 80 },
  ciclomotor: { coexistencia: 20, local_geral: 40, autoestrada: null, reservada: null, restante: 45 },
  pesado_passageiros_sem: { coexistencia: 20, local_geral: 50, autoestrada: 100, reservada: 90, restante: 80 },
  pesado_passageiros_com: { coexistencia: 20, local_geral: 50, autoestrada: 90, reservada: 90, restante: 70 },
  pesado_mercadorias_sem: { coexistencia: 20, local_geral: 50, autoestrada: 90, reservada: 80, restante: 80 },
  pesado_mercadorias_com: { coexistencia: 20, local_geral: 40, autoestrada: 80, reservada: 70, restante: 70 },
  trator: { coexistencia: 20, local_geral: 30, autoestrada: null, reservada: null, restante: 40 },
  maquina_agricola: { coexistencia: 20, local_geral: 20, autoestrada: null, reservada: null, restante: 20 },
  maquina_industrial_sem: { coexistencia: 20, local_geral: 30, autoestrada: null, reservada: null, restante: 30 },
  maquina_industrial_com: { coexistencia: 20, local_geral: 40, autoestrada: 80, reservada: 70, restante: 70 }
};

export function vehicleGroup(vehicle: VehicleType): VehicleGroup {
  return (
    vehicle.startsWith("ligeiro_") ||
    vehicle.startsWith("motociclo_") ||
    vehicle === "triciclo"
  ) ? "ligeiros" : "pesados";
}

export function defaultSpeedLimit(
  vehicle: VehicleType,
  regime: SpeedRegime
): number | null {
  if (regime === "especial" || regime === "personalizado") return null;
  return CIN_VEHICLE_LIMITS[vehicle][regime] ?? null;
}

export function ema(
  mode: CinemometerMode,
  verification: VerificationType
): number {
  if (mode === "perseguicao") {
    return verification === "primeira" ? 0.03 : 0.05;
  }
  if (mode === "movimento") {
    return verification === "primeira" ? 0.05 : 0.07;
  }
  return verification === "primeira" ? 0.03 : 0.05;
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
  const group = vehicleGroup(vehicle);
  const outside = regime === "autoestrada" || regime === "reservada" || regime === "restante";
  const coexist = regime === "coexistencia";
  const inside = !outside;

  let seriousLimit: number;
  let verySeriousLimit: number;
  let topLimit: number;

  if (group === "ligeiros") {
    seriousLimit = inside ? 20 : 30;
    verySeriousLimit = inside ? 40 : 60;
    topLimit = inside ? 60 : 80;
  } else {
    seriousLimit = inside ? 10 : 20;
    verySeriousLimit = inside ? 20 : 40;
    topLimit = inside ? 40 : 60;
  }

  if (excess <= seriousLimit) {
    return { gravidade: "Leve", coima: "60€ a 300€", pontos: "—", inibicao: "—", faixa: "leve" };
  }
  if (excess <= verySeriousLimit) {
    return {
      gravidade: "Grave",
      coima: "120€ a 600€",
      pontos: coexist ? "3" : "2",
      inibicao: "1 mês a 1 ano",
      faixa: "grave"
    };
  }
  if (excess <= topLimit) {
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

export function operationalCode(
  classification: ExcessClassification,
  regime: SpeedRegime
): string {
  const outside = regime === "autoestrada" || regime === "reservada" || regime === "restante";
  const external = {
    leve: "1860270113",
    grave: "2860270114",
    muito: "3860270115",
    topo: "3860270116"
  } as const;
  const internal = {
    leve: "1860270109",
    grave: "2860270110",
    muito: "3860270111",
    topo: "3860270112"
  } as const;

  return (outside ? external : internal)[classification.faixa];
}
