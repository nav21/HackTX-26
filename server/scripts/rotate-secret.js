// Gives an existing device a new bridge secret and prints its credentials (e.g. to run the one
// physical board as a device you already claimed). The old secret stops working.
// Usage (from /server): npm run device:rotate-secret -- --device <id>
//                       npm run device:rotate-secret -- --name "Grandma's pillbox" --owner you@example.com
// Only a hash of DEVICE_SECRET is stored; it can't be recovered later.
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { supabase } from '../supabase.js';
import { hashSecret } from '../middleware/deviceAuth.js';

const { values } = parseArgs({ options: { device: { type: 'string' }, name: { type: 'string' }, owner: { type: 'string' } } });

class Fail extends Error {}
const must = ({ data, error }) => {
  if (error) throw new Fail(error.message);
  return data;
};

async function findDevice() {
  if (values.device) {
    const [device] = must(await supabase.from('devices').select('id, name').eq('id', values.device).limit(1));
    if (!device) throw new Fail(`no device with id ${values.device}`);
    return device;
  }
  const email = values.owner.trim().toLowerCase();
  const [owner] = must(await supabase.from('profiles').select('id').eq('email', email).limit(1));
  if (!owner) throw new Fail(`no profile with email ${email}`);
  const rows = must(await supabase.from('device_members').select('devices(id, name)').eq('user_id', owner.id).eq('role', 'owner'));
  const matches = rows.map((r) => r.devices).filter((d) => d?.name === values.name);
  if (!matches.length) throw new Fail(`${email} owns no device named "${values.name}"`);
  if (matches.length > 1) throw new Fail(`several devices named "${values.name}": ${matches.map((d) => d.id).join(', ')} (use --device)`);
  return matches[0];
}

try {
  if (!supabase) throw new Fail('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing in server/.env');
  if (!values.device && !(values.name && values.owner)) throw new Fail('pass --device <id>, or --name "<device name>" --owner <email>');

  const device = await findDevice();
  const secret = randomBytes(32).toString('base64url');
  must(await supabase.from('devices').update({ secret_hash: hashSecret(secret) }).eq('id', device.id));

  console.log(`
New secret for "${device.name}". The old one no longer works (a running server may accept it for up to a minute).

# bridge/.env
DEVICE_ID=${device.id}
DEVICE_SECRET=${secret}
`);
} catch (err) {
  if (!(err instanceof Fail)) throw err;
  console.error(`[rotate-secret] ${err.message}`);
  process.exitCode = 1; // not process.exit(): on Windows that can abort while fetch sockets close
}
