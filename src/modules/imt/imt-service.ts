import { buildImtRnsiUrl, buildImtQueryTargets } from './imt-url-builder';
import type { ImtSource } from './imt-contract';

export interface ImtWindowAdapter {
  open(url: string): Window | null;
}

export interface ImtOperation {
  readonly sequence: number;
  readonly inspectionUrl: string;
  readonly livreteUrl: string;
}

export class ImtService {
  private sequence = 0;

  constructor(
    private readonly windowAdapter: ImtWindowAdapter,
    private readonly sequenceSource: { next(): number } = { next: () => ++this.sequence }
  ) {}

  createOperation(vehiclePlate: string, trailerPlate: string): ImtOperation {
    const targets = buildImtQueryTargets(vehiclePlate, trailerPlate);
    const sequence = this.sequenceSource.next();
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
    open: (url) => window.open(url, '_blank', 'noopener,noreferrer')
  };
}