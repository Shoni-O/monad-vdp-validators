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

export function buildCounts(items: Array<{ country?: string; city?: string; provider?: string }>) {
  const byCountry: Record<string, number> = {};
  const byCity: Record<string, number> = {};
  const byProvider: Record<string, number> = {};

  for (const it of items) {
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
}) {
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

  const badge = total >= 80 ? 'unique' : total >= 55 ? 'ok' : 'saturated';

  return {
    geo: Math.round(geoScore),
    provider: Math.round(providerScore),
    total: Math.round(total),
    badge,
  };
}