export type Network = 'testnet' | 'mainnet';

export type Badge = 'unique' | 'ok' | 'saturated' | 'insufficient-data';

export type Scores = {
  geo: number;
  provider: number;
  total: number;
  badge: Badge;
};

export type GmonadsValidator = {
  id: number;
  secp?: string;
  bls?: string;
  name?: string;
  // Поля можуть відрізнятися, тому тримаємо тип гнучким
  [key: string]: any;
};

export type EnrichedValidator = {
  id: number;
  secp?: string;
  bls?: string;

  displayName: string;
  website?: string;
  description?: string;
  logo?: string;
  x?: string;

  country?: string;
  city?: string;
  provider?: string;

  status: 'active' | 'inactive';
  scores: Scores;

  raw: {
    gmonads: any;
    github?: any;
  };
};

export type Snapshot = {
  network: Network;
  generatedAt: string;
  counts: {
    total: number;
    active: number;
    byCountry: Record<string, number>;
    byCity: Record<string, number>;
    byProvider: Record<string, number>;
  };
  validators: EnrichedValidator[];
};