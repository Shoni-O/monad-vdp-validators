// lib/getSnapshot.ts

import { unstable_cache } from 'next/cache';
import type { Network, Snapshot, GmonadsValidator, EnrichedValidator } from '@/lib/types';
import { buildCounts, scoreValidator } from '@/lib/scoring';
import { normalizeCountry } from '@/lib/countries';

const GITHUB_FETCH_CONCURRENCY = 50;

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

async function tryFetchValidatorInfoFromGitHub(network: Network, nodeId?: string) {
  const nid = safeStr(nodeId);
  if (!nid) return null;

  const rawUrl = `https://raw.githubusercontent.com/monad-developers/validator-info/main/${network}/${nid}.json`;
  const res = await fetch(rawUrl, {
    next: { revalidate: 3600 },
  });

  if (!res.ok) return null;
  return res.json();
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
  if (tRaw === undefined || tRaw === null || tRaw === '') return true;

  const t = String(tRaw).trim().toLowerCase();
  return t === 'active';
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

async function mapWithLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    const chunk = items.slice(i, i + limit);
    const chunkResults = await Promise.all(chunk.map(fn));
    results.push(...chunkResults);
  }
  return results;
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

  const activeEpoch = epochData.filter(isActive);

  const baseRowsRaw = await Promise.all(
    activeEpoch.map(async (v: any) => {
      const key = getNumericId(v);

      const geo = typeof key === 'number' ? byKeyGeo.get(key) : undefined;
      const meta = typeof key === 'number' ? byKeyMeta.get(key) : undefined;

      const merged = { ...v, ...meta, ...geo };
      const extracted = extractGeo(merged);

      const ip = pickIp(merged);
      const needsIp = !extracted.country || !extracted.city || !extracted.provider;
      const ipGeo = needsIp ? await geoFromIp(ip) : {};

      const rawCountry = extracted.country ?? ipGeo.country;
      const country = normalizeCountry(rawCountry);
      const city = extracted.city ?? ipGeo.city;
      const provider = extracted.provider ?? ipGeo.provider;

      const nodeId = safeStr(merged?.node_id) ?? safeStr(v?.node_id);
      const secp = normalizeSecp(merged) ?? safeStr(merged?.auth_address) ?? undefined;
      const bls = safeStr(merged?.bls) ?? safeStr(v?.bls);

      return {
        id: typeof key === "number" ? key : typeof v?.id === "number" ? v.id : 0,
        nodeId,
        secp,
        bls,
        country,
        city,
        provider,
        merged,
      };
    })
  );

  const baseRows = dedupeById(baseRowsRaw).filter((r) => r.id !== 0);
  const t2 = Date.now();
  if (process.env.NODE_ENV === 'development') {
    console.log(`[snapshot] baseRows + IP geo: ${t2 - t1}ms`);
  }

  const counts = buildCounts(baseRows);

  const enriched: EnrichedValidator[] = await mapWithLimit(
    baseRows,
    GITHUB_FETCH_CONCURRENCY,
    async (row) => {
      const gh = await tryFetchValidatorInfoFromGitHub(network, row.nodeId);

      const displayName = safeStr(gh?.name) ?? makeDisplayName(row.merged, row.id);

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
        country: row.country ?? 'Unknown',
        city: row.city ?? 'Unknown',
        provider: row.provider ?? 'Unknown',
        scores,
        raw: {
          gmonads: row.merged,
          github: gh ?? undefined,
        },
      };
    }
  );

  const t3 = Date.now();
  if (process.env.NODE_ENV === 'development') {
    console.log(`[snapshot] GitHub enrichment: ${t3 - t2}ms`);
  }

  enriched.sort((a, b) => b.scores.total - a.scores.total);

  const generatedAt = new Date().toISOString();
  if (process.env.NODE_ENV === 'development') {
    console.log(`[snapshot] total: ${Date.now() - t0}ms`);
  }

  return {
    network,
    generatedAt,
    counts: {
      total: enriched.length,
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