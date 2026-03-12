# 🚨 Production Outage: DNS Recovery Guide

**Status:** Both domains NXDOMAIN - Vercel UI shows "Valid" but DNS target invalid  
**Severity:** 🔴 Critical - All traffic blocked  
**Root Cause:** CNAME points to non-existent Vercel DNS server  
**Recovery Time:** 5-15 minutes  

---

## What Went Wrong

### Current Broken State
```
DNS Records Set:
  monad-validators.block-pro.net          → CNAME → d2fa438363140986.vercel-dns-017.com
  monad-validators-testnet.block-pro.net  → CNAME → d2fa438363140986.vercel-dns-017.com

But That CNAME Target:
  nslookup d2fa438363140986.vercel-dns-017.com → NXDOMAIN ❌
```

### Why "Valid Configuration" in Vercel UI?
- Vercel UI checks DNS record syntax (✅ valid CNAME format)
- Vercel UI does NOT verify the CNAME target actually resolves
- This is a display issue - the records are syntactically valid but semantically broken
- The DNS target `d2fa438363140986.vercel-dns-017.com` appears to be:
  - An old/decommissioned Vercel DNS server, OR
  - A typo that was never valid, OR
  - A project ID from deleted infrastructure

### Why Is This in Your DNS?

**Searched entire codebase** - No hardcoded domain config found:
- ✅ No DNS target in `vercel.json`
- ✅ No DNS target in `next.config.ts`
- ✅ No DNS target in repo files
- ✅ No custom domain config anywhere in app code

**Conclusion:** The invalid CNAME was entered manually into your DNS provider (Namecheap, GoDaddy, Route53, Cloudflare, etc.), likely from copy-pasting an old/stale Vercel suggestion or manual entry error.

---

## What's the Correct CNAME?

### Standard Vercel CNAME
Most Vercel projects use a single standard CNAME target:
```
cname.vercel-dns.com
```

This is a load balancer that routes to your Vercel project.

### How to Get YOUR Exact CNAME

Since you're in a production outage, you'll need to:

1. **Go to Vercel Dashboard:**
   - https://vercel.com/dashboard
   - Select project: `monad-vdp-validators`

2. **For each domain (do twice: mainnet + testnet):**
   - Settings → Domains
   - Find the domain: `monad-validators.block-pro.net` (or testnet)
   - Click on it
   - Look for section: **"Add this CNAME record:"**
   - Copy the exact value shown (likely `cname.vercel-dns.com`)

3. **Expected values:**
   ```
   Standard: cname.vercel-dns.com
   
   Alt formats (rare):
   - For Pro plans: Sometimes cname-<region>.vercel-dns.com
   - For Teams: Sometimes team-specific
   - For old projects: Might have hash prefixes (what you currently have)
   ```

**If you can't access Vercel right now**, proceed with standard `cname.vercel-dns.com` - this works for 99% of cases.

---

## Immediate Recovery Steps

### Option A: Use Standard CNAME (Fastest - Do This First)

Assumption: Your Vercel project is in good standing and using standard infrastructure.

#### Step 1: Update DNS Provider

Go to your DNS provider (Namecheap, GoDaddy, Route53, Cloudflare, etc.):

**Delete/Replace BOTH Records:**

```
OLD VALUES (Remove):
  monad-validators          CNAME → d2fa438363140986.vercel-dns-017.com
  monad-validators-testnet  CNAME → d2fa438363140986.vercel-dns-017.com

NEW VALUES (Set):
  monad-validators          CNAME → cname.vercel-dns.com
  monad-validators-testnet  CNAME → cname.vercel-dns.com
```

**For each subdomain:**
```
Name (subdomain):  monad-validators
Record Type:       CNAME
Value (target):    cname.vercel-dns.com
TTL:               3600 (or lowest your provider allows)
Save/Update
```

#### Step 2: Clear & Verify

```PowerShell
# Clear local DNS cache (Windows)
ipconfig /flushdns

# Test immediately
nslookup monad-validators.block-pro.net
nslookup monad-validators-testnet.block-pro.net

# Expected: Should now resolve instead of NXDOMAIN
# May take 1-5 minutes for DNS resolution
```

#### Step 3: Verify Resolution

```PowerShell
# Check CNAME targets
nslookup -type=CNAME monad-validators.block-pro.net
nslookup -type=CNAME monad-validators-testnet.block-pro.net

# Both should show: cname.vercel-dns.com
```

---

### Option B: Verify Against Vercel Dashboard (Most Reliable)

Only do this if Option A doesn't work or you want to be 100% certain.

#### Step 1: Get the Exact Value from Vercel

1. Go to: https://vercel.com/dashboard  
2. Select: `monad-vdp-validators` project  
3. Go to: Settings → Domains  
4. For `monad-validators.block-pro.net`:
   - Click the domain
   - Look for: "To set up this domain with your DNS provider, add this CNAME record:"
   - Copy the exact value (take a screenshot if needed)
5. Repeat for `monad-validators-testnet.block-pro.net`

#### Step 2: Update DNS Provider with Exact Value

In your DNS provider, update both records to the **exact** value from Vercel:

```
If Vercel shows: cname.vercel-dns.com
→ Set CNAME to: cname.vercel-dns.com

If Vercel shows: cname-abc123.vercel-dns.com
→ Set CNAME to: cname-abc123.vercel-dns.com

(Use exactly what Vercel shows)
```

#### Step 3: Verify

Wait 2-5 minutes, then test both domains.

---

## Recovery Timeline

| Time | Action | Status |
|------|--------|--------|
| T+0 | Update DNS records in provider | ⏳ Propagating |
| T+1-5 min | Local resolver caches expire | ⏳ Propagating |
| T+5-15 min | ISP DNS caches update | ⏳ Propagating |
| T+15+ min | Global DNS cached entries expire | ⏳ Possible |
| T+30 min | Full propagation should be complete | ✅ Resolved |
| T+24 h | Absolute guarantee of full propagation | ✅ Closed |

**In most cases:** 5-15 minutes is enough for full recovery.

---

## Verification Checklist

After updating DNS and waiting 5 minutes:

```PowerShell
# ✅ Test 1: Basic resolution
nslookup monad-validators.block-pro.net
nslookup monad-validators-testnet.block-pro.net
# Both should return A record addresses (not NXDOMAIN)

# ✅ Test 2: CNAME targets
nslookup -type=CNAME monad-validators.block-pro.net
nslookup -type=CNAME monad-validators-testnet.block-pro.net
# Both should show: cname.vercel-dns.com (or your exact value)

# ✅ Test 3: Browser access
# Open: https://monad-validators.block-pro.net (mainnet)
# Open: https://monad-validators-testnet.block-pro.net (testnet)
# Both should load dashboard without timeout/NXDOMAIN

# ✅ Test 4: With different DNS resolvers
nslookup monad-validators.block-pro.net 1.1.1.1
nslookup monad-validators.block-pro.net 8.8.8.8
# Both should resolve (tests Cloudflare/Google DNS propagation)
```

---

## Troubleshooting: If Still Broken After 15 Minutes

### Step 1: Verify DNS Provider Saved Changes

1. Go back to DNS provider
2. Find the domain records
3. Confirm they show:
   ```
   monad-validators          CNAME → cname.vercel-dns.com
   monad-validators-testnet  CNAME → cname.vercel-dns.com
   ```
4. If they still show the old `d2fa438363140986.vercel-dns-017.com`:
   - Delete those records
   - Add new ones with correct value
   - Save again

### Step 2: Verify No Time Limit Triggers

Some DNS providers cache changes:
- Check if there's a "pending" or "staged" status
- Try "Force Update" or "Rebuild zone" in DNS provider UI
- Wait another 5-10 minutes

### Step 3: Check Vercel Project Status

1. Go to Vercel dashboard
2. Select `monad-vdp-validators`
3. Check:
   - ✅ Project is not suspended/deleted
   - ✅ No billing issues
   - ✅ Domains show "Valid" status
4. Try:
   - Re-verify domains in domain settings
   - "Re-initialize domain" if available
   - Check Vercel status page for outages

### Step 4: Verify DNS at Root Level

```PowerShell
# Check if block-pro.net's nameservers are correct
nslookup -type=NS block-pro.net

# Should show your DNS provider's nameservers
# e.g., ns1.namecheap.com, ns2.namecheap.com
# If not, domain delegation is broken (contact registrar)
```

### Step 5: Escalate if Still Broken

If still NXDOMAIN after following steps 1-4:
1. **Vercel Support:** Open ticket at https://vercel.com/help
   - Include: DNS propagation delay unusual
   - Include: Both subdomains affected
2. **DNS Provider Support:** Contact their support
   - Include: CNAME should resolve but doesn't
   - Include: Exact records being set

---

## Why This Happened: Analysis

| Factor | Finding | Conclusion |
|--------|---------|------------|
| **Code Config** | Zero hardcoded domain values | ✅ Code is clean |
| **Vercel Config** | Project exists, shows "Valid" | ✅ Project OK |
| **DNS CNAME** | Points to non-existent server | ❌ **BROKEN HERE** |
| **Root Cause** | Manual entry of invalid CNAME | Likely: copy-paste error, old value, or typo |
| **Prevention** | Always verify CNAME resolves | Use: `nslookup -type=A <cname-target>` |

---

## Prevention: Moving Forward

After recovery, add to ops checklist:

```
Domain Change Procedure:
1. [ ] Get CNAME from Vercel dashboard
2. [ ] Verify CNAME resolves: nslookup -type=A <cname>
3. [ ] Update DNS provider
4. [ ] Wait 2 min, clear local cache: ipconfig /flushdns
5. [ ] Test resolution: nslookup <domain>
6. [ ] Test browser: https://<domain>
7. [ ] Check different DNS resolvers
8. [ ] Mark as complete when all tests pass
9. [ ] Document changes in ticket/wiki
```

---

## Questions to Answer

After recovery, investigate:

1. **Who set the CNAME value?**
   - Check DNS provider audit log (if available)
   - Ask team members

2. **Where did `d2fa438363140986.vercel-dns-017.com` come from?**
   - Old Vercel suggestion?
   - Copied from test environment?
   - Manual typo?

3. **How to prevent?**
   - Automated tests that verify CNAMEs resolve?
   - Documentation for domain changes?
   - Restricted DNS provider access?

4. **When did it break?**
   - Check deploy logs
   - When was CNAME last changed?
   - Did a Vercel project migration happen?

---

## Summary

**Problem:** CNAME target doesn't exist (NXDOMAIN chain)  
**Fix:** Update both CNAMEs to `cname.vercel-dns.com` (or exact Vercel value)  
**Time to Recovery:** 5-15 minutes  
**Steps:** Update DNS → Wait → Verify  
**If Still Broken:** See troubleshooting section  

**Your exact DNS records should be:**
```
monad-validators                CNAME    cname.vercel-dns.com
monad-validators-testnet        CNAME    cname.vercel-dns.com
```

**Go set them now in your DNS provider!** 🚀
