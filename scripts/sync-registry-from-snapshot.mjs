#!/usr/bin/env node

/**
 * Sync registry files from current snapshot
 * 
 * Usage:
 *   node scripts/sync-registry-from-snapshot.mjs [snapshot-url] [network]
 * 
 * Examples:
 *   node scripts/sync-registry-from-snapshot.mjs http://localhost:3000/api/snapshot testnet
 *   node scripts/sync-registry-from-snapshot.mjs https://monad-validators.vercel.app/api/snapshot mainnet
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const registryDir = path.join(__dirname, '..', 'lib', 'registry');

async function fetchSnapshot(baseUrl, network) {
  const url = new URL(baseUrl);
  url.searchParams.set('network', network);
  
  console.log(`📡 Fetching snapshot from: ${url.toString()}`);
  const res = await fetch(url.toString());
  
  if (!res.ok) {
    throw new Error(`Failed to fetch snapshot: ${res.status} ${res.statusText}`);
  }
  
  const json = await res.json();
  if (!json.data || !json.data.validators) {
    throw new Error('Invalid snapshot format: missing data.validators');
  }
  
  return json.data;
}

function mergeValidatorGeo(registry, validator) {
  const secp = validator.secp?.toLowerCase();
  if (!secp) return;
  
  const isRealValue = (val) => {
    return !!val && typeof val === 'string' && 
           val !== 'Unknown' && val !== 'No data' && 
           val.trim().length > 0;
  };
  
  if (!isRealValue(validator.country) && 
      !isRealValue(validator.city) && 
      !isRealValue(validator.provider)) {
    return; // Skip if no real geo data
  }
  
  if (!registry[secp]) {
    registry[secp] = {
      secp: secp.toLowerCase(),
      discoveredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
  
  const existing = registry[secp];
  
  // Update geo data if real values
  if (isRealValue(validator.country)) {
    existing.country = validator.country;
  }
  if (isRealValue(validator.city)) {
    existing.city = validator.city;
  }
  if (isRealValue(validator.provider)) {
    existing.provider = validator.provider;
  }
  
  // Always update timestamp for active validators
  if (validator.status === 'active') {
    existing.lastSeenAt = new Date().toISOString();
  }
  
  existing.updatedAt = new Date().toISOString();
}

async function main() {
  const snapshotUrl = process.argv[2] || 'http://localhost:3000/api/snapshot';
  const networks = process.argv.slice(3);
  
  if (networks.length === 0) {
    console.log('No networks specified. Syncing both mainnet and testnet...');
    networks.push('mainnet', 'testnet');
  }
  
  for (const network of networks) {
    try {
      console.log(`\n📚 Syncing ${network.toUpperCase()} registry...`);
      
      // Fetch snapshot
      const snapshot = await fetchSnapshot(snapshotUrl, network);
      
      // Load existing registry
      const registryPath = path.join(registryDir, `${network}.json`);
      let registry = {};
      
      if (fs.existsSync(registryPath)) {
        try {
          const data = fs.readFileSync(registryPath, 'utf-8');
          registry = JSON.parse(data);
          console.log(`  ✅ Loaded existing registry: ${Object.keys(registry).length} validators`);
        } catch (e) {
          console.warn(`  ⚠️  Could not parse existing registry, starting fresh`);
        }
      }
      
      // Merge geo data from snapshot
      let merged = 0;
      let skipped = 0;
      
      for (const validator of snapshot.validators) {
        const before = JSON.stringify(registry[validator.secp?.toLowerCase()] || {});
        mergeValidatorGeo(registry, validator);
        const after = JSON.stringify(registry[validator.secp?.toLowerCase()] || {});
        
        if (before !== after) {
          merged++;
        } else {
          skipped++;
        }
      }
      
      console.log(`  📝 Merged: ${merged} validators with geo data`);
      console.log(`  ⏭️  Skipped: ${skipped} validators (no real geo data)`);
      
      // Save registry
      fs.writeFileSync(
        registryPath,
        JSON.stringify(registry, null, 2)
      );
      
      console.log(`  💾 Saved to: ${registryPath}`);
      console.log(`  📊 Total validators in registry: ${Object.keys(registry).length}`);
      
      // Stats
      const withGeo = Object.values(registry).filter(v => v.country || v.city || v.provider).length;
      console.log(`  🌍 Validators with geo data: ${withGeo} (${Math.round(withGeo / Object.keys(registry).length * 100)}%)`);
      
    } catch (e) {
      console.error(`  ❌ Error syncing ${network}:`, e.message);
      process.exit(1);
    }
  }
  
  console.log(`\n✅ Registry sync complete!`);
  console.log(`\n📋 Next steps:`);
  console.log(`  1. Review changes: git diff lib/registry/`);
  console.log(`  2. Commit changes: git add lib/registry/*.json && git commit -m "Update registry from latest snapshot"`);
  console.log(`  3. Deploy: git push`);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
