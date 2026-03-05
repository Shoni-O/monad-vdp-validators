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

async function tryFetchValidatorInfoFromGitHub(network: Network, nodeId?: string) {
  const nid = safeStr(nodeId);
  if (!nid) return null;

  // repo uses filenames as node_id.json
  const rawUrl = `https://raw.githubusercontent.com/monad-developers/validator-info/main/${network}/${nid}.json`;
  const res = await fetch(rawUrl, { next: { revalidate: 3600 } });
  if (!res.ok) return null;
  return res.json();
}

function safeStr(v: any): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  return s.length ? s : undefined;
}

function normalizeProvider(v?: string) {
  if (!v) return undefined;
  // "AS12345 Hetzner Online GmbH" -> "Hetzner Online GmbH"
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
  // якщо немає secp, пробуємо хоч якийсь стабільний ключ для пошуку/посилань
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
  // якщо поле є
  const t = String(v?.validator_set_type ?? '').toLowerCase();
  if (t) return t === 'active';
  // якщо поля нема, не чіпаємо, але зазвичай воно є
  return true;
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

  // Мапи по універсальному numeric key (id/val_index)
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

  // кеш по IP, щоб не робити дублікати
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

  // 1) беремо тільки active (щоб цифри збігались з очікуванням)
  const activeEpoch = epochData.filter(isActive);

  // 2) збираємо baseRows асинхронно, щоб мати fallback geo/provider по IP
  const baseRows = await Promise.all(
    activeEpoch.map(async (v: any) => {
      const key = getNumericId(v);
      if (typeof key !== 'number') {
        // якщо раптом немає ключа, все одно повернемо щось стабільне
        const mergedOnly = { ...v };
        const ip0 = pickIp(mergedOnly);
        const ipGeo0 = await geoFromIp(ip0);

        const nodeId0 = safeStr(mergedOnly?.node_id);
        const secp0 = normalizeSecp(mergedOnly) ?? safeStr(mergedOnly?.auth_address);
        const bls0 = safeStr(mergedOnly?.bls);

        return {
          id: 0,
          nodeId: nodeId0,
          secp: secp0,
          bls: bls0,
          country: ipGeo0.country,
          city: ipGeo0.city,
          provider: ipGeo0.provider,
          merged: mergedOnly,
        };
      }

      const geo = byKeyGeo.get(key);
      const meta = byKeyMeta.get(key);

      // merged тільки з gmonads джерел (не домішуємо github!)
      const merged = { ...v, ...meta, ...geo };

      const extracted = extractGeo(merged);

      // fallback по IP тільки якщо поля не прийшли з gmonads
      const ip = pickIp(merged);
      const ipGeo = (!extracted.country || !extracted.city || !extracted.provider) ? await geoFromIp(ip) : {};

      const country = extracted.country ?? ipGeo.country;
      const city = extracted.city ?? ipGeo.city;
      const provider = extracted.provider ?? ipGeo.provider;

      const nodeId = safeStr(merged?.node_id) ?? safeStr((v as any)?.node_id);

      const secp =
        normalizeSecp(merged) ??
        safeStr(merged?.auth_address) ??
        undefined;

      const bls = safeStr(merged?.bls) ?? safeStr((v as any)?.bls);

      return {
        id: key,
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

      // для UI: якщо secp нема, хай під ніком можна показати node_id через raw.gmonads.node_id
      // (але у тип EnrichedValidator ми зайвих полів не додаємо)
      const fallbackKey = makeFallbackKey(row.merged, row.id);

      return {
        id: row.id,
        secp: row.secp ?? fallbackKey, // щоб у тебе не було “пусто” під ніком, якщо фронт показує secp
        bls: row.bls,

        displayName,
        website: safeStr(gh?.website) ?? safeStr(row.merged?.website),
        description: safeStr(gh?.description) ?? safeStr(row.merged?.description),
        logo: safeStr(gh?.logo) ?? safeStr(row.merged?.logo),
        x: safeStr(gh?.x) ?? safeStr(row.merged?.x),

        country: row.country,
        city: row.city,
        provider: row.provider,

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