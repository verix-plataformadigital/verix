import { normalizeAsfDate } from "../../shared/validators/vehicle";

export const HISTORY_KEY = "VERIX_CONSULTAS_HISTORICO_V1";
export const HISTORY_LIMIT = 100;

export interface HistoryRecord {
  readonly id: string;
  readonly veiculo: string;
  readonly reboque: string;
  readonly data: string;
  readonly dataConsultaAsf?: string;
  readonly seguro: "pendente" | "sim" | "nao" | "desconhecido";
  readonly seguroAtualizado?: string;
}

export interface HistoryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class HistoryService {
  private records: HistoryRecord[] = [];

  constructor(
    private readonly storage: HistoryStorage | null,
    private readonly now: () => Date = () => new Date(),
    private readonly idFactory: () => string = () => {
      if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
      }
      return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }
  ) {
    this.records = this.load();
  }

  list(): readonly HistoryRecord[] {
    return this.records;
  }

  add(veiculo: string, reboque: string, queryId?: string | null, dataConsultaAsf?: string | null): HistoryRecord | null {
    const v = veiculo.trim().toUpperCase();
    const r = reboque.trim().toUpperCase();
    if (!v && !r) return null;

    const asfDate = normalizeAsfDate(dataConsultaAsf);
    const record: HistoryRecord = {
      id: queryId || `hist_${this.idFactory()}`,
      veiculo: v,
      reboque: r,
      data: this.now().toISOString(),
      ...(asfDate ? { dataConsultaAsf: asfDate } : {}),
      seguro: "pendente"
    };

    this.records = [record, ...this.records].slice(0, HISTORY_LIMIT);
    this.persist();
    return record;
  }

  updateInsurance(
    queryId: string | null,
    matriculaFallback: string | null,
    estado: HistoryRecord["seguro"]
  ): boolean {
    const qid = String(queryId || "");
    const plate = String(matriculaFallback || "").trim().toUpperCase();
    if (!qid && !plate) return false;

    let index = qid ? this.records.findIndex((item) => item.id === qid) : -1;

    if (!qid && index < 0 && plate) {
      index = this.records.findIndex(
        (item) =>
          item.id.startsWith("hist_") &&
          (item.veiculo === plate || item.reboque === plate)
      );
    }

    if (index < 0) return false;

    const current = this.records[index];
    if (!current) return false;

    this.records[index] = {
      ...current,
      seguro: estado,
      seguroAtualizado: this.now().toISOString()
    };

    this.persist();
    return true;
  }

  removeAll(): void {
    this.records = [];
    try {
      this.storage?.removeItem(HISTORY_KEY);
    } catch {
      // Preserve in-memory state when storage is unavailable.
    }
  }

  private load(): HistoryRecord[] {
    try {
      const raw = this.storage?.getItem(HISTORY_KEY);
      if (!raw) return [];

      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];

      return parsed
        .filter((item): item is Record<string, unknown> =>
          !!item && typeof item === "object" && !Array.isArray(item)
        )
        .map((item) => this.normalize(item))
        .filter((item): item is HistoryRecord => item !== null)
        .slice(0, HISTORY_LIMIT);
    } catch {
      return [];
    }
  }

  private normalize(item: Record<string, unknown>): HistoryRecord | null {
    const veiculo = String(item.veiculo ?? "").trim().toUpperCase();
    const reboque = String(item.reboque ?? "").trim().toUpperCase();
    const id = String(item.id ?? "").trim();
    const data = String(item.data ?? "").trim();

    if ((!veiculo && !reboque) || !id || !data) return null;

    const rawState = String(item.seguro ?? "desconhecido");
    const seguro: HistoryRecord["seguro"] =
      rawState === "pendente" ||
      rawState === "sim" ||
      rawState === "nao" ||
      rawState === "desconhecido"
        ? rawState
        : "desconhecido";

    const seguroAtualizado = String(item.seguroAtualizado ?? "").trim();
    const dataConsultaAsf = normalizeAsfDate(item.dataConsultaAsf);

    return {
      id,
      veiculo,
      reboque,
      data,
      ...(dataConsultaAsf ? { dataConsultaAsf } : {}),
      seguro,
      ...(seguroAtualizado ? { seguroAtualizado } : {})
    };
  }

  private persist(): void {
    try {
      this.storage?.setItem(HISTORY_KEY, JSON.stringify(this.records));
    } catch {
      // Keep the history available in memory.
    }
  }
}
