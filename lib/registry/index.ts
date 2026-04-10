/**
 * Registry storage and management
 * 
 * CRITICAL FIX FOR VERCEL DEPLOYMENT:
 * In serverless (Vercel), /tmp is ephemeral and data is LOST on redeploy.
 * This caused inactive validators to show "Unknown" after deployments.
 * 
 * Solution: This version now uses project files as main storage.
 * For WRITE operations in serverless:
 * - Attempts project files first (may work if permissions allow)
 * - Falls back to /tmp silently (ephemeral but better than crashing)
 * 
 * For READ operations (critical):
 * - Always reads from project files first (persistent across deployments)
 * - Then /tmp as fallback (for in-flight updates within same deployment)
 * 
 * In local dev: Both reads and writes use project files directly
 */

import fs from 'fs';
import path from 'path';
import { ValidatorRegistry, ValidatorMetadata } from './types';

const MAINNET_REGISTRY_PATH = path.join(process.cwd(), 'lib', 'registry', 'mainnet.json');
const TESTNET_REGISTRY_PATH = path.join(process.cwd(), 'lib', 'registry', 'testnet.json');

// In serverless, have fallback paths but prioritize project files for reads
const isServerless = process.cwd().startsWith('/var/task');
const MAINNET_TMP_PATH = '/tmp/mainnet.json';
const TESTNET_TMP_PATH = '/tmp/testnet.json';

let mainnetCache: ValidatorRegistry | null = null;
let testnetCache: ValidatorRegistry | null = null;

/**
 * Load registry from JSON file (with in-memory caching)
 * CRITICAL: Always tries project files first (persistent), then /tmp (ephemeral)
 * This ensures inactive validators can fallback to stale geo data across deployments
 */
function loadRegistry(network: 'mainnet' | 'testnet'): ValidatorRegistry {
  const cache = network === 'mainnet' ? mainnetCache : testnetCache;
  if (cache) return cache;

  const projectPath = network === 'mainnet' ? MAINNET_REGISTRY_PATH : TESTNET_REGISTRY_PATH;
  const tmpPath = network === 'mainnet' ? MAINNET_TMP_PATH : TESTNET_TMP_PATH;
  
  try {
    // PRIORITY: Always try project files first (persistent across deployments)
    // This is CRITICAL for inactive validator fallback to work in Vercel
    const pathsToTry = [projectPath];
    
    // Then try /tmp as fallback (ephemeral, but has latest updates from this deployment)
    if (isServerless && tmpPath !== projectPath) {
      pathsToTry.push(tmpPath);
    }
    
    for (const filePath of pathsToTry) {
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
      } catch (readError) {
        // Try next path
        if (process.env.NODE_ENV === 'development') {
          console.log(`[registry] Could not read ${filePath}:`, (readError as Error).message);
        }
      }
    }
  } catch (e) {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[registry] Failed to load ${network} registry:`, (e as Error).message);
    }
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
 * 
 * STRATEGY for Vercel persistence:
 * 1. Always try project files first (persistent across deployments)
 * 2. If that fails, try /tmp (ephemeral but better than losing updates entirely)
 * 3. If both fail, log warning but don't crash
 * 
 * Note: Project file writes may fail in Vercel (read-only /var/task), 
 * but this is the CORRECT target. This function should be called from CI/CD
 * to update registry files before deployment for production environments.
 */
function saveRegistry(network: 'mainnet' | 'testnet', registry: ValidatorRegistry): void {
  const projectPath = network === 'mainnet' ? MAINNET_REGISTRY_PATH : TESTNET_REGISTRY_PATH;
  const tmpPath = network === 'mainnet' ? MAINNET_TMP_PATH : TESTNET_TMP_PATH;
  
  // Attempt to write to project files first
  const pathsToTry = [projectPath];
  if (isServerless) {
    pathsToTry.push(tmpPath); // Fallback to /tmp if project files fail
  }
  
  let lastError: Error | null = null;
  
  for (const filePath of pathsToTry) {
    try {
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
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`[registry] Successfully saved ${network} registry to ${filePath}`);
      }
      return; // Success, exit
    } catch (e) {
      lastError = e as Error;
      if (process.env.NODE_ENV === 'development') {
        console.log(`[registry] Failed to save to ${filePath}: ${lastError.message}`);
      }
      // Try next path
    }
  }
  
  // All write attempts failed
  if (process.env.NODE_ENV === 'development') {
    console.warn(`[registry] WARNING: Could not persist ${network} registry to ANY location:`, lastError?.message);
    console.warn(`[registry] SOLUTION: Update registry files in version control after snapshots change`);
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
