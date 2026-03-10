/**
 * Persistent validator metadata types
 * Stores researched data (country/city/provider) separately from live state
 */

export interface ValidatorMetadata {
  // Stable identifiers (never change)
  secp: string;
  nodeId?: string;
  address?: string;

  // From metadata API (cached)
  name?: string;
  website?: string;
  description?: string;
  logo?: string;
  twitter?: string;

  // Manually researched (the important stuff)
  country?: string;
  city?: string;
  provider?: string;
  providerRegion?: string;
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
  evidenceSource?: string;
  notes?: string;

  // Tracking
  discoveredAt: string;
  updatedAt: string;
}

/**
 * All validators in a network ever seen
 * Keyed by SECP public key (lowercase)
 */
export type ValidatorRegistry = Record<string, ValidatorMetadata>;
