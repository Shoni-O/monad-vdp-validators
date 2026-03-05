// app/page.tsx

import type { Snapshot, Network } from '@/lib/types';
import { headers } from 'next/headers';
import { computeSnapshot } from '@/lib/getSnapshot';

export const dynamic = 'force-dynamic';

function getNetworkFromHost(host?: string | null): Network {
  const h = (host ?? '').toLowerCase();

  if (h.startsWith('monad-validators-testnet.')) return 'testnet';
  if (h.startsWith('monad-validators.')) return 'mainnet';

  return 'testnet'; // fallback
}

function topEntries(map: Record<string, number>, limit = 10) {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

export default async function Page({
  searchParams,
}: {
  searchParams: { q?: string; country?: string; provider?: string };
}) {
  let snapshot: Snapshot | null = null;
  let error: string | null = null;
  let network: Network = 'testnet';

  try {
    // headers() тепер async → await його
    const headersList = await headers();
    const host = headersList.get('host');

    network = getNetworkFromHost(host);

    snapshot = await computeSnapshot(network);
  } catch (err) {
    console.error('Error computing snapshot:', err);
    error = err instanceof Error ? err.message : 'Unknown error';
  }

  const mainnetUrl = 'https://monad-validators.block-pro.net/';
  const testnetUrl = 'https://monad-validators-testnet.block-pro.net/';

  // Якщо помилка — показуємо екран помилки
  if (error || !snapshot) {
    return (
      <main className="max-w-6xl mx-auto p-6 text-center">
        <h1 className="text-3xl font-bold text-red-600 mb-4">Something went wrong</h1>
        <p className="text-lg mb-6">
          Failed to load validator data for <strong>{network}</strong>.
        </p>
        <p className="text-sm text-gray-600 mb-4">
          {error || 'Please check server logs or try again later.'}
        </p>
        <div className="flex justify-center gap-4">
          <a href={mainnetUrl} className="underline text-blue-600">Mainnet</a>
          <a href={testnetUrl} className="underline text-blue-600">Testnet</a>
        </div>
      </main>
    );
  }

  const q = (searchParams.q ?? '').toLowerCase().trim();
  const countryFilter = (searchParams.country ?? '').trim();
  const providerFilter = (searchParams.provider ?? '').trim();

  // Покращена фільтрація
  const filtered = snapshot.validators.filter((v) => {
    const matchesSearch =
      !q ||
      v.displayName.toLowerCase().includes(q) ||
      (v.secp ?? '').toLowerCase().includes(q) ||
      (v.id.toString().includes(q));

    const matchesCountry =
      !countryFilter ||
      (v.country ?? 'Unknown').trim() === countryFilter.trim();

    const matchesProvider =
      !providerFilter ||
      (v.provider ?? 'Unknown').trim() === providerFilter.trim();

    return matchesSearch && matchesCountry && matchesProvider;
  });

  // Повний список для селектів
  const countries = Object.keys(snapshot.counts.byCountry).sort();
  const providers = Object.keys(snapshot.counts.byProvider).sort();

  const topCountries = topEntries(snapshot.counts.byCountry, 8);
  const topProviders = topEntries(snapshot.counts.byProvider, 8);

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Monad Validator Diversity Map</h1>
        <p className="text-sm opacity-80">
          Network: <b>{network}</b> | Validators: <b>{snapshot.counts.total}</b> | Updated:{' '}
          <b>{new Date(snapshot.generatedAt).toLocaleString()}</b>
        </p>
      </header>

      <section className="flex flex-wrap gap-3 items-end">
        <form className="flex flex-wrap gap-3 items-end" action="/" method="get">
          <label className="flex flex-col text-sm gap-1">
            Search
            <input
              name="q"
              defaultValue={searchParams.q ?? ''}
              className="border rounded px-2 py-1"
              placeholder="name or secp"
            />
          </label>

          <label className="flex flex-col text-sm gap-1">
            Country
            <select name="country" defaultValue={countryFilter} className="border rounded px-2 py-1">
              <option value="">All</option>
              {countries.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col text-sm gap-1">
            Provider
            <select name="provider" defaultValue={providerFilter} className="border rounded px-2 py-1">
              <option value="">All</option>
              {providers.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>

          <button className="border rounded px-3 py-2 text-sm">Apply</button>
        </form>

        <div className="flex gap-2 items-center">
          <a
            className={`border rounded px-3 py-2 text-sm ${network === 'mainnet' ? 'font-semibold' : ''}`}
            href={mainnetUrl}
          >
            mainnet
          </a>
          <a
            className={`border rounded px-3 py-2 text-sm ${network === 'testnet' ? 'font-semibold' : ''}`}
            href={testnetUrl}
          >
            testnet
          </a>
        </div>
      </section>

      <section className="grid md:grid-cols-2 gap-4">
        <div className="border rounded p-4">
          <h2 className="font-semibold mb-2">Top Countries</h2>
          <ul className="text-sm space-y-1">
            {topCountries.map(([k, v]) => (
              <li key={k} className="flex justify-between">
                <span>{k}</span>
                <span>{v}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="border rounded p-4">
          <h2 className="font-semibold mb-2">Top Providers</h2>
          <ul className="text-sm space-y-1">
            {topProviders.map(([k, v]) => (
              <li key={k} className="flex justify-between">
                <span>{k}</span>
                <span>{v}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border rounded overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left">
              <th className="p-3">Validator</th>
              <th className="p-3">Country</th>
              <th className="p-3">City</th>
              <th className="p-3">Provider</th>
              <th className="p-3">Score</th>
              <th className="p-3">Links</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((v) => (
              <tr key={v.id} className="border-t">
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    {v.logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={v.logo} alt="" className="w-6 h-6 rounded" />
                    ) : null}
                    <div className="flex flex-col">
                      <span className="font-medium">{v.displayName}</span>
                      <span className="opacity-70 text-xs">{v.secp ? v.secp : `id ${v.id}`}</span>
                    </div>
                  </div>
                </td>
                <td className="p-3">{v.country ?? 'Unknown'}</td>
                <td className="p-3">{v.city ?? 'Unknown'}</td>
                <td className="p-3">{v.provider ?? 'Unknown'}</td>
                <td className="p-3">
                  <div className="flex flex-col">
                    <span className="font-semibold">{v.scores.total}</span>
                    <span className="text-xs opacity-70">{v.scores.badge}</span>
                  </div>
                </td>
                <td className="p-3">
                  <div className="flex gap-3">
                    {v.website ? (
                      <a className="underline" href={v.website} target="_blank" rel="noreferrer">
                        site
                      </a>
                    ) : null}
                    {v.x ? (
                      <a className="underline" href={v.x} target="_blank" rel="noreferrer">
                        x
                      </a>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}

            {filtered.length === 0 && (
              <tr>
                <td className="p-3 opacity-70 text-center" colSpan={6}>
                  No matching validators found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <footer className="text-xs opacity-70 text-center mt-8">
        Data sources: gmonads public API and monad-developers validator-info.
      </footer>
    </main>
  );
}