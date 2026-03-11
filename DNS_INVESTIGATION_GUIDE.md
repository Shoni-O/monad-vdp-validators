# DNS Investigation Guide - monad-validators.block-pro.net

**Status:** NXDOMAIN error (DNS lookup failure)  
**Working Reference:** monad-validators-testnet.block-pro.net ✅  
**Target:** monad-validators.block-pro.net ❌  

---

## Quick Diagnostic Commands (Run These First)

### 1. Check DNS Resolution from Your Local Machine

**Windows (PowerShell):**
```powershell
# Check current resolution
nslookup monad-validators.block-pro.net
nslookup monad-validators-testnet.block-pro.net

# For detailed output
Resolve-DnsName -Name monad-validators.block-pro.net -Server 8.8.8.8
Resolve-DnsName -Name monad-validators-testnet.block-pro.net -Server 8.8.8.8

# Compare both
Write-Host "=== Mainnet ===" ; Resolve-DnsName monad-validators.block-pro.net -ErrorAction SilentlyContinue
Write-Host "=== Testnet ===" ; Resolve-DnsName monad-validators-testnet.block-pro.net -ErrorAction SilentlyContinue
```

**Mac/Linux:**
```bash
# Direct comparison
dig monad-validators.block-pro.net
dig monad-validators-testnet.block-pro.net

# With specific resolver
dig monad-validators.block-pro.net @8.8.8.8
dig monad-validators-testnet.block-pro.net @8.8.8.8

# Show all records
dig monad-validators.block-pro.net ANY
dig monad-validators-testnet.block-pro.net ANY

# Trace the DNS path
dig monad-validators.block-pro.net +trace
```

### 2. Check What Each Domain Points To

```powershell
# Get full DNS info including TTL and record type
$mainnet = Resolve-DnsName -Name monad-validators.block-pro.net -Type CNAME -ErrorAction SilentlyContinue
$testnet = Resolve-DnsName -Name monad-validators-testnet.block-pro.net -Type CNAME -ErrorAction SilentlyContinue

Write-Host "Mainnet CNAME target: $($mainnet.NameHost)"
Write-Host "Testnet CNAME target: $($testnet.NameHost)"
```

### 3. Verify Vercel Is Serving Both

```powershell
# Direct HTTP check (ignoring DNS)
# Replace IP with your actual Vercel IP if known
curl -H "Host: monad-validators.block-pro.net" https://monad-vdp-validators.vercel.app/
curl -H "Host: monad-validators-testnet.block-pro.net" https://monad-vdp-validators.vercel.app/
```

---

## Investigation Checklist

### ✅ Step 1: Check DNS Provider (e.g., Namecheap, GoDaddy, Route53, Cloudflare)

**Look for:**
```
Mainnet record:
  Name: monad-validators
  Type: CNAME
  Value: ??? (should point to Vercel)
  TTL: 3600 (or similar)

Testnet record (working):
  Name: monad-validators-testnet
  Type: CNAME
  Value: ??? (should point to Vercel)
  TTL: 3600 (or similar)
```

**What you're checking:**
- [ ] Mainnet CNAME record exists
- [ ] Mainnet CNAME has same target as testnet (or similar Vercel target)
- [ ] No typos in domain name
- [ ] TTL shows it's been updated (not old cached value)
- [ ] Testnet record exists for comparison

### ✅ Step 2: Check Vercel Dashboard

1. **Go to:** https://vercel.com/dashboard
2. **Project:** monad-vdp-validators
3. **Settings → Domains**

**Check for each domain:**
```
Domain: monad-validators.block-pro.net
Status: [Should be "Valid" or "Verified" - NOT "Invalid" or "Pending"]

Domain: monad-validators-testnet.block-pro.net  
Status: [Should be "Valid" or "Verified"]
```

**Red flags to watch for:**
- ❌ Domain config missing entirely
- ❌ Status shows "Pending Configuration" or "Invalid"
- ❌ Domain assigned to wrong project
- ❌ Domain assigned to different team/org
- ❌ Wrong CNAME target showing

4. **Get Vercel's CNAME target:**
   - Click on domain
   - Look for: "Add this CNAME record"
   - Should show something like: `cname.vercel-dns.com` or similar

### ✅ Step 3: Compare Working vs Non-Working

Run these commands and compare output:

```powershell
# Build comparison table
@{
  "monad-validators-testnet.block-pro.net (WORKING)" = (Resolve-DnsName monad-validators-testnet.block-pro.net).IPAddress
  "monad-validators.block-pro.net (BROKEN)" = (Resolve-DnsName monad-validators.block-pro.net -ErrorAction SilentlyContinue).IPAddress
} | Format-Table

# More detailed comparison
function Compare-Domains {
  $testnet = @()
  $mainnet = @()
  
  try { $testnet = Resolve-DnsName -Name monad-validators-testnet.block-pro.net -Type CNAME } catch {}
  try { $mainnet = Resolve-DnsName -Name monad-validators.block-pro.net -Type CNAME } catch {}
  
  Write-Host "=== CNAME Records ==="
  Write-Host "Testnet: $($testnet.Name) -> $($testnet.NameHost)"
  Write-Host "Mainnet: $($mainnet.Name) -> $($mainnet.NameHost)"
}

Compare-Domains
```

---

## Likely Causes (In Order of Probability)

### 1. **DNS Record Missing (Most Likely)**
- Domain not added to DNS provider
- Typo in domain name
- Record deleted accidentally

**Fix:**
```
Add DNS record:
Name: monad-validators
Type: CNAME
Value: [exact value from Vercel dashboard]
TTL: 3600
```

---

### 2. **Vercel Domain Not Connected**
- Domain not added to Vercel project
- Domain added but not verified

**Fix:**
1. Go to Vercel Dashboard → monad-vdp-validators → Settings → Domains
2. Add domain: `monad-validators.block-pro.net`
3. Follow Vercel's instructions to verify
4. Ensure it shows "Valid" status

---

### 3. **Wrong Vercel Target**
- CNAME pointing to wrong Vercel instance
- Pointing to old/deleted project

**Fix:**
1. Check Vercel's suggested CNAME value
2. Update DNS record to exact value
3. Clear cache and retest

---

### 4. **DNS Propagation Delay**
- Changes made <24 hours ago
- Old DNS cached somewhere

**Fix:**
1. Wait 24-48 hours
2. Force clear your local DNS cache:
   ```powershell
   ipconfig /flushdns
   ```
3. Try different DNS server:
   ```powershell
   Resolve-DnsName monad-validators.block-pro.net -Server 1.1.1.1
   ```

---

### 5. **Zone Delegation Issue**
- DNS zone configured with different registrar
- Nameservers pointing to wrong provider
- Subdomain zone conflict

**Fix:**
1. Check root domain's nameservers:
   ```powershell
   Resolve-DnsName -Name block-pro.net -Type NS
   ```
2. Verify they match your DNS provider
3. Check if block-pro.net is properly delegated

---

## Complete Diagnostic Script (Windows PowerShell)

```powershell
# Save as: diagnose-dns.ps1

Write-Host "=== DNS Diagnostic Report ===" -ForegroundColor Cyan
Write-Host "Time: $(Get-Date)" -ForegroundColor Gray
Write-Host ""

# Test 1: Can we resolve testnet (working)?
Write-Host "TEST 1: Testnet (should work)" -ForegroundColor Yellow
try {
  $testnet = Resolve-DnsName -Name monad-validators-testnet.block-pro.net
  Write-Host "✅ Testnet resolves to: $($testnet.IPAddress)" -ForegroundColor Green
} catch {
  Write-Host "❌ Testnet failed: $_" -ForegroundColor Red
}

Write-Host ""

# Test 2: Can we resolve mainnet (broken)?
Write-Host "TEST 2: Mainnet (should fail currently)" -ForegroundColor Yellow
try {
  $mainnet = Resolve-DnsName -Name monad-validators.block-pro.net
  Write-Host "✅ Mainnet resolves to: $($mainnet.IPAddress)" -ForegroundColor Green
} catch {
  Write-Host "❌ Mainnet failed (expected): $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Test 3: CNAME records
Write-Host "TEST 3: CNAME Targets" -ForegroundColor Yellow
try {
  $testnetCname = Resolve-DnsName -Name monad-validators-testnet.block-pro.net -Type CNAME
  Write-Host "Testnet CNAME: $($testnetCname.NameHost)"
} catch {
  Write-Host "Could not resolve testnet CNAME"
}

try {
  $mainnetCname = Resolve-DnsName -Name monad-validators.block-pro.net -Type CNAME
  Write-Host "Mainnet CNAME: $($mainnetCname.NameHost)"
} catch {
  Write-Host "Could not resolve mainnet CNAME (expected if broken)"
}

Write-Host ""

# Test 4: Check from Google DNS
Write-Host "TEST 4: Google Public DNS (8.8.8.8)" -ForegroundColor Yellow
try {
  $viaGoogle = Resolve-DnsName -Name monad-validators.block-pro.net -Server 8.8.8.8
  Write-Host "✅ Via Google DNS: $($viaGoogle.IPAddress)" -ForegroundColor Green
} catch {
  Write-Host "❌ Via Google DNS failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Test 5: Check from Cloudflare DNS
Write-Host "TEST 5: Cloudflare Public DNS (1.1.1.1)" -ForegroundColor Yellow
try {
  $viaCloudflare = Resolve-DnsName -Name monad-validators.block-pro.net -Server 1.1.1.1
  Write-Host "✅ Via Cloudflare DNS: $($viaCloudflare.IPAddress)" -ForegroundColor Green
} catch {
  Write-Host "❌ Via Cloudflare DNS failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== END DIAGNOSTIC ===" -ForegroundColor Cyan
```

**Run it:**
```powershell
.\diagnose-dns.ps1
```

---

## Information to Share With Me

Once you've run the diagnostics, please provide:

1. **DNS resolution output:**
   ```
   Mainnet: [your output]
   Testnet: [your output]
   ```

2. **CNAME targets:**
   ```
   Mainnet CNAME target: [value]
   Testnet CNAME target: [value]
   ```

3. **Vercel Dashboard status:**
   ```
   Mainnet domain status: [Valid/Invalid/Pending]
   Testnet domain status: [Valid/Invalid/Pending]
   ```

4. **Error message exactly:**
   ```
   [your exact error]
   ```

5. **When was the mainnet domain last working?**
   ```
   [date/time if known]
   ```

---

## Most Likely Quick Fix

Based on typical NXDOMAIN issues:

**99% of the time, it's one of these:**

1. **Missing DNS record** → Add CNAME to DNS provider
2. **Wrong Vercel target** → Update CNAME value in DNS
3. **Not verified in Vercel** → Go to Vercel → Settings → Domains → Complete verification
4. **DNS caching** → Clear cache: `ipconfig /flushdns` and wait

---

## Action Plan

1. ✅ Run diagnostics above
2. ✅ Share output with me or check Vercel dashboard
3. ✅ Compare mainnet vs testnet DNS records
4. ✅ If testnet has CNAME but mainnet doesn't → Add it
5. ✅ If Vercel shows domain invalid → Re-verify it
6. ✅ Wait 15-30 minutes for DNS propagation
7. ✅ Test again

---

## Still Not Working?

If after these steps it's still broken, I'll need:

```powershell
# Detailed output
Resolve-DnsName monad-validators.block-pro.net -Verbose
Resolve-DnsName monad-validators.block-pro.net @8.8.8.8 -Verbose
Resolve-DnsName monad-validators.block-pro.net @1.1.1.1 -Verbose

# Check nameserver for block-pro.net
Resolve-DnsName block-pro.net -Type NS
```

Then we can dig deeper into zone delegation or DNS provider issues.
