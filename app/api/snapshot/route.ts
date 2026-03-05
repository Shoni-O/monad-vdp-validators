import { NextRequest } from 'next/server';
import type { Network, Snapshot, GmonadsValidator, EnrichedValidator } from '@/lib/types';
import { buildCounts, scoreValidator } from '@/lib/scoring';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 300;

const GMONADS_BASE = 'https://www.gmonads.com/api/v1/public';

function pickNetwork(req: NextRequest): Network {
  const host = (req.headers.get('host') ?? '').toLowerCase();

  if (host.startsWith('monad-validators-testnet.')) return 'testnet';
  if (host.startsWith('monad-validators.')) return 'mainnet';

  // fallback для vercel.app / preview
  return 'testnet';
}

async function fetchJson(url: string) {
  const res = await fetch(url, {
    next: { revalidate: 300 },
    headers: { accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`);
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
  const res = await fetch(rawUrl, { next: { revalidate: 3600 } });
  if (!res.ok) return null;
  return res.json();
}

function normalizeProvider(v?: string) {
  if (!v) return undefined;
  return v.replace(/^AS\d+\s+/, '').trim() || undefined;
}

function extractGeo(meta: any): { country?: string; city?: string; provider?: string } {
  const country =
    safeStr(meta?.country) ??
    safeStr(meta?.country_code) ??
    safeStr(meta?.geo?.country) ??
    safeStr(meta?.geolocation?.country) ??
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

  return { country, city, provider: normalizeProvider(providerRaw) };
}

type IpGeo = { country?: string; city?: string; provider?: string };

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

// IMPORTANT: gmonads може мати id або val_index. Ця функція дістає “універсальний” numeric key.
function getNumericId(x: any): number | undefined {
  if (typeof x?.id === 'number') return x.id;
  if (typeof x?.val_index === 'number') return x.val_index;
  if (typeof x?.id === 'string' && x.id.trim() && Number.isFinite(Number(x.id))) return Number(x.id);
  if (typeof x?.val_index === 'string' && x.val_index.trim() && Number.isFinite(Number(x.val_index)))
    return Number(x.val_index);
  return undefined;
}

function isActive(v: any): boolean {
  const tRaw = v?.validator_set_type;
  if (tRaw === undefined || tRaw === null || tRaw === '') return true; // якщо поля нема, не ріжемо
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
  // що більше “важливих” полів заповнено, то краще
  let q = 0;
  if (r.country) q += 3;
  if (r.city) q += 2;
  if (r.provider) q += 2;
  if (r.nodeId) q += 2;
  if (r.secp) q += 1;
  const ts = r.merged?.timestamp ? Date.parse(r.merged.timestamp) : 0;
  if (Number.isFinite(ts) && ts > 0) q += Math.min(3, Math.floor(ts / 1_000_000_000)); // слабкий буст за “свіжість”
  return q;
}

function dedupeById<T extends { id: number }>(rows: T[]) {
  const map = new Map<number, T>();
  for (const r of rows) {
    const prev = map.get(r.id);
    if (!prev) {
      map.set(r.id, r);
      continue;
    }
    // лишаємо запис з кращою якістю
    const keep = rowQuality(r as any) >= rowQuality(prev as any) ? r : prev;
    map.set(r.id, keep);
  }
  return Array.from(map.values());
}

export async function GET(req: NextRequest) {
  const network = pickNetwork(req);

  const [epoch, geolocs, metadata] = await Promise.all([
    fetchJson(`${GMONADS_BASE}/validators/epoch?network=${network}`),
    fetchJson(`${GMONADS_BASE}/validators/geolocations?network=${network}`),
    fetchJson(`${GMONADS_BASE}/validators/metadata?network=${network}`),
  ]);

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

  async function geoFromIp(ip?: string): Promise<IpGeo> {
    if (!ip) return {};
    if (ipCache.has(ip)) return ipCache.get(ip)!;

    const token = safeStr(process.env.IPINFO_TOKEN);
    if (!token) {
      const empty: IpGeo = {};
      ipCache.set(ip, empty);
      return empty;
    }

    const res = await fetch(`https://ipinfo.io/${ip}?token=${token}`, {
      cache: 'no-store',
      next: { revalidate: 86400 },
    });

    if (!res.ok) {
      const empty: IpGeo = {};
      ipCache.set(ip, empty);
      return empty;
    }

    const j = await res.json();

    const out: IpGeo = {
      country: safeStr(j?.country),
      city: safeStr(j?.city),
      provider: normalizeProvider(safeStr(j?.org) ?? safeStr(j?.hostname)),
    };

    ipCache.set(ip, out);
    return out;
  }

  // 1) active
  const activeEpoch = epochData.filter(isActive);

  // 2) baseRows
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

      const country = extracted.country ?? ipGeo.country;
      const city = extracted.city ?? ipGeo.city;
      const provider = extracted.provider ?? ipGeo.provider;

      const nodeId = safeStr(merged?.node_id) ?? safeStr((v as any)?.node_id);

      const secp = normalizeSecp(merged) ?? safeStr(merged?.auth_address) ?? undefined;
      const bls = safeStr(merged?.bls) ?? safeStr((v as any)?.bls);

      return {
        id: typeof key === 'number' ? key : (typeof v?.id === 'number' ? v.id : 0),
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

  // 3) dedupe
  const baseRows = dedupeById(baseRowsRaw).filter(r => r.id !== 0);

  const counts = buildCounts(baseRows);

  const enriched: EnrichedValidator[] = await Promise.all(
    baseRows.map(async (row) => {
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
        raw: { gmonads: row.merged, github: gh ?? undefined },
      };
    })
  );

  enriched.sort((a, b) => b.scores.total - a.scores.total);

  const snapshot: Snapshot = {
    network,
    generatedAt: new Date().toISOString(),
    counts: {
      total: enriched.length,
      byCountry: counts.byCountry,
      byCity: counts.byCity,
      byProvider: counts.byProvider,
    },
    validators: enriched,
  };

  return Response.json({ success: true, data: snapshot });
}