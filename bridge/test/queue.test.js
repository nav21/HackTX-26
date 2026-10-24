import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventQueue } from '../queue.js';
import { ApiError, createApi } from '../api.js';

const ev = (seq, type = 'OPEN') => ({ type, seq, at: '2026-10-24T13:12:00.000Z' });
const fast = { baseDelayMs: 1, maxDelayMs: 8, parkRetryMs: 30 };

test('batches everything pushed in the same tick into one request', async () => {
  const calls = [];
  const q = new EventQueue({ ...fast, send: async (b) => void calls.push(b.map((e) => e.seq)) });
  q.push(ev(1));
  q.push(ev(2));
  q.push(ev(3));
  await q.drain(1000);
  assert.deepEqual(calls, [[1, 2, 3]]);
  assert.equal(q.pending, 0);
});

test('caps batches at batchSize and keeps order', async () => {
  const calls = [];
  const q = new EventQueue({ ...fast, batchSize: 2, send: async (b) => void calls.push(b.map((e) => e.seq)) });
  [1, 2, 3, 4, 5].forEach((n) => q.push(ev(n)));
  await q.drain(1000);
  assert.deepEqual(calls, [[1, 2], [3, 4], [5]]);
});

test('retries with backoff on failure and never drops', async () => {
  let attempts = 0;
  const retries = [];
  const sent = [];
  const q = new EventQueue({
    ...fast,
    send: async (b) => {
      attempts++;
      if (attempts <= 3) throw new ApiError('cannot reach server');
      sent.push(...b);
    },
    onRetry: (r) => retries.push(r.delayMs),
  });
  q.push(ev(1));
  q.push(ev(2));
  await q.drain(2000);
  assert.equal(attempts, 4);
  assert.deepEqual(sent.map((e) => e.seq), [1, 2]);
  assert.deepEqual(retries, [1, 2, 4]); // exponential
});

test('backoff is capped at maxDelayMs', async () => {
  let attempts = 0;
  const delays = [];
  const q = new EventQueue({
    ...fast,
    send: async () => {
      if (++attempts < 7) throw new ApiError('HTTP 503');
    },
    onRetry: (r) => delays.push(r.delayMs),
  });
  q.push(ev(1));
  await q.drain(3000);
  assert.deepEqual(delays, [1, 2, 4, 8, 8, 8]);
});

test('events pushed while offline are batched together after recovery, in order', async () => {
  let up = false;
  const calls = [];
  const q = new EventQueue({
    ...fast,
    send: async (b) => {
      if (!up) throw new ApiError('cannot reach server');
      calls.push(b.map((e) => e.seq));
    },
  });
  q.push(ev(1));
  await new Promise((r) => setTimeout(r, 5));
  q.push(ev(2));
  q.push(ev(3));
  up = true;
  await q.drain(2000);
  assert.deepEqual(calls.flat(), [1, 2, 3]);
  assert.ok(calls.length <= 2);
});

test('a batch the server rejects as bad is split; good events still get through, bad one is parked not lost', async () => {
  const accepted = [];
  const parked = [];
  const q = new EventQueue({
    ...fast,
    parkRetryMs: 10000,
    send: async (b) => {
      if (b.some((e) => e.seq === 3)) throw new ApiError('HTTP 400 bad_request', { status: 400, permanent: true });
      accepted.push(...b.map((e) => e.seq));
    },
    onParked: (e) => parked.push(e.seq),
  });
  [1, 2, 3, 4].forEach((n) => q.push(ev(n)));
  await new Promise((r) => setTimeout(r, 80));
  assert.deepEqual(accepted.sort(), [1, 2, 4]);
  assert.deepEqual(parked, [3]);
  assert.equal(q.pending, 1); // still held in memory
  q.stop();
});

test('parked event is retried later and delivered once the server accepts it', async () => {
  let reject = true;
  const accepted = [];
  const q = new EventQueue({
    ...fast,
    parkRetryMs: 20,
    send: async (b) => {
      if (reject) throw new ApiError('HTTP 422', { status: 422, permanent: true });
      accepted.push(...b.map((e) => e.seq));
    },
  });
  q.push(ev(9));
  await new Promise((r) => setTimeout(r, 10));
  reject = false;
  await q.drain(2000);
  assert.deepEqual(accepted, [9]);
});

test('401 is retried (not permanent): fixing the secret later still delivers', async () => {
  let ok = false;
  const q = new EventQueue({
    ...fast,
    send: async () => {
      if (!ok) throw new ApiError('HTTP 401 unauthorized', { status: 401, permanent: false });
    },
  });
  q.push(ev(1));
  await new Promise((r) => setTimeout(r, 15));
  assert.equal(q.pending, 1);
  ok = true;
  await q.drain(2000);
  assert.equal(q.pending, 0);
});

test('drain rejects on timeout while events remain', async () => {
  const q = new EventQueue({ ...fast, send: async () => { throw new ApiError('down'); } });
  q.push(ev(1));
  await assert.rejects(q.drain(30), /not drained/);
  q.stop();
});

// ---- api.js with a fake fetch ------------------------------------------------

function fakeFetch(handler) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    return handler(url, init);
  };
  fn.calls = calls;
  return fn;
}
const jsonRes = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => (body === undefined ? '' : JSON.stringify(body)),
});

test('api.postEvents sends device headers and the {events} body', async () => {
  const f = fakeFetch(() => jsonRes(200, { accepted: 2, duplicates: 0 }));
  const api = createApi({ apiUrl: 'http://x.test/', deviceId: 'dev-1', deviceSecret: 's3cret', fetchImpl: f });
  const out = await api.postEvents([ev(1), ev(2)]);
  assert.deepEqual(out, { accepted: 2, duplicates: 0 });
  const { url, init } = f.calls[0];
  assert.equal(url, 'http://x.test/api/device/events');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers['X-Device-Id'], 'dev-1');
  assert.equal(init.headers['X-Device-Secret'], 's3cret');
  assert.equal(init.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(init.body), { events: [ev(1), ev(2)] });
});

test('api.getCommands returns the array and validates shape', async () => {
  const api = createApi({
    apiUrl: 'http://x.test',
    deviceId: 'd',
    deviceSecret: 's',
    fetchImpl: fakeFetch(() => jsonRes(200, ['LED,G', 'CAL'])),
  });
  assert.deepEqual(await api.getCommands(), ['LED,G', 'CAL']);

  const bad = createApi({ apiUrl: 'http://x.test', deviceId: 'd', deviceSecret: 's', fetchImpl: fakeFetch(() => jsonRes(200, { nope: 1 })) });
  await assert.rejects(bad.getCommands(), /not an array/);
});

test('api maps errors: network, 5xx and 401 retryable; 400 permanent; reads server error body', async () => {
  const mk = (h) => createApi({ apiUrl: 'http://x.test', deviceId: 'd', deviceSecret: 's', fetchImpl: fakeFetch(h) });

  await assert.rejects(
    mk(() => {
      throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    }).postEvents([ev(1)]),
    (e) => e.permanent === false && /ECONNREFUSED/.test(e.message),
  );
  await assert.rejects(mk(() => jsonRes(503, {})).postEvents([ev(1)]), (e) => e.permanent === false && e.status === 503);
  await assert.rejects(
    mk(() => jsonRes(401, { error: { code: 'unauthorized', message: 'Bad device secret' } })).postEvents([ev(1)]),
    (e) => e.permanent === false && e.status === 401 && /Bad device secret/.test(e.message),
  );
  await assert.rejects(mk(() => jsonRes(400, { error: { code: 'bad_request', message: 'x' } })).postEvents([ev(1)]), (e) => e.permanent === true);
});

test('queue + api together: retries a network failure then succeeds, resending the same batch', async () => {
  let n = 0;
  const f = fakeFetch(() => {
    if (++n === 1) throw new TypeError('fetch failed');
    return jsonRes(200, { accepted: 1, duplicates: 0 });
  });
  const api = createApi({ apiUrl: 'http://x.test', deviceId: 'd', deviceSecret: 's', fetchImpl: f });
  const q = new EventQueue({ ...fast, send: (b) => api.postEvents(b) });
  q.push(ev(1));
  await q.drain(2000);
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[0].init.body, f.calls[1].init.body);
});
