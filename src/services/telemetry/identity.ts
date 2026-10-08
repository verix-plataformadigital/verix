import { SafeStorage, type StorageLike } from "./storage";

export interface IdentityOptions {
  readonly installationKey?: string;
  readonly sessionKey?: string;
  readonly tabKey?: string;
  readonly idFactory?: () => string;
}

export interface VerixIdentity {
  readonly installationId: string;
  readonly sessionId: string;
  readonly tabId: string;
}

function defaultIdFactory(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
}

function persistentId(
  store: SafeStorage,
  key: string,
  prefix: string,
  idFactory: () => string
): string {
  const existing = store.get(key);
  if (existing) return existing.slice(0, 120);

  const created = (prefix + "-" + idFactory()).slice(0, 120);
  store.set(key, created);
  return created;
}

export function createIdentity(
  localStorage: StorageLike | null,
  sessionStorage: StorageLike | null,
  options: IdentityOptions = {}
): VerixIdentity {
  const local = new SafeStorage(localStorage);
  const session = new SafeStorage(sessionStorage);
  const idFactory = options.idFactory ?? defaultIdFactory;

  return {
    installationId: persistentId(
      local,
      options.installationKey ?? "VERIX_T2_INSTALL_ID",
      "i",
      idFactory
    ),
    sessionId: persistentId(
      session,
      options.sessionKey ?? "VERIX_T2_SESSION_ID",
      "s",
      idFactory
    ),
    tabId: persistentId(
      session,
      options.tabKey ?? "VERIX_T2_TAB_ID",
      "t",
      idFactory
    )
  };
}
