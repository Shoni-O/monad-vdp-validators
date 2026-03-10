# Validator Geographic Metadata Mapping

This document explains how to populate the validator geographic metadata mapping for enriching validators with country, city, and provider information.

## Overview

The validator mapping system provides a dedicated, independent data source for geographic and infrastructure metadata that works for both active and inactive validators, regardless of gmonads API availability.

## File Location

- **Primary:** [lib/validators-geo-mapping.ts](lib/validators-geo-mapping.ts)
- **Source priority:** Local mapping → Geolocations endpoint → Other sources → IP geolocation → Unknown

## Structure

The mapping file contains three lookup tables:

### 1. By SECP Public Key (Recommended)

```typescript
export const VALIDATOR_GEO_MAPPING: Record<string, ValidatorGeoData> = {
  "0237534fc1ff5118f436ab78d5dbe9cb96147b6290460b7517e02895f8aa9f866c": {
    country: "Switzerland",
    city: "Zurich",
    provider: "Luganodes"
  },
  // Add more validators...
};
```

**Why SECP is preferred:**
- Available from both epoch (as `node_id`) and metadata (as `secp`)
- Stable identifier across active/inactive status changes
- Works for validators not in epoch (inactive validators)

### 2. By Node ID

```typescript
export const VALIDATOR_GEO_MAPPING_BY_NODE_ID: Record<string, ValidatorGeoData> = {
  "034f57c0a58f644151e73ac3d0e73c206c8294834bf1c319eed26b269d42a26998": {
    country: "Germany",
    city: "Frankfurt",
    provider: "AWS"
  },
};
```

**Use when:**
- Only node_id is available
- SECP lookup didn't find a match

### 3. By Address

```typescript
export const VALIDATOR_GEO_MAPPING_BY_ADDRESS: Record<string, ValidatorGeoData> = {
  "monad1abc...": {
    country: "Singapore",
    city: "Singapore",
    provider: "AWS"
  },
};
```

**Use when:**
- Only auth_address is available
- Other identifiers not found

## How to Get Validator Identifiers

### Finding SECP (Recommended)

**From Mainnet Epoch Data:**
```bash
curl -s "https://www.gmonads.com/api/v1/public/validators/epoch?network=mainnet" \
  | jq '.data[] | select(.val_index==76) | .node_id'
# Output: "0237534fc1ff5118f436ab78d5dbe9cb96147b6290460b7517e02895f8aa9f866c"
```

**From Metadata:**
```bash
curl -s "https://www.gmonads.com/api/v1/public/validators/metadata?network=mainnet" \
  | jq '.data[] | select(.name=="Luganodes") | .secp'
# Output: "0237534fc1ff5118f436ab78d5dbe9cb96147b6290460b7517e02895f8aa9f866c"
```

### Finding Country/City/Provider

**Sources to check (in order):**
1. Validator operator's website/documentation
2. GitHub validator-info repository: `https://github.com/monad-developers/validator-info`
3. Public validator information announcements
4. IP-based geolocation (fallback used by system)
5. Validator node public info / DNS records

**Example: Add Luganodes (Swiss validator)**

```typescript
"0237534fc1ff5118f436ab78d5dbe9cb96147b6290460b7517e02895f8aa9f866c": {
  country: "Switzerland",
  city: "Zurich",
  provider: "Luganodes"  // or their infrastructure provider
}
```

## Adding Validator Data

### Step 1: Find Validator Identifier

```bash
# Get all active validators
curl -s "https://www.gmonads.com/api/v1/public/validators/epoch?network=mainnet" \
  | jq '.data[] | {id, name, node_id}' | head -20
```

### Step 2: Get Geographic Information

- Check validator operator website
- Search validator documentation
- Review public announcements

### Step 3: Add to Mapping

Edit [lib/validators-geo-mapping.ts](lib/validators-geo-mapping.ts):

```typescript
export const VALIDATOR_GEO_MAPPING: Record<string, ValidatorGeoData> = {
  // Existing entries...
  
  // New entry:
  "0237534fc1ff5118f436ab78d5dbe9cb96147b6290460b7517e02895f8aa9f866c": {
    country: "Switzerland",
    city: "Zurich",
    provider: "Luganodes"
  },
};
```

### Step 4: Verify with Dashboard

1. Restart the dev server: `npm run dev`
2. Navigate to the dashboard
3. Verify the validator now shows the correct country/city/provider
4. Check console logs: `[enrichment-debug]` will show `src:mapping` for mapped values

## Data Validation

Before committing, ensure:

- ✅ Country is in ISO 3166-1 alpha-2 format (2-letter codes like "CH", "DE", "US") or full name
- ✅ City names are properly capitalized and match common usage
- ✅ Provider names match infrastructure services (AWS, GCP, Hetzner, etc.)
- ✅ No typos in secp/node_id values (40 hex chars for compressed public keys)
- ✅ All entries follow the same structure

## For Inactive Validators

Inactive validators can ONLY be enriched from:

1. **Local mapping** (SECP-based)
2. **GitHub validator-info** (if they have geographic data there)
3. **IP geolocation** (if IP available and IPINFO_TOKEN env var set)

They will NOT have data from gmonads geolocation endpoint (which only covers active validators).

**To support an inactive validator:**
- Add their entry to [lib/validators-geo-mapping.ts](lib/validators-geo-mapping.ts) using their SECP
- Or ensure their GitHub validator-info includes geographic metadata

## Example: Complete Mainnet Mapping

```typescript
export const VALIDATOR_GEO_MAPPING: Record<string, ValidatorGeoData> = {
  // Luganodes (Switzerland)
  "0237534fc1ff5118f436ab78d5dbe9cb96147b6290460b7517e02895f8aa9f866c": {
    country: "Switzerland",
    city: "Zurich",
    provider: "Luganodes"
  },
  
  // Alchemy (United States)
  "02fbb9abb43cff6f29a6ca40182e526847ca132d42abab6d1af517c956d19f7c68": {
    country: "United States",
    city: "San Francisco",
    provider: "Alchemy"
  },
  
  // Monad Foundation - Inactive (France)
  "038922d0d2bc9f80823b27ce6520357534ad82764cfc8115668344e3fc9c1ec2c5": {
    country: "France",
    city: "Paris",
    provider: "Monad Foundation"
  },
  
  // Add more validators...
};
```

## Debugging

If mappings aren't working:

### Check Logs

```bash
# Run dev server and check for [enrichment-debug] logs
npm run dev
curl http://localhost:3000/api/snapshot?network=mainnet
```

Look for output like:
```
[enrichment-debug] INACTIVE validator ID 1: Monad Foundation
  Mapped geo: country=France, city=Paris, provider=Monad Foundation
  Final values: country=France (src:mapping), city=Paris (src:mapping), provider=Monad Foundation (src:mapping)
```

### Common Issues

**Mapping not found:**
- Check SECP spelling (should be 66 hex characters for compressed key)
- Verify key is lowercase
- Check for trailing/leading spaces

**Wrong source attribution:**
- Check if value exists in extracted geo (would take priority from there)
- Verify mapping entry is correctly added

**Key identifier mismatch:**
- Use SECP from metadata (not node_id) for best compatibility
- For epoch-only validators, node_id and secp should be the same

## Submission Process

To add validators to the official mapping:

1. Verify all geographic data from official sources
2. Test locally and confirm logs show mapping sources
3. Document reasoning for geographic choices
4. Submit PR with updated [lib/validators-geo-mapping.ts](lib/validators-geo-mapping.ts)
5. Include any external sources or confirmations

## Limitations

- Geographic mapping improves display but does NOT change scoring logic
- Validators without any metadata still show "No data" and receive insufficient-data badge
- IP geolocation is used as fallback only when IPINFO_TOKEN is set
- Manual mapping is required for validators not providing this info publicly

