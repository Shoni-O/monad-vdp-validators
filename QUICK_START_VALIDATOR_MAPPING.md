# Quick Start: Add Validator Geographic Data

## In 3 Steps

### 1. Get Validator SECP

For Monad Foundation validator (ID 1):
```bash
curl -s "https://www.gmonads.com/api/v1/public/validators/metadata?network=mainnet" \
  | jq '.data[] | select(.id==1) | .secp'
# → "038922d0d2bc9f80823b27ce6520357534ad82764cfc8115668344e3fc9c1ec2c5"
```

### 2. Edit lib/validators-geo-mapping.ts

Uncomment and update the example:

```typescript
export const VALIDATOR_GEO_MAPPING: Record<string, ValidatorGeoData> = {
  "038922d0d2bc9f80823b27ce6520357534ad82764cfc8115668344e3fc9c1ec2c5": {
    country: "France",
    city: "Paris",
    provider: "Monad Foundation"
  },
};
```

### 3. Restart and Verify

```bash
npm run dev
curl http://localhost:3000/api/snapshot?network=mainnet | jq '.data.validators[] | select(.id==1) | {country,city,provider}'
```

Expected output:
```json
{
  "country": "France",
  "city": "Paris",
  "provider": "Monad Foundation"
}
```

---

## Real-World Example: Add All Inactive Validators

**Mainnet Inactive Validators:**
- ID 1-2: Monad Foundation 
- ID 47: Dead King Society
- ID 59: vldtr.xyz
- ID 140: NTT DOCOMO GLOBAL
- ... (18 total)

**To enrich them all:**

```typescript
// lib/validators-geo-mapping.ts

export const VALIDATOR_GEO_MAPPING: Record<string, ValidatorGeoData> = {
  // Monad Foundation Validator 1 (Frankfurt validator)
  "038922d0d2bc9f80823b27ce6520357534ad82764cfc8115668344e3fc9c1ec2c5": {
    country: "Germany",
    city: "Frankfurt",
    provider: "Monad Foundation"
  },
  
  // Monad Foundation Validator 2 (New York validator)
  "030658fba49d3686faea21a9219e24cfe0881f03f06dc44de5c0b58da4da33de96": {
    country: "United States",
    city: "New York",
    provider: "Monad Foundation"
  },
  
  // Add remaining validators...
};
```

---

## Data Sources

Where to find validator geographic information:

| Source | How to Access |
|--------|--------------|
| Validator website | Visit operator's site |
| GitHub validator-info | `https://github.com/monad-developers/validator-info` |
| Public announcements | Twitter, Discord, docs |
| Validator node info | Query node's public endpoints |
| Whois/DNS records | Check domain registration |

---

## Validation Checklist

Before committing:

- [ ] SECP is 66 hex characters (lowercase)
- [ ] Country is ISO 3166-1 (2-letter code) or full name
- [ ] City is properly capitalized  
- [ ] Provider is infrastructure service name
- [ ] Data sourced from official validator information
- [ ] No trailing/leading whitespace in keys

---

## Troubleshooting

### Mapping not showing up?

**Check:**
```bash
# 1. Server restarted?
# Kill old process and restart: npm run dev

# 2. SECP correct?
# Should be 66 hex characters (no spaces)
"038922d0d2bc9f80823b27ce6520357534ad82764cfc8115668344e3fc9c1ec2c5"  ✓
"038922d0d2bc9f80823b27ce6520357534ad82764cfc8115668344e3fc9c1ec2c " ✗

# 3. Check logs
# npm run dev output should show:
# [enrichment-debug] INACTIVE validator ID ...
# Final values: country=France (src:mapping)
```

### Different validators with same data?

Create separate entries - each validator needs its own SECP:

```typescript
// ✗ Wrong - only one validator
"038922d0d2bc9f80823b27ce6520357534ad82764cfc8115668344e3fc9c1ec2c5": {
  country: "France",
  city: "Paris"
}

// ✓ Correct - separate entries for each validator
"038922d0d2bc9f80823b27ce6520357534ad82764cfc8115668344e3fc9c1ec2c5": {
  country: "France",
  city: "Paris"
},
"030658fba49d3686faea21a9219e24cfe0881f03f06dc44de5c0b58da4da33de96": {
  country: "United States",
  city: "New York"
}
```

---

## See Also

- [VALIDATOR_MAPPING_GUIDE.md](VALIDATOR_MAPPING_GUIDE.md) - Complete documentation
- [METADATA_ENRICHMENT_IMPLEMENTATION.md](METADATA_ENRICHMENT_IMPLEMENTATION.md) - Architecture details
- [lib/validators-geo-mapping.ts](lib/validators-geo-mapping.ts) - Actual mapping file

