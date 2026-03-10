# Validator Metadata Enrichment - Implementation Summary

## What Was Implemented

A dedicated, independent metadata source for validator geographic and infrastructure data that:

### ✅ Solves the Original Problem

- **Works for inactive validators** - No dependency on gmonads geolocation endpoint (which only has active validators)
- **Independent data source** - Not reliant on API endpoints; can be maintained locally
- **Complete enrichment pipeline** - Metadata flows through to scoring and display

### ✅ Maintains Data Priority

**Resolution order:**
1. **Local mapping** (new) - Explicit, manually maintained geographic data
2. **Gmonads geolocations** - For active validators in epoch
3. **Other gmonads sources** - Epoch, metadata endpoints
4. **IP geolocation** - Fallback (when IPINFO_TOKEN available)
5. **Unknown/No data** - Final fallback

### ✅ Supports All Validator Types

- Active validators (enriched from epoch + mapping)
- Inactive validators (enriched from metadata + mapping)
- Validators not in epoch (enriched from metadata + mapping)

## Files Modified

1. **lib/validators-geo-mapping.ts** (NEW)
   - Core mapping data structure
   - Three lookup tables: by secp, node_id, address
   - Lookup function with priority-based resolution

2. **lib/getSnapshot.ts**
   - Integrated local mapping lookup (line 506-514)
   - Multi-source priority resolution (line 516-535)
   - Enhanced debug logging showing source attribution
   - Enabled GitHub enrichment by default (always-on, not env-gated)
   - Fixed nodeId resolution for inactive validators

3. **VALIDATOR_MAPPING_GUIDE.md** (NEW)
   - Complete guide for populating the mapping
   - Instructions for getting validator identifiers
   - Examples and validation rules
   - Debugging tips

## How Geographic Data Flows

```
For INACTIVE Validator (not in epoch):
├─ secp from metadata endpoint
├─ Look up in local mapping → Found? USE IT
│  └─ If not found → Extract from metadata → Extract from geo → IP geo → Unknown
└─ (GitHub enrichment attempted but only has social data)

For ACTIVE Validator (in epoch):
├─ secp from epoch (as node_id)
├─ First check: Local mapping → Found? USE IT
│  └─ If not found → Extract from geolocations endpoint
│     └─ If not found → Extract from metadata → IP geo → Unknown
└─ (GitHub enrichment attempted)
```

## Enabling the Feature

### Currently Enabled

The feature is **automatically active** because:
- `lookupValidatorGeo()` is called for all validators (lines 506-507)
- GitHub enrichment is enabled by default (line 647)
- Local mapping takes priority in resolution order

### To Populate with Data

1. Open [lib/validators-geo-mapping.ts](lib/validators-geo-mapping.ts)
2. Add entries to `VALIDATOR_GEO_MAPPING` (keyed by secp)
3. Example:

```typescript
export const VALIDATOR_GEO_MAPPING: Record<string, ValidatorGeoData> = {
  "038922d0d2bc9f80823b27ce6520357534ad82764cfc8115668344e3fc9c1ec2c5": {
    country: "France",
    city: "Paris",
    provider: "Monad Foundation"
  },
};
```

4. Restart dev server: `npm run dev`
5. Verify in dashboard: validator now shows real country/city/provider
6. Check console logs for `[enrichment-debug]` to see `src:mapping`

## For Inactive Validators to Work

**Required conditions:**
- ✅ Entry in local mapping (`VALIDATOR_GEO_MAPPING`)
- ✅ Uses secp as key (available from metadata endpoint)
- ⚠️ If no mapping entry: falls back to "Unknown" (geo endpoint not available for inactive)

**Example: Monad Foundation validators (inactive, ID 1-2)**

To enrich them:
```typescript
// ID 1 secp: 038922d0d2bc9f80823b27ce6520357534ad82764cfc8115668344e3fc9c1ec2c5
"038922d0d2bc9f80823b27ce6520357534ad82764cfc8115668344e3fc9c1ec2c5": {
  country: "France",
  city: "Paris",  // Or correct city
  provider: "Monad Foundation"
},
```

## Testing the Implementation

### 1. Add Test Data

Edit [lib/validators-geo-mapping.ts](lib/validators-geo-mapping.ts) and uncomment the examples:

```typescript
// Uncomment one of these examples
"038922d0d2bc9f80823b27ce6520357534ad82764cfc8115668344e3fc9c1ec2c5": {
  country: "France",
  city: "Paris",
  provider: "Monad Foundation"
},
```

### 2. Restart Server

```bash
npm run dev
```

### 3. Fetch and Check

```bash
# Make API request
curl http://localhost:3000/api/snapshot?network=mainnet | jq '.data.validators[] | select(.id==1) | {displayName, country, city, provider, scores}'

# Expected output for ID 1:
{
  "displayName": "Monad Foundation - mf-mainnet-val-tsw-fra-001",
  "country": "France",
  "city": "Paris",
  "provider": "Monad Foundation",
  "scores": { "geo": ..., "provider": ..., "total": ..., "badge": ... }
}
```

### 4. Check Console Logs

Look for debug output showing source:
```
[enrichment-debug] INACTIVE validator ID 1: Monad Foundation
  Mapped geo: country=France, city=Paris, provider=Monad Foundation
  Final values: country=France (src:mapping), city=Paris (src:mapping), provider=Monad Foundation (src:mapping)
```

## Architecture Benefits

### 1. **Independence**
- Not dependent on gmonads API changes
- Not blocked by missing geolocation endpoint entries
- Can be updated locally without API changes

### 2. **Scalability**
- Supports all validator types (active, inactive, unregistered)
- Can grow to include all validators over time
- Lookup is O(1) hash table operation

### 3. **Maintainability**
- Single source of truth in one file
- Clear structure and documentation
- Easy to audit and review changes

### 4. **Reliability**
- Explicit data trumps derived data
- Prevents incorrect inferences
- Fallback chains ensure no data is completely lost

## Known Limitations

1. **Manual effort** - Mapping must be populated by humans with validator information
2. **Not auto-updated** - Requires code changes to update
3. **No validation endpoint** - Geographic claims not independently verified
4. **Scoring unchanged** - This enrichment affects display only, not diversity scoring

## Next Steps

1. **Populate mapping** - Add validator geographic data from official sources
2. **Request validator data** - Encourage validators to provide geographic info
3. **Update GitHub validator-info** - Propose adding geo fields to validator-info repo
4. **Monitor usage** - Track which validators are enriched vs. Unknown

## For Developers

### Adding a New Validator

```typescript
// Get secp from metadata or epoch
const secp = "038922d0d2bc9f80823b27ce6520357534ad82764cfc8115668344e3fc9c1ec2c5";

// Add to mapping
VALIDATOR_GEO_MAPPING[secp] = {
  country: "France",      // ISO 3166-1 alpha-2 or full name
  city: "Paris",          // Properly capitalized
  provider: "AWS"         // Infrastructure provider
};

// It will automatically be used next server restart
```

### Lookup Examples

```typescript
import { lookupValidatorGeo } from '@/lib/validators-geo-mapping';

// By secp (preferred)
lookupValidatorGeo({ 
  secp: "038922d0d2bc9f80823b27ce6520357534ad82764cfc8115668344e3fc9c1ec2c5" 
});

// By node_id
lookupValidatorGeo({ 
  nodeId: "034f57c0a58f644151e73ac3d0e73c206c8294834bf1c319eed26b269d42a26998" 
});

// By address
lookupValidatorGeo({ 
  address: "monad1abc..." 
});

// Returns: { country: "France", city: "Paris", provider: "Monad Foundation" }
```

