import { normalizePlate } from "../../shared/validators/vehicle";
import type { ImtSource } from "./imt-contract";

export const IMT_RNSI_BASE_URL =
  "http://consultapsp.imtt.external.rnsi.local/veiculos/";

const IMT_RNSI_PATHS: Record<ImtSource, string> = {
  inspecao: "consulta_inspecao.php",
  livrete: "consulta_livrete.php"
};

export function buildImtRnsiUrl(source: ImtSource, plate: string): string {
  const normalized = normalizePlate(plate);
  return (
    IMT_RNSI_BASE_URL +
    IMT_RNSI_PATHS[source] +
    "?Matricula=" +
    encodeURIComponent(normalized)
  );
}

export interface ImtQueryTargets {
  readonly inspecao: string;
  readonly livrete: string;
}

export function buildImtQueryTargets(
  vehiclePlate: string,
  trailerPlate: string
): ImtQueryTargets {
  const vehicle = normalizePlate(vehiclePlate);
  const trailer = normalizePlate(trailerPlate);

  return {
    inspecao: vehicle || trailer,
    livrete: trailer || vehicle
  };
}
