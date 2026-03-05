// app/api/snapshot/route.ts

import { NextRequest, NextResponse } from 'next/server';
import type { Network, Snapshot } from '@/lib/types';
import { computeSnapshot } from '@/lib/getSnapshot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 300;

export async function GET(req: NextRequest) {
  try {
    // Беремо мережу або з query-параметра, або з хоста (для сумісності з твоїм попереднім кодом)
    const searchParams = req.nextUrl.searchParams;
    let network = (searchParams.get('network')?.toLowerCase().trim() as Network | undefined) || 'testnet';

    // Якщо в query нічого немає — fallback на хост
    if (network !== 'mainnet' && network !== 'testnet') {
      const host = (req.headers.get('host') ?? '').toLowerCase();
      if (host.startsWith('monad-validators-testnet.')) network = 'testnet';
      else if (host.startsWith('monad-validators.')) network = 'mainnet';
      else network = 'testnet';
    }

    // Головний виклик — вся логіка вже в lib/getSnapshot.ts
    const snapshot: Snapshot = await computeSnapshot(network);

    return NextResponse.json(
      { success: true, data: snapshot },
      { status: 200 }
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