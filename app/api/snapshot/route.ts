import { NextRequest } from 'next/server';
import type { Network, Snapshot, GmonadsValidator, EnrichedValidator } from '@/lib/types';
import { buildCounts, scoreValidator } from '@/lib/scoring';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 300;

const GMONADS_BASE = 'https://www.gmonads.com/api/v1/public';

function pickNetwork(req: NextRequest): Network {
  const n = (req.nextUrl.searchParams.get('network') ?? 'testnet').toLowerCase();
  return n === 'mainnet' ? 'mainnet' : 'testnet';
}

async function fetchJson(url: string, revalidateSec: number) {
  const res = await fetch(url, {
    next: { revalidate: revalidateSec },
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

function normalizeProvider(v?: string) {
  if (!v) return undefined;
  return v.replace(/^AS\d+\s+/, '').trim() || undefined;
}

function pickIp(row: any): string | undefined {
  return safeStr(row?.ip_address) ?? safeStr(row?.ip) ?? safeStr(row?.ipv4);
}

function pickNodeId(row: any): string | undefined {
  return safeStr(row?.node_id) ?? safeStr(row?.nodeId);
}

function pickSecp(row: any): string | undefined {
  return (
    safeStr(row?.secp) ??
    safeStr(row?.secp_key) ??
    safeStr(row?.secpKey) ??
    safeStr(row?.secp_pubkey) ??
    safeStr(row?.secpPubkey) ??
    safeStr(row?.auth_address) // інколи у тебе “secp” по факту EVM address — хай буде як fallback ключ для пошуку
  );
}

function extractGeo(meta: any): { country?: string; city?: string; provider?: string } {
  const country =
    safeStr(meta?.country) ??
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

function makeDisplayName(merged: any, fallbackId: number) {
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

  const nodeId = pickNodeId(merged);
  if (nodeId) return `Validator ${nodeId.slice(0, 10)}…`;

  return `Validator #${fallbackId}`;
}

async function tryFetchValidatorInfoFromGitHub(network: Network, nodeId?: string) {
  if (!nodeId) return null;
  const rawUrl = `https://raw.githubusercontent.com/monad-developers/validator-info/main/${network}/${nodeId}.json`;
  const res = await fetch(rawUrl, { next: { revalidate: 3600 } });
  if (!res.ok) return null;
  return res.json();
}

export async function GET(req: NextRequest) {
  const network = pickNetwork(req);

  const [epoch, geolocs, metadata] = await Promise.all([
    fetchJson(`${GMONADS_BASE}/validators/epoch?network=${network}`, 300),
    fetchJson(`${GMONADS_BASE}/validators/geolocations?network=${network}`, 3600),
    fetchJson(`${GMONADS_BASE}/validators/metadata?network=${network}`, 3600),
  ]);

  const epochData = (epoch?.data ?? []) as GmonadsValidator[];
  const geolocData = (geolocs?.data ?? []) as any[];
  const metaData = (metadata?.data ?? []) as any[];

  const byIdGeo = new Map<number, any>();
  for (const g of geolocData) if (typeof g?.id === 'number') byIdGeo.set(g.id, g);

  const byIdMeta = new Map<number, any>();
  for (const m of metaData) if (typeof m?.id === 'number') byIdMeta.set(m.id, m);

  // IPINFO fallback (опційно)
  const ipCache = new Map<string, IpGeo>();
  async function geoFromIp(ip?: string): Promise<IpGeo> {
    if (!ip) return {};
    if (ipCache.has(ip)) return ipCache.get(ip)!;

    const token = process.env.IPINFO_TOKEN;
    if (!token) {
      const empty = {};
      ipCache.set(ip, empty);
      return empty;
    }

    const res = await fetch(`https://ipinfo.io/${ip}?token=${token}`, {
      cache: 'no-store',
      next: { revalidate: 86400 },
    });

    if (!res.ok) {
      const empty = {};
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

  // 1) мердж + 2) фільтр тільки active + 3) dedupe по id (беремо найсвіжіший timestamp)
  type Row = {
    id: number;
    nodeId?: string;
    secp?: string;
    bls?: string;
    country?: string;
    city?: string;
    provider?: string;
    merged: any;
    ts?: number;
  };

  const rowsAll: Row[] = await Promise.all(
    epochData.map(async (v) => {
      const geo = byIdGeo.get(v.id);
      const meta = byIdMeta.get(v.id);
      const merged = { ...v, ...meta, ...geo };

      const nodeId = pickNodeId(merged);
      const secp = pickSecp(merged);
      const bls = safeStr(merged?.bls) ?? safeStr((v as any)?.bls);

      const tsRaw = safeStr(merged?.timestamp);
      const ts = tsRaw ? Date.parse(tsRaw) : undefined;

      let { country, city, provider } = extractGeo(merged);

      // якщо gmonads не дав гео — пробуємо по IP
      if (!country || !city || !provider) {
        const ip = pickIp(merged);
        const ipGeo = await geoFromIp(ip);
        country = country ?? ipGeo.country;
        city = city ?? ipGeo.city;
        provider = provider ?? ipGeo.provider;
      }

      return {
        id: v.id,
        nodeId,
        secp,
        bls,
        country,
        city,
        provider,
        merged,
        ts,
      };
    })
  );

  // тільки active (це має наблизити total до 231/187)
  const rowsActive = rowsAll.filter((r) => safeStr(r.merged?.validator_set_type) === 'active');

  // dedupe by id
  const dedup = new Map<number, Row>();
  for (const r of rowsActive) {
    const prev = dedup.get(r.id);
    if (!prev) {
      dedup.set(r.id, r);
      continue;
    }
    const a = prev.ts ?? -1;
    const b = r.ts ?? -1;
    if (b > a) dedup.set(r.id, r);
  }

  const baseRows = Array.from(dedup.values());

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

      return {
        id: row.id,
        secp: row.secp,
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