// app/page.tsx

import type { Snapshot, Network } from '@/lib/types';
import { headers } from 'next/headers';
import { getCachedSnapshot } from '@/lib/getSnapshot';
import ValidatorTable from '@/app/components/ValidatorTable';
import NetworkSwitch from '@/app/components/NetworkSwitch';
import ScoreExplanation from '@/app/components/ScoreExplanation';

export const dynamic = 'force-dynamic';

function getNetworkFromHost(host?: string | null): Network {
  const h = (host ?? '').toLowerCase();
  if (h.startsWith('monad-validators-testnet.')) return 'testnet';
  if (h.startsWith('monad-validators.')) return 'mainnet';
  return 'testnet';
}

function topEntries(map: Record<string, number>, limit = 10) {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

export default async function Page() {
  let snapshot: Snapshot | null = null;
  let error: string | null = null;
  let network: Network = 'testnet';

  try {
    const headersList = await headers();
    const host = headersList.get('host');
    network = getNetworkFromHost(host);
    snapshot = await getCachedSnapshot(network);
  } catch (err) {
    console.error('Error computing snapshot:', err);
    error = err instanceof Error ? err.message : 'Unknown error';
  }

  const mainnetUrl = 'https://monad-validators.block-pro.net/';
  const testnetUrl = 'https://monad-validators-testnet.block-pro.net/';

  if (error || !snapshot) {
    return (
      <main className="mx-auto max-w-6xl p-6 text-center">
        <h1 className="mb-4 text-3xl font-bold text-rose-600">Something went wrong</h1>
        <p className="mb-6 text-lg">
          Failed to load validator data for <strong>{network}</strong>.
        </p>
        <p className="mb-4 text-sm text-purple-600">
          {error || 'Please check server logs or try again later.'}
        </p>
        <div className="flex justify-center gap-4">
          <a href={mainnetUrl} className="text-purple-600 underline hover:text-purple-800">
            Mainnet
          </a>
          <a href={testnetUrl} className="text-purple-600 underline hover:text-purple-800">
            Testnet
          </a>
        </div>
      </main>
    );
  }

  const topCountries = topEntries(snapshot.counts.byCountry, 8);
  const topProviders = topEntries(snapshot.counts.byProvider, 8);
  const generatedAt = new Date(snapshot.generatedAt).toLocaleString();

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-purple-900">
          Monad Validator Diversity Map
        </h1>
        <p className="text-sm text-purple-700">
          Network: <b>{network}</b> · Validators: <b>{snapshot.counts.total}</b> · Updated:{' '}
          <b>{generatedAt}</b>
        </p>
      </header>

      <section className="flex justify-end">
        <NetworkSwitch
          active={network}
          mainnetUrl={mainnetUrl}
          testnetUrl={testnetUrl}
        />
      </section>

      <ScoreExplanation />

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border-2 border-purple-200 bg-white p-4 shadow-sm">
          <h2 className="mb-2 font-semibold text-purple-900">Top Countries</h2>
          <ul className="space-y-1 text-sm text-purple-800">
            {topCountries.map(([k, v]) => (
              <li key={k} className="flex justify-between">
                <span>{k}</span>
                <span>{v}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border-2 border-purple-200 bg-white p-4 shadow-sm">
          <h2 className="mb-2 font-semibold text-purple-900">Top Providers</h2>
          <ul className="space-y-1 text-sm text-purple-800">
            {topProviders.map(([k, v]) => (
              <li key={k} className="flex justify-between">
                <span>{k}</span>
                <span>{v}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section>
        <ValidatorTable validators={snapshot.validators} />
      </section>

      <footer className="mt-8 text-center text-xs text-purple-600">
        Data sources: gmonads public API and monad-developers validator-info.
      </footer>
    </main>
  );
}
