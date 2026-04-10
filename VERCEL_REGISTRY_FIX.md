# CRITICAL FIX: Inactive Validator Snapshot Fallback on Vercel

## 🔴 Problem Identified

**Inactive validators show "Unknown" instead of last-known geo data after Vercel deployments.**

### Root Cause

The snapshot/fallback system works correctly **within a deployment**, but breaks **across deployments** due to ephemeral `/tmp` storage in Vercel:

```
Deployment Cycle:
┌────────────────────────────────────────┐
│ Vercel Deployment A                    │
├────────────────────────────────────────┤
│ 1. loadRegistry() → reads from         │
│    lib/registry/mainnet.json (✅ OK)   │
│ 2. Active validators get geo data      │
│    from gmonads API                    │
│ 3. updateValidatorGeoData() writes to: │
│    /tmp/mainnet.json (EPHEMERAL! ⚠️)  │
│ 4. Inactive validators can read from   │
│    /tmp (works for this deployment)    │
└────────────────────────────────────────┘
          ⏹️  Deployment ends
          /tmp is WIPED ❌
┌────────────────────────────────────────┐
│ Vercel Deployment B (new instance)     │
├────────────────────────────────────────┤
│ 1. loadRegistry() → /tmp is empty!     │
│    Falls back to project files         │
│ 2. Project files have OLD data         │
│    (from BEFORE Deployment A ran)      │
│ 3. Inactive validators lookup registry │
│    → missing geo → shows "Unknown" ❌  │
└────────────────────────────────────────┘
```

### Why Project Files Don't Update

In Vercel:
- `/var/task/` (project files) is **READ-ONLY**
- Only `/tmp/` is writable
- Writes to `/tmp/` are **ephemeral** (lost on redeployment)
- Project files in git are **never updated** with runtime geo data

---

## ✅ Solution Implemented

### Step 1: Fixed Read Priority (Already Applied)

**File: `lib/registry/index.ts`**

Changed `loadRegistry()` to **always prioritize project files**:

```typescript
// Before (broken):
const pathsToTry = isServerless ? [tmpPath, readPath] : [readPath];  // ❌ /tmp first

// After (fixed):  
const pathsToTry = [projectPath];  // ✅ Project files first (persistent)
if (isServerless && tmpPath !== projectPath) {
  pathsToTry.push(tmpPath);  // Then /tmp as fallback (in-flight updates)
}
```

**Why this helps:** Inactive validators now read from persistent project files, not lost /tmp data.

### Step 2: Update Registry Files Before Deployment (YOU MUST DO THIS)

The registry files (`lib/registry/mainnet.json` and `lib/registry/testnet.json`) need to be kept **in sync with active validators' geo data**.

**Two approaches:**

#### Option A: Manual Update (Recommended Short-term)

1. **Run a snapshot export locally or fetch from production:**

```powershell
# Get current snapshot from Vercel or local dev
$snapshot = curl "https://monad-validators.vercel.app/api/snapshot?network=mainnet" -s | ConvertFrom-Json

# Extract active validators with geo data
$activeWithGeo = $snapshot.data.validators | Where-Object { 
  $_.status -eq 'active' -and ($_.country -or $_.city -or $_.provider)
} | Select-Object secp, country, city, provider

# Convert to registry format and merge with existing
$existing = Get-Content lib/registry/mainnet.json | ConvertFrom-Json
foreach ($v in $activeWithGeo) {
  if ($existing.$($v.secp)) {
    $existing.$($v.secp) | Add-Member -MemberType NoteProperty -Name "country" -Value $v.country -Force
    $existing.$($v.secp) | Add-Member -MemberType NoteProperty -Name "city" -Value $v.city -Force
    $existing.$($v.secp) | Add-Member -MemberType NoteProperty -Name "provider" -Value $v.provider -Force
    $existing.$($v.secp) | Add-Member -MemberType NoteProperty -Name "lastSeenAt" -Value ([DateTime]::UtcNow.ToString("o")) -Force
  }
}

$existing | ConvertTo-Json | Out-File lib/registry/mainnet.json
git add lib/registry/mainnet.json
git commit -m "Update registry geo data for active validators"
git push
```

#### Option B: Automatic CI/CD (Recommended Long-term)

Create a GitHub Actions workflow that:

1. Runs on a schedule (e.g., every 6 hours)
2. Calls the snapshot endpoint
3. Extracts active validator geo data  
4. Updates registry files
5. Commits and pushes to version control

**File: `.github/workflows/sync-registry.yml`**

```yaml
name: Sync Registry with Current Validators

on:
  schedule:
    - cron: '0 */6 * * *'  # Every 6 hours
  workflow_dispatch:

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Fetch snapshot and update registry
        run: |
          # Fetch mainnet snapshot
          curl https://monad-validators.vercel.app/api/snapshot?network=mainnet \
            -o snapshot-mainnet.json
          
          # Update registry (run your sync script here)
          node scripts/sync-registry.js snapshot-mainnet.json
          
          # Commit if changed
          git config user.email "bot@monad.foundation"
          git config user.name "Registry Bot"
          git add lib/registry/*.json
          git diff --quiet && git diff --staged --quiet || \
            (git commit -m "Update registry from latest snapshot" && git push)
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

---

## 📋 What Needs to Happen

### Immediate (This Week)

1. ✅ **Code fix applied** (`lib/registry/index.ts` updated)
2. **Update registry files** with current active validator geo data
   - Use Option A (manual) or Option B (automation setup)
3. **Commit updated registry files** to version control
4. **Test against Vercel**:
   ```bash
   npm run build  # Ensure no build errors
   git push      # Deploy to Vercel
   
   # Check result:
   curl https://monad-validators.vercel.app/api/snapshot?network=mainnet \
     | jq '.data.validators[] | select(.status == "inactive") | select(.country != "Unknown")' | head -5
   ```

### Long-term (Optional but Recommended)

1. Set up automated CI/CD workflow (Option B) to keep registry in sync
2. Consider migrating to Vercel KV for real-time persistence
3. Add monitoring to alert when many inactive validators show "Unknown"

---

## Verification Steps

### Test Locally

1. **Start dev server:**
   ```bash
   npm run dev
   ```

2. **Fetch snapshot:**
   ```powershell
   $snapshot = curl http://localhost:3000/api/snapshot?network=testnet -s | ConvertFrom-Json
   ```

3. **Check an inactive validator:**
   ```powershell
   $inactive = $snapshot.data.validators | Where-Object status -eq "inactive" | Select-Object -First 1
   $inactive | Format-Table displayName, status, country, city, provider
   ```

4. **Expected:** Should show country/city/provider (not "Unknown" or "No data")

### Test on Vercel

After deploying:

```powershell
# Check mainnet inactive validators
$snapshot = curl "https://monad-validators.vercel.app/api/snapshot?network=mainnet" -s | ConvertFrom-Json

$inactive = $snapshot.data.validators | Where-Object status -eq "inactive"
$withData = $inactive | Where-Object { $_.country -ne "Unknown" -and $_.country -ne "No data" }

Write-Host "Total inactive: $($inactive.Count)"
Write-Host "With geo data: $($withData.Count)"
Write-Host "Percentage: $([Math]::Round($withData.Count / $inactive.Count * 100))%"
```

**Expected:** Most inactive validators should have geo data (>80%)

---

## Monitoring

Add this check to your monitoring to catch regressions:

```powershell
# Run hourly to alert if inactive validators lose geo data
$snapshot = curl https://monad-validators.vercel.app/api/snapshot?network=mainnet -s | ConvertFrom-Json
$inactive = $snapshot.data.validators | Where-Object status -eq "inactive"
$withoutData = $inactive | Where-Object { 
  $_.country -eq "Unknown" -or $_.country -eq "No data" -or !$_.country
}

if ($withoutData.Count / $inactive.Count -gt 0.2) {
  # Alert: More than 20% of inactive validators have no geo data
}
```

---

## FAQ / Troubleshooting

### Q: Why does the fix work?

**A:** By prioritizing project files for reads, inactive validators now retrieve persistent geo data even after `/tmp` is wiped. Project files are seeded from version control at deploy time.

### Q: What if the registry files still show "Unknown"?

**A:** The registry files haven't been updated with current geo data. Follow "Update Registry Files" step above.

### Q: Why can't we just write to project files in Vercel?

**A:** Vercel runs on AWS Lambda with `/var/task/` (app code) mounted as read-only for security. Only `/tmp/` is writable from Lambda functions.

### Q: Will active validators be affected?

**A:** No. Active validators continue to work normally because:
- gmonads API returns their current geo data
- This data is extracted and displayed immediately (no fallback needed)
- Data is persisted to registry for future use when they go inactive

---

## Code Reference

### How Fallback Works Now (Fixed)

```
For INACTIVE validator with secp "abc123":

1. Load snapshot → gmonads API has NO geo data for inactive
2. enrichValidator() called with empty geo data
3. Try extractGeo(merged) → nothing (no API data)
4. Try getValidatorMetadata(network, secp) → 
   a. Check /var/task/lib/registry/mainnet.json (project files) ✅ FIXED
   b. Check /tmp/mainnet.json (fallback)
   Result: Returns last-known country/city/provider ✅
5. Display validator with preserved geo data (not "Unknown")
```

### Files Modified

- `lib/registry/index.ts` - Fixed read priority and added documentation

### Files Still Need Updates (Manual Step)

- `lib/registry/mainnet.json` - Update with current geo data
- `lib/registry/testnet.json` - Update with current geo data

---

**Status:** 🟡 **Code fix complete, but manual registry update required** ← YOU ARE HERE

**Next:** Follow "Update Registry Files" section above to complete the fix.
