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
    open: (url) => Boolean(window.open(url, '_blank', 'noopener,noreferrer'))
  };
}