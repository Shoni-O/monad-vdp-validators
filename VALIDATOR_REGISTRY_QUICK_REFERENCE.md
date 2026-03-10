# Validator Registry — Quick Reference

## The Problem (In One Sentence)
When validators become inactive, their manually-researched geographic metadata disappears because we only use live API snapshots as truth.

## The Solution (In One Sentence)
Separate **persistent registry** (all validators + researched metadata) from **live snapshots** (current active/inactive state).

---

## System Layers

### Layer 1: Registry (Persistent, Eternal)
```typescript
// lib/registry/mainnet.ts
export const MAINNET_VALIDATOR_REGISTRY = {
  "secp_key_lowercase": {
    country: "Japan",
    city: "Tokyo", 
    provider: "AWS",
    confidence: "HIGH",
    discoveredAt: "2026-03-10T00:00:00Z"
  }
}
```
✅ Never deletes validators  
✅ Stores ALL researched metadata  
✅ Survives state transitions  

### Layer 2: Snapshots (Transient, Live)
```typescript
// lib/snapshots/current.ts
export const CURRENT_SNAPSHOT = {
  mainnet: {
    validators: {
      "secp_key": { 
        nodeId, stake, validatorSetType: "active|inactive|registered" 
      }
    }
  }
}
```
✅ Updates frequently  
✅ Shows real-time state  
✅ Will be discarded/replaced  

### Layer 3: Enrichment (Merged Output)
```typescript
// Combines both layers
enrichValidator(apiData, registry, snapshot)
→ { country, city, provider,         // From registry (preserved!)
    isActive: boolean,                // From snapshot (current!)
    geographicSource: "registry",     // Shows where data came from
    confidence: "HIGH"                // Confidence in data
  }
```

---

## File Structure (New)

```
lib/registry/
  ├─ types.ts          ← Interfaces
  ├─ mainnet.ts        ← MAINNET_VALIDATOR_REGISTRY
  └─ testnet.ts        ← TESTNET_VALIDATOR_REGISTRY
  
lib/snapshots/
  ├─ types.ts          ← Interfaces
  └─ current.ts        ← CURRENT_SNAPSHOT

lib/validator-matching.ts     ← Link snapshot to registry
lib/validator-enrichment.ts   ← Merge with priorities
lib/getSnapshot.ts            ← Updated to use new system
```

---

## How It Works

```
1. GET gmonads API
   ↓
2. CREATE snapshot with epoch + geoloc data
   ↓
3. FOR EACH validator in snapshot:
   - Look up by SECP key in REGISTRY
   - If found: use existing metadata (country/city/provider)
   - If not found: create new registry entry
   ↓
4. ENRICH snapshot by merging with registry
   - Priority: registry > snapshot > none
   ↓
5. OUTPUT to API with:
   - Current status from snapshot (active/inactive)
   - Metadata from registry (preserved!)
   - Provenance showing where each came from
```

---

## Priority Rules

**Geographic Data** (country/city/provider) sourced from:

1. **Registry** (manual research) — YES → Use this ✅
2. → Snapshot geolocations (API) — Use if registry empty
3. → IP geolocation — Use if nothing else
4. → "Unknown" — Last resort

**Example: Kamunagi (Inactive)**
```before
- Snapshot: Not in geolocations endpoint (inactive)
- Output: country="Unknown", provider="Unknown"
```
```after
- Registry: country="Japan", provider="AWS", confidence="HIGH"
- Output: country="Japan", provider="AWS", geographicSource="registry"
```

---

## Implementation Steps (Condensed)

1. **Create types** (1 hr)
   - ValidatorMetadata + SnapshotData interfaces

2. **Create storage** (1 hr)
   - Empty registries for mainnet/testnet

3. **Create matching** (1 hr)
   - Match validators by SECP key

4. **Create enrichment** (1.5 hrs)
   - Merge registry + snapshot with priorities

5. **Update getSnapshot()** (1.5 hrs)
   - Call enrichment, register new validators

6. **Populate data** (Ongoing)
   - Migrate existing research to registry
   - Research new validators

**Total MVP**: ~7 hours

---

## Key Decisions

| Question | Answer | Why |
|----------|--------|-----|
| How to match validators? | By SECP key | Never changes, stable |
| Where to store metadata? | Registry (separate from snapshot) | Survives state changes |
| Separate mainnet/testnet? | Yes, different registries | Network independence |
| Include confidence? | Yes (HIGH/MEDIUM/LOW) | Shows data quality |
| Include source link? | Yes (evidenceSource URL) | Audit trail |
| Break API compatibility? | No, fully backward compatible | Enrichment is additive |

---

## Success Checklist

After implementation:

- [ ] Inactive validator still has country/city/provider (not "Unknown")
- [ ] Output shows geographicSource="registry" for researched data
- [ ] Confidence levels present and correct
- [ ] New validators auto-register in registry on discovery
- [ ] API output format unchanged
- [ ] Mainnet and testnet registries independent
- [ ] Metadata persists through active→inactive→active cycles

---

## Data You Control

As researcher, you can populate:

```typescript
{
  country: "Japan",                    // ISO code or full name
  city: "Tokyo",                       // Specific location
  provider: "AWS",                     // Hosting provider name
  providerRegion: "ap-northeast-1",    // AWS region if known
  confidence: "HIGH",                  // Data quality
  evidenceSource: "https://...",       // Where you found this
  notes: "From company website"        // Any context
}
```

Store in registry once researched → persists forever.

---

## One-Page Data Flow

```
           PAST (Live API Only)
         ┌─────────────────────┐
         │  Active Validators  │
         │    (from API)       │
         └──────────┬──────────┘
                    │
                    │ When inactive
                    ↓
            ❌ Data Lost
            (not in geolocations)
                    
           FUTURE (With Registry)
┌────────────────────────────────────────────┐
│ Registry (Persistent)                      │
│ ├─ All validators ever seen                │
│ └─ Researched metadata forever             │
└────────┬─────────────────────────────────┬─┘
         │                                 │
         │ Lookup                          │
         │ by SECP                    ✅ Match!
         │                                 │
         ↓                                 ↓
      ┌─────────────────────────────────────┐
      │ Snapshot (Transient)                │
      │ ├─ Active/inactive status           │
      │ └─ Current state                    │
      └────────┬────────────────────────────┘
               │
               ↓
            Enrich
         (merge both)
               │
               ↓
         ┌──────────────┐
         │ API Output   │
         ├─ Country: ? ✅ (from registry)
         ├─ Status: inactive (from snapshot)
         └─ Source: "registry" (tracked)
```

---

## For Researchers: Immediate Actions

1. **Open**: [INACTIVE_VALIDATORS_RESEARCH.md](INACTIVE_VALIDATORS_RESEARCH.md)
2. **Start with**: IDs 140, 175, 177 (easiest, 5 min each)
3. **Fill columns**: Country, City, Provider, Evidence, Confidence
4. **When dev is ready**: Copy to registry format

---

## For Developers: Immediate Actions

1. **Read**: [VALIDATOR_REGISTRY_DESIGN.md](VALIDATOR_REGISTRY_DESIGN.md)
2. **Follow**: [REGISTRY_IMPLEMENTATION_ROADMAP.md](REGISTRY_IMPLEMENTATION_ROADMAP.md)
3. **Execute**: 6-step MVP checklist
4. **Result**: System ready for researcher data entry

---

## Key Insight

> **Problem**: We treat snapshots as truth → lose data on state changes  
> **Solution**: Registry as truth, snapshots as status updates   
> **Result**: All data preserved across state transitions forever

---

## File Reference

| Document | Purpose | Read If... |
|----------|---------|-----------|
| VALIDATOR_REGISTRY_DESIGN.md | Technical spec | Implementing code |
| REGISTRY_IMPLEMENTATION_ROADMAP.md | Step-by-step | Planning work |
| VALIDATOR_REGISTRY_SYSTEM_OVERVIEW.md | Complete guide | Learning system |
| INACTIVE_VALIDATORS_RESEARCH.md | Data table | Researching validators |
| THIS FILE | Quick reference | Need instant reference |

---

**You're solving a real architectural problem. This design is solid and ready to implement! 🚀**
