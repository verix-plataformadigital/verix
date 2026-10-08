import { describe, expect, it } from "vitest";
import {
  CIN_VEHICLE_LIMITS,
  calculateDeducedSpeed,
  classifyExcess,
  codeFamily,
  defaultSpeedLimit,
  ema,
  emaForCinemometer,
  calculateDeducedSpeedForCinemometer,
  operationalCodeForVehicle,
  vehicleGroup
} from "../../src/modules/cinemometer/cinemometer-domain";

describe("cinemómetro — regra V61 efetiva", () => {
  it("usa os identificadores finais da UI V61", () => {
    expect(vehicleGroup("motociclo_mais50_sem")).toBe("light");
    expect(vehicleGroup("motociclo_ate50")).toBe("light");
    expect(vehicleGroup("ciclomotor")).toBe("other");
    expect(vehicleGroup("maquina_industrial")).toBe("other");
    expect(Object.keys(CIN_VEHICLE_LIMITS)).toHaveLength(16);
  });

  it("preserva EMA final", () => {
    expect(ema("fixo", "primeira")).toBe(0.03);
    expect(ema("media", "periodica")).toBe(0.05);
    expect(ema("movimento", "primeira")).toBe(0.05);
    expect(ema("movimento", "periodica")).toBe(0.07);
    expect(ema("perseguicao", "primeira")).toBe(0.05);
    expect(ema("perseguicao", "periodica")).toBe(0.07);
  });

  it("preserva a regra de dedução final", () => {
    expect(calculateDeducedSpeed(100, "fixo", "primeira")).toBe(97);
    expect(calculateDeducedSpeed(101, "fixo", "primeira")).toBe(97);
    expect(calculateDeducedSpeed(120, "fixo", "primeira")).toBe(116);
    expect(calculateDeducedSpeed(200, "movimento", "periodica")).toBe(186);
    expect(calculateDeducedSpeed(0, "fixo", "primeira")).toBeNull();
  });

  it("preserva limites V61 e exceções especiais", () => {
    expect(defaultSpeedLimit("motociclo_mais50_sem", "autoestrada")).toBe(120);
    expect(defaultSpeedLimit("motociclo_ate50", "local_geral")).toBe(40);
    expect(defaultSpeedLimit("motociclo_ate50", "autoestrada")).toBeNull();
    expect(defaultSpeedLimit("maquina_industrial", "autoestrada")).toBe(80);
    expect(defaultSpeedLimit("maquina_industrial", "personalizado")).toBeNull();
    expect(defaultSpeedLimit("ligeiro_passageiros_sem", "auto_placas")).toBe(100);
  });

  it("mapeia famílias de código V61", () => {
    expect(codeFamily("coexistencia")).toBe("local_geral");
    expect(codeFamily("local_placas")).toBe("local_placas");
    expect(codeFamily("autoestrada")).toBe("fora_geral");
    expect(codeFamily("auto_placas")).toBe("fora_placas");
    expect(codeFamily("especial")).toBeNull();
  });

  it("preserva fronteiras de classificação V61", () => {
    expect(classifyExcess(20, "ligeiro_passageiros_sem", "local_geral").faixa).toBe("leve");
    expect(classifyExcess(21, "ligeiro_passageiros_sem", "local_geral").faixa).toBe("grave");
    expect(classifyExcess(40, "ligeiro_passageiros_sem", "local_geral").faixa).toBe("grave");
    expect(classifyExcess(41, "ligeiro_passageiros_sem", "local_geral").faixa).toBe("muito");
    expect(classifyExcess(60, "ligeiro_passageiros_sem", "local_geral").faixa).toBe("muito");
    expect(classifyExcess(61, "ligeiro_passageiros_sem", "local_geral").faixa).toBe("topo");

    expect(classifyExcess(30, "ligeiro_passageiros_sem", "autoestrada").faixa).toBe("leve");
    expect(classifyExcess(31, "ligeiro_passageiros_sem", "autoestrada").faixa).toBe("grave");
    expect(classifyExcess(60, "ligeiro_passageiros_sem", "autoestrada").faixa).toBe("grave");
    expect(classifyExcess(61, "ligeiro_passageiros_sem", "autoestrada").faixa).toBe("muito");
    expect(classifyExcess(80, "ligeiro_passageiros_sem", "autoestrada").faixa).toBe("muito");
    expect(classifyExcess(81, "ligeiro_passageiros_sem", "autoestrada").faixa).toBe("topo");
  });

  it("preserva família de códigos para ligeiros e outros veículos", () => {
    const light = classifyExcess(25, "ligeiro_passageiros_sem", "local_geral");
    const other = classifyExcess(15, "pesado_mercadorias_sem", "local_geral");

    expect(operationalCodeForVehicle(light, "ligeiro_passageiros_sem", "local_geral")).toBe("2860270110");
    expect(operationalCodeForVehicle(other, "pesado_mercadorias_sem", "local_geral")).toBe("2860270118");
    expect(operationalCodeForVehicle(light, "ligeiro_passageiros_sem", "local_placas")).toBe("2860280107");
    expect(operationalCodeForVehicle(light, "ligeiro_passageiros_sem", "fora_placas")).toBe("2860280111");
  });
});


describe("cinemómetro — EMA legal atual", () => {
  it("distingue radar em movimento de perseguição", () => {
    expect(emaForCinemometer("radar_movimento", "periodica")).toEqual([7, 7]);
    expect(emaForCinemometer("perseguicao", "periodica")).toEqual([5, 5]);
  });

  it("aplica EMA absoluto até 100 km/h", () => {
    expect(emaForCinemometer("radar_fixo", "periodica")).toEqual([5, 5]);
    expect(
      calculateDeducedSpeedForCinemometer(77, "radar_fixo", "periodica")
    ).toBe(72);
  });

  it("aplica percentagem apenas acima de 100 km/h", () => {
    expect(
      calculateDeducedSpeedForCinemometer(120, "radar_movimento", "periodica")
    ).toBe(111);
  });

  it("cobre explicitamente os tipos da Portaria 352/2023", () => {
    expect(emaForCinemometer("aeronave", "periodica")).toEqual([10, 10]);
    expect(emaForCinemometer("video_secao", "periodica")).toEqual([5, 5]);
    expect(emaForCinemometer("tratamento_imagem", "periodica")).toEqual([5, 5]);
  });
});
