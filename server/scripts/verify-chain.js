// Verifies a device's event hash chain with the service role and prints the latest events.
// Usage (from /server): npm run verify-chain -- <deviceId> [--events 10]
import 'dotenv/config';
import { parseArgs } from 'node:util';
import { supabase } from '../supabase.js';
import { verifyChain } from '../engine/events.js';

const { values, positionals } = parseArgs({ allowPositionals: true, options: { events: { type: 'string', default: '10' } } });
const deviceId = positionals[0];
if (!deviceId) {
  console.error('Usage: npm run verify-chain -- <deviceId> [--events 10]');
  process.exit(1);
}

const { data: rows, error } = await supabase
  .from('events')
  .select('id, type, source, seq, occurred_at, payload, hash')
  .eq('device_id', deviceId)
  .order('id', { ascending: false })
  .limit(Number(values.events));
if (error) {
  console.error(error.message);
  process.exit(1);
}
console.table(rows.reverse().map((r) => ({ ...r, payload: JSON.stringify(r.payload), hash: r.hash.slice(0, 12) })));
console.log('verify:', await verifyChain(deviceId));
