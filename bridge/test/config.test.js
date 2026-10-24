import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, parseArgs, parseScript } from '../config.js';
import { MockDevice } from '../mock.js';
import { parseLine } from '../protocol.js';

test('loadConfig reports every missing variable', () => {
  const { config, errors } = loadConfig({});
  assert.equal(config, undefined);
  assert.match(errors[0], /API_URL, DEVICE_ID, DEVICE_SECRET/);
});

test('loadConfig rejects a bad API_URL and trims a trailing slash on a good one', () => {
  assert.match(loadConfig({ API_URL: 'localhost:3001', DEVICE_ID: 'a', DEVICE_SECRET: 'b' }).errors.join(), /valid http/);
  const ok = loadConfig({ API_URL: 'http://localhost:3001/', DEVICE_ID: 'a', DEVICE_SECRET: 'b', SERIAL_PATH: '' });
  assert.equal(ok.config.apiUrl, 'http://localhost:3001');
  assert.equal(ok.config.serialPath, '');
});

test('parseArgs', () => {
  assert.equal(parseArgs(['--mock']).mock, true);
  const s = parseArgs(['--script', 'o, c,O']);
  assert.deepEqual(s.script, ['o', 'c', 'o']);
  assert.equal(s.mock, true);
  assert.equal(parseArgs(['--script=o,c']).script.length, 2);
  assert.ok(parseArgs(['--nope']).errors.length);
  assert.ok(parseScript('o,x', []).length);
  const errs = [];
  parseScript('o,x', errs);
  assert.ok(errs.length);
});

test('MockDevice behaves like the firmware: BOOT first, shared seq from 1, no duplicate open/close', async () => {
  const m = new MockDevice({ heartbeatMs: 1e9 });
  const lines = [];
  m.on('line', (l) => lines.push(l));
  m.start();
  await new Promise((r) => setImmediate(r));
  m.open();
  m.open(); // already open: no line
  m.heartbeat();
  m.close();
  m.stop();
  assert.equal(lines[0], 'BOOT,mock-1.0');
  assert.equal(lines[1], 'EVT,OPEN,1');
  assert.match(lines[2], /^HB,2,\d+$/);
  assert.equal(lines[3], 'EVT,CLOSE,3');
  for (const l of lines) assert.equal(parseLine(l).kind, 'event', l);
});
