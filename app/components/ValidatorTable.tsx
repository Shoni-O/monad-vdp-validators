'use client';

import { useState, useMemo } from 'react';
import type { EnrichedValidator } from '@/lib/types';

type SortKey = 'displayName' | 'country' | 'city' | 'provider' | 'total' | 'status';
type SortDir = 'asc' | 'desc';

function Badge({ badge }: { badge: string }) {
  const styles: Record<string, string> = {
    unique: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800',
    ok: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800',
    saturated: 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950 dark:text-rose-200 dark:border-rose-800',
  };
  const cls = styles[badge] ?? 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700';
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium capitalize ${cls}`}
    >
      {badge}
    </span>
  );
}

function StatusBadge({ status }: { status: 'active' | 'inactive' }) {
  const isActive = status === 'active';
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${
        isActive
          ? 'bg-green-100 text-green-800 border-green-200 dark:bg-green-950 dark:text-green-200 dark:border-green-800'
          : 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-900 dark:text-gray-300 dark:border-gray-700'
      }`}
    >
      {isActive ? 'Active' : 'Inactive'}
    </span>
  );
}

function SortHeader({
  label,
  sortKey,
  currentKey,
  dir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey | null;
  dir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const active = currentKey === sortKey;
  const arrow = active ? (dir === 'asc' ? ' ↑' : ' ↓') : '';
  return (
    <th
      className="cursor-pointer select-none p-3 text-left transition-colors hover:bg-purple-100 dark:hover:bg-purple-900"
      onClick={() => onSort(sortKey)}
      role="columnheader"
    >
      {label}{arrow}
    </th>
  );
}

export default function ValidatorTable({ validators }: { validators: EnrichedValidator[] }) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [focused, setFocused] = useState(false);

  const searchLower = search.trim().toLowerCase();
  const suggestions = useMemo(() => {
    if (!searchLower || searchLower.length < 1) return [];
    const matches = validators.filter((v) =>
      v.displayName.toLowerCase().includes(searchLower)
    );
    return matches.slice(0, 5);
  }, [validators, searchLower]);

  const filtered = useMemo(() => {
    if (!searchLower) return validators;
    return validators.filter((v) =>
      v.displayName.toLowerCase().includes(searchLower)
    );
  }, [validators, searchLower]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    if (!sortKey) return list;
    list.sort((a, b) => {
      let aVal: any = '';
      let bVal: any = '';

      if (sortKey === 'total') {
        aVal = a.scores.total;
        bVal = b.scores.total;
      } else if (sortKey === 'status') {
        aVal = a.status;
        bVal = b.status;
      } else {
        aVal = a[sortKey] ?? '';
        bVal = b[sortKey] ?? '';
      }

      const cmp =
        typeof aVal === 'number' && typeof bVal === 'number'
          ? aVal - bVal
          : String(aVal).localeCompare(String(bVal), undefined, { sensitivity: 'base' });
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [filtered, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <label htmlFor="validator-search" className="sr-only">
          Search by validator moniker
        </label>
        <input
          id="validator-search"
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder="Search by validator moniker..."
          className="w-full rounded-lg border border-purple-300 bg-white px-4 py-2.5 text-sm placeholder:text-purple-400 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-100 dark:placeholder:text-purple-500 dark:focus:border-purple-600 dark:focus:ring-purple-800"
          autoComplete="off"
        />
        {focused && suggestions.length > 0 && (
          <ul
            className="absolute z-10 mt-1 w-full rounded-lg border border-purple-200 bg-white py-1 shadow-lg dark:border-purple-800 dark:bg-purple-950"
            role="listbox"
          >
            {suggestions.map((v) => (
              <li
                key={v.id}
                role="option"
                className="cursor-pointer px-4 py-2 text-sm hover:bg-purple-50 dark:hover:bg-purple-900 dark:text-purple-100"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setSearch(v.displayName);
                }}
              >
                {v.displayName}
              </li>
            ))}
          </ul>
        )}
      </div>

      <section className="overflow-x-auto rounded-lg border border-purple-200 bg-white shadow-sm dark:border-purple-800 dark:bg-purple-950">
        <table className="min-w-full text-sm">
          <thead className="bg-purple-100 dark:bg-purple-900">
            <tr className="text-left">
              <SortHeader
                label="Validator"
                sortKey="displayName"
                currentKey={sortKey}
                dir={sortDir}
                onSort={handleSort}
              />
              <SortHeader
                label="Status"
                sortKey="status"
                currentKey={sortKey}
                dir={sortDir}
                onSort={handleSort}
              />
              <SortHeader
                label="Country"
                sortKey="country"
                currentKey={sortKey}
                dir={sortDir}
                onSort={handleSort}
              />
              <SortHeader
                label="City"
                sortKey="city"
                currentKey={sortKey}
                dir={sortDir}
                onSort={handleSort}
              />
              <SortHeader
                label="Provider"
                sortKey="provider"
                currentKey={sortKey}
                dir={sortDir}
                onSort={handleSort}
              />
              <SortHeader
                label="Score"
                sortKey="total"
                currentKey={sortKey}
                dir={sortDir}
                onSort={handleSort}
              />
              <th className="p-3 dark:text-purple-100">Links</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((v) => (
              <tr key={v.id} className="border-t border-purple-100 transition-colors hover:bg-purple-50/70 dark:border-purple-900 dark:hover:bg-purple-900/50 dark:text-purple-100">
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    {v.logo ? (
                      <img src={v.logo} alt="" className="h-6 w-6 rounded" />
                    ) : null}
                    <div className="flex flex-col">
                      <span className="font-medium text-purple-900 dark:text-purple-100">{v.displayName}</span>
                      <span className="text-xs text-purple-600/70 dark:text-purple-400/70">
                        {v.secp ?? `id ${v.id}`}
                      </span>
                    </div>
                  </div>
                </td>
                <td className="p-3">
                  <StatusBadge status={v.status} />
                </td>
                <td className="p-3 text-purple-800 dark:text-purple-200">{v.country ?? 'Unknown'}</td>
                <td className="p-3 text-purple-800 dark:text-purple-200">{v.city ?? 'Unknown'}</td>
                <td className="p-3 text-purple-800 dark:text-purple-200">{v.provider ?? 'Unknown'}</td>
                <td className="p-3">
                  <div className="flex flex-col gap-1">
                    <span className="font-semibold text-purple-900 dark:text-purple-100">{v.scores.total}</span>
                    <Badge badge={v.scores.badge} />
                  </div>
                </td>
                <td className="p-3">
                  <div className="flex gap-3">
                    {v.website ? (
                      <a
                        className="text-purple-600 underline hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300"
                        href={v.website}
                        target="_blank"
                        rel="noreferrer"
                      >
                        site
                      </a>
                    ) : null}
                    {v.x ? (
                      <a
                        className="text-purple-600 underline hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300"
                        href={v.x}
                        target="_blank"
                        rel="noreferrer"
                      >
                        x
                      </a>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td className="p-6 text-center text-purple-600/70 dark:text-purple-400/70" colSpan={7}>
                  No validators found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
