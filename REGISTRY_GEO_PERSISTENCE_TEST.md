# Registry Geo Data Persistence - Test Guide

## Implementation Summary

### What Changed

**1. `lib/registry/types.ts`**
- Added `lastSeenAt?: string` field to `ValidatorMetadata` interface
- Tracks when a validator was last observed as active

**2. `lib/registry/index.ts`**
- Added `updateValidatorGeoData()` function for batch geo updates
- Filters out placeholder values ("Unknown", "No data") - only saves real data
- Merges with existing registry entries without losing previously set fields
- Single batch write per snapshot for efficiency

**3. `lib/getSnapshot.ts`**
- Imported new `updateValidatorGeoData` function
- Added logic after validator enrichment (line ~725):
  - Filters for active validators with secp + real geo data
  - Builds batch array of { secp, country, city, provider, lastSeenAt }
  - Calls `updateValidatorGeoData()` once per snapshot
  - Logs success count in development mode

### How It Works

**Flow:**
```
1. computeSnapshot() fetches epoch + geolocations from API
2. Enriches validators (merges registry + snapshot + IP geo)
3. Filters inactive validators + newly inactive from rotation
4. ✅ [NEW] For active validators with real geo data → persist to registry
5. Returns enriched snapshot to API consumers
```

**Data Priority (unchanged):**
- Registry (manual research) > Snapshot (API) > IP Geolocation > None

**Inactive Fallback:**
- When validator rotates out, API stops returning geo data
- Existing `getValidatorMetadata()` lookup returns last-known data from registry
- Dashboard shows preserved location/provider for inactive validators

---

## Test Steps

### Prerequisites
```powershell
# Terminal 1: Start dev server (if not running)
npm run dev

# Terminal 2: Run tests
$env:NODE_ENV = "development"
```

### Test 1: Verify Registry Persistence on Snapshot

**Goal:** Confirm geo data is captured and saved to registry files

**Steps:**

1. **Clear registry files** (backup first if needed):
   ```powershell
   # Backup current registries
   Copy-Item lib/registry/mainnet.json lib/registry/mainnet.json.backup
   Copy-Item lib/registry/testnet.json lib/registry/testnet.json.backup
   
   # Reset to empty
   @{} | ConvertTo-Json | Out-File -FilePath lib/registry/mainnet.json -Encoding utf8
   @{} | ConvertTo-Json | Out-File -FilePath lib/registry/testnet.json -Encoding utf8
   ```

2. **Call snapshot API (testnet)**:
   ```powershell
   # Open browser or curl
   curl "http://localhost:3000/api/snapshot?network=testnet" -s | jq . > snapshot-testnet.json
   ```

3. **Check registry file was populated**:
   ```powershell
   # View registry (should now have entries with geo data)
   Get-Content lib/registry/testnet.json | jq '.[] | select(.country != null) | {secp, country, city, provider, lastSeenAt}' | head -20
   ```

4. **Verify data quality**:
   ```powershell
   # Count entries with geo data
   $registry = Get-Content lib/registry/testnet.json | ConvertFrom-Json
   $withGeo = $registry.PSObject.Properties | Where-Object {$_.Value.country -or $_.Value.city -or $_.Value.provider}
   Write-Host "Validators with geo data: $($withGeo.Count)"
   
   # Sample entry
   $sample = $withGeo | Select-Object -First 1
   $sample.Value
   ```

**Expected Output:**
- ✅ mainnet.json / testnet.json contain entries with `country`, `city`, `provider` fields
- ✅ Each has `lastSeenAt` timestamp from this snapshot
- ✅ No "Unknown" or "No data" values persisted
- ✅ Dev console shows: `[registry] Persisted geo data for N active validators`

---

### Test 2: Verify Inactive Validator Fallback

**Goal:** Confirm inactive validators use registry data when API provides nothing

**Steps:**

1. **Prepare test data** - Identify an active validator from snapshot:
   ```powershell
   # Pick a validator that's currently active
   $snap = Get-Content snapshot-testnet.json | ConvertFrom-Json
   $active = $snap.validators | Where-Object {$_.status -eq "active"} | Select-Object -First 1
   $testSecp = $active.secp
   Write-Host "Test validator SECP: $testSecp"
   Write-Host "Current location: $($active.country) / $($active.city) / $($active.provider)"
   ```

2. **Verify it's in registry**:
   ```powershell
   $registry = Get-Content lib/registry/testnet.json | ConvertFrom-Json
   $inRegistry = $registry.$testSecp
   Write-Host "In registry: $($inRegistry.country) / $($inRegistry.city) / $($inRegistry.provider)"
   ```

3. **Simulate inactive validator** - Create a mock test:

   Create `test-registry-fallback.mjs`:
   ```javascript
   import { getValidatorMetadata, updateValidatorGeoData } from './lib/registry/index.ts';
   
   // Test with testnet
   const network = 'testnet';
   
   // Pick a real SECP from latest snapshot (from test 1)
   const testSecp = 'your-test-secp-here';
   
   // Simulate: validator becomes inactive
   // API no longer provides country/city/provider
   // Dashboard queries registry for fallback
   const fallback = getValidatorMetadata(network, testSecp);
   
   if (fallback?.country) {
     console.log('✅ Fallback data found:');
     console.log(`   Country: ${fallback.country}`);
     console.log(`   City: ${fallback.city}`);
     console.log(`   Provider: ${fallback.provider}`);
     console.log(`   Last seen: ${fallback.lastSeenAt}`);
   } else {
     console.log('❌ No fallback data found');
   }
   ```

   ```powershell
   node test-registry-fallback.mjs
   ```

**Expected Output:**
- ✅ Registry returns geo data for previously-active validator
- ✅ Fallback includes country, city, provider, lastSeenAt
- ✅ Even if validator is not in current snapshot, data persists

---

### Test 3: Verify No Overwrite of Existing Data

**Goal:** Confirm that persisting new data doesn't erase manually-researched entries

**Steps:**

1. **Manually add research data to registry**:
   ```powershell
   # Add a manual entry
   $registry = Get-Content lib/registry/testnet.json | ConvertFrom-Json
   $registry | Add-Member -MemberType NoteProperty -Name "0x1111" -Value @{
     secp = "0x1111"
     country = "Singapore"
     city = "Marina Bay"
     provider = "Manual Research"
     confidence = "HIGH"
     discoveredAt = "2026-03-01T00:00:00Z"
     updatedAt = "2026-03-01T00:00:00Z"
   }
   $registry | ConvertTo-Json | Out-File lib/registry/testnet.json
   ```

2. **Run snapshot again**:
   ```powershell
   curl "http://localhost:3000/api/snapshot?network=testnet" -s > /dev/null
   ```

3. **Check manual entry is preserved**:
   ```powershell
   $registry = Get-Content lib/registry/testnet.json | ConvertFrom-Json
   $manual = $registry."0x1111"
   Write-Host "Manual entry preserved:"
   Write-Host "  Country: $($manual.country)"
   Write-Host "  Confidence: $($manual.confidence)"
   ```

**Expected Output:**
- ✅ Manual entry still has country="Singapore" (not overwritten)
- ✅ Confidence="HIGH" preserved
- ✅ updatedAt may be new, but geo data intact

---

### Test 4: Run Full Integration

**Goal:** End-to-end test with real snapshot flow

**Steps:**

1. **Reset environment**:
   ```powershell
   @{} | ConvertTo-Json | Out-File -FilePath lib/registry/testnet.json -Encoding utf8
   ```

2. **First snapshot call (mainnet)**:
   ```powershell
   $t1 = Get-Date
   Invoke-WebRequest -Uri "http://localhost:3000/api/snapshot?network=mainnet" -Method Get | ConvertFrom-Json > snap1.json
   $t2 = Get-Date
   Write-Host "First snapshot took: $($t2 - $t1)"
   
   # Count active validators
   $active1 = (Get-Content snap1.json | ConvertFrom-Json).validators | Where-Object {$_.status -eq "active"}
   Write-Host "Active validators: $($active1.Count)"
   ```

3. **Check registry was populated**:
   ```powershell
   $registry = Get-Content lib/registry/mainnet.json | ConvertFrom-Json
   $withGeo = $registry.PSObject.Properties | Where-Object {$_.Value.country}
   Write-Host "Registry entries with geo: $($withGeo.Count)"
   Write-Host "Sample:"
   ($withGeo | Select-Object -First 1).Value | ConvertTo-Json
   ```

4. **Second snapshot call (cache check)**:
   ```powershell
   $t3 = Get-Date
   Invoke-WebRequest -Uri "http://localhost:3000/api/snapshot?network=mainnet" -Method Get | ConvertTo-Json > snap2.json
   $t4 = Get-Date
   Write-Host "Second snapshot took: $($t4 - $t3) (should be faster - cached)"
   
   # Verify data consistency
   $same = (Get-Content snap1.json | ConvertFrom-Json).counts.total -eq (Get-Content snap2.json | ConvertFrom-Json).counts.total
   Write-Host "Validator count consistent: $same"
   ```

5. **Check dev console for persistence logs**:
   ```
   [registry] Persisted geo data for X active validators
   ```

**Expected Output:**
- ✅ First call populates registry (may be slower due to IP lookups)
- ✅ Registry has entries with country/city/provider
- ✅ No "Unknown" or "No data" values in registry
- ✅ Second call uses cache (faster)
- ✅ Data persists across calls

---

## Verification Checklist

- [ ] Registry files (`mainnet.json`, `testnet.json`) contain populated entries
- [ ] Entries have `country`, `city`, `provider` fields (only real values)
- [ ] Entries have `lastSeenAt` timestamp
- [ ] No "Unknown" or "No data" strings in registry files
- [ ] Dev console logs "[registry] Persisted geo data for X validators"
- [ ] Manually-added registry entries are preserved
- [ ] Inactive validator lookup returns registry data
- [ ] Multiple snapshot calls don't corrupt registry

---

## Rollback (if needed)

```powershell
# Restore backup
Copy-Item lib/registry/mainnet.json.backup lib/registry/mainnet.json -Force
Copy-Item lib/registry/testnet.json.backup lib/registry/testnet.json -Force
```

---

## Files Modified

1. `lib/registry/types.ts` - Added `lastSeenAt` field
2. `lib/registry/index.ts` - Added `updateValidatorGeoData()` function
3. `lib/getSnapshot.ts` - Integrated geo persistence call
