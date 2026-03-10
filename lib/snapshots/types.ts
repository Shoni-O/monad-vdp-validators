/**
 * Live snapshot data types
 * Represents the current active/inactive state from APIs
 */

export interface ValidatorSnapshot {
  // From epoch endpoint
  nodeId: string;
  valIndex: number;
  stake: string;
  validatorSetType: 'active' | 'registered' | 'inactive';
  commission: string;
  flags: string;
  authAddress?: string;
  ipAddress?: string;

  // From geolocations endpoint (only for active validators)
  latitude?: number;
  longitude?: number;
  city?: string;
  countryCode?: string;
  provider?: string;
}

export interface SnapshotData {
  timestamp: string;
  epoch: string;
  network: 'mainnet' | 'testnet';
  validators: Record<string, ValidatorSnapshot>;
  totalValidators: number;
  activeCount: number;
  registeredCount: number;
  inactiveCount: number;
}
