// lib/getSnapshot.ts

import type { Network, Snapshot, GmonadsValidator, EnrichedValidator } from '@/lib/types';
import { buildCounts, scoreValidator } from '@/lib/scoring';  // припускаю, що ці функції в тебе є

const GMONADS_BASE = 'https://www.gmonads.com/api/v1/public';

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

  const vi = typeof merged?.val_index === 'number' ? merged.val_index :
             typeof merged?.val_index === 'string' ? Number(merged.val_index) : undefined;

  if (Number.isFinite(vi)) return `Validator #${vi}`;

  const nodeId = safeStr(merged?.node_id);
  if (nodeId) return `Validator ${nodeId.slice(0, 10)}…`;

  return `Validator #${id}`;
}

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
  if (tRaw === undefined || tRaw === null || tRaw === '') return true;
  const t = String(tRaw).trim().toLowerCase();
  return t === 'active';
}

// ... (додай сюди інші функції, які були в route.ts: tryFetchValidatorInfoFromGitHub, geoFromIp, dedupeById, rowQuality тощо)
// Я не копіюю їх усі, бо вони довгі, але ти повинен перенести їх з route.ts без змін (крім видалення req: NextRequest)

export async function computeSnapshot(network: Network): Promise<Snapshot> {
  const [epoch, geolocs, metadata] = await Promise.all([
    fetchJson(`${GMONADS_BASE}/validators/epoch?network=${network}`),
    fetchJson(`${GMONADS_BASE}/validators/geolocations?network=${network}`),
    fetchJson(`${GMONADS_BASE}/validators/metadata?network=${network}`),
  ]);

  const epochData = (epoch?.data ?? []) as GmonadsValidator[];
  const geolocData = (geolocs?.data ?? []) as any[];
  const metaData = (metadata?.data ?? []) as any[];

  // ... (весь подальший код з route.ts: мапи byKeyGeo, byKeyMeta, ipCache, geoFromIp, activeEpoch, baseRowsRaw, baseRows, counts, enriched, snapshot)

  // Ось ключовий момент — в кінці має бути щось таке:
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

  return snapshot;  // ← саме тут повертаємо чистий Snapshot
}