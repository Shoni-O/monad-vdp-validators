const BASE = 'https://www.gmonads.com/api/v1/public';

function getNumericId(x) {
  if (typeof x?.id === 'number') return x.id;
  if (typeof x?.val_index === 'number') return x.val_index;
  if (typeof x?.id === 'string' && x.id.trim() && Number.isFinite(Number(x.id))) return Number(x.id);
  if (typeof x?.val_index === 'string' && x.val_index.trim() && Number.isFinite(Number(x.val_index))) return Number(x.val_index);
  return undefined;
}

async function debug(network) {
  console.log(`\n=== Debugging ${network} ===`);
  
  const [epochRes, geoRes, metaRes] = await Promise.all([
    fetch(`${BASE}/validators/epoch?network=${network}`),
    fetch(`${BASE}/validators/geolocations?network=${network}`),
    fetch(`${BASE}/validators/metadata?network=${network}`),
  ]);
  
  const epochData = (await epochRes.json()).data || [];
  const geoData = (await geoRes.json()).data || [];
  const metaData = (await metaRes.json()).data || [];
  
  console.log(`Total in epoch: ${epochData.length}`);
  console.log(`Total in geo: ${geoData.length}`);
  console.log(`Total in meta: ${metaData.length}`);
  // Analyze validator_set_type
  const typeDistribution = {};
  const samples = {};
  
  epochData.forEach((v) => {
    const type = v.validator_set_type ?? '(missing)';
    typeDistribution[type] = (typeDistribution[type] || 0) + 1;
    
    if (!samples[type]) {
      samples[type] = {
        id: v.id,
        validator_set_type: v.validator_set_type,
        moniker: v.moniker,
        node_id: v.node_id,
      };
    }
  });
  
  console.log(`\nvalidator_set_type distribution in epoch:`);
  Object.entries(typeDistribution).forEach(([type, count]) => {
    console.log(`  "${type}": ${count}`);
  });
  
  // Build allIDs like the app does
  const epochIds = new Set();
  epochData.forEach((v) => {
    const k = getNumericId(v);
    if (typeof k === 'number') epochIds.add(k);
  });
  
  const geoIds = new Set();
  geoData.forEach((g) => {
    const k = getNumericId(g);
    if (typeof k === 'number') geoIds.add(k);
  });
  
  const metaIds = new Set();
  metaData.forEach((m) => {
    const k = getNumericId(m);
    if (typeof k === 'number') metaIds.add(k);
  });
  
  const allIds = new Set([...epochIds, ...geoIds, ...metaIds]);
  
  console.log(`\nUnique IDs:`);
  console.log(`  From epoch: ${epochIds.size}`);
  console.log(`  From geo: ${geoIds.size}`);
  console.log(`  From meta: ${metaIds.size}`);
  console.log(`  Total unique (allIds): ${allIds.size}`);
}

await debug('mainnet');
await debug('testnet');
