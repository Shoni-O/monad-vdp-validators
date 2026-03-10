# Validator Registry Architecture Design

## Problem Statement

**Current Issues:**
1. **Data Loss**: When validators become inactive, they disappear from gmonads geolocations endpoint → lose all researched metadata
2. **No Persistence**: Manual research (country/city/provider) is hardcoded in `validators-geo-mapping.ts` with no structure
3. **Network Blind**: Only mainnet supported; testnet validators have nowhere to go
4. **Snapshot as Truth**: Treating live API responses as the only source of truth means we must re-research every inactive validator
5. **Name-Based Matching**: Validators matched by mutable name field, not stable cryptographic identifiers
6. **No History**: Cannot track when a validator became inactive or when metadata was last verified

**Impact**: 
- Inactive validators regress to "Unknown" country/city/provider
- Manual research cannot be reused if validator rotates in/out of active set
- Testnet validator infrastructure abandoned with no persistent record
- Scoring unfairly penalizes validators that were researched but temporarily inactive

---

## Proposed Architecture

### High-Level Design

```
┌─────────────────────────────────────────────────────────────┐
│           PERSISTENT VALIDATOR REGISTRY                      │
│   (All validators ever seen + manually researched metadata)  │
│  ┌──────────────────────┐         ┌──────────────────────┐  │
│  │  MAINNET_REGISTRY    │         │  TESTNET_REGISTRY    │  │
│  │  (stored data)       │         │  (stored data)       │  │
│  └──────────────────────┘         └──────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                           ▲
                           │ (merge)
                           │
┌─────────────────────────────────────────────────────────────┐
│         LIVE SNAPSHOT DATA (from APIs)                       │
│   (Active/inactive status, stake, IP geolocation)            │
│  ┌──────────────────────┐         ┌──────────────────────┐  │
│  │  Mainnet Snapshot    │         │  Testnet Snapshot    │  │
│  │  (epoch + geoloc)    │         │  (epoch + geoloc)    │  │
│  └──────────────────────┘         └──────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ (enrich)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│     ENRICHED OUTPUT (API response)                           │
│   (All data merged with preserved metadata)                  │
└─────────────────────────────────────────────────────────────┘
```

**Key Principle**: 
- **Registry** = permanent store of validator identity + researched metadata
- **Snapshot** = transient view of current active/inactive state
- **Enrichment** = merge registry metadata into snapshot for API output

---

## Detailed Structure

### 1. Persistent Validator Registry

**File**: `lib/registry/types.ts`

```typescript
/**
 * Metadata about a validator that is researched/verified and preserved
 * across active/inactive state transitions.
 * 
 * Key principle: Keyed by SECP public key for stable matching,
 * independent of validator name changes.
 */
export interface ValidatorMetadata {
  // ============ STABLE IDENTIFIERS ============
  /** SECP public key (66 hex chars) - primary key, never changes */
  secp: string;
  
  /** Alternative identifier: node_id from validator_set, if known */
  nodeId?: string;
  
  /** Alternative identifier: ethereum address, if known */
  address?: string;

  // ============ SOURCED FROM METADATA ENDPOINT ============
  /** Validator name from metadata (may change) */
  name?: string;
  
  /** Website URL from metadata */
  website?: string;
  
  /** Description from metadata */
  description?: string;
  
  /** Logo URL from metadata */
  logo?: string;
  
  /** Twitter/X handle from metadata */
  twitter?: string;

  // ============ MANUALLY RESEARCHED (PRESERVED) ============
  /** Geographic country (ISO 3166-1 alpha-2 or full name) */
  country?: string;
  
  /** Specific city/region where validator infra is located */
  city?: string;
  
  /** Hosting provider name (AWS, Hetzner, Linode, OVH, Contabo, etc.) */
  provider?: string;
  
  /** AWS region code if applicable (us-east-1, eu-west-1, ap-northeast-1) */
  providerRegion?: string;
  
  /** Evidence source URL (GitHub, website, WHOIS record, etc.) */
  evidenceSource?: string;
  
  /** Confidence in the geographic/provider data */
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW';

  // ============ METADATA TRACKING ============
  /** ISO 8601 timestamp when validator was first discovered */
  discoveredAt: string;
  
  /** ISO 8601 timestamp of last update to this record */
  updatedAt: string;
  
  /** Who/what updated this record (for audit trail) */
  updatedBy?: 'api' | 'manual' | 'github' | 'user:email' | 'cron';
  
  /** Free-form notes about this validator (e.g., why inactive) */
  notes?: string;
}

export type ValidatorRegistry = Record<string, ValidatorMetadata>;  // Keyed by secp (lowercase)
```

**File**: `lib/registry/mainnet.ts`

```typescript
import { ValidatorRegistry } from './types';

/**
 * MAINNET PERSISTENT VALIDATOR REGISTRY
 * 
 * This is the source of truth for validator metadata that must be preserved
 * across active/inactive transitions. It is populated by:
 * 1. Manual research (country/city/provider)
 * 2. Metadata from gmonads API (name/website/description)
 * 3. Epoch data (discovery of new validators)
 * 
 * DO NOT rely solely on live API snapshots for this data.
 */
export const MAINNET_VALIDATOR_REGISTRY: ValidatorRegistry = {
  // Example: Monad Foundation validator (ID 1)
  "038922d0d2bc9f80823b27ce6520357534ad82764cfc8115668344e3fc9c1ec2c1": {
    secp: "038922d0d2bc9f80823b27ce6520357534ad82764cfc8115668344e3fc9c1ec2c1",
    nodeId: "034f57c0a58f644151e73ac3d0e73c206c8294834bf1c319eed26b269d42a26998",
    name: "Monad Foundation - mf-mainnet-val-tsw-fra-001",
    website: "https://www.monad.foundation/",
    country: "Switzerland",
    city: "Zurich",
    provider: "Swisscom",
    evidenceSource: "https://www.monad.foundation/infrastructure",
    confidence: "MEDIUM",
    discoveredAt: "2026-03-01T00:00:00Z",
    updatedAt: "2026-03-10T00:00:00Z",
    updatedBy: "manual",
    notes: "Foundation validator, location inferred from name pattern"
  },

  // Example: NTT DOCOMO GLOBAL (ID 140) - researched as inactive
  "0347967f3ecab6a70429374bc8339d8c4615d49cec1243b5d17927def66750373": {
    secp: "0347967f3ecab6a70429374bc8339d8c4615d49cec1243b5d17927def66750373",
    name: "NTT DOCOMO GLOBAL",
    website: "https://www.docomoglobalgr.com/english",
    description: "NTT DOCOMO GLOBAL - Digital Services",
    country: "Japan",
    city: "Tokyo",
    provider: "NTT Communications",
    providerRegion: "ap-northeast-1",
    confidence: "HIGH",
    discoveredAt: "2026-02-15T00:00:00Z",
    updatedAt: "2026-03-10T00:00:00Z",
    updatedBy: "manual",
    notes: "NTT DOCOMO is major Japanese telecom. Became inactive in epoch 1200."
  },

  // Add more validators as researched...
};

export function getMainnetRegistry(): ValidatorRegistry {
  return MAINNET_VALIDATOR_REGISTRY;
}

export function updateMainnetRegistry(secp: string, metadata: Partial<ValidatorMetadata>): void {
  const existing = MAINNET_VALIDATOR_REGISTRY[secp.toLowerCase()] || {
    secp: secp.toLowerCase(),
    discoveredAt: new Date().toISOString(),
  };
  
  MAINNET_VALIDATOR_REGISTRY[secp.toLowerCase()] = {
    ...existing,
    ...metadata,
    updatedAt: new Date().toISOString(),
  };
}
```

**File**: `lib/registry/testnet.ts`

```typescript
import { ValidatorRegistry } from './types';

/**
 * TESTNET PERSISTENT VALIDATOR REGISTRY
 * 
 * Separate from mainnet to track testnet validator infrastructure
 * and metadata independently.
 */
export const TESTNET_VALIDATOR_REGISTRY: ValidatorRegistry = {
  // Populated as testnet validators are discovered and researched
};

export function getTestnetRegistry(): ValidatorRegistry {
  return TESTNET_VALIDATOR_REGISTRY;
}

export function updateTestnetRegistry(secp: string, metadata: Partial<ValidatorMetadata>): void {
  const existing = TESTNET_VALIDATOR_REGISTRY[secp.toLowerCase()] || {
    secp: secp.toLowerCase(),
    discoveredAt: new Date().toISOString(),
  };
  
  TESTNET_VALIDATOR_REGISTRY[secp.toLowerCase()] = {
    ...existing,
    ...metadata,
    updatedAt: new Date().toISOString(),
  };
}
```

---

### 2. Live Snapshot Data

**File**: `lib/snapshots/types.ts`

```typescript
/**
 * Live snapshot of validator state from epoch endpoint.
 * This changes frequently and is NOT persisted long-term.
 */
export interface ValidatorSnapshot {
  // From epoch endpoint
  nodeId: string;
  valIndex: number;
  stake: string;
  validatorSetType: 'active' | 'registered' | 'inactive';  // Current state
  commission: string;
  flags: string;
  authAddress?: string;
  ipAddress?: string;
  
  // From geolocations endpoint (if available - only for active validators)
  latitude?: number;
  longitude?: number;
  city?: string;
  countryCode?: string;
  provider?: string;
  timestamp?: string;
}

/**
 * Complete snapshot of all validators at a point in time
 */
export interface SnapshotData {
  timestamp: string;          // ISO 8601
  epoch: string;
  network: 'mainnet' | 'testnet';
  
  /** Keyed by SECP public key (if available) or node_id as fallback */
  validators: Record<string, ValidatorSnapshot>;
  
  /** Metadata */
  totalValidators: number;
  activeCount: number;
  registeredCount: number;
  inactiveCount: number;
}
```

**File**: `lib/snapshots/current.ts`

```typescript
import { SnapshotData } from './types';

/**
 * Current live snapshot for each network.
 * Updated when getSnapshot() is called.
 */
export let CURRENT_SNAPSHOT: {
  mainnet: SnapshotData | null;
  testnet: SnapshotData | null;
} = {
  mainnet: null,
  testnet: null,
};

export function setSnapshot(network: 'mainnet' | 'testnet', data: SnapshotData): void {
  CURRENT_SNAPSHOT[network] = data;
}

export function getSnapshot(network: 'mainnet' | 'testnet'): SnapshotData | null {
  return CURRENT_SNAPSHOT[network];
}
```

---

### 3. Validator Matching Strategy

**File**: `lib/validator-matching.ts`

```typescript
import { ValidatorMetadata } from './registry/types';
import { ValidatorSnapshot } from './snapshots/types';

/**
 * Stable validator matching strategy:
 * Match validators by cryptographic identifiers, not by name.
 * 
 * Priority:
 * 1. SECP public key (primary)
 * 2. node_id (fallback)
 * 3. address (last resort)
 */

export interface ValidatorMatchResult {
  secp?: string;
  nodeId?: string;
  address?: string;
  matched: boolean;
  matchMethod: 'secp' | 'nodeid' | 'address' | 'none';
}

/**
 * Extract stable identifiers from API metadata
 */
export function extractIdentifiers(apiValidator: any): {
  secp?: string;
  nodeId?: string;
  address?: string;
} {
  return {
    secp: apiValidator.secp ? apiValidator.secp.toLowerCase() : undefined,
    nodeId: apiValidator.node_id ? apiValidator.node_id.toLowerCase() : undefined,
    address: apiValidator.auth_address ? apiValidator.auth_address.toLowerCase() : undefined,
  };
}

/**
 * Match a validator in the registry based on any stable identifier
 */
export function matchRegistryEntry(
  apiIds: ReturnType<typeof extractIdentifiers>,
  registry: Record<string, ValidatorMetadata>
): ValidatorMatchResult {
  // Try SECP first (most stable)
  if (apiIds.secp) {
    if (registry[apiIds.secp]) {
      return { secp: apiIds.secp, matched: true, matchMethod: 'secp' };
    }
  }

  // Try node_id
  if (apiIds.nodeId) {
    for (const [secp, entry] of Object.entries(registry)) {
      if (entry.nodeId?.toLowerCase() === apiIds.nodeId) {
        return { secp, nodeId: apiIds.nodeId, matched: true, matchMethod: 'nodeid' };
      }
    }
  }

  // Try address
  if (apiIds.address) {
    for (const [secp, entry] of Object.entries(registry)) {
      if (entry.address?.toLowerCase() === apiIds.address) {
        return { secp, address: apiIds.address, matched: true, matchMethod: 'address' };
      }
    }
  }

  return { ...apiIds, matched: false, matchMethod: 'none' };
}

/**
 * Identify new validators not yet in registry
 */
export function isNewValidator(match: ValidatorMatchResult, registry: Record<string, ValidatorMetadata>): boolean {
  return !match.matched;
}
```

---

### 4. Enrichment & Merge Logic

**File**: `lib/validator-enrichment.ts`

```typescript
import { ValidatorMetadata } from './registry/types';
import { ValidatorSnapshot } from './snapshots/types';
import { matchRegistryEntry, extractIdentifiers } from './validator-matching';

/**
 * Enriched validator combines registry metadata with live snapshot data.
 * Preserves all researched metadata even if validator becomes inactive.
 */
export interface EnrichedValidator {
  // ============ IDENTIFIERS ============
  secp: string;
  nodeId?: string;
  address?: string;

  // ============ FROM REGISTRY (persistent) ============
  name?: string;
  website?: string;
  description?: string;
  logo?: string;
  twitter?: string;

  // ============ FROM SNAPSHOT (live) ============
  snapshot: ValidatorSnapshot | null;  // null if not in current epoch
  isActive: boolean;
  isRegistered: boolean;
  isInactive: boolean;
  
  // ============ GEOGRAPHIC/INFRASTRUCTURE (preserved + merged) ============
  country?: string;
  city?: string;
  provider?: string;
  providerRegion?: string;
  latitude?: number;
  longitude?: number;

  // ============ DATA PROVENANCE ============
  geographicSource: 'registry' | 'snapshot-geoloc' | 'snapshot-ip' | 'none';
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
  
  // ============ TIMESTAMPS ============
  discoveredAt: string;
  lastSeen: string;
  updatedAt: string;
}

/**
 * Enrich a validator by merging registry metadata with snapshot data.
 * 
 * Priority for geographic data:
 * 1. Registry (high-confidence manual research)
 * 2. Geolocations endpoint (from gmonads)
 * 3. IP geolocation (from ipinfo.io)
 * 4. None
 */
export function enrichValidator(
  apiValidator: any,
  snapshot: ValidatorSnapshot | null,
  registryEntry: ValidatorMetadata | null,
  geolocData?: any
): EnrichedValidator {
  const ids = extractIdentifiers(apiValidator);
  const now = new Date().toISOString();

  // Determine geographic source (priority: registry > snapshot > ip)
  let geographicSource: 'registry' | 'snapshot-geoloc' | 'snapshot-ip' | 'none' = 'none';
  let country = snapshot?.countryCode;
  let city = snapshot?.city;
  let provider = snapshot?.provider;
  let latitude = snapshot?.latitude;
  let longitude = snapshot?.longitude;
  let confidence = undefined;

  // Override with registry if available (higher confidence)
  if (registryEntry?.country) {
    country = registryEntry.country;
    city = registryEntry.city;
    provider = registryEntry.provider;
    latitude = undefined;  // Don't use snapshot geo if registry has data
    longitude = undefined;
    geographicSource = 'registry';
    confidence = registryEntry.confidence;
  } else if (snapshot?.countryCode || snapshot?.city) {
    // Use snapshot geolocations data if available
    geographicSource = 'snapshot-geoloc';
  }

  return {
    secp: ids.secp || apiValidator.secp || '',
    nodeId: ids.nodeId || snapshot?.nodeId,
    address: ids.address,

    // From registry
    name: apiValidator.name || registryEntry?.name,
    website: apiValidator.website || registryEntry?.website,
    description: apiValidator.description || registryEntry?.description,
    logo: apiValidator.logo || registryEntry?.logo,
    twitter: apiValidator.twitter || registryEntry?.twitter,

    // From snapshot
    snapshot,
    isActive: snapshot?.validatorSetType === 'active' || false,
    isRegistered: snapshot?.validatorSetType === 'registered' || false,
    isInactive: snapshot?.validatorSetType === 'inactive' || false,

    // Geographic (merged priority)
    country,
    city,
    provider,
    providerRegion: registryEntry?.providerRegion,
    latitude,
    longitude,
    geographicSource,
    confidence,

    // Timestamps
    discoveredAt: registryEntry?.discoveredAt || now,
    lastSeen: now,
    updatedAt: registryEntry?.updatedAt || now,
  };
}

/**
 * Enrich entire snapshot by merging with registry
 */
export function enrichSnapshot(
  snapshotData: any,
  registry: Record<string, ValidatorMetadata>,
  network: 'mainnet' | 'testnet'
): {
  enriched: EnrichedValidator[];
  newValidators: string[];
  stats: {
    totalEnriched: number;
    withRegistryData: number;
    newToRegistry: number;
  };
} {
  const enriched: EnrichedValidator[] = [];
  const newValidators: string[] = [];

  for (const [secp, snapshotEntry] of Object.entries(snapshotData.validators)) {
    // Match to registry
    const ids = extractIdentifiers(snapshotEntry);
    const registryEntry = registry[secp.toLowerCase()];
    const isNew = !registryEntry;

    if (isNew) {
      newValidators.push(secp);
    }

    // Enrich
    const enrichedValidator = enrichValidator(
      snapshotEntry,
      snapshotEntry,
      registryEntry
    );
    enriched.push(enrichedValidator);
  }

  return {
    enriched,
    newValidators,
    stats: {
      totalEnriched: enriched.length,
      withRegistryData: enriched.filter(v => v.geographicSource === 'registry').length,
      newToRegistry: newValidators.length,
    },
  };
}
```

---

### 5. Updated getSnapshot Integration

**File**: `lib/getSnapshot.ts` (key changes)

```typescript
import { getMainnetRegistry, getTestnetRegistry } from './registry/mainnet';
import { enrichSnapshot } from './validator-enrichment';
import { setSnapshot } from './snapshots/current';

export async function getSnapshot() {
  const network = 'mainnet';  // Could be parameterized
  const registry = getMainnetRegistry();

  // Fetch live data from APIs
  const epochData = await fetchValidatorEpoch(network);
  const geolocData = await fetchValidatorGeolocations(network);

  // Construct snapshot
  const snapshot = {
    timestamp: new Date().toISOString(),
    epoch: epochData.epoch,
    network,
    validators: {/* merged epoch + geoloc */},
    totalValidators: epochData.validators.length,
    activeCount: epochData.validators.filter(v => v.validator_set_type === 'active').length,
    registeredCount: epochData.validators.filter(v => v.validator_set_type === 'registered').length,
    inactiveCount: epochData.validators.filter(v => v.validator_set_type === 'inactive').length,
  };

  // Save snapshot
  setSnapshot(network, snapshot);

  // Enrich with registry data
  const { enriched, newValidators, stats } = enrichSnapshot(snapshot, registry, network);

  // Register new validators (with discoveredAt timestamp)
  for (const secp of newValidators) {
    updateMainnetRegistry(secp, {
      secp,
      name: snapshot.validators[secp].name,
      website: snapshot.validators[secp].website,
      discoveredAt: new Date().toISOString(),
    });
  }

  // Build output (same as before, but using enriched data)
  const output = {
    success: true,
    data: enriched,
    meta: {
      timestamp: snapshot.timestamp,
      network,
      snapshot: stats,
    },
  };

  return output;
}
```

---

## File Structure

```
lib/
  registry/
    types.ts                    # Shared types
    mainnet.ts                  # MAINNET_VALIDATOR_REGISTRY (persistent)
    testnet.ts                  # TESTNET_VALIDATOR_REGISTRY (persistent)
    index.ts                    # Exports
    
  snapshots/
    types.ts                    # Snapshot types
    current.ts                  # Live snapshot storage
    
  validator-matching.ts         # Stable identifier matching
  validator-enrichment.ts       # Merge logic
  getSnapshot.ts                # Updated to use registry + snapshots
  
  # Legacy file (can be deprecated or repurposed)
  validators-geo-mapping.ts     # (Optional: kept for transition period)
```

---

## Key Benefits

| Issue | Solution |
|-------|----------|
| Data loss on inactive | Registry persists all metadata across state changes |
| No testnet support | Separate registry for testnet validators |
| Manual research lost | Researched data stored in registry, matched by SECP |
| Name-based matching breaks | Stable matching by secp/nodeId/address |
| No version history | `discoveredAt`, `updatedAt`, `updatedBy` track changes |
| Unclear data source | `geographicSource` field shows: registry/snapshot/IP/none |
| Network hardcoded | Registry split by network from start |

---

## Implementation Phases

### Phase 1: Create Registry Infrastructure (Week 1)
- [ ] Define types (`registry/types.ts`, `snapshots/types.ts`)
- [ ] Create empty mainnet & testnet registries
- [ ] Implement matching logic
- [ ] Implement enrichment logic
- [ ] Update `getSnapshot.ts` to use new stack

### Phase 2: Populate Registry (Ongoing)
- [ ] Migrate existing research from `validators-geo-mapping.ts` → mainnet registry
- [ ] Complete research for 18 inactive validators → mainnet registry
- [ ] Update registry when new validators discovered

### Phase 3: Add Testnet (Future)
- [ ] Populate testnet registry with known validators
- [ ] Switch testnet to use separate registry

### Phase 4: Optional Enhancements (Future)
- [ ] Add database persistence (SQLite/PostgreSQL)
- [ ] Track state transitions (when validator became inactive)
- [ ] Webhook on new validator discovery
- [ ] CLI tool to update registry entries

---

## Example Usage

```typescript
// Add a researched validator to mainnet registry
import { updateMainnetRegistry } from './registry/mainnet';

updateMainnetRegistry('02ef0fc9ac54d327831e8010c5a5748476d6fa7f050b56923bf9829cc461942960', {
  country: 'Japan',
  city: 'Tokyo',
  provider: 'AWS Tokyo',
  confidence: 'HIGH',
  evidenceSource: 'https://kamunagi.xyz/',
  updatedBy: 'user:researcher@example.com',
});

// Then call getSnapshot() - will automatically:
// 1. Preserve this metadata even if Kamunagi goes inactive
// 2. Enrich output with researched data
// 3. Mark geographicSource as 'registry' with HIGH confidence
```

---

## Migration Path

Current `validators-geo-mapping.ts`:
```typescript
// OLD
"028986e40f8e9f39bf68fa5f2f8de58514b124a150261a340e13940d286c0c7317": {
  country: "Canada",
  city: "Montreal",
  provider: "Leaseweb Canada Inc."
}
```

Becomes in registry:
```typescript
// NEW - lib/registry/mainnet.ts
"028986e40f8e9f39bf68fa5f2f8de58514b124a150261a340e13940d286c0c7317": {
  secp: "028986e40f8e9f39bf68fa5f2f8de58514b124a150261a340e13940d286c0c7317",
  name: "BlockPro",
  website: "...",
  country: "Canada",
  city: "Montreal",
  provider: "Leaseweb Canada Inc.",
  confidence: "HIGH",
  discoveredAt: "2026-03-05T00:00:00Z",
  updatedAt: "2026-03-10T00:00:00Z"
}
```

Output format remains identical—fully backward compatible.

