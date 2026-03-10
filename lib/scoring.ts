import type { Badge, Scores } from './types';

function safeKey(v?: string) {
  const s = (v ?? '').trim();
  return s.length ? s : 'Unknown';
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function logPenalty(count: number) {
  // 1 -> 0
  // 2 -> маленький штраф
  // 10+ -> більший штраф, але не безмежний
  return Math.log(Math.max(1, count));
}

function computeBadge(total: number): Badge {
  if (total >= 80) return 'unique';
  if (total >= 55) return 'ok';
  return 'saturated';
}

/**
 * Check if a validator has actual metadata (at least one real field)
 */
export function hasMetadata(item: { country?: string; city?: string; provider?: string }): boolean {
  return !!(item.country || item.city || item.provider);
}

/**
 * Build counts from validators that have metadata
 * Validators without any metadata are excluded from counts
 */
export function buildCounts(items: Array<{ country?: string; city?: string; provider?: string }>) {
  const byCountry: Record<string, number> = {};
  const byCity: Record<string, number> = {};
  const byProvider: Record<string, number> = {};

  for (const it of items) {
    // Skip validators with no metadata
    if (!hasMetadata(it)) {
      continue;
    }

    const c = safeKey(it.country);
    const city = safeKey(it.city);
    const p = safeKey(it.provider);

    byCountry[c] = (byCountry[c] ?? 0) + 1;
    byCity[city] = (byCity[city] ?? 0) + 1;
    byProvider[p] = (byProvider[p] ?? 0) + 1;
  }

  return { byCountry, byCity, byProvider };
}

export function scoreValidator(params: {
  country?: string;
  city?: string;
  provider?: string;
  counts: {
    byCountry: Record<string, number>;
    byCity: Record<string, number>;
    byProvider: Record<string, number>;
  };
}): Scores {
  // If validator has no metadata, return insufficient-data badge
  if (!hasMetadata(params)) {
    return {
      geo: 0,
      provider: 0,
      total: 0,
      badge: 'insufficient-data',
    };
  }

  const countryKey = safeKey(params.country);
  const cityKey = safeKey(params.city);
  const providerKey = safeKey(params.provider);

  const countryCount = params.counts.byCountry[countryKey] ?? 1;
  const cityCount = params.counts.byCity[cityKey] ?? 1;
  const providerCount = params.counts.byProvider[providerKey] ?? 1;

  const geoPenalty = logPenalty(countryCount) * 14 + logPenalty(cityCount) * 6;
  const providerPenalty = logPenalty(providerCount) * 18;

  const geoScore = clamp(100 - geoPenalty, 0, 100);
  const providerScore = clamp(100 - providerPenalty, 0, 100);

  const total = clamp(geoScore * 0.55 + providerScore * 0.45, 0, 100);

  const roundedTotal = Math.round(total);

  return {
    geo: Math.round(geoScore),
    provider: Math.round(providerScore),
    total: roundedTotal,
    badge: computeBadge(roundedTotal),
  };
}