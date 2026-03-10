/**
 * Dedicated validator metadata mapping for geographic and infrastructure data.
 * 
 * This mapping is independent from gmonads API endpoints and provides a reliable
 * source for enriching validators with country, city, and provider information
 * regardless of active/inactive status.
 * 
 * Keys: validator identifiers (secp public key preferred, can also use node_id or address)
 * Values: geographic and infrastructure metadata
 * 
 * Priority for lookups:
 * 1. secp (most reliable - used by both epoch and metadata endpoints)
 * 2. node_id (for validators in epoch)
 * 3. address (auth_address field)
 */

export interface ValidatorGeoData {
  country?: string;
  city?: string;
  provider?: string;
}

/**
 * Validator metadata mapping by secp public key
 * Format: secp -> { country, city, provider }
 */
export const VALIDATOR_GEO_MAPPING: Record<string, ValidatorGeoData> = {
  "028986e40f8e9f39bf68fa5f2f8de58514b124a150261a340e13940d286c0c7317": {
    country: "Test Country",
    city: "Test City",
    provider: "Test Provider"
  },
};
  // Active validators with known geographic/infrastructure data
  // Add validators here as their location information becomes available
  
  // Example: Luganodes (Switzerland) - ID 76
  // "0237534fc1ff5118f436ab78d5dbe9cb96147b6290460b7517e02895f8aa9f866c": {
  //   country: "Switzerland",
  //   city: "Zurich",
  //   provider: "Luganodes"
  // },
  
  // Inactive validators (included in metadata but not in epoch)
  // These can be enriched from this mapping even though they're not in active geolocation endpoint
  
  // Example: Monad Foundation - Inactive (France) - ID 1
  // Based on name parsing: "mf-mainnet-val-tsw-fra-001" → fra = Frankfurt? Or France?
  // "038922d0d2bc9f80823b27ce6520357534ad82764cfc8115668344e3fc9c1ec2c5": {
  //   country: "France",
  //   city: "Paris",
  //   provider: "Monad Foundation"
  // },
  
  // Example: Monad Foundation - Inactive (USA) - ID 2  
  // Based on name parsing: "mf-mainnet-val-lsn-jfk-011" → jfk = John F. Kennedy (New York)
  // "030658fba49d3686faea21a9219e24cfe0881f03f06dc44de5c0b58da4da33de96": {
  //   country: "United States",
  //   city: "New York",
  //   provider: "Monad Foundation"
  // },
  
  // ===== POPULATE THIS SECTION WITH VALIDATOR DATA =====
  // Add entries for all validators with known geographic data
  // See VALIDATOR_MAPPING_GUIDE.md for detailed instructions
};

/**
 * Alternative lookup by node_id (for epoch data lookups)
 */
export const VALIDATOR_GEO_MAPPING_BY_NODE_ID: Record<string, ValidatorGeoData> = {
  // Same format, keyed by node_id instead of secp
  // Use this if secp is not available but node_id is
};

/**
 * Alternative lookup by address/auth_address
 */
export const VALIDATOR_GEO_MAPPING_BY_ADDRESS: Record<string, ValidatorGeoData> = {
  // Same format, keyed by address/auth_address
};

/**
 * Look up geographic metadata for a validator using multiple identifier strategies
 * Returns the first match found using priority: secp > node_id > address
 */
export function lookupValidatorGeo(params: {
  secp?: string;
  nodeId?: string;
  address?: string;
}): ValidatorGeoData | undefined {
  // Priority 1: Try secp
  if (params.secp) {
    const normalized = params.secp.toLowerCase().trim();
    if (VALIDATOR_GEO_MAPPING[normalized]) {
      return VALIDATOR_GEO_MAPPING[normalized];
    }
  }

  // Priority 2: Try node_id
  if (params.nodeId) {
    const normalized = params.nodeId.toLowerCase().trim();
    if (VALIDATOR_GEO_MAPPING_BY_NODE_ID[normalized]) {
      return VALIDATOR_GEO_MAPPING_BY_NODE_ID[normalized];
    }
  }

  // Priority 3: Try address
  if (params.address) {
    const normalized = params.address.toLowerCase().trim();
    if (VALIDATOR_GEO_MAPPING_BY_ADDRESS[normalized]) {
      return VALIDATOR_GEO_MAPPING_BY_ADDRESS[normalized];
    }
  }

  return undefined;
}
