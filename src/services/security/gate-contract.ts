export interface VerixSecurityIdentity {
  readonly installationId: string;
  readonly sessionId: string;
  readonly tabId: string;
  readonly buildId: string;
}

export interface GateAuthorization {
  getToken(forceRefresh?: boolean): Promise<string>;
  getIdentity(): VerixSecurityIdentity;
  clear(): void;
}
