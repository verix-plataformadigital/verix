import type { AsfGraphqlResponse, AsfLicenseNode } from "./asf-contract";

export type AsfOutcome =
  | { readonly kind: "insured"; readonly node: AsfLicenseNode }
  | { readonly kind: "no-record" }
  | { readonly kind: "invalid-response"; readonly reason: string }
  | { readonly kind: "graphql-error"; readonly messages: readonly string[] };

function licenseNodes(response: AsfGraphqlResponse): readonly AsfLicenseNode[] | null | undefined {
  return response.data?.mobishoutEntry?.noone?.entry?.licenseNumber?.nodes;
}

/**
 * Preserves the operational distinction that matters to VÉRIX:
 * an HTTP 200 response is not, by itself, proof of insurance.
 * A license node must contain a non-null license value.
 */
export function classifyAsfResponse(response: AsfGraphqlResponse): AsfOutcome {
  const errors = response.errors
    ?.map((item) => String(item.message ?? "").trim())
    .filter(Boolean) ?? [];

  if (errors.length > 0) {
    return { kind: "graphql-error", messages: errors };
  }

  const nodes = licenseNodes(response);

  if (nodes == null) {
    return {
      kind: "invalid-response",
      reason: "O caminho GraphQL de licenseNumber.nodes não existe."
    };
  }

  if (nodes.length === 0) {
    return { kind: "no-record" };
  }

  const insuredNode = nodes.find((node) => node.license !== null && node.license !== undefined);

  return insuredNode
    ? { kind: "insured", node: insuredNode }
    : { kind: "no-record" };
}
