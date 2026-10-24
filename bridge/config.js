// Environment / CLI parsing. Pure functions (no process.exit) so they can be tested.

const REQUIRED = ['API_URL', 'DEVICE_ID', 'DEVICE_SECRET'];

/**
 * @returns {{ config?: object, errors: string[] }}
 */
export function loadConfig(env) {
  const errors = [];
  const get = (k) => (env[k] ?? '').trim();

  const missing = REQUIRED.filter((k) => !get(k));
  if (missing.length) {
    errors.push(`Missing required setting${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`);
  }

  const apiUrl = get('API_URL');
  if (apiUrl) {
    try {
      const u = new URL(apiUrl);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('not http(s)');
    } catch {
      errors.push(`API_URL is not a valid http(s) URL: "${apiUrl}" (example: http://localhost:3001)`);
    }
  }

  if (errors.length) return { errors };
  return {
    errors,
    config: {
      apiUrl: apiUrl.replace(/\/+$/, ''),
      deviceId: get('DEVICE_ID'),
      deviceSecret: get('DEVICE_SECRET'),
      serialPath: get('SERIAL_PATH'),
    },
  };
}

/** Minimal flag parser: --mock, --script "o,c,o", --script-interval 1000, --help */
export function parseArgs(argv) {
  const out = { mock: false, script: null, scriptIntervalMs: 1000, help: false, errors: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--mock') out.mock = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--script' || a.startsWith('--script=')) {
      const v = a.includes('=') ? a.slice(a.indexOf('=') + 1) : argv[++i];
      if (!v) out.errors.push('--script needs a value, e.g. --script "o,c,o"');
      else out.script = parseScript(v, out.errors);
      out.mock = true; // a script only makes sense without hardware
    } else if (a === '--script-interval' || a.startsWith('--script-interval=')) {
      const v = a.includes('=') ? a.slice(a.indexOf('=') + 1) : argv[++i];
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) out.errors.push(`bad --script-interval "${v}"`);
      else out.scriptIntervalMs = n;
    } else out.errors.push(`Unknown option: ${a}`);
  }
  return out;
}

/** "o,c,h" -> ["o","c","h"] (open, close, heartbeat). */
export function parseScript(text, errors = []) {
  const keys = String(text)
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((k) => k.toLowerCase());
  for (const k of keys) {
    if (!['o', 'c', 'h'].includes(k)) errors.push(`--script: unknown step "${k}" (use o, c, h)`);
  }
  return keys;
}
