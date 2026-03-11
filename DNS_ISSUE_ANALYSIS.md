# DNS Issue Analysis - monad-validators.block-pro.net

**Problem:** `DNS_PROBE_FINISHED_NXDOMAIN` for mainnet domain  
**Working:** monad-validators-testnet.block-pro.net ✅  
**Broken:** monad-validators.block-pro.net ❌  

---

## What I Found in Codebase

### Project Configuration
- **Vercel Project:** monad-vdp-validators
- **Project ID:** prj_WAkfYIjDVbtU1pzXGu3gCTozTsmI
- **Org ID:** team_yZPffXwqt5bBEN4Dmlvmo4om

### Current Setup
- No hardcoded domain references in app code
- No custom domain routing in next.config.ts
- Vercel project.json shows single project: "monad-vdp-validators"
- vercel.json.disabled has cron config but no domain settings

**Finding:** The codebase is clean - no app-level issues. This is purely a **DNS/domain configuration issue**.

---

## Most Likely Root Causes

### 🔴 Cause #1: DNS Record Missing (Probability: 80%)

**What happened:**
- Mainnet domain never added to DNS provider, OR
- Mainnet CNAME record was deleted

**Evidence to check:**
- Log in to your DNS provider (Namecheap, GoDaddy, Route53, Cloudflare, etc.)
- Search for "monad-validators" record
- **Compare:** Does testnet have a CNAME but mainnet doesn't?

**If this is it:**
```
Go to DNS Provider:
- Add Record
- Name: monad-validators
- Type: CNAME
- Value: [EXACT value from Vercel, typically cname.vercel-dns.com or similar]
- TTL: 3600
- Save

Wait 15-30 minutes for propagation
Test: nslookup monad-validators.block-pro.net
```

---

### 🟡 Cause #2: Vercel Domain Not Configured (Probability: 15%)

**What happened:**
- Domain added to Vercel but not verified, OR
- Domain added to different Vercel project/team, OR
- Domain removed from Vercel

**Evidence to check:**
1. Go to https://vercel.com/dashboard
2. Select project: monad-vdp-validators
3. Go to: Settings → Domains
4. Look for both domains:
   - monad-validators-testnet.block-pro.net (should be there)
   - monad-validators.block-pro.net (should be there, check status)

**If mainnet is missing:**
```
In Vercel:
1. Click "Add Domain"
2. Enter: monad-validators.block-pro.net
3. Follow verification steps
4. Status should change to "Valid"
5. Get CNAME target from Vercel
6. Add that CNAME to DNS provider
```

**If mainnet shows "Invalid":**
```
1. Click the domain
2. Click "Re-verify" or "Edit"
3. Follow Vercel's instructions
4. Update DNS if needed
```

---

### 🟠 Cause #3: DNS Propagation / Caching (Probability: 3%)

**What happened:**
- Changes made <24 hours ago, still propagating
- Old DNS cached on your machine
- ISP DNS cache hasn't updated

**If this is it:**
```PowerShell
# Clear local DNS cache
ipconfig /flushdns

# Test with different DNS resolver
nslookup monad-validators.block-pro.net 1.1.1.1
nslookup monad-validators.block-pro.net 8.8.8.8

# If one works but another doesn't, it's propagation
# Wait 24 hours and test again
```

---

### 🟣 Cause #4: Zone/Nameserver Issue (Probability: 2%)

**What happened:**
- block-pro.net's nameservers point to wrong DNS provider
- Subdomain zone created but not properly delegated
- DNS zone split across multiple providers

**If you suspect this:**
```PowerShell
# Check nameservers for block-pro.net
nslookup -type=NS block-pro.net

# Should return nameservers of your DNS provider
# e.g., ns1.namecheap.com, ns2.namecheap.com
# Should match the provider you're using
```

---

## Quick Diagnosis (30 seconds)

Open PowerShell and run:

```powershell
# This will tell you immediately if it's DNS
$test = Resolve-DnsName monad-validators.block-pro.net -ErrorAction SilentlyContinue
if ($test) {
  Write-Host "✅ Resolves to: $($test.IPAddress)"
} else {
  Write-Host "❌ Does not resolve - definitely a DNS issue"
  Write-Host ""
  Write-Host "Next steps:"
  Write-Host "1. Check DNS provider for mainnet record"
  Write-Host "2. Compare with testnet record"
  Write-Host "3. Verify domain in Vercel dashboard"
}
```

---

## Step-by-Step Fix (If Cause #1 - Most Likely)

### Step 1: Log in to DNS Provider
- Namecheap, GoDaddy, Route53, Cloudflare, etc.
- Find domain: block-pro.net

### Step 2: Look at Existing Records
```
You should see something like:

monad-validators-testnet  CNAME  actual-vercel-target.vercel-dns.com
monad-validators          CNAME  ??? (MISSING or wrong value)
```

### Step 3: Get Correct Value from Vercel
1. Go to vercel.com/dashboard
2. Select: monad-vdp-validators
3. Settings → Domains
4. Find: monad-validators.block-pro.net
5. Click it
6. Look for: "Add this CNAME record:"
7. Copy the value

### Step 4: Add/Update DNS Record
Go back to DNS provider and:
- If record doesn't exist: Create it
  ```
  Name: monad-validators
  Type: CNAME
  Value: [Vercel's CNAME target]
  TTL: 3600
  ```
- If record exists but wrong value: Update it
  ```
  Change Value to: [Vercel's CNAME target]
  ```

### Step 5: Wait & Test
- Wait 15-30 minutes
- Run: `nslookup monad-validators.block-pro.net`
- Should resolve ✅

---

## Comparison: Testnet vs Mainnet

**What the working testnet setup should show:**

```
DNS Provider Records:
✅ monad-validators-testnet.block-pro.net → CNAME → cname.vercel-dns.com (or similar)

Vercel Dashboard:
✅ monad-validators-testnet.block-pro.net → Status: Valid
```

**What mainnet SHOULD have (but might not):**

```
DNS Provider Records:
❌ monad-validators.block-pro.net → (MISSING or wrong CNAME)

Vercel Dashboard:
❌ monad-validators.block-pro.net → (Missing or Invalid status)
```

---

## Do NOT Do

❌ Change app code - the code is fine  
❌ Rebuild or redeploy - DNS is independent of code  
❌ Create A records to IPs - use CNAME pointing to Vercel  
❌ Add multiple CNAMEs - should be exactly one  
❌ Try to work around it in app - fix DNS, not code  

---

## Expected Timeline After Fix

- **Immediately:** Local DNS may resolve if you clear cache
- **5 minutes:** Some ISPs propagate quickly
- **15-30 minutes:** Most resolvers updated
- **1-2 hours:** CloudFlare and other caches
- **24 hours:** Full global propagation guaranteed

---

## Test After Fix

```powershell
# Local test
nslookup monad-validators.block-pro.net

# Google DNS
nslookup monad-validators.block-pro.net 8.8.8.8

# Cloudflare DNS
nslookup monad-validators.block-pro.net 1.1.1.1

# Browser test
# Open: https://monad-validators.block-pro.net
# Should load mainnet dashboard
```

---

## Need More Help?

Run the full diagnostic script:
- [DNS_INVESTIGATION_GUIDE.md](DNS_INVESTIGATION_GUIDE.md)
- Contains complete `diagnose-dns.ps1` script
- Provides detailed output to share

Then share:
1. Diagnostic output
2. DNS provider records (screenshot fine)
3. Vercel domain status
4. Exact error message

---

## Summary

| Check | Status | Fix If Needed |
|-------|--------|---------------|
| DNS Record in provider | ❓ Check | Add/update CNAME |
| Vercel domain config | ❓ Check | Add domain, verify |
| Code/app side | ✅ Fine | None needed |
| Propagation | ⏳ Time | Wait 24h max |

**Next step:** Run the diagnostic commands above and check your DNS provider.

The fix is almost certainly just adding the missing DNS record! 🎯
