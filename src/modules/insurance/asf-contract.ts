export interface AsfQueryRequest {
  readonly matricula: string;
  readonly date: string;
  readonly installationId: string;
}

export interface AsfLicenseNode {
  readonly id: string | null;
  readonly entity: string | null;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly policy: string | null;
  readonly license: string | null;
  readonly code: string | null;
  readonly logo: string | null;
}

export interface AsfGraphqlResponse {
  readonly data?: {
    readonly mobishoutEntry?: {
      readonly noone?: {
        readonly entry?: {
          readonly licenseNumber?: {
            readonly nodes?: readonly AsfLicenseNode[] | null;
          } | null;
        } | null;
      } | null;
    } | null;
  } | null;
  readonly errors?: readonly {
    readonly message?: string;
    readonly path?: readonly (string | number)[];
  }[];
}
