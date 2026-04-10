# QUICK ACTION GUIDE - Fix Inactive Validator Snapshot Issue

## ⚡ TL;DR (15 Minutes)

### Root Cause
Vercel's `/tmp` storage is ephemeral (wiped on redeploy) → inactive validator fallback data is lost → shows "Unknown"

### What I Fixed
✅ Code change applied: `lib/registry/index.ts` now reads from persistent project files first

### What YOU Need to Do
1. **Update registry files** with current geo data (2 minutes)
2. **Commit and deploy** (1 minute)  
3. **Verify** on Vercel (5 minutes)

---

## 🚀 Implementation Steps

### Step 1: Update Registry Files (Choose ONE)

#### 🔷 **Option A: Use the Sync Script (Recommended)**

**From a dev server or local CLI:**

```powershell
# If dev server is running locally at port 3000:
node scripts/sync-registry-from-snapshot.mjs http://localhost:3000/api/snapshot testnet mainnet

# Or point to production snapshot:
node scripts/sync-registry-from-snapshot.mjs https://monad-validators.vercel.app/api/snapshot mainnet

# Or run just one network:
node scripts/sync-registry-from-snapshot.mjs http://localhost:3000/api/snapshot testnet
```

**Expected output:**
```
📚 Syncing TESTNET registry...
  ✅ Loaded existing registry: 230 validators
  📝 Merged: 196 validators with geo data
  ⏭️  Skipped: 34 validators (no real geo data)
  💾 Saved to: lib/registry/testnet.json
  🌍 Validators with geo data: 196 (85%)

✅ Registry sync complete!
```

#### 🔷 **Option B: Manual PowerShell Update**

```powershell
# Fetch production snapshot
$snapshot = curl "https://monad-validators.vercel.app/api/snapshot?network=mainnet" -s | ConvertFrom-Json

# Load current registry
$registry = (Get-Content lib/registry/mainnet.json | ConvertFrom-Json -AsHashtable)

# Update active validators' geo data
foreach ($v in $snapshot.data.validators) {
    if ($v.status -eq "active" -and ($v.country -or $v.city -or $v.provider)) {
        $secp = $v.secp.ToLower()
        if (-not $registry[$secp]) {
            $registry[$secp] = @{secp = $secp; discoveredAt = (Get-Date -AsUTC -Format 'o')}
        }
        $registry[$secp]["country"] = $v.country
        $registry[$secp]["city"] = $v.city
        $registry[$secp]["provider"] = $v.provider
        $registry[$secp]["lastSeenAt"] = (Get-Date -AsUTC -Format 'o')
        $registry[$secp]["updatedAt"] = (Get-Date -AsUTC -Format 'o')
    }
}

# Save updated registry
$registry | ConvertTo-Json | Out-File lib/registry/mainnet.json -Encoding utf8

Write-Host "✅ Updated lib/registry/mainnet.json"
```

**Repeat for testnet:**
```powershell
# Change "mainnet" to "testnet" in the above script and run again
```

---

### Step 2: Verify Changes

```powershell
# Check what changed:
git diff lib/registry/

# Quick stats:
$mainnet = Get-Content lib/registry/mainnet.json | ConvertFrom-Json
$withGeo = $mainnet.PSObject.Properties | Where-Object {$_.Value.country -or $_.Value.city -or $_.Value.provider}
Write-Host "Mainnet: $($mainnet.PSObject.Properties.Count) validators, $($withGeo.Count) with geo data"
```

---

### Step 3: Commit and Deploy

```powershell
# Commit registry updates
git add lib/registry/mainnet.json lib/registry/testnet.json
git commit -m "Update registry with current validator geo data

- Fixed: Inactive validators now fallback to persisted geo data
- Also: Fixed lib/registry/index.ts read priority for Vercel persistence
- Reason: Vercel /tmp storage is ephemeral (wiped on redeploy)
"

# Push to trigger Vercel deployment
git push
```

---

### Step 4: Verify on Vercel (5 minutes after deployment)

```powershell
# Wait for Vercel to finish deployment, then check:

$snapshot = curl "https://monad-validators.vercel.app/api/snapshot?network=mainnet" -s | ConvertFrom-Json

# Count inactive validators with geo data
$inactive = $snapshot.data.validators | Where-Object status -eq "inactive"
$withoutData = $inactive | Where-Object { 
  $_.country -eq "Unknown" -or $_.country -eq "No data" -or !$_.country
}

Write-Host "Inactive validators: $($inactive.Count)"
Write-Host "Without geo data: $($withoutData.Count)"
Write-Host "Success rate: $(100 - [Math]::Round($withoutData.Count / $inactive.Count * 100))%"

# Sample inactive validator with data:
$sample = $inactive | Where-Object country -NE "Unknown" | Select-Object -First 1
if ($sample) {
    Write-Host "`n✅ Example inactive validator WITH geo data:"
    $sample | Format-Table displayName, status, country, city, provider
}
```

**Expected:**
- ✅ Most inactive validators have geo data (>80%)
- ✅ country, city, provider should be populated (not "Unknown")
- ✅ Sample validator shows real location data

---

## 📊 What Changed

### Code Files Modified
- `lib/registry/index.ts` - **Fixed read priority** for Vercel persistence
  - Now always checks persistent project files first
  - Falls back to `/tmp` for in-flight updates within same deployment

### Configuration Files to Update
- `lib/registry/mainnet.json` - **Needs refresh** with current geo data
- `lib/registry/testnet.json` - **Needs refresh** with current geo data

### New Tooling Added
- `scripts/sync-registry-from-snapshot.mjs` - Automates registry sync

---

## 🔍 Validation Checklist

After deployment, verify:

- [ ] Dev server runs without errors: `npm run dev`
- [ ] Snapshot API works: `curl http://localhost:3000/api/snapshot?network=testnet`
- [ ] Inactive validators show geo data (not "Unknown")
- [ ] Vercel deployment completes successfully
- [ ] Production snapshot works: `curl https://monad-validators.vercel.app/api/snapshot?network=mainnet`
- [ ] Inactive validators have geo data on production
- [ ] No errors in Vercel Function Logs

---

## 📚 Detailed Documentation

See **[VERCEL_REGISTRY_FIX.md](VERCEL_REGISTRY_FIX.md)** for:
- Full technical explanation
- Why the bug happened
- Long-term solutions (CI/CD automation)
- Troubleshooting
- Monitoring setup

---

## ⚠️ Common Issues & Fixes

### Issue: "Script not found" when running sync script

**Solution:**
```powershell
# Ensure you have Node.js installed, then try:
node ./scripts/sync-registry-from-snapshot.mjs http://localhost:3000/api/snapshot testnet
```

### Issue: "Cannot read snapshot from URL"

**Solution:**
```powershell
# Make sure the dev server is running:
npm run dev

# Then in another terminal:
node scripts/sync-registry-from-snapshot.mjs http://localhost:3000/api/snapshot testnet

# Or if that fails, fetch manually and save:
curl http://localhost:3000/api/snapshot?network=testnet > snapshot.json

# Then use to update registry manually
```

### Issue: Deploy didn't fix the problem

**Likely cause:** Registry files weren't updated before deployment

**Solution:**
1. Verify registry files were actually modified: `git diff lib/registry/`
2. Re-run the sync script: `node scripts/sync-registry-from-snapshot.mjs`
3. Check that commit was pushed: `git log --oneline -n 5`

---

## 🎯 Success Criteria

✅ **Inactive validators show country/city/provider** (not "Unknown" or "No data")

✅ **Data persists across Vercel deployments**

✅ **Active validators still work normally**

---

## 📞 If Problems Persist

Document and share:
1. Output from verification script above
2. Git commit hash of your changes: `git rev-parse HEAD`
3. Vercel deployment URL
4. Specific validator ID showing "Unknown" (find from snapshot)
5. Whether it worked before or this is first deployment

Then debug with logs:

```powershell
# Enable debug output for next deployment:
$env:NODE_ENV="development"
npm run dev

# Look for [registry] and [enrichment-debug] logs
# They will show the fallback chain and why it failed
```

---

**Status:** Ready to implement ➡️ Execute the 4 steps above
