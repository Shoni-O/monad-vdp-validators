// app/api/warm/route.ts
import { NextResponse } from 'next/server';

async function warm(network: 'testnet' | 'mainnet') {
  const base =
    process.env.PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    'http://localhost:3000';

  const url = `${base}/api/snapshot?network=${network}`;
  await fetch(url, { method: 'GET', cache: 'no-store' });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const secret = searchParams.get('secret') || '';
  const expected = process.env.CRON_SECRET || '';

  if (expected && secret !== expected) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  await Promise.all([warm('testnet'), warm('mainnet')]);

  return NextResponse.json({ ok: true });
}