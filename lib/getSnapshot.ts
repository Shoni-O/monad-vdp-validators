import { unstable_cache } from 'next/cache';

const GITHUB_CACHE_SECONDS = 86400; // 24h - validator-info changes rarely
import type { Network, Snapshot, GmonadsValidator, EnrichedValidator } from '@/lib/types';
import { buildCounts, scoreValidator, hasMetadata } from '@/lib/scoring';
import { normalizeCountry, resolveCountryFromCity } from '@/lib/countries';
import { lookupValidatorGeo } from '@/lib/validators-geo-mapping';
import { getValidatorMetadata, updateValidatorMetadata, registerNewValidators, updateValidatorGeoData } from '@/lib/registry/index';

const GMONADS_BASE = 'https://www.gmonads.com/api/v1/public';

async function fetchJson(url: string) {
  const res = await fetch(url, {
    next: { revalidate: 300 },
    headers: { accept: 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`Fetch failed ${res.status} for ${url}`);
  }

  return res.json();
}

function safeStr(v: any): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  return s.length ? s : undefined;
}

function getCachedValidatorInfo(network: Network, nodeId: string) {
  return unstable_cache(
    async () => {
      const rawUrl = `https://raw.githubusercontent.com/monad-developers/validator-info/main/${network}/${nodeId}.json`;
      const res = await fetch(rawUrl, { headers: { accept: 'application/json' } });
      if (!res.ok) return null;
      return res.json();
    },
    [`github-validator-${network}-${nodeId}`],
    { revalidate: GITHUB_CACHE_SECONDS }
  )();
}

function normalizeProvider(v?: string) {
  if (!v) return undefined;
  return v.replace(/^AS\d+\s+/, '').trim() || undefined;
}

function extractGeo(meta: any): { country?: string; city?: string; provider?: string } {
  const country =
    safeStr(meta?.country_code) ??
    safeStr(meta?.country) ??
    safeStr(meta?.geo?.country_code) ??
    safeStr(meta?.geo?.country) ??
    safeStr(meta?.geolocation?.country_code) ??
    safeStr(meta?.geolocation?.country) ??
    safeStr(meta?.location?.country_code) ??
    safeStr(meta?.location?.country);

  const city =
    safeStr(meta?.city) ??
    safeStr(meta?.geo?.city) ??
    safeStr(meta?.geolocation?.city) ??
    safeStr(meta?.location?.city);

  const providerRaw =
    safeStr(meta?.provider) ??
    safeStr(meta?.hosting) ??
    safeStr(meta?.host) ??
    safeStr(meta?.hostingProvider) ??
    safeStr(meta?.infrastructure?.provider) ??
    safeStr(meta?.org) ??
    safeStr(meta?.isp);

  return {
    country,
    city,
    provider: normalizeProvider(providerRaw),
  };
}

type IpGeo = {
  country?: string;
  city?: string;
  provider?: string;
};

function pickIp(row: any): string | undefined {
  return safeStr(row?.ip_address) ?? safeStr(row?.ip) ?? safeStr(row?.ipv4);
}

function normalizeSecp(row: any): string | undefined {
  return (
    safeStr(row?.secp) ??
    safeStr(row?.secp_key) ??
    safeStr(row?.secpKey) ??
    safeStr(row?.secp_pubkey) ??
    safeStr(row?.secpPubkey)
  );
}

function makeDisplayName(merged: any, id: number) {
  const name =
    safeStr(merged?.name) ??
    safeStr(merged?.displayName) ??
    safeStr(merged?.validator) ??
    safeStr(merged?.moniker);

  if (name) return name;

  const vi =
    typeof merged?.val_index === 'number'
      ? merged.val_index
      : typeof merged?.val_index === 'string'
        ? Number(merged.val_index)
        : undefined;

  if (Number.isFinite(vi)) return `Validator #${vi}`;

  const nodeId = safeStr(merged?.node_id);
  if (nodeId) return `Validator ${nodeId.slice(0, 10)}…`;

  return `Validator #${id}`;
}

function makeFallbackKey(merged: any, id: number): string | undefined {
  return (
    normalizeSecp(merged) ??
    safeStr(merged?.auth_address) ??
    safeStr(merged?.node_id) ??
    (typeof merged?.val_index === 'number' ? String(merged.val_index) : undefined) ??
    String(id)
  );
}

function getNumericId(x: any): number | undefined {
  if (typeof x?.id === 'number') return x.id;
  if (typeof x?.val_index === 'number') return x.val_index;

  if (typeof x?.id === 'string' && x.id.trim() && Number.isFinite(Number(x.id))) {
    return Number(x.id);
  }

  if (
    typeof x?.val_index === 'string' &&
    x.val_index.trim() &&
    Number.isFinite(Number(x.val_index))
  ) {
    return Number(x.val_index);
  }

  return undefined;
}

function isActive(v: any): boolean {
  const tRaw = v?.validator_set_type;
  
  if (tRaw !== undefined && tRaw !== null) {
    const t = String(tRaw).trim().toLowerCase();
    // Explicitly active
    if (t === 'active') {
      return true;
    }
    // Explicitly inactive states
    if (t === 'inactive' || t === 'jailed' || t === 'unbonding' || t === 'registered') {
      return false;
    }
    // Unknown status → treat as inactive (conservative)
    return false;
  }
  
  // Missing/null validator_set_type in epoch data → treat as active
  // (Only validators explicitly marked as 'registered'/'inactive'/'jailed'/'unbonding' are inactive)
  return true;
}

function rowQuality(r: {
  country?: string;
  city?: string;
  provider?: string;
  nodeId?: string;
  secp?: string;
  merged?: any;
}) {
  let q = 0;

  if (r.country) q += 3;
  if (r.city) q += 2;
  if (r.provider) q += 2;
  if (r.nodeId) q += 2;
  if (r.secp) q += 1;

  const ts = r.merged?.timestamp ? Date.parse(r.merged.timestamp) : 0;
  if (Number.isFinite(ts) && ts > 0) {
    q += Math.min(3, Math.floor(ts / 1_000_000_000));
  }

  return q;
}

function buildEnrichedRow(
  row: { id: number; nodeId?: string; secp?: string; bls?: string; country?: string; city?: string; provider?: string; merged: any; isActive: boolean },
  counts: { byCountry: Record<string, number>; byCity: Record<string, number>; byProvider: Record<string, number> },
  gh: any
): EnrichedValidator {
  const displayName = safeStr(gh?.name) ?? makeDisplayName(row.merged, row.id);
  
  // Determine if validator has any metadata
  const hasData = hasMetadata(row);
  
  // Use "No data" for validators with no metadata, otherwise use "Unknown" for missing fields
  const country = hasData ? (row.country ?? 'Unknown') : 'No data';
  const city = hasData ? (row.city ?? 'Unknown') : 'No data';
  const provider = hasData ? (row.provider ?? 'Unknown') : 'No data';
  
  const scores = scoreValidator({
    country: row.country,
    city: row.city,
    provider: row.provider,
    counts,
  });
  const fallbackKey = makeFallbackKey(row.merged, row.id);

  return {
    id: row.id,
    secp: row.secp ?? fallbackKey,
    bls: row.bls,
    displayName,
    website: safeStr(gh?.website) ?? safeStr(row.merged?.website),
    description: safeStr(gh?.description) ?? safeStr(row.merged?.description),
    logo: safeStr(gh?.logo) ?? safeStr(row.merged?.logo),
    x: safeStr(gh?.x) ?? safeStr(row.merged?.x),
    country,
    city,
    provider,
    status: row.isActive ? 'active' : 'inactive',
    scores,
    raw: { gmonads: row.merged, github: gh ?? undefined },
  };
}

function dedupeById<T extends { id: number }>(rows: T[]) {
  const map = new Map<number, T>();

  for (const r of rows) {
    const prev = map.get(r.id);

    if (!prev) {
      map.set(r.id, r);
      continue;
    }

    const keep = rowQuality(r as any) >= rowQuality(prev as any) ? r : prev;
    map.set(r.id, keep);
  }

  return Array.from(map.values());
}

export async function computeSnapshot(network: Network): Promise<Snapshot> {
  const t0 = Date.now();

  const [epoch, geolocs, metadata] = await Promise.all([
    fetchJson(`${GMONADS_BASE}/validators/epoch?network=${network}`),
    fetchJson(`${GMONADS_BASE}/validators/geolocations?network=${network}`),
    fetchJson(`${GMONADS_BASE}/validators/metadata?network=${network}`),
  ]);

  const t1 = Date.now();
  if (process.env.NODE_ENV === 'development') {
    console.log(`[snapshot] gmonads fetch: ${t1 - t0}ms`);
  }

  const epochData = (epoch?.data ?? []) as GmonadsValidator[];
  const geolocData = (geolocs?.data ?? []) as any[];
  const metaData = (metadata?.data ?? []) as any[];

  // Debug logging: raw data counts
  if (process.env.NODE_ENV === 'development') {
    console.log(`[snapshot-debug] Raw epoch validators: ${epochData.length}`);
    console.log(`[snapshot-debug] Raw geolocations: ${geolocData.length}`);
    console.log(`[snapshot-debug] Raw metadata: ${metaData.length}`);
  }

  // Create maps for lookup
  const byKeyGeo = new Map<number, any>();
  for (const g of geolocData) {
    const k = getNumericId(g);
    if (typeof k === 'number') byKeyGeo.set(k, g);
  }

  const byKeyMeta = new Map<number, any>();
  for (const m of metaData) {
    const k = getNumericId(m);
    if (typeof k === 'number') byKeyMeta.set(k, m);
  }

  // Create a set of all validator IDs from epoch for easier lookup
  const epochIds = new Set<number>();
  for (const v of epochData) {
    const k = getNumericId(v);
    if (typeof k === 'number') epochIds.add(k);
  }

  if (process.env.NODE_ENV === 'development') {
    console.log(`[snapshot-debug] Validators in epoch: ${epochIds.size}`);
    console.log(`[snapshot-debug] Validators in geo: ${byKeyGeo.size}`);
    console.log(`[snapshot-debug] Validators in meta: ${byKeyMeta.size}`);
    
    // Show sample of first few validators in geo/meta to see structure
    if (byKeyGeo.size > 0) {
      const sampleGeoId = Array.from(byKeyGeo.keys())[0];
      const sampleGeo = byKeyGeo.get(sampleGeoId);
      console.log(`[snapshot-debug] Sample geo entry (ID ${sampleGeoId}):`, {
        keys: Object.keys(sampleGeo).slice(0, 15),
        country_code: sampleGeo?.country_code,
        country: sampleGeo?.country,
        city: sampleGeo?.city,
      });
    }
    
    if (byKeyMeta.size > 0) {
      const sampleMetaId = Array.from(byKeyMeta.keys())[0];
      const sampleMeta = byKeyMeta.get(sampleMetaId);
      console.log(`[snapshot-debug] Sample meta entry (ID ${sampleMetaId}):`, {
        keys: Object.keys(sampleMeta).slice(0, 15),
        country: sampleMeta?.country,
        country_code: sampleMeta?.country_code,
        city: sampleMeta?.city,
        provider: sampleMeta?.provider,
      });
    }
  }

  // Build a canonical records map for each epoch ID (handling duplicates)
  // When an ID appears multiple times, prefer 'active' > other values > 'registered'/'inactive'
  const canonicalEpochEntry = new Map<number, any>();
  
  for (const v of epochData) {
    const k = getNumericId(v);
    if (typeof k !== 'number') continue;
    
    const existing = canonicalEpochEntry.get(k);
    if (!existing) {
      canonicalEpochEntry.set(k, v);
      continue;
    }
    
    // Pick the "better" record if we have duplicates
    const existingType = String(existing?.validator_set_type ?? '').toLowerCase();
    const newType = String(v?.validator_set_type ?? '').toLowerCase();
    
    // Preference order: 'active' > other known values > 'registered'/'inactive'/'jailed'/'unbonding' > undefined
    const typeScore = (t: string) => {
      if (t === 'active') return 100;
      if (t === 'registered' || t === 'inactive' || t === 'jailed' || t === 'unbonding') return 10;
      if (t && t.length > 0) return 50; // Other known values
      return 0; // undefined/empty
    };
    
    if (typeScore(newType) > typeScore(existingType)) {
      canonicalEpochEntry.set(k, v);
    }
  }

  // Create a set of active validator IDs from epoch (using canonical records)
  const activeIds = new Set<number>();
  const inactiveIds = new Set<number>();
  const validatorSetTypeDistribution: Record<string, number> = {};
  const samplesByType: Record<string, any> = {};
  
  for (const [k, v] of canonicalEpochEntry.entries()) {
    const vst = v?.validator_set_type;
    const vstStr = String(vst).trim().toLowerCase() || '(missing)';
    validatorSetTypeDistribution[vstStr] = (validatorSetTypeDistribution[vstStr] ?? 0) + 1;
    
    // Keep a sample of each type for debugging
    if (!samplesByType[vstStr]) {
      samplesByType[vstStr] = { 
        id: k, 
        validator_set_type: v?.validator_set_type,
        moniker: v?.moniker,
        node_id: v?.node_id,
      };
    }
    
    if (isActive(v)) {
      activeIds.add(k);
    } else {
      inactiveIds.add(k);
    }
  }

  if (process.env.NODE_ENV === 'development') {
    console.log(`[snapshot-debug] === EPOCH DATA ANALYSIS ===`);
    console.log(`[snapshot-debug] Raw epoch rows: ${epochData.length}`);
    console.log(`[snapshot-debug] After deduplication by ID: ${canonicalEpochEntry.size}`);
    console.log(`[snapshot-debug] Validator set type distribution:`, validatorSetTypeDistribution);
    console.log(`[snapshot-debug] Marked as active from epoch: ${activeIds.size}`);
    console.log(`[snapshot-debug] Marked as inactive from epoch: ${inactiveIds.size}`);
    console.log(`[snapshot-debug] Sample validators by type:`, samplesByType);
  }

  // Check for validators only in geo/meta (not in epoch at all)
  const validatorsNotInEpoch = new Set<number>();
  for (const id of byKeyGeo.keys()) {
    if (!epochIds.has(id)) validatorsNotInEpoch.add(id);
  }
  for (const id of byKeyMeta.keys()) {
    if (!epochIds.has(id)) validatorsNotInEpoch.add(id);
  }

  if (process.env.NODE_ENV === 'development') {
    console.log(`[snapshot-debug] Validators in geo/meta but NOT in epoch: ${validatorsNotInEpoch.size}`);
    // Log first few for debugging
    Array.from(validatorsNotInEpoch).slice(0, 5).forEach((id) => {
      const meta = byKeyMeta.get(id);
      const geo = byKeyGeo.get(id);
      const name = safeStr(meta?.name) ?? safeStr(meta?.moniker) ?? safeStr(geo?.moniker) ?? `id ${id}`;
      console.log(`  [not-in-epoch] ${id}: ${name}`);
    });
  }

  // Collect all unique validator IDs from all sources
  const allIds = new Set<number>();
  for (const v of epochData) {
    const k = getNumericId(v);
    if (typeof k === 'number') allIds.add(k);
  }
  for (const id of byKeyGeo.keys()) {
    allIds.add(id);
  }
  for (const id of byKeyMeta.keys()) {
    allIds.add(id);
  }

  if (process.env.NODE_ENV === 'development') {
    console.log(`[snapshot-debug] Total unique validator IDs: ${allIds.size}`);
  }

  const ipCache = new Map<string, IpGeo>();
  const ipPending = new Map<string, Promise<IpGeo>>();

  async function geoFromIp(ip?: string): Promise<IpGeo> {
    if (!ip) return {};
    if (ipCache.has(ip)) return ipCache.get(ip)!;

    let pending = ipPending.get(ip);
    if (pending) return pending;

    const token = safeStr(process.env.IPINFO_TOKEN);
    pending = (async (): Promise<IpGeo> => {
      if (!token) {
        const empty: IpGeo = {};
        ipCache.set(ip, empty);
        return empty;
      }

      const ipinfoUrl = `https://ipinfo.io/${ip}?token=${token}`;

      const res = await fetch(ipinfoUrl, {
      next: { revalidate: 86400 },
      headers: { accept: 'application/json' },
    });

    if (!res.ok) {
      const empty: IpGeo = {};
      ipCache.set(ip, empty);
      return empty;
    }

    const j = await res.json();

      const rawCountry = safeStr(j?.country);
      const out: IpGeo = {
        country: rawCountry ? normalizeCountry(rawCountry) : undefined,
        city: safeStr(j?.city),
        provider: normalizeProvider(safeStr(j?.org) ?? safeStr(j?.hostname)),
      };

      ipCache.set(ip, out);
      return out;
    })();

    ipPending.set(ip, pending);
    try {
      return await pending;
    } finally {
      ipPending.delete(ip);
    }
  }

  // Process ALL validators (both active and inactive)
  const baseRowsRaw = await Promise.all(
    Array.from(allIds).map(async (id: number) => {
      // Merge data from all sources (for enrichment only)
      const epochEntry = epochData.find((v: any) => getNumericId(v) === id);
      const geo = byKeyGeo.get(id);
      const meta = byKeyMeta.get(id);

      // NOTE: Do NOT use moniker/name matching for status.
      // Active status is determined purely by membership in activeIds set,
      // which is computed strictly from epoch data with validator_set_type field.
      // Moniker matching for enrichment purposes only (display names, etc).

      const merged = { ...epochEntry, ...meta, ...geo };
      
      // Extract identifiers for lookups
      const secp = normalizeSecp(merged) ?? safeStr(merged?.auth_address) ?? undefined;
      const nodeId = safeStr(merged?.node_id);
      const address = safeStr(merged?.auth_address);
      
      // Priority 1: Check persistent registry (for manually researched data)
      const registryData = secp ? getValidatorMetadata(network, secp) : undefined;
      
      // Priority 2: Check local metadata mapping for geographic data (legacy)
      const mappedGeo = lookupValidatorGeo({ secp, nodeId, address });
      
      // Priority 3: Extract from standard endpoints if not in registry/mapping
      const extracted = extractGeo(merged);
      
      // Merge with priority: registry > mapped > extracted
      const country_from_registry = registryData?.country;
      const city_from_registry = registryData?.city;
      const provider_from_registry = registryData?.provider;
      
      const country_from_mapping = mappedGeo?.country;
      const city_from_mapping = mappedGeo?.city;
      const provider_from_mapping = mappedGeo?.provider;
      
      const country_from_extracted = extracted?.country;
      const city_from_extracted = extracted?.city;
      const provider_from_extracted = extracted?.provider;

      // Final resolution with priority: registry > mapping > extracted > IP geo > unknown
      const ip = pickIp(merged);
      const needsIp = !(country_from_registry || country_from_mapping || country_from_extracted) ||
                      !(city_from_registry || city_from_mapping || city_from_extracted) ||
                      !(provider_from_registry || provider_from_mapping || provider_from_extracted);
      const ipGeo = needsIp ? await geoFromIp(ip) : {};

      // For country: trust registry/mapped values as-is, but normalize API-sourced values
      let country = country_from_registry ?? country_from_mapping ?? normalizeCountry(country_from_extracted ?? ipGeo.country);
      const city = city_from_registry ?? city_from_mapping ?? city_from_extracted ?? ipGeo.city;
      const provider = provider_from_registry ?? provider_from_mapping ?? provider_from_extracted ?? ipGeo.provider;

      // Fallback: If country is Unknown but city is known, try to infer country from city
      // This handles cases like Lelystad with no country code but city is present
      if (country === 'Unknown' && city && city !== 'Unknown' && city !== 'No data') {
        const countryFromCity = resolveCountryFromCity(city);
        if (countryFromCity) {
          country = countryFromCity;
        }
      }

      // nodeId is used for GitHub validator-info lookups
      // For epoch data: use node_id field
      // For metadata-only validators: use secp field (same identifier)  
      const nodeIdForGitHub = nodeId ?? secp;
      const bls = safeStr(merged?.bls);
      
      // Debug Luganodes specifically
      const displayName = safeStr(merged?.name) ?? safeStr(merged?.displayName) ?? safeStr(merged?.moniker) ?? `Validator #${id}`;
      // Determine active status: only from activeIds (computed strictly from epoch data)
      const isActiveValidator = activeIds.has(id);
      
      const isLuganodes = displayName.toLowerCase().includes('luganodes') || nodeIdForGitHub?.toLowerCase().includes('luganodes');
      
      if (isLuganodes && process.env.NODE_ENV === 'development') {
        console.log(`[luganodes-debug] Found Luganodes:`);
        console.log(`  id: ${id}, in activeIds: ${isActiveValidator}`);
        console.log(`  displayName: ${displayName}`);
        console.log(`  nodeId: ${nodeIdForGitHub}`);
        console.log(`  secp: ${secp}`);
        console.log(`  epochEntry exists: ${epochEntry ? 'YES' : 'NO'}`);
        if (epochEntry) {
          console.log(`    epochEntry.validator_set_type: ${epochEntry.validator_set_type}`);
          console.log(`    epochEntry.moniker: ${epochEntry.moniker}`);
          console.log(`    epochEntry.node_id: ${epochEntry.node_id}`);
        }
        console.log(`  geo: ${geo ? 'YES' : 'NO'}`);
        console.log(`  meta: ${meta ? 'YES' : 'NO'}`);
      }

      // Debug any inactive validator to trace metadata enrichment
      if (!isActiveValidator && process.env.NODE_ENV === 'development') {
        const hasMetadataAtAll = !!(country || city || provider);
        const countrySrc = country_from_registry ? 'registry' : (country_from_mapping ? 'mapping' : (country_from_extracted ? 'extracted' : (ipGeo.country ? 'ip' : 'none')));
        const citySrc = city_from_registry ? 'registry' : (city_from_mapping ? 'mapping' : (city_from_extracted ? 'extracted' : (ipGeo.city ? 'ip' : 'none')));
        const providerSrc = provider_from_registry ? 'registry' : (provider_from_mapping ? 'mapping' : (provider_from_extracted ? 'extracted' : (ipGeo.provider ? 'ip' : 'none')));
        
        if (id <= 10 || Math.random() < 0.05) { // Log first 10 and sample 5% of others
          console.log(`[enrichment-debug] INACTIVE validator ID ${id}: ${displayName}`);
          console.log(`  Sources available: epoch=${!!epochEntry}, geo=${!!geo}, meta=${!!meta}`);
          console.log(`  Mapped geo: country=${mappedGeo?.country}, city=${mappedGeo?.city}, provider=${mappedGeo?.provider}`);
          console.log(`  Extracted geo: country=${country_from_extracted}, city=${city_from_extracted}, provider=${provider_from_extracted}`);
          console.log(`  IP lookup performed: ${needsIp}, result: country=${ipGeo.country}, city=${ipGeo.city}, provider=${ipGeo.provider}`);
          console.log(`  Final values: country=${country} (src:${countrySrc}), city=${city} (src:${citySrc}), provider=${provider} (src:${providerSrc})`);
          console.log(`  Has any metadata: ${hasMetadataAtAll}`);
          if (meta) {
            console.log(`  Meta entry keys: ${Object.keys(meta).slice(0, 10).join(', ')}`);
          }
          if (geo) {
            console.log(`  Geo entry keys: ${Object.keys(geo).slice(0, 10).join(', ')}`);
          }
        }
      }

      return {
        id,
        nodeId: nodeIdForGitHub,
        secp,
        bls,
        country,
        city,
        provider,
        merged,
        isActive: isActiveValidator,
      };
    })
  );

  const baseRows = dedupeById(baseRowsRaw).filter((r) => r.id !== 0);
  
  if (process.env.NODE_ENV === 'development') {
    const activeCount = baseRows.filter((r) => (r as any).isActive).length;
    const inactiveCount = baseRows.length - activeCount;
    console.log(`[snapshot-debug] === FINAL COUNTS AFTER DEDUP AND ID FILTER ===`);
    console.log(`[snapshot-debug] Total: ${baseRows.length}`);
    console.log(`[snapshot-debug] Active: ${activeCount}`);
    console.log(`[snapshot-debug] Inactive: ${inactiveCount}`);
    
    // Show breakdown of inactive validators by source
    const inactiveRows = baseRows.filter((r) => !(r as any).isActive);
    const inactiveInEpoch = inactiveRows.filter((r) => inactiveIds.has(r.id));
    const inactiveNotInEpoch = inactiveRows.filter((r) => !epochIds.has(r.id));
    
    console.log(`[snapshot-debug] Inactive validators:`);
    console.log(`  - From epoch (marked inactive): ${inactiveInEpoch.length}`);
    console.log(`  - From geo/meta (not in epoch): ${inactiveNotInEpoch.length}`);
    
    // Check which inactive validators have metadata
    const inactiveWithoutMetadata = inactiveRows.filter((r: any) => !r.country && !r.city && !r.provider);
    const inactiveWithMetadata = inactiveRows.filter((r: any) => !!(r.country || r.city || r.provider));
    
    console.log(`[snapshot-debug] Inactive metadata status:`);
    console.log(`  - With metadata: ${inactiveWithMetadata.length}`);
    console.log(`  - WITHOUT metadata: ${inactiveWithoutMetadata.length}`);
    
    if (inactiveWithoutMetadata.length > 0 && inactiveWithoutMetadata.length <= 20) {
      console.log(`[snapshot-debug] Inactive validators WITHOUT metadata:`);
      inactiveWithoutMetadata.slice(0, 10).forEach((r: any) => {
        const inEpoch = epochIds.has(r.id) ? 'IN_EPOCH' : 'geo/meta-only';
        const hasMeta = byKeyMeta.has(r.id) ? 'meta-available' : 'meta-missing';
        const hasGeo = byKeyGeo.has(r.id) ? 'geo-available' : 'geo-missing';
        const moniker = safeStr(r.merged?.moniker) ?? 'N/A';
        console.log(`    ID ${r.id} [${inEpoch}] ${hasMeta} ${hasGeo}: ${moniker}`);
      });
    }
    
    if (inactiveWithMetadata.length > 0 && inactiveWithMetadata.length <= 20) {
      console.log(`[snapshot-debug] First inactive validators WITH metadata (should work):`);
      inactiveWithMetadata.slice(0, 5).forEach((r: any) => {
        const inEpoch = epochIds.has(r.id) ? 'IN_EPOCH' : 'geo/meta-only';
        const moniker = safeStr(r.merged?.moniker) ?? 'N/A';
        console.log(`    ID ${r.id} [${inEpoch}] ${r.country} / ${r.city} / ${r.provider}: ${moniker}`);
      });
    }
    
    if (inactiveRows.length > 0 && inactiveRows.length <= 50) {
      console.log(`[snapshot-debug] First 10 inactive validators:`);
      inactiveRows.slice(0, 10).forEach((r: any) => {
        const inEpoch = epochIds.has(r.id) ? 'EPOCH' : 'GEO/META';
        const vstatus = inactiveIds.has(r.id) ? '(marked inactive in epoch)' : '(not in epoch)';
        const moniker = safeStr(r.merged?.moniker) ?? 'N/A';
        console.log(`    ID ${r.id} [${inEpoch}] ${vstatus}: ${moniker}`);
      });
    }
  }

  // Register any new validators discovered in this snapshot to the persistent registry
  const newValidatorsForRegistry = baseRows
    .filter((r: any) => r.secp && !getValidatorMetadata(network, r.secp))
    .map((r: any) => ({
      secp: r.secp,
      name: safeStr(r.merged?.name),
      website: safeStr(r.merged?.website),
    }));
  
  if (newValidatorsForRegistry.length > 0) {
    registerNewValidators(network, newValidatorsForRegistry);
    if (process.env.NODE_ENV === 'development') {
      console.log(`[registry] Registered ${newValidatorsForRegistry.length} new validators`);
    }
  }

  const t2 = Date.now();
  if (process.env.NODE_ENV === 'development') {
    console.log(`[snapshot] baseRows + IP geo: ${t2 - t1}ms`);
  }

  const counts = buildCounts(baseRows);

  // GitHub enrichment: fetch validator-info including country/city/provider for all validators
  // Results are cached 24h per validator, so performance impact is minimal after first load.
  // This is essential for inactive validators which don't have geo data from gmonads.
  const useGitHubEnrichment = true; // Always enabled for complete metadata enrichment

  const enriched: EnrichedValidator[] = useGitHubEnrichment
    ? await Promise.all(
        baseRows.map(async (row) => {
          const gh = row.nodeId ? await getCachedValidatorInfo(network, row.nodeId) : null;
          return buildEnrichedRow(row as any, counts, gh);
        })
      )
    : baseRows.map((row) => buildEnrichedRow(row as any, counts, null));

  const t3 = Date.now();
  if (process.env.NODE_ENV === 'development') {
    console.log(`[snapshot] enrichment: ${t3 - t2}ms${useGitHubEnrichment ? ' (with GitHub)' : ' (gmonads only)'}`);
  }

  enriched.sort((a, b) => b.scores.total - a.scores.total);

  const activeCount = enriched.filter((v) => v.status === 'active').length;
  const generatedAt = new Date().toISOString();
  if (process.env.NODE_ENV === 'development') {
    console.log(`[snapshot] total: ${Date.now() - t0}ms - Final: ${enriched.length} validators (${activeCount} active)`);
  }

  // Persist geo data from active validators to registry
  // This ensures inactive validators can fall back to last-known location/provider
  const isRealValue = (val?: string): boolean =>
    !!val && typeof val === 'string' && val !== 'Unknown' && val !== 'No data';

  const geoUpdates = enriched
    .filter((v): v is EnrichedValidator & { secp: string } => v.status === 'active' && !!v.secp && typeof v.secp === 'string')
    .map((v) => ({
      secp: v.secp,
      country: isRealValue(v.country) ? v.country : undefined,
      city: isRealValue(v.city) ? v.city : undefined,
      provider: isRealValue(v.provider) ? v.provider : undefined,
      lastSeenAt: generatedAt,
    }))
    .filter((u) => u.country || u.city || u.provider);

  if (geoUpdates.length > 0) {
    updateValidatorGeoData(network, geoUpdates);
    if (process.env.NODE_ENV === 'development') {
      console.log(`[registry] Persisted geo data for ${geoUpdates.length} active validators`);
    }
  }

  return {
    network,
    generatedAt,
    counts: {
      total: enriched.length,
      active: activeCount,
      byCountry: counts.byCountry,
      byCity: counts.byCity,
      byProvider: counts.byProvider,
    },
    validators: enriched,
  };
}

const SNAPSHOT_CACHE_SECONDS = 600;

const getCachedTestnetSnapshot = unstable_cache(
  async () => computeSnapshot('testnet'),
  ['snapshot-testnet'],
  { revalidate: SNAPSHOT_CACHE_SECONDS }
);

const getCachedMainnetSnapshot = unstable_cache(
  async () => computeSnapshot('mainnet'),
  ['snapshot-mainnet'],
  { revalidate: SNAPSHOT_CACHE_SECONDS }
);

export function getCachedSnapshot(network: Network): Promise<Snapshot> {
  return network === 'mainnet' ? getCachedMainnetSnapshot() : getCachedTestnetSnapshot();
}