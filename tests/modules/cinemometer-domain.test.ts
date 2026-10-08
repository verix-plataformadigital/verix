import { describe, expect, it } from "vitest";
import {
  CIN_VEHICLE_LIMITS,
  calculateDeducedSpeed,
  classifyExcess,
  defaultSpeedLimit,
  ema,
  operationalCode,
  vehicleGroup
} from "../../src/modules/cinemometer/cinemometer-domain";

describe("cinemómetro — cálculo puro", () => {
  it("preserva a classificação de veículos do legado", () => {
    expect(vehicleGroup("ligeiro_passageiros_sem")).toBe("ligeiros");
    expect(vehicleGroup("motociclo_sem")).toBe("ligeiros");
    expect(vehicleGroup("triciclo")).toBe("ligeiros");
    expect(vehicleGroup("pesado_mercadorias_sem")).toBe("pesados");
    expect(vehicleGroup("trator")).toBe("pesados");
  });

  it("preserva os valores EMA do legado", () => {
    expect(ema("fixo", "primeira")).toBe(0.03);
    expect(ema("fixo", "periodica")).toBe(0.05);
    expect(ema("movimento", "primeira")).toBe(0.05);
    expect(ema("movimento", "periodica")).toBe(0.07);
    expect(ema("perseguicao", "primeira")).toBe(0.03);
    expect(ema("perseguicao", "periodica")).toBe(0.05);
    expect(ema("media", "primeira")).toBe(0.03);
  });

  it("aplica a dedução fixa até 100 km/h e percentual acima de 100", () => {
    expect(calculateDeducedSpeed(100, "fixo", "primeira")).toBe(97);
    expect(calculateDeducedSpeed(101, "fixo", "primeira")).toBe(97);
    expect(calculateDeducedSpeed(120, "fixo", "primeira")).toBe(116);
    expect(calculateDeducedSpeed(200, "movimento", "periodica")).toBe(186);
    expect(calculateDeducedSpeed(0, "fixo", "primeira")).toBeNull();
    expect(calculateDeducedSpeed(Number.NaN, "fixo", "primeira")).toBeNull();
  });

  it("preserva a matriz de limites atual", () => {
    expect(defaultSpeedLimit("ligeiro_passageiros_sem", "autoestrada")).toBe(120);
    expect(defaultSpeedLimit("ligeiro_passageiros_com", "autoestrada")).toBe(100);
    expect(defaultSpeedLimit("ciclomotor", "autoestrada")).toBeNull();
    expect(defaultSpeedLimit("trator", "restante")).toBe(40);
    expect(defaultSpeedLimit("pesado_mercadorias_com", "local_geral")).toBe(40);
    expect(defaultSpeedLimit("ligeiro_passageiros_sem", "personalizado")).toBeNull();
    expect(Object.keys(CIN_VEHICLE_LIMITS)).toHaveLength(16);
  });

  it("classifica fronteiras de ligeiros dentro/fora de localidade", () => {
    expect(classifyExcess(20, "ligeiro_passageiros_sem", "local_geral").gravidade).toBe("Leve");
    expect(classifyExcess(21, "ligeiro_passageiros_sem", "local_geral").gravidade).toBe("Grave");
    expect(classifyExcess(40, "ligeiro_passageiros_sem", "local_geral").gravidade).toBe("Grave");
    expect(classifyExcess(41, "ligeiro_passageiros_sem", "local_geral").gravidade).toBe("Muito Grave");
    expect(classifyExcess(60, "ligeiro_passageiros_sem", "local_geral").faixa).toBe("muito");
    expect(classifyExcess(61, "ligeiro_passageiros_sem", "local_geral").faixa).toBe("topo");

    expect(classifyExcess(30, "ligeiro_passageiros_sem", "autoestrada").gravidade).toBe("Leve");
    expect(classifyExcess(31, "ligeiro_passageiros_sem", "autoestrada").gravidade).toBe("Grave");
    expect(classifyExcess(60, "ligeiro_passageiros_sem", "autoestrada").gravidade).toBe("Grave");
    expect(classifyExcess(61, "ligeiro_passageiros_sem", "autoestrada").faixa).toBe("muito");
    expect(classifyExcess(80, "ligeiro_passageiros_sem", "autoestrada").faixa).toBe("muito");
    expect(classifyExcess(81, "ligeiro_passageiros_sem", "autoestrada").faixa).toBe("topo");
  });

  it("preserva a regra especial dos pesados e coexistência", () => {
    expect(classifyExcess(10, "pesado_mercadorias_sem", "local_geral").faixa).toBe("leve");
    expect(classifyExcess(11, "pesado_mercadorias_sem", "local_geral").faixa).toBe("grave");
    expect(classifyExcess(20, "pesado_mercadorias_sem", "local_geral").pontos).toBe("2");
    expect(classifyExcess(20, "pesado_mercadorias_sem", "coexistencia").pontos).toBe("3");
    expect(classifyExcess(40, "pesado_mercadorias_sem", "coexistencia").pontos).toBe("5");
  });

  it("preserva os códigos operacionais", () => {
    const light = classifyExcess(25, "ligeiro_passageiros_sem", "local_geral");
    const external = classifyExcess(25, "ligeiro_passageiros_sem", "autoestrada");

    expect(operationalCode(light, "local_geral")).toBe("2860270110");
    expect(operationalCode(external, "autoestrada")).toBe("1860270113");
  });
});
