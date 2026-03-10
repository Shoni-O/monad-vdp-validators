# Validator Registry System - Complete Overview

## The Complete Picture

You now have a complete system design for validator metadata management:

```
┌─────────────────────────────────────────────────────────────────┐
│  SYSTEM ARCHITECTURE                                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  📚 PERSISTENT REGISTRY                                          │
│     ├─ mainnet.ts: All mainnet validators ever discovered       │
│     ├─ testnet.ts: All testnet validators ever discovered       │
│     └─ Contains: researched metadata (country/city/provider)    │
│                                                                   │
│  📸 LIVE SNAPSHOTS                                               │
│     └─ current.ts: Real-time state from APIs (active/inactive)  │
│                                                                   │
│  🔗 MATCHING & ENRICHMENT                                        │
│     ├─ validator-matching.ts: Link snapshot to registry         │
│     └─ validator-enrichment.ts: Merge data with priority rules  │
│                                                                   │
│  📤 API OUTPUT                                                   │
│     └─ getSnapshot.ts: Complete enriched data (preserved ✅)    │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Three Documents, One System

### 1. **VALIDATOR_REGISTRY_DESIGN.md** (You are here)
**Technical specification** — Detailed architecture, type definitions, code examples

**Contains**:
- ValidatorMetadata interface (what gets stored in registry)
- SnapshotData interface (what gets stored in live snapshots)
- Matching strategy (how to find validators by key)
- Enrichment logic (how to merge and apply priorities)
- File structure and updated getSnapshot integration

**Who needs this**: Developers implementing the registry system

**When to read**: During MVP implementation phase

---

### 2. **REGISTRY_IMPLEMENTATION_ROADMAP.md**
**Implementation guide** — Step-by-step tasks with time estimates

**Contains**:
- MVP checklist (6 steps, ~12 hours total)
- Success criteria (how to verify it works)
- Before/after examples showing the improvement
- Risk mitigation strategies
- Migration guide for users

**Who needs this**: Project manager or developer leading implementation

**When to read**: Planning the work sprint

---

### 3. **INACTIVE_VALIDATORS_RESEARCH.md**
**Research working table** — Structured markdown to track manual metadata enrichment

**Contains**:
- All 18 inactive validators with their metadata
- Empty columns for country/city/provider/confidence/evidence
- Research workflow instructions
- Quick-win validators to start with
- Progress tracking checklist

**Who needs this**: Researcher filling in geographic data

**When to read**: During Phase 2 (populate registry)

---

## How They Work Together

### Timeline View

```
WEEK 1: Build Infrastructure
  ├─ Read: VALIDATOR_REGISTRY_DESIGN.md (understand architecture)
  ├─ Read: REGISTRY_IMPLEMENTATION_ROADMAP.md (plan tasks)
  └─ Execute: MVP steps (implement types → matching → enrichment)
             Result: Empty registry with all infrastructure ready

WEEK 2+: Populate Registry
  ├─ Read: INACTIVE_VALIDATORS_RESEARCH.md (research guide)
  ├─ Execute: Research each validator (use research table)
  └─ Update: mainnet.ts registry as data is researched
             Result: 18 inactive validators + any others with data

WEEK 3+: Maintenance
  ├─ New validators auto-register via enrichment logic
  ├─ Update registry when new research completed
  └─ Monitor confidence levels and data quality
```

---

## How To Use This System

### For Researchers (You!)

**Week 1-2: Populate Inactive Validators**

1. **Open** [INACTIVE_VALIDATORS_RESEARCH.md](INACTIVE_VALIDATORS_RESEARCH.md)
2. **For each validator** (rows 1-18):
   - Visit the website
   - Search for country/city/provider info
   - Find evidence URL
   - Rate confidence (HIGH/MEDIUM/LOW)
   - Fill in the table row
3. **When ready to implement**:
   - Copy completed rows into registry format:
   ```typescript
   "secp_key_lowercase": {
     country: "...",
     city: "...",
     provider: "...",
     confidence: "HIGH",
     evidenceSource: "https://...",
     discoveredAt: "2026-03-10T00:00:00Z",
     updatedAt: "2026-03-10T00:00:00Z"
   }
   ```

---

### For Developers

**Week 1: Implement Infrastructure**

Follow the 6 steps in [REGISTRY_IMPLEMENTATION_ROADMAP.md](REGISTRY_IMPLEMENTATION_ROADMAP.md):

1. Create type definitions
2. Create registry storage
3. Create matching logic
4. Create enrichment logic
5. Update getSnapshot
6. Populate with existing research

**Result**: All infrastructure ready, API works with both active and inactive validators' metadata preserved.

---

### For Operations

**Ongoing: Monitor & Maintain**

After implementation:
- New validators auto-register on discovery
- Manual research updates flow through registry:update
- Metadata persists through state transitions
- Confidence scores show data quality
- API output includes data provenance

---

## Key Benefits of This System

### Before Implementation ❌

```
Validator becomes INACTIVE
                ↓
Disappears from geolocations endpoint
                ↓
Metadata lost
                ↓
Country/city/provider → "Unknown"
                ↓
Research was wasted 😞
```

### After Implementation ✅

```
Validator becomes INACTIVE
                ↓
Still in snapshot (validatorSetType: "inactive")
                ↓
Registry entry preserved
                ↓
Country/city/provider → Uses registry data
                ↓
Confidence shows it came from research
                ↓
Research preserved forever ✅
```

---

## Proposed Workflow

### Immediate (This Week)

**For Researcher** (you):
1. ✅ **Review** [INACTIVE_VALIDATORS_RESEARCH.md](INACTIVE_VALIDATORS_RESEARCH.md) table
2. ✅ **Identify** quick-win validators (ID 140, 175, 177 are easiest)
3. ✅ **Research** one validator as proof-of-concept
4. ⏳ **Document** findings in research table

**For Developer**:
1. ⏳ **Review** [VALIDATOR_REGISTRY_DESIGN.md](VALIDATOR_REGISTRY_DESIGN.md) design
2. ⏳ **Estimate** implementation time for MVP
3. ⏳ **Plan** sprints for phases 1-2

---

### Week 1-2 (Implementation Sprint)

**For Developer**:
- Implementation MVP (6 steps from roadmap, ~12 hours)
- Result: System ready for data entry

**For Researcher**:
- Research 2-3 quick-win validators
- Add to registry once system ready
- Expand to remaining 15 validators

---

### Week 3+ (Ongoing)

**For Researcher**:
- Complete research on all 18 inactive validators
- Add any new validators discovered
- Update confidence levels with additional research

**For Developer**:
- Monitor system performance
- Handle any new validator discovery issues
- Optionally: add database persistence, CLI tooling

---

## Validation Checklist

After system is live, verify:

- [ ] Inactive validator (e.g., Kamunagi) appears in output with preserved metadata
- [ ] Output shows `geographicSource: "registry"` for researched validators
- [ ] Confidence scores displayed correctly
- [ ] New validators auto-added to registry with `discoveredAt` timestamp
- [ ] API output format unchanged (backward compatible)
- [ ] Both mainnet and testnet registries independent
- [ ] Metadata survives validator state transitions (active ↔ inactive)
- [ ] Evidence URLs allow tracking research sources

---

## Document Cross-References

### If you want to... → Read:

| Goal | Document | Section |
|------|----------|---------|
| Understand the architecture | VALIDATOR_REGISTRY_DESIGN.md | High-Level Design |
| Plan implementation | REGISTRY_IMPLEMENTATION_ROADMAP.md | Implementation Plan |
| Know what to research | INACTIVE_VALIDATORS_RESEARCH.md | Research Data table |
| See code examples | VALIDATOR_REGISTRY_DESIGN.md | Detailed Structure |
| Get started ASAP | REGISTRY_IMPLEMENTATION_ROADMAP.md | MUST DO (MVP) |
| Know success criteria | REGISTRY_IMPLEMENTATION_ROADMAP.md | Success Criteria |
| See quick-wins | INACTIVE_VALIDATORS_RESEARCH.md | Difficulty Tier |
| Understand data flow | REGISTRY_IMPLEMENTATION_ROADMAP.md | Data Flow Diagram |

---

## Key Design Principles (Recap)

1. **Separation of Concerns**
   - Registry = permanent storage
   - Snapshot = live state
   - Enrichment = merge logic

2. **Stable Identifiers**
   - Match by SECP key, not name
   - Resilient to validator rebrand/rename

3. **Data Preservation**
   - Manual research never lost
   - Metadata survives state transitions

4. **Confidence Tracking**
   - Every geographic field has confidence level
   - Shows data quality/reliability

5. **Network Independence**
   - Separate registries for mainnet/testnet
   - Future-proof for multi-chain

6. **Backward Compatibility**
   - API output format unchanged
   - Enrichment is additive, not disruptive

---

## Next Steps

### You Should Pick One:

**Option A: Start with Research** (No coding needed)
1. Open [INACTIVE_VALIDATORS_RESEARCH.md](INACTIVE_VALIDATORS_RESEARCH.md)
2. Research validators 140, 175, 177 (easiest, 5-10 min each)
3. Fill in research table
4. Ready to hand off to developer

**Option B: Start with Implementation** (Coding)
1. Open [VALIDATOR_REGISTRY_DESIGN.md](VALIDATOR_REGISTRY_DESIGN.md)
2. Follow MVP checklist from [REGISTRY_IMPLEMENTATION_ROADMAP.md](REGISTRY_IMPLEMENTATION_ROADMAP.md)
3. Implement 6 steps in parallel with research
4. Have working system + populated research by end of week

**Option C: Review First** (Risk Mitigation)
1. Read all 4 documents (this + 3 linked)
2. Identify any architecture concerns
3. Propose adjustments before implementation
4. Then proceed with Option A or B

---

## Questions This Design Answers

**Q: What happens to validator data when it becomes inactive?**
A: It's preserved in the registry. The snapshot shows it as inactive, but the enriched output combines both.

**Q: How do we avoid losing manual research?**
A: Registry is persistent. Manual data is stored separately from live snapshots, so research survives state changes.

**Q: Can we support both mainnet and testnet?**
A: Yes; separate registries from day one. No cross-contamination.

**Q: How do we know if country data is researched vs. guessed?**
A: Confidence field + geographicSource field + evidenceSource URL. Full traceability.

**Q: What if a validator changes its name?**
A: Doesn't matter. We match by SECP key, which never changes.

**Q: Will this break the current API?**
A: No. Output format is backward compatible. Enrichment adds optional fields.

**Q: How long to implement?**
A: MVP infrastructure: ~12 hours (1.5 days). Data population: gradual (2-3 hours per validator researched).

---

## Summary Table

| Aspect | Current State | After Implementation |
|--------|---|---|
| **Inactive Validation Data** | Lost 😞 | Preserved ✅ |
| **Data Source** | Only live API | Registry + Snapshot ✅ |
| **Manual Research Loss** | On state change | Never ✅ |
| **Network Support** | Mainnet only | Mainnet + Testnet ✅ |
| **Identifier Matching** | By name (fragile) | By SECP key (stable) ✅ |
| **Data Provenance** | Unknown | Tracked (source + confidence) ✅ |
| **Backward Compatibility** | N/A | Full ✅ |
| **Metadata Quality** | Low (unknowns) | High (HIGH/MED/LOW) ✅ |

---

## Who Should Do What

| Role | Responsibility | Documents |
|------|---|---|
| **Researcher/Analyst** | Fill research table; identify validator metadata | INACTIVE_VALIDATORS_RESEARCH.md |
| **Backend Developer** | Implement registry system; update getSnapshot | VALIDATOR_REGISTRY_DESIGN.md, ROADMAP.md |
| **Project Manager** | Plan sprints; track progress; verify MVP success | REGISTRY_IMPLEMENTATION_ROADMAP.md |
| **DevOps/QA** | Test persistence; verify backward compatibility | Success Criteria section |

---

## Getting Started

### Right Now (Pick One)

**Option 1 - Research First**
```bash
# Open in editor
code INACTIVE_VALIDATORS_RESEARCH.md

# Start with easy ones (ID 140, 175, 177)
# Take ~15 minutes per validator
# Fill in your findings
```

**Option 2 - Implementation First**
```bash
# Review the architecture
code VALIDATOR_REGISTRY_DESIGN.md

# Plan your sprint
code REGISTRY_IMPLEMENTATION_ROADMAP.md

# Create your first file
mkdir -p lib/registry
code lib/registry/types.ts
```

**Option 3 - Both in Parallel**
```bash
# Split across team
# Researcher: Start with research table
# Developer: Start with type definitions
# Meet in 2 hours to sync on design questions
```

---

**This is a solid, implementable system that solves real problems in your validator metadata pipeline. You're ready to proceed! 🚀**

