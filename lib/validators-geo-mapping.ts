/**
 * Dedicated validator metadata mapping for geographic and infrastructure data.
 */

export interface ValidatorGeoData {
  country?: string;
  city?: string;
  provider?: string;
}

export const VALIDATOR_GEO_MAPPING: Record<string, ValidatorGeoData> = {
  "028986e40f8e9f39bf68fa5f2f8de58514b124a150261a340e13940d286c0c7317": {
    country: "Test Country",
    city: "Test City",
    provider: "Test Provider"
  }
};

export const VALIDATOR_GEO_MAPPING_BY_NODE_ID: Record<string, ValidatorGeoData> = {};

export const VALIDATOR_GEO_MAPPING_BY_ADDRESS: Record<string, ValidatorGeoData> = {};

export function lookupValidatorGeo(params: {
  secp?: string;
  nodeId?: string;
  address?: string;
}): ValidatorGeoData | undefined {
  if (params.secp) {
    const normalized = params.secp.toLowerCase().trim();
    if (VALIDATOR_GEO_MAPPING[normalized]) {
      return VALIDATOR_GEO_MAPPING[normalized];
    }
  }

  if (params.nodeId) {
    const normalized = params.nodeId.toLowerCase().trim();
    if (VALIDATOR_GEO_MAPPING_BY_NODE_ID[normalized]) {
      return VALIDATOR_GEO_MAPPING_BY_NODE_ID[normalized];
    }
  }

  if (params.address) {
    const normalized = params.address.toLowerCase().trim();
    if (VALIDATOR_GEO_MAPPING_BY_ADDRESS[normalized]) {
      return VALIDATOR_GEO_MAPPING_BY_ADDRESS[normalized];
    }
  }

  return undefined;
}