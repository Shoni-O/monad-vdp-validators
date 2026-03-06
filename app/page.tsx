// app/page.tsx

import type { Snapshot, Network } from '@/lib/types';
import { headers } from 'next/headers';
import { getCachedSnapshot } from '@/lib/getSnapshot';
import ValidatorTable from '@/app/components/ValidatorTable';
import NetworkSwitch from '@/app/components/NetworkSwitch';
import ThemeToggle from '@/app/components/ThemeToggle';
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
        <h1 className="mb-4 text-3xl font-bold text-rose-600 dark:text-rose-400">Something went wrong</h1>
        <p className="mb-6 text-lg dark:text-purple-100">
          Failed to load validator data for <strong>{network}</strong>.
        </p>
        <p className="mb-4 text-sm text-purple-600 dark:text-purple-300">
          {error || 'Please check server logs or try again later.'}
        </p>
        <div className="flex justify-center gap-4">
          <a href={mainnetUrl} className="text-purple-600 underline hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300">
            Mainnet
          </a>
          <a href={testnetUrl} className="text-purple-600 underline hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300">
            Testnet
          </a>
        </div>
      </main>
    );
  }

  const topCountries = topEntries(snapshot.counts.byCountry, 8);
  const topProviders = topEntries(snapshot.counts.byProvider, 8);
  const inactiveCount = snapshot.counts.total - snapshot.counts.active;
  const generatedAt = new Date(snapshot.generatedAt).toLocaleString();

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        <header className="space-y-3 flex-1 min-w-0">
          <h1 className="text-3xl font-bold text-purple-900 dark:text-white">
            Monad Validator Diversity Map
          </h1>
          <p className="text-sm text-purple-700 dark:text-purple-200">
            Network: <b>{network}</b> · Updated: <b>{generatedAt}</b>
          </p>
        </header>
        
        <div className="flex gap-3 items-center flex-shrink-0">
          <NetworkSwitch
            active={network}
            mainnetUrl={mainnetUrl}
            testnetUrl={testnetUrl}
          />
          <ThemeToggle />
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-purple-200 bg-gradient-to-br from-white to-purple-50 p-4 shadow-sm dark:border-purple-700 dark:from-purple-950 dark:to-purple-900">
          <h3 className="text-sm font-bold text-purple-600 dark:text-purple-300 uppercase tracking-wide">Total Validators</h3>
          <p className="mt-2 text-3xl font-bold text-purple-900 dark:text-white">{snapshot.counts.total}</p>
        </div>
        <div className="rounded-lg border border-green-200 bg-gradient-to-br from-white to-green-50 p-4 shadow-sm dark:border-green-700 dark:from-green-950 dark:to-green-900">
          <h3 className="text-sm font-bold text-green-600 dark:text-green-300 uppercase tracking-wide">Active Validators</h3>
          <p className="mt-2 text-3xl font-bold text-green-900 dark:text-green-100">{snapshot.counts.active}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 shadow-sm dark:border-slate-700 dark:from-slate-950 dark:to-slate-900">
          <h3 className="text-sm font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide">Inactive Validators</h3>
          <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-slate-100">{inactiveCount}</p>
        </div>
      </section>

      <ScoreExplanation />

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-purple-200 bg-white p-4 shadow-sm dark:border-purple-700 dark:bg-purple-950">
          <h2 className="mb-3 font-semibold text-purple-900 dark:text-white">Top Countries</h2>
          <ul className="space-y-2 text-sm">
            {topCountries.map(([k, v]) => (
              <li key={k} className="flex justify-between text-purple-800 dark:text-purple-100">
                <span>{k}</span>
                <span className="font-medium text-purple-900 dark:text-white">{v}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-purple-200 bg-white p-4 shadow-sm dark:border-purple-700 dark:bg-purple-950">
          <h2 className="mb-3 font-semibold text-purple-900 dark:text-white">Top Providers</h2>
          <ul className="space-y-2 text-sm">
            {topProviders.map(([k, v]) => (
              <li key={k} className="flex justify-between text-purple-800 dark:text-purple-100">
                <span>{k}</span>
                <span className="font-medium text-purple-900 dark:text-white">{v}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section>
        <ValidatorTable validators={snapshot.validators} />
      </section>

      <footer className="mt-8 text-center text-xs text-purple-600 dark:text-purple-400">
        Data sources: gmonads public API and monad-developers validator-info.
      </footer>
    </main>
  );
}
