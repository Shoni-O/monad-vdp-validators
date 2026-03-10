# Validator Registry Implementation Roadmap

## Overview

This document summarizes the architecture redesign and provides a clear path to implementation.

**Core Problem**: Currently, when validators become inactive, their manually-researched geographic metadata (country/city/provider) is lost because we treat the live API snapshot as the source of truth.

**Solution**: Separate **persistent registry** (all validators ever seen + researched metadata) from **live snapshots** (current active/inactive state). Match validators by stable cryptographic identifiers (SECP key), not by mutable names.

---

## The Three-Layer Architecture

### Layer 1: Persistent Registry (Eternal)
**Files**: `lib/registry/mainnet.ts`, `lib/registry/testnet.ts`

What it stores:
- All validators ever discovered on each network
- Manually researched metadata: country, city, provider, confidence
- Stable identifiers: secp, node_id, address
- Metadata timestamps: when discovered, last updated, by whom

**Why it matters**: 
- Survives validator state transitions (active → inactive → active)
- Manual research is never lost
- Can track history of changes

### Layer 2: Live Snapshots (Transient)
**Files**: `lib/snapshots/current.ts`

What it stores:
- Current epoch data (stake, validator_set_type: active/registered/inactive)
- Geolocations endpoint data (IP-based city/provider/country)
- Timestamps (when snapshot was created)

**Why it matters**:
- Represents current state without losing old data
- Updated frequently (every getSnapshot() call)
- Can be queried but not the source of truth

### Layer 3: Enriched Output (Merged)
**Files**: `lib/validator-enrichment.ts`

What it does:
- Merges registry metadata with snapshot data
- Applies priority: registry > snapshot geoloc > IP geoloc
- Tracks data provenance: "where did each field come from?"

**Why it matters**:
- API output has complete data from both sources
- Field-level attribution ("this country came from manual research")
- Confidence scoring transparent

---

## Current State vs. Proposed State

### BEFORE: Everything in Snapshots

```
API → Epoch + Geolocations → Output
           ↓
      (if validator inactive)
      → disappears from geolocations
      → loses all metadata
      → research wasted 😞
```

### AFTER: Snapshot + Registry

```
API → Epoch + Geolocations → Snapshot
  ↓
  Registry (persistent) ← Manual research, discovered validators
  ↓
  Enrich (merge) ← Combine snapshot + registry
  ↓
  Output ← Complete data, preserved across state changes
           ✅ Inactive validators keep their metadata
           ✅ Confidence scores track data quality
           ✅ Source attribution shows where data came from
```

---

## File Structure (New Files to Create)

```
lib/
├── registry/
│   ├── types.ts                     # ValidatorMetadata interface
│   ├── mainnet.ts                   # MAINNET_VALIDATOR_REGISTRY
│   ├── testnet.ts                   # TESTNET_VALIDATOR_REGISTRY
│   └── index.ts                     # Re-exports
│
├── snapshots/
│   ├── types.ts                     # SnapshotData interface
│   ├── current.ts                   # CURRENT_SNAPSHOT storage
│   └── index.ts                     # Re-exports
│
├── validator-matching.ts            # Stable ID matching logic
├── validator-enrichment.ts          # Merge registry + snapshot
└── getSnapshot.ts                   # (UPDATED)
```

---

## Implementation Plan

### MUST DO (MVP - Week 1)

**Step 1: Create type definitions** (2 hrs)
- Create `lib/registry/types.ts` with `ValidatorMetadata` interface
- Create `lib/snapshots/types.ts` with `SnapshotData` interface
- Define all fields, documentation, and confidence levels

**Step 2: Create registry storage** (1 hr)
- Create `lib/registry/mainnet.ts` with empty `MAINNET_VALIDATOR_REGISTRY`
- Create `lib/registry/testnet.ts` with empty `TESTNET_VALIDATOR_REGISTRY`
- Implement `updateMainnetRegistry()` and `updateTestnetRegistry()` functions

**Step 3: Create matching logic** (2 hrs)
- Create `lib/validator-matching.ts`
- Implement `extractIdentifiers()` (pull secp/nodeId/address from validator)
- Implement `matchRegistryEntry()` (find validator in registry by any ID)
- Implement `isNewValidator()` (detect when discovering new validators)

**Step 4: Create enrichment logic** (3 hrs)
- Create `lib/validator-enrichment.ts`
- Implement `enrichValidator()` (merge one validator: registry + snapshot)
- Implement `enrichSnapshot()` (merge entire snapshot with registry)
- Implement priority logic: registry > snapshot-geoloc > snapshot-ip > none

**Step 5: Update getSnapshot.ts** (2 hrs)
- Update to call `enrichSnapshot()` instead of current logic
- Register new validators in registry on discovery
- Output enriched data with metadata provenance

**Step 6: Populate mainnet registry with existing research** (1.5 hrs)
- Migrate BlockPro entry from `validators-geo-mapping.ts`
- Add any other manually-researched validators
- Test that enrichment preserves metadata correctly

---

### SHOULD DO (Immediate After MVP)

**Step 7: Complete inactive validator research** (6-8 hrs, gradual)
- Use [INACTIVE_VALIDATORS_RESEARCH.md](INACTIVE_VALIDATORS_RESEARCH.md) table
- Research each of 18 inactive validators
- Add to mainnet registry as confidence allows

**Step 8: Migrate validators-geo-mapping.ts** (1 hr)
- Option A: Keep it but have it pull from registry (safer)
- Option B: Delete and use registry directly (cleaner)
- Either way: all data now flows through registry

---

### NICE TO HAVE (Future)

**Step 9: Add testnet support**
- Populate `TESTNET_VALIDATOR_REGISTRY` with known testnet validators
- Test cross-network independence

**Step 10: Add persistence**
- Export registry to JSON for backup
- Optionally add database (SQLite/PostgreSQL)
- Track historical state changes

**Step 11: Add CLI tooling**
- `npm run registry:update <secp> --country <country> --city <city>`
- `npm run registry:import <json-file>`
- `npm run registry:export > backup.json`

---

## Success Criteria

After implementation, verify:

✅ **Inactive validators preserve metadata**
- Mark a validator as inactive in epoch
- Confirm it still shows country/city/provider in output
- Confirm confidence score still present

✅ **New validators auto-registered**
- Add a new validator to epoch
- Call getSnapshot()
- Confirm new validator appears in registry with `discoveredAt` timestamp

✅ **Registry metadata survives**
- Add validator to registry with HIGH confidence data
- Change validator's API name/website
- Confirm enriched output still uses HIGH confidence registry data (not snapshot)

✅ **Testnet independent**
- Add validator to testnet registry
- Confirm it's separate from mainnet
- Verify no cross-contamination

✅ **Data provenance clear**
- Verify `geographicSource` field shows correct source
- Confirm confidence levels displayed
- Confirm research notes preserved

---

## Before/After Example

### BEFORE (Current Issue)

```
Validator ID 185: Kamunagi
Epoch: INACTIVE
Geolocations: NOT IN LIST (inactive → no geoloc data)
Output:
{
  name: "Kamunagi",
  country: "Unknown",
  city: "Unknown", 
  provider: "Unknown",
  confidence: undefined
}
❌ Lost all research about Kamunagi
```

### AFTER (With Registry)

Even though Kamunagi is INACTIVE:
```
Registry lookup: Found Kamunagi's SECP key
Registry data:
  country: "Japan"
  city: "Tokyo"
  provider: "AWS Japan"
  confidence: "HIGH"

Output:
{
  name: "Kamunagi",
  country: "Japan",
  city: "Tokyo",
  provider: "AWS Japan",
  confidence: "HIGH",
  geographicSource: "registry",  ← Shows where this came from
  isActive: false                 ← Snapshot shows inactive state
}
✅ Metadata preserved! Research saved!
```

---

## Migration Guide

### For Users Researching Validators

**OLD WAY** (current):
1. Research validator
2. Manually edit `validators-geo-mapping.ts`
3. If validator goes inactive → metadata disappears 😞

**NEW WAY** (after MVP):
1. Research validator
2. Run: `npm run registry:update <secp> --country "<country>" --city "<city>"`
3. Registry auto-updated with timestamp/provenance
4. If validator becomes inactive → metadata persists ✅
5. If validator re-activates → metadata still available ✅

### For API Consumers

**NO CHANGE to output format** — fully backward compatible!

**NEW in output** (optional enrichment fields):
```typescript
{
  // ... existing fields ...
  
  geographicSource: "registry" | "snapshot-geoloc" | "snapshot-ip" | "none",
  confidence?: "HIGH" | "MEDIUM" | "LOW",
  discoveredAt: ISO8601,
  updatedAt: ISO8601
}
```

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────┐
│          gmonads API (Live)                              │
│  ├─ Epoch (active/registered/inactive validators)       │
│  └─ Geolocations (IP-based data for active only)        │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Snapshot Creation                                       │
│  (merge epoch + geoloc)                                 │
│  ↓ For each validator:                                  │
│    - Extract stable IDs (secp, nodeId, address)        │
│    - Store snapshot data (active status, stake)        │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Registry Matching                                       │
│  ↓ For each validator in snapshot:                      │
│    - Look up by secp in MAINNET_VALIDATOR_REGISTRY     │
│    - If found: use existing metadata                   │
│    - If not found: create new registry entry           │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Enrichment (Merge)                                      │
│  ├─ Geographic priority: registry > snapshot > IP      │
│  ├─ Preserve all registry metadata                      │
│  └─ Attach provenance: where each field came from      │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  API Output                                              │
│  ├─ All validators (active + inactive + registered)    │
│  ├─ Preserved metadata from registry                    │
│  ├─ Current status from snapshot                        │
│  └─ Data provenance visible                            │
└─────────────────────────────────────────────────────────┘
```

---

## Key Design Principles

1. **Identifier Stability**: Match by cryptographic keys (secp/nodeId), never by name
2. **Data Separation**: Registry (eternal) ≠ Snapshot (ephemeral)
3. **Metadata Preservation**: Manual research never lost on state transition
4. **Network Independence**: Separate registries for mainnet/testnet
5. **Transparent Provenance**: Always know where each field came from
6. **Confidence Tracking**: Confidence scores attached to researched fields
7. **Backward Compatibility**: API output format unchanged
8. **Audit Trail**: discoveredAt/updatedAt/updatedBy timestamps

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Data loss during migration | Keep old `validators-geo-mapping.ts` as backup until verified |
| Duplicate validators | Use matching logic with fallbacks (secp → nodeId → address) |
| Stale registry | Implement `updatedAt` tracking; warn on old entries |
| Merge conflicts | Registry has priority, snapshot is advisory |
| Breaking API changes | Enrichment fields all optional; output format unchanged |

---

## Success Metrics

After implementation:
1. **Metadata Preservation**: 0 validators lose researched data on state transitions
2. **Inactive Validator Coverage**: 18 inactive validators have HIGH/MEDIUM confidence geographic data
3. **Auto-discovery**: New validators auto-registered with discoveredAt timestamp
4. **Data Quality**: All geographic data has confidence level + source tracked
5. **Performance**: Enrichment adds <50ms to getSnapshot() call
6. **Maintainability**: Adding new validator metadata takes <1 minute

