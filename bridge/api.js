// Thin HTTP client for the two device endpoints (API.md "Device (bridge)").

export class ApiError extends Error {
  constructor(message, { status = 0, code = null, permanent = false } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    // permanent = the server understood us and said the payload itself is bad (retrying the
    // identical request will never help). Everything else (network, 5xx, 401...) is retryable.
    this.permanent = permanent;
  }
}

const PERMANENT_STATUSES = new Set([400, 413, 422]);

export function createApi({ apiUrl, deviceId, deviceSecret, fetchImpl = globalThis.fetch, timeoutMs = 8000 }) {
  const base = apiUrl.replace(/\/+$/, '');
  const headers = {
    'X-Device-Id': deviceId,
    'X-Device-Secret': deviceSecret,
    Accept: 'application/json',
  };

  async function request(method, path, body) {
    let res;
    try {
      res = await fetchImpl(base + path, {
        method,
        headers: body === undefined ? headers : { ...headers, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const why = err?.cause?.code || err?.cause?.message || err?.name || err?.message;
      throw new ApiError(`cannot reach ${base} (${why})`);
    }

    const text = await res.text().catch(() => '');
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* non-JSON body */
    }

    if (!res.ok) {
      const code = json?.error?.code ?? null;
      const msg = json?.error?.message ?? text.slice(0, 120);
      const hint = res.status === 401 ? ' (check DEVICE_ID / DEVICE_SECRET in .env)' : '';
      throw new ApiError(`HTTP ${res.status}${code ? ` ${code}` : ''}${msg ? `: ${msg}` : ''}${hint}`, {
        status: res.status,
        code,
        permanent: PERMANENT_STATUSES.has(res.status),
      });
    }
    return json;
  }

  return {
    /** POST /api/device/events -> { accepted, duplicates } */
    postEvents: (events) => request('POST', '/api/device/events', { events }),
    /** GET /api/device/commands -> string[] */
    async getCommands() {
      const out = await request('GET', '/api/device/commands');
      if (!Array.isArray(out)) throw new ApiError('commands response was not an array');
      return out;
    },
  };
}
