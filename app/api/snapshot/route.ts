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

async function fetchJson(url: string) {
  const res = await fetch(url, {
    next: { revalidate: 300 },
    headers: { accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`);
  return res.json();
}

async function tryFetchValidatorInfoFromGitHub(network: Network, secp?: string) {
  if (!secp) return null;
  const rawUrl = `https://raw.githubusercontent.com/monad-developers/validator-info/main/${network}/${secp}.json`;
  const res = await fetch(rawUrl, { next: { revalidate: 3600 } });
  if (!res.ok) return null;
  return res.json();
}

function safeStr(v: any): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  return s.length ? s : undefined;
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

function normalizeProvider(v?: string) {
  if (!v) return undefined;
  // "AS12345 Hetzner Online GmbH" -> "Hetzner Online GmbH"
  return v.replace(/^AS\d+\s+/, '').trim() || undefined;
}

type IpGeo = { country?: string; city?: string; provider?: string };

function pickIp(row: any): string | undefined {
  const ip = safeStr(row?.ip_address) ?? safeStr(row?.ip) ?? safeStr(row?.ipv4);
  return ip;
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

function makeDisplayName(network: Network, merged: any, id: number) {
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

  return `Validator ${id}`;
}

function makeFallbackKey(merged: any, id: number): string | undefined {
  // якщо немає secp, пробуємо хоч якийсь стабільний ключ для пошуку/посилань
  return (
    normalizeSecp(merged) ??
    safeStr(merged?.auth_address) ??
    safeStr(merged?.node_id) ??
    (typeof merged?.val_index === 'number' ? String(merged.val_index) : undefined) ??
    String(id)
  );
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

  const byIdGeo = new Map<number, any>();
  for (const g of geolocData) {
    if (typeof g?.id === 'number') byIdGeo.set(g.id, g);
  }

  const byIdMeta = new Map<number, any>();
  for (const m of metaData) {
    if (typeof m?.id === 'number') byIdMeta.set(m.id, m);
  }

  // кеш по IP, щоб не робити дублікати
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

  // базові рядки робимо async, щоб одразу підставити geo/provider по IP
  const baseRows = await Promise.all(
    epochData.map(async (v) => {
      const geo = byIdGeo.get(v.id);
      const meta = byIdMeta.get(v.id);

      const merged = { ...v, ...meta, ...geo };

      let { country, city, provider } = extractGeo(merged);

      const ip = pickIp(merged);
      if (!country || !city || !provider) {
        const ipGeo = await geoFromIp(ip);
        country = country ?? ipGeo.country;
        city = city ?? ipGeo.city;
        provider = provider ?? ipGeo.provider;
      }

      const secp = normalizeSecp(merged);
      const fallbackKey = makeFallbackKey(merged, v.id);

      return {
        id: v.id,
        secp,
        bls: safeStr(merged?.bls) ?? v.bls,
        country,
        city,
        provider,
        ip,
        merged,
        fallbackKey,
      };
    })
  );

  const counts = buildCounts(baseRows);

  const enriched: EnrichedValidator[] = await Promise.all(
    baseRows.map(async (row) => {
      // GitHub validator-info працює тільки якщо є справжній secp key
      const gh = await tryFetchValidatorInfoFromGitHub(network, row.secp);

      const displayName =
        safeStr(gh?.name) ?? makeDisplayName(network, row.merged, row.id);

      const scores = scoreValidator({
        country: row.country,
        city: row.city,
        provider: row.provider,
        counts,
      });

      return {
        id: row.id,
        secp: row.secp ?? row.fallbackKey,
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