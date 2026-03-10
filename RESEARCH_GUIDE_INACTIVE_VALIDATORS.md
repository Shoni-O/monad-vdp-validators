# Inactive Validators - Research Resources Guide

**Quick reference for finding geographic metadata for each inactive validator**

---

## By Validator - Available Research Vectors

### ID 1 & 2: Monad Foundation Official Validators

**Name**: Monad Foundation - mf-mainnet-val-{location}-{code}  
**SECP**: 038922d0... / 030658fb...  
**Website**: https://www.monad.foundation/  
**Recommendation**: 🔴 **DIRECT CONTACT** - Best approach

**Research Vectors**:
- Validator name contains location codes: "tsw-fra" (possible SwissRun/Frankfurt?), "lsn-jfk" (possible Linode/JFK?)
- Contact: team@monad.foundation
- GitHub: https://github.com/monadxyz
- Search for: "validator infrastructure locations" on website

**Hints**:
- tsw-fra: Could be Frankfurt (FRA airport code)
- lsn-jfk: Could be New York/Jamaica/JFK area

---

### ID 47: Dead King Society

**Website**: https://www.deadkingsociety.io/  
**Twitter**: https://x.com/DeadKingSociety  

**Research Vectors**:
- Social media for team locations/Discord channels
- Check "About Us" or team page
- Look for infrastructure announcements

---

### ID 59: vldtr.xyz

**Website**: bbs.vldtr.xyz  
**Twitter**: https://x.com/ShavetheMFwhale  
**Description**: Solo validator

**Research Vectors**:
- BBS forum may have location hints
- Twitter bio/location information
- GitHub if any repos exist

---

### ID 140: NTT DOCOMO GLOBAL

**Website**: https://www.docomoglobalgr.com/english  
**SECP**: 0347967f...  

**Research Vectors**:
- 🟢 **LIKELY JAPAN** - NTT DOCOMO is major Japanese telecoms company
- Check "Our Company" pages: https://www.docomoglobalgr.com/english/company/
- HQ location likely Tokyo or Japan-based
- Infrastructure: Likely NTT datacenter network

**Pre-filled Suggestion**:
```
Country: Japan
City: Tokyo (or check official HQ)
Provider: NTT Datacenter / NTT Communications
```

---

### ID 147: AltLayer

**Website**: https://altlayer.io/  
**Twitter**: https://x.com/alt_layer  

**Research Vectors**:
- Team page/About section
- Check for blog posts about validator infrastructure
- LinkedIn profiles of core team
- Discord/community announcements

---

### ID 173-184: Various Staking Providers

#### ID 173: Nodeify
- Website: https://nodeify.net
- Research: Company location, infrastructure partners

#### ID 174: Endorphine Stake
- Website: https://endorphinestake.com
- Twitter: https://x.com/endorphinestake

#### ID 175: Ledgerwise
- Website: https://ledgerwise.io/
- **Clue**: "Indian Blockchain ecosystem" → 🟢 **LIKELY INDIA**
- Location: Probably India/Delhi/Bangalore area
- Pre-filled: India, possibly Bangalore (tech hub)

#### ID 176: JustNodes
- Website: https://justnod.es/
- Twitter: https://x.com/god_of_insights

#### ID 177: Pacific Meta
- Website: https://pacific-meta.co.jp/
- **Clue**: `.co.jp` domain → 🟢 **DEFINITELY JAPAN**
- Location: Japan (check about/company page for city)
- Pre-filled: Japan, check website for specific city

#### ID 178: SpeedyNodes
- Website: https://speedynodes.com
- Check hosting provider + infrastructure pages

#### ID 179: LeMonad
- Website: https://lemonad.pro/
- Twitter: https://x.com/LeMonad_pro

#### ID 180: Unknown (SECP only)
- **Research Challenge**: No metadata available
- Only identifier: `02568b7f...`
- Try: Reverse-lookup SECP in forums/Discord
- Check: gmonads validator lists, Monad docs

#### ID 181: LI.FI
- Website: https://li.fi/
- **Focus**: Liquidity protocol, may be infrastructure-light
- Check: Team + infrastructure partners

#### ID 182: Water Cooler Studios
- Website: https://www.wcs.tech
- Check: Team page, AWS/infrastructure setup

#### ID 183: Forest Staking
- Website: https://foreststaking.com
- **Clue**: "Military and civilian trained cybersecurity engineers"
- Check: LinkedIn for team locations

#### ID 184: smallstreet
- Website: https://smallstreet.com
- Twitter: https://x.com/chamonster
- Check: Team/About section

#### ID 185: Kamunagi
- Website: https://kamunagi.xyz/
- Twitter: https://x.com/kamunagi_xyz
- **Focus**: Oracle validator, C/C++ based
- Check: Infrastructure pages

#### ID 186: Etherfuse
- Website: https://www.etherfuse.com/
- Twitter: https://x.com/etherfuse
- Check: Company about/team pages

#### ID 187: Kiln (kiln.fi)
- Website: https://kiln.fi
- Twitter: https://x.com/Kiln_finance
- **Note**: Enterprise staking provider - likely has clear infrastructure info

---

## General Research Workflow

### Step 1: Automated Clues
- [ ] Check domain TLD (.jp = Japan, .de = Germany, etc.)
- [ ] Extract geographic clues from company name/description
- [ ] Search metadata for explicit location mentions

### Step 2: Website Analysis
1. Visit **About Us** page
2. Look for **Company Location** / **Headquarters**
3. Check **Contact** page for address
4. Search for **"infrastructure"** or **"datacenter"** mentions
5. Review **Team** page for member locations

### Step 3: Social Media
1. Check Twitter bio for location tag
2. Look at recent tweets for infrastructure announcements
3. Join community Discord for tech discussions

### Step 4: Infrastructure Lookup
1. Visit website, open DevTools → Network tab
2. Check IP addresses of API endpoints
3. Use online tools: `whois`, `dnschecker`, IP geolocation
4. Identify hosting provider (AWS region code, etc.)

### Step 5: Verification
- ✅ If found on multiple sources → **HIGH confidence**
- ⚠️ If found on one source + inferred → **MEDIUM confidence**
- ❌ If only guessed/inferred → **LOW confidence**

---

## Pre-Filled Values (High Confidence)

Based on available metadata:

| ID | Country | City | Provider | Confidence |
|---|---|---|---|---|
| 140 | Japan | Tokyo | NTT Datacenter | HIGH |
| 175 | India | Bangalore* | TBD | MEDIUM |
| 177 | Japan | TBD* | TBD | HIGH |

*Indicates requires verification on website

---

## Completion Checklist

### Phase 1: Easy Wins (Pre-identified clues)
- [ ] Fill ID 140, 175, 177 with available clues
- [ ] Research ID 1, 2 (contact foundation if needed)

### Phase 2: Medium Difficulty
- [ ] All other staking providers (173-187, 47, 59)
- [ ] Check websites for about/contact/team pages

### Phase 3: Challenge Cases
- [ ] ID 180 (no metadata) - reverse lookup needed
- [ ] ID 59 (solo operator) - social media deep dive

---

## Useful Tools

| Tool | Purpose | URL |
|---|---|---|
| WHOIS Lookup | Domain registration info | https://whois.com/ |
| IP Geolocation | Server location | https://www.iplocation.net/ |
| DNS Lookup | Domain records | https://dnschecker.org/ |
| Shodan | IP/infrastructure search | https://www.shodan.io/ |
| Archive.org | Historical website versions | https://web.archive.org/ |

---

## Format for Contribution

Once verified, add to [lib/validators-geo-mapping.ts](lib/validators-geo-mapping.ts):

```typescript
// ID <number>: <validator_name>
"<secp_lowercase>": {
  country: "<country>",
  city: "<city>",
  provider: "<provider>"
},
```

Save findings in [INACTIVE_VALIDATORS_RESEARCH.md](INACTIVE_VALIDATORS_RESEARCH.md) table first, then bulk-import when ready.

---

## Expected Difficulty Tier

🟢 **EASY** (should find within 5 min):
- ID 140 (NTT DOCOMO), ID 175 (Ledgerwise), ID 177 (Pacific Meta)

🟡 **MEDIUM** (10-20 min research):
- ID 1, 2, 174, 178, 179, 181, 182, 183, 184, 185, 186, 187

🔴 **HARD** (30+ min or contact needed):
- ID 47 (Dead King Society), ID 59 (solo), ID 180 (no metadata)

