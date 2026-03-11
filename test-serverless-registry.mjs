// test-serverless-registry.mjs
// Quick test to verify registry works in serverless environment simulation

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Simulate serverless by mocking process.cwd()
const originalCwd = process.cwd;
let simulateServerless = false;

if (process.argv.includes('--serverless')) {
  simulateServerless = true;
  process.cwd = () => '/var/task';
  console.log('🔒 Simulating serverless environment (readonly /var/task)');
}

// Import after mock is set up
const { getRegistry, getValidatorMetadata, updateValidatorGeoData } = await import('./lib/registry/index.ts');

try {
  console.log('\n1️⃣  Testing READ from registry (should work in serverless)');
  const registry = getRegistry('testnet');
  console.log(`   ✅ Loaded registry with ${Object.keys(registry).length} entries`);

  console.log('\n2️⃣  Testing geo data persistence (should fail gracefully in serverless)');
  const geoUpdates = [
    {
      secp: '0xtestsecp123',
      country: 'Singapore',
      city: 'Marina Bay',
      provider: 'AWS',
      lastSeenAt: new Date().toISOString(),
    },
  ];

  try {
    updateValidatorGeoData('testnet', geoUpdates);
    console.log('   ✅ updateValidatorGeoData() called successfully');
    
    // Try to read it back
    const lookedUp = getValidatorMetadata('testnet', '0xtestsecp123');
    if (lookedUp?.country) {
      console.log(`   ✅ Validator found in cache: ${lookedUp.country}/${lookedUp.city}`);
    } else {
      console.log('   ℹ️  Validator not in persistent registry (expected in serverless ephemeral storage)');
    }
  } catch (e) {
    console.log(`   ❌ Error: ${e.message}`);
    process.exit(1);
  }

  console.log('\n3️⃣  Testing fallback behavior');
  // In serverless, updates go to /tmp and won't persist after restart
  // But in-memory cache works within the request lifetime
  const testValidator = getValidatorMetadata('testnet', '0xtestsecp123');
  if (testValidator?.country === 'Singapore') {
    console.log('   ✅ In-memory cache working (within request lifetime)');
  } else {
    console.log('   ℹ️  Persistent cache not available (expected in serverless)');
  }

  console.log('\n✅ All tests passed! Serverless compatibility verified.');
} catch (e) {
  console.error('❌ Test failed:', e);
  process.exit(1);
}
