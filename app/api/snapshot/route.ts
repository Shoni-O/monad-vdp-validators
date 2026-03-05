import { NextRequest } from 'next/server';
import type { Network, Snapshot, GmonadsValidator, EnrichedValidator } from '@/lib/types';
import { buildCounts, scoreValidator } from '@/lib/scoring';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Це керує кешем на рівні route handler в App Router
export const revalidate = 300;

const GMONADS_BASE = 'https://www.gmonads.com/api/v1/public';

function pickNetwork(req: NextRequest): Network {
  const n = (req.nextUrl.searchParams.get('network') ?? 'testnet').toLowerCase();
  return n === 'mainnet' ? 'mainnet' : 'testnet';
}

async function fetchJson(url: string) {
  const res = await fetch(url, {
    // revalidate на рівні fetch, щоб Vercel тримав результат певний час
    next: { revalidate: 300 },
    headers: { 'accept': 'application/json' },
  });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`);
  return res.json();
}

// GitHub enrichment
// Файл має назву <SECP_KEY>.json у папках testnet або mainnet :contentReference[oaicite:6]{index=6}
async function tryFetchValidatorInfoFromGitHub(network: Network, secp?: string) {
  if (!secp) return null;
  const rawUrl = `https://raw.githubusercontent.com/monad-developers/validator-info/main/${network}/${secp}.json`;
  const res = await fetch(rawUrl, { next: { revalidate: 3600 } });
  if (!res.ok) return null;
  return res.json();
}

function extractGeo(meta: any): { country?: string; city?: string; provider?: string } {
  // Тут ми робимо “м’яке” витягування, бо поля можуть називатись по різному.
  // Ти потім під себе підправиш по фактичній відповіді API.
  const country =
    meta?.country ?? meta?.geo?.country ?? meta?.geolocation?.country ?? meta?.location?.country;
  const city =
    meta?.city ?? meta?.geo?.city ?? meta?.geolocation?.city ?? meta?.location?.city;
  const provider =
    meta?.provider ?? meta?.hosting ?? meta?.host ?? meta?.hostingProvider ?? meta?.infrastructure?.provider;

  return { country, city, provider };
}

export async function GET(req: NextRequest) {
  const network = pickNetwork(req);

  // gmonads endpoints описані в їхній документації :contentReference[oaicite:7]{index=7}
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

  const baseRows = epochData.map(v => {
    const geo = byIdGeo.get(v.id);
    const meta = byIdMeta.get(v.id);
    const merged = { ...v, ...meta, ...geo };
    const { country, city, provider } = extractGeo(merged);

    return {
      id: v.id,
      secp: merged.secp ?? v.secp,
      bls: merged.bls ?? v.bls,
      country,
      city,
      provider,
      merged,
    };
  });

  const counts = buildCounts(baseRows);

  // GitHub enrichment паралельно, але обережно
  // Якщо валідаторів дуже багато, краще обмежити, а потім додати кнопку “load more”
  const enriched: EnrichedValidator[] = await Promise.all(
    baseRows.map(async (row) => {
      const gh = await tryFetchValidatorInfoFromGitHub(network, row.secp);

      const displayName =
        gh?.name ??
        row.merged?.name ??
        row.merged?.validator ??
        `Validator ${row.id}`;

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
        website: gh?.website ?? row.merged?.website,
        description: gh?.description ?? row.merged?.description,
        logo: gh?.logo ?? row.merged?.logo,
        x: gh?.x ?? row.merged?.x,

        country: row.country,
        city: row.city,
        provider: row.provider,

        scores,
        raw: { gmonads: row.merged, github: gh ?? undefined },
      };
    })
  );

  // Сортуємо, щоб зверху були найунікальніші
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