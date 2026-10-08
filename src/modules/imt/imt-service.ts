import { buildImtRnsiUrl, buildImtQueryTargets } from './imt-url-builder';
import type { ImtSource } from './imt-contract';
import { ImtSequence } from './imt-sequence';

export interface ImtWindowAdapter {
  open(url: string): boolean;
}

export interface ImtOperation {
  readonly sequence: number;
  readonly inspectionUrl: string;
  readonly livreteUrl: string;
}

export class ImtService {
  private readonly sequence = new ImtSequence();

  constructor(private readonly windowAdapter: ImtWindowAdapter) {}

  createOperation(vehiclePlate: string, trailerPlate: string): ImtOperation {
    const targets = buildImtQueryTargets(vehiclePlate, trailerPlate);
    const sequence = this.sequence.next();
    return {
      sequence,
      inspectionUrl: buildImtRnsiUrl('inspecao', targets.inspecao),
      livreteUrl: buildImtRnsiUrl('livrete', targets.livrete)
    };
  }

  open(source: ImtSource, plate: string): boolean {
    const url = buildImtRnsiUrl(source, plate);
    return Boolean(this.windowAdapter.open(url));
  }
}

export function browserImtWindowAdapter(): ImtWindowAdapter {
  return {
    open: (url) => {
      // The V2 document sets Referrer-Policy: no-referrer. Do not pass the
      // "noopener" feature here: browsers deliberately return null when it is
      // requested, even if the new window opened successfully.
      const opened = window.open(url, "_blank");
      if (!opened) return false;

      // Sever the opener synchronously before the external page finishes
      // loading, retaining protection against reverse tabnabbing while keeping
      // a meaningful return value for popup-blocking diagnostics.
      try {
        opened.opener = null;
      } catch {
        try { opened.close(); } catch { /* best-effort cleanup */ }
        return false;
      }

      return true;
    }
  };
}