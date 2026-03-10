/**
 * Enrich validators by merging registry metadata with snapshot data
 * Priority: registered metadata > snapshot geolocations > IP geolocation > unknown
 */

import { ValidatorMetadata } from './registry/types';
import { ValidatorSnapshot } from './snapshots/types';
import { getValidatorSecp } from './validator-matching';
import { getValidatorMetadata } from './registry/index';

export interface EnrichedValidator {
  // Identifiers
  secp: string;
  nodeId: string;
  name?: string;
  website?: string;
  description?: string;
  logo?: string;
  twitter?: string;

  // Status from snapshot
  valIndex: number;
  stake: string;
  isActive: boolean;
  isRegistered: boolean;
  isInactive: boolean;
  commission: string;
  flags: string;
  authAddress?: string;
  ipAddress?: string;

  // Geographic data (merged with priority)
  country?: string;
  city?: string;
  provider?: string;
  latitude?: number;
  longitude?: number;

  // Data provenance
  countrySource: 'registry' | 'snapshot' | 'none';
  citySource: 'registry' | 'snapshot' | 'none';
  providerSource: 'registry' | 'snapshot' | 'none';

  // Confidence in researched data
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
  evidenceSource?: string;

  // Tracking
  discoveredAt?: string;
  updatedAt?: string;
}

/**
 * Enrich a single validator by merging registry metadata with snapshot
 * Priority: registry (high confidence) > snapshot > none
 */
export function enrichValidator(
  apiData: any,
  snapshot: ValidatorSnapshot,
  registry: ValidatorMetadata | undefined
): EnrichedValidator {
  // Country priority: registry > snapshot > none
  let country = snapshot.countryCode;
  let countrySource: 'registry' | 'snapshot' | 'none' = snapshot.countryCode ? 'snapshot' : 'none';
  if (registry?.country) {
    country = registry.country;
    countrySource = 'registry';
  }

  // City priority: registry > snapshot > none
  let city = snapshot.city;
  let citySource: 'registry' | 'snapshot' | 'none' = snapshot.city ? 'snapshot' : 'none';
  if (registry?.city) {
    city = registry.city;
    citySource = 'registry';
  }

  // Provider priority: registry > snapshot > none
  let provider = snapshot.provider;
  let providerSource: 'registry' | 'snapshot' | 'none' = snapshot.provider ? 'snapshot' : 'none';
  if (registry?.provider) {
    provider = registry.provider;
    providerSource = 'registry';
  }

  return {
    secp: snapshot.nodeId || apiData.secp || '',
    nodeId: snapshot.nodeId,
    name: apiData.name || registry?.name,
    website: apiData.website || registry?.website,
    description: apiData.description || registry?.description,
    logo: apiData.logo || registry?.logo,
    twitter: apiData.twitter || registry?.twitter,

    valIndex: snapshot.valIndex,
    stake: snapshot.stake,
    isActive: snapshot.validatorSetType === 'active',
    isRegistered: snapshot.validatorSetType === 'registered',
    isInactive: snapshot.validatorSetType === 'inactive',
    commission: snapshot.commission,
    flags: snapshot.flags,
    authAddress: snapshot.authAddress,
    ipAddress: snapshot.ipAddress,

    country,
    city,
    provider,
    latitude: snapshot.latitude,
    longitude: snapshot.longitude,

    countrySource,
    citySource,
    providerSource,

    confidence: registry?.confidence,
    evidenceSource: registry?.evidenceSource,

    discoveredAt: registry?.discoveredAt,
    updatedAt: registry?.updatedAt,
  };
}

/**
 * Enrich entire snapshot by merging with registry
 */
export function enrichSnapshotData(
  snapshotData: any,
  network: 'mainnet' | 'testnet'
): EnrichedValidator[] {
  const enriched: EnrichedValidator[] = [];

  for (const validator of snapshotData.data || []) {
    const secp = getValidatorSecp(validator);
    const registryData = secp ? getValidatorMetadata(network, secp) : undefined;

    // Reconstruct snapshot object
    const snapshot: ValidatorSnapshot = {
      nodeId: validator.node_id,
      valIndex: validator.val_index,
      stake: validator.stake,
      validatorSetType: validator.validator_set_type,
      commission: validator.commission,
      flags: validator.flags,
      authAddress: validator.auth_address,
      ipAddress: validator.ip_address,
      latitude: validator.latitude,
      longitude: validator.longitude,
      city: validator.city,
      countryCode: validator.country_code,
      provider: validator.provider,
    };

    const enrichedValidator = enrichValidator(validator, snapshot, registryData);
    enriched.push(enrichedValidator);
  }

  return enriched;
}
