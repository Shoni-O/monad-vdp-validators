// app/api/snapshot/route.ts

import { NextRequest, NextResponse } from 'next/server';
import type { Network, Snapshot } from '@/lib/types';
import { getCachedSnapshot } from '@/lib/getSnapshot';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    let network = (searchParams.get('network')?.toLowerCase().trim() as Network | undefined) || 'testnet';

    if (network !== 'mainnet' && network !== 'testnet') {
      const host = (req.headers.get('host') ?? '').toLowerCase();
      if (host.startsWith('monad-validators-testnet.')) network = 'testnet';
      else if (host.startsWith('monad-validators.')) network = 'mainnet';
      else network = 'testnet';
    }

    const snapshot: Snapshot = await getCachedSnapshot(network);

    return NextResponse.json(
      { success: true, data: snapshot },
      {
        status: 200,
        headers: {
          'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=300',
        },
      }
    );
  } catch (error) {
    console.error('API /snapshot error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Internal server error',
          code: 500,
        },
      },
      { status: 500 }
    );
  }
}