// Creates an unclaimed device and prints its bridge credentials.
// Usage (from /server): npm run create-device [-- --name "Demo Box"]
// Only a hash of DEVICE_SECRET is stored; it can't be recovered later.
import 'dotenv/config';
import { randomBytes, randomInt } from 'node:crypto';
import { parseArgs } from 'node:util';
import { supabase } from '../supabase.js';
import { hashSecret } from '../middleware/deviceAuth.js';

const { values } = parseArgs({ options: { name: { type: 'string', default: 'TSwift' } } });

if (!supabase) {
  console.error('[create-device] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing in server/.env');
  process.exit(1);
}

const secret = randomBytes(32).toString('base64url');
let device;
for (let attempt = 0; attempt < 20 && !device; attempt++) {
  const pairing_code = String(randomInt(1000, 10000)); // no leading zeros: easier to read off a label
  const { data, error } = await supabase
    .from('devices')
    .insert({ name: values.name, pairing_code, secret_hash: hashSecret(secret) })
    .select('id, name, pairing_code')
    .single();
  if (!error) device = data;
  else if (error.code !== '23505') {
    console.error('[create-device] FAILED:', error.message);
    process.exit(1);
  }
}
if (!device) {
  console.error('[create-device] could not find a free pairing code');
  process.exit(1);
}

console.log(`
Created device "${device.name}" (unclaimed, mode care).
Pairing code (print on the box label): ${device.pairing_code}

# bridge/.env
API_URL=http://localhost:3001
DEVICE_ID=${device.id}
DEVICE_SECRET=${secret}
`);
