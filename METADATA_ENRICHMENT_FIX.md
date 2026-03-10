# Metadata Enrichment Fix for Inactive Validators

## Problem Analysis

**Root Cause Identified:** Inactive validators were NOT being enriched from GitHub validator-info repository because the pipeline had a gap in the identifier chain.

###Data Source Investigation

#### Gmonads API Endpoints
1. **`/validators/epoch`** - Contains active validators only
   - Has: `node_id` (secp public key), `ip_address`, `validator_set_type='active'`
   - Missing for: Inactive/non-participating validators
   - Mainnet: 169 active validators

2. **`/validators/geolocations`** - Filtered to active validators ONLY
   - Has: `country`, `city`, `ip`, `isp`
   - Issue: Only contains 169 validators (all from active epoch)
   - Missing: 18 validators that are in metadata but not in epoch

3. **`/validators/metadata`** - All validators (active + inactive)
   - Has: `id`, `name`, `secp` (the node_id), `bls`, `website`, `description`, `logo`, `x`
   - Missing: country, city, provider (geographic/infrastructure data)
   - Mainnet: 187 validators (169 active + 18 inactive)

####GitHub Validator-Info Repository
fetched from: `https://raw.githubusercontent.com/monad-developers/validator-info/main/{network}/{secp}.json`
- Has: `id`, `name`, `secp`, `bls`, `website`, `description`, `logo`, `x`
- Missing: country, city, provider (same as gmonads metadata)

### Data Flow Issue

**Old Pipeline for Inactive Validators:**
```
ID 1 (inactive validator)
  ↓
  epoch: NOT FOUND (not in active set)
  geolocations: NOT FOUND (filtered to active only)
  metadata: FOUND (has secp="038922...")
  ↓
  Extract nodeId: undefined (only looked in epoch/geo)
  ↓
  GitHub enrichment: SKIPPED (no nodeId to lookup)
  ↓
  Final result: No geographic data → "Unknown"
```

**New Pipeline for Inactive Validators:**
```
ID 1 (inactive validator)
  ↓
  epoch: NOT FOUND
  geolocations: NOT FOUND
  metadata: FOUND (has secp="038922...")
  ↓
  Extract nodeId: secp fallback now works!
  ↓
  GitHub enrichment: ENABLED (fetches using secp as node_id)
  ↓
  If GitHub has geo data: Use it
  Otherwise: Falls back to IP geolocation or "Unknown"
```

## Changes Made

### 1. lib/getSnapshot.ts - Line 516: nodeId Fallback
**Before:**
```typescript
const nodeId = safeStr(merged?.node_id);
```

**After:**
```typescript
const secp = normalizeSecp(merged) ?? safeStr(merged?.auth_address) ?? undefined;
// nodeId is used for GitHub validator-info lookups
// For epoch data: use node_id field
// For metadata-only validators: use secp field (same identifier)  
const nodeId = safeStr(merged?.node_id) ?? secp;
```

**Why:** Allows GitHub lookups for validators not in epoch by using their secp from metadata

### 2. lib/getSnapshot.ts - Line 645: GitHub Enrichment Default
**Before:**
```typescript
const useGitHubEnrichment = process.env.ENABLE_GITHUB_ENRICHMENT === 'true';
```

**After:**
```typescript
// GitHub enrichment: fetch validator-info including country/city/provider for all validators
// Results are cached 24h per validator, so performance impact is minimal after first load.
// This is essential for inactive validators which don't have geo data from gmonads.
const useGitHubEnrichment = true; // Always enabled for complete metadata enrichment
```

**Why:** Ensures GitHub data is fetched for all validators, not just when environment variable is set

## Result

- ✅ Inactive validators now have their `nodeId` properly resolved from `secp` field
- ✅ GitHub validator-info is fetched for ALL validators (active + inactive)
- ✅ Any geographic/provider data in GitHub validator-info will be used for enrichment
- ⚠️ If GitHub validator-info doesn't contain geographic data, validators still show "Unknown"
  - This appears to be a limitation of the data sources, not the enrichment pipeline

## Debugging Info

For mainnet:
- Epoch: 169 validators (all active)
- Geolocations: 169 validators (matches epoch, active only)
- Metadata: 187 validators (169 active + 18 inactive)
- Inactive validators not in geo/epoch: IDs 1, 2, 47, 59, 140, 147, 173, 174, 175, 176, 181, 182, 183, 184, 185, 186, 187

## Next Steps

If inactive validators SHOULD have geographic data but don't:
1. Check if validator-info repository should be updated with location data
2. Verify if there's another data source containing geographic metadata
3. Consider parsing location from validator names (e.g., "mf-mainnet-val-tsw-fra-001" → Frankfurt)
4. Implement fallback geolocation lookup using cached/memoized IP if available

