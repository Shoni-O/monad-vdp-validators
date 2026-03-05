// lib/getSnapshot.ts  (або де тобі зручно)
import type { Network, Snapshot } from '@/lib/types';
// сюди скопіюй весь код з route.ts, який робить snapshot
// тобто все від const network = ... до return { success: true, data: snapshot }

// але зроби це як звичайну async функцію, без NextRequest і Response

export async function computeSnapshot(network: Network): Promise<Snapshot> {
  // тут весь твій код з GET-ендпоінта route.ts
  // ...
  // на кінці:
  return snapshot;  // не Response.json, просто об'єкт
}