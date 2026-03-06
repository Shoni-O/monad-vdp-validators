'use client';

type Network = 'mainnet' | 'testnet';

export default function NetworkSwitch({
  active,
  mainnetUrl,
  testnetUrl,
}: {
  active: Network;
  mainnetUrl: string;
  testnetUrl: string;
}) {
  const Link = ({
    network,
    url,
    label,
  }: {
    network: Network;
    url: string;
    label: string;
  }) => {
    const isActive = active === network;
    return (
      <a
        href={url}
        className={`flex items-center gap-2 rounded-lg border-2 px-4 py-2.5 text-sm font-medium transition-colors ${
          isActive
            ? 'border-purple-400 bg-purple-100 text-purple-900 shadow-sm dark:border-purple-600 dark:bg-purple-900 dark:text-purple-100'
            : 'border-purple-200 bg-white text-purple-700 hover:border-purple-300 hover:bg-purple-50 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-300 dark:hover:border-purple-700 dark:hover:bg-purple-900'
        }`}
      >
        {isActive && (
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500 dark:bg-emerald-400"
            aria-hidden
          />
        )}
        {label}
      </a>
    );
  };

  return (
    <div className="flex gap-2">
      <Link network="mainnet" url={mainnetUrl} label="Mainnet" />
      <Link network="testnet" url={testnetUrl} label="Testnet" />
    </div>
  );
}
