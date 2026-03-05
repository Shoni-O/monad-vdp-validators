import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function mustBeCron(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;

  const header = req.headers.get('x-cron-secret');
  return header === secret;
}

async function warm(network: 'testnet' | 'mainnet') {
  const url = `${process.env.https://monad-validators.block-pro.net}/api/snapshot?network=${network}`;
  await fetch(url, { method: 'GET' });
}

export async function GET(req: NextRequest) {
  if (!mustBeCron(req)) {
    return Response.json({ success: false, error: 'unauthorized' }, { status: 401 });
  }

  await Promise.all([warm('testnet'), warm('mainnet')]);
  return Response.json({ success: true, warmed: true });
}