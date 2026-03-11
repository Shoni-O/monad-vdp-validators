/**
 * Registry storage and management
 * Reads/writes from JSON files for persistence
 */

import fs from 'fs';
import path from 'path';
import { ValidatorRegistry, ValidatorMetadata } from './types';

const MAINNET_REGISTRY_PATH = path.join(process.cwd(), 'lib', 'registry', 'mainnet.json');
const TESTNET_REGISTRY_PATH = path.join(process.cwd(), 'lib', 'registry', 'testnet.json');

let mainnetCache: ValidatorRegistry | null = null;
let testnetCache: ValidatorRegistry | null = null;

/**
 * Load registry from JSON file (with caching)
 */
function loadRegistry(network: 'mainnet' | 'testnet'): ValidatorRegistry {
  const cache = network === 'mainnet' ? mainnetCache : testnetCache;
  if (cache) return cache;

  const filePath = network === 'mainnet' ? MAINNET_REGISTRY_PATH : TESTNET_REGISTRY_PATH;
  
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      const registry = JSON.parse(data) as ValidatorRegistry;
      if (network === 'mainnet') {
        mainnetCache = registry;
      } else {
        testnetCache = registry;
      }
      return registry;
    }
  } catch (e) {
    console.warn(`Failed to load ${network} registry:`, e);
  }

  const emptyRegistry: ValidatorRegistry = {};
  if (network === 'mainnet') {
    mainnetCache = emptyRegistry;
  } else {
    testnetCache = emptyRegistry;
  }
  return emptyRegistry;
}

/**
 * Save registry to JSON file
 */
function saveRegistry(network: 'mainnet' | 'testnet', registry: ValidatorRegistry): void {
  const filePath = network === 'mainnet' ? MAINNET_REGISTRY_PATH : TESTNET_REGISTRY_PATH;
  
  // Ensure directory exists
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(filePath, JSON.stringify(registry, null, 2));
  
  // Clear cache so next load reads fresh data
  if (network === 'mainnet') {
    mainnetCache = null;
  } else {
    testnetCache = null;
  }
}

/**
 * Get entire registry for a network
 */
export function getRegistry(network: 'mainnet' | 'testnet'): ValidatorRegistry {
  return loadRegistry(network);
}

/**
 * Look up a validator in the registry by SECP key
 */
export function getValidatorMetadata(
  network: 'mainnet' | 'testnet',
  secp: string
): ValidatorMetadata | undefined {
  const registry = loadRegistry(network);
  return registry[secp.toLowerCase()];
}

/**
 * Add or update a validator in the registry
 */
export function updateValidatorMetadata(
  network: 'mainnet' | 'testnet',
  secp: string,
  metadata: Partial<ValidatorMetadata>
): void {
  const registry = loadRegistry(network);
  const now = new Date().toISOString();
  const existing = registry[secp.toLowerCase()] || { secp: secp.toLowerCase(), discoveredAt: now };

  registry[secp.toLowerCase()] = {
    ...existing,
    ...metadata,
    secp: secp.toLowerCase(), // ensure lowercase
    updatedAt: now,
  } as ValidatorMetadata;

  saveRegistry(network, registry);
}

/**
 * Batch register new validators found in epoch
 */
export function registerNewValidators(
  network: 'mainnet' | 'testnet',
  validators: Array<{ secp: string; name?: string; website?: string }>
): void {
  const registry = loadRegistry(network);
  const now = new Date().toISOString();
  let updated = false;

  for (const v of validators) {
    const secp = v.secp.toLowerCase();
    if (!registry[secp]) {
      registry[secp] = {
        secp,
        name: v.name,
        website: v.website,
        discoveredAt: now,
        updatedAt: now,
      };
      updated = true;
    }
  }

  if (updated) {
    saveRegistry(network, registry);
  }
}

/**
 * Batch update geo data for active validators from snapshot
 * Only persists meaningful values (skips "Unknown", "No data", undefined)
 * Merges with existing data without overwriting non-empty fields
 */
export function updateValidatorGeoData(
  network: 'mainnet' | 'testnet',
  validators: Array<{
    secp: string;
    country?: string;
    city?: string;
    provider?: string;
    lastSeenAt?: string;
  }>
): void {
  const registry = loadRegistry(network);
  const now = new Date().toISOString();
  let updated = false;

  for (const v of validators) {
    if (!v.secp) continue;

    const secp = v.secp.toLowerCase();
    const existing = registry[secp] || { secp, discoveredAt: now };

    // Helper: check if a value is "real" (not empty, not "Unknown", not "No data")
    const isRealValue = (val?: string): boolean => {
      if (!val || typeof val !== 'string') return false;
      const trimmed = val.trim();
      return trimmed.length > 0 && trimmed !== 'Unknown' && trimmed !== 'No data';
    };

    // Only merge in geo fields if they have real values
    const updates: Partial<ValidatorMetadata> = {};
    if (isRealValue(v.country)) updates.country = v.country;
    if (isRealValue(v.city)) updates.city = v.city;
    if (isRealValue(v.provider)) updates.provider = v.provider;

    // Only update if we have at least one real value to add
    if (Object.keys(updates).length > 0) {
      registry[secp] = {
        ...existing,
        ...updates,
        lastSeenAt: v.lastSeenAt || now,
        updatedAt: now,
      } as ValidatorMetadata;
      updated = true;
    }
  }

  if (updated) {
    saveRegistry(network, registry);
  }
}
