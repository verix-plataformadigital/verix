export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class SafeStorage {
  constructor(private readonly storage: StorageLike | null) {}

  get(key: string): string | null {
    try {
      return this.storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  set(key: string, value: string): boolean {
    try {
      if (!this.storage) return false;
      this.storage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }

  remove(key: string): boolean {
    try {
      if (!this.storage) return false;
      this.storage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  }
}
