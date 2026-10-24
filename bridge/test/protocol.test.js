import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLine, isValidCommand, describeCommand } from '../protocol.js';

const NOW = new Date('2026-10-24T13:12:00.000Z');
const AT = '2026-10-24T13:12:00.000Z';

test('EVT,OPEN', () => {
  assert.deepEqual(parseLine('EVT,OPEN,4', NOW), { kind: 'event', event: { type: 'OPEN', seq: 4, at: AT } });
});

test('EVT,CLOSE', () => {
  assert.deepEqual(parseLine('EVT,CLOSE,5', NOW), { kind: 'event', event: { type: 'CLOSE', seq: 5, at: AT } });
});

test('HB with ldr', () => {
  assert.deepEqual(parseLine('HB,12,431', NOW), { kind: 'event', event: { type: 'HB', seq: 12, ldr: 431, at: AT } });
});

test('BOOT gets seq 0 and fw_version', () => {
  assert.deepEqual(parseLine('BOOT,1.0.0', NOW), {
    kind: 'event',
    event: { type: 'BOOT', seq: 0, fw_version: '1.0.0', at: AT },
  });
  assert.equal(parseLine('BOOT,mock-1.0', NOW).event.fw_version, 'mock-1.0');
});

test('tolerates CRLF and surrounding whitespace', () => {
  assert.equal(parseLine('EVT,OPEN,7\r', NOW).event.seq, 7);
  assert.equal(parseLine('  HB,1,2  \r\n', NOW).event.ldr, 2);
});

test('# lines are comments, blanks are empty', () => {
  assert.deepEqual(parseLine('#CAL baseline=40 open>=100 close<=70'), {
    kind: 'comment',
    text: 'CAL baseline=40 open>=100 close<=70',
  });
  assert.equal(parseLine('').kind, 'empty');
  assert.equal(parseLine('   \r').kind, 'empty');
  assert.equal(parseLine(undefined).kind, 'empty');
});

test('malformed lines are invalid', () => {
  const bad = [
    'EVT,OPEN', // missing seq
    'EVT,OPEN,x', // non-numeric seq
    'EVT,OPEN,-1',
    'EVT,OPEN,1.5',
    'EVT,OPEN,1,2', // extra field
    'EVT,TOGGLE,3', // unknown kind
    'HB,1', // missing ldr
    'HB,1,abc',
    'HB,1,1024', // out of ADC range
    'HB,,5',
    'BOOT', // missing version
    'BOOT,a,b',
    'BOOT,bad version!',
    'LED,G', // host command echoed back / unknown
    'garbage\x00\x01',
    'evt,open,1', // protocol is case-sensitive
  ];
  for (const line of bad) {
    const r = parseLine(line, NOW);
    assert.equal(r.kind, 'invalid', `expected invalid: ${JSON.stringify(line)} got ${JSON.stringify(r)}`);
    assert.ok(r.reason);
  }
});

test('isValidCommand accepts the host protocol only', () => {
  for (const ok of ['CAL', 'LED,G', 'LED,Y,BLINK', 'LED,R,BLINK', 'LED,B', 'LED,OFF']) {
    assert.equal(isValidCommand(ok), true, ok);
  }
  for (const bad of ['', 'LED', 'LED,X', 'LED,OFF,BLINK2', 'cal', 'LED,G\nCAL', 'LED,G,', null, 5]) {
    assert.equal(isValidCommand(bad), false, String(bad));
  }
});

test('describeCommand', () => {
  assert.equal(describeCommand('LED,Y,BLINK').text, 'LED yellow blinking');
  assert.equal(describeCommand('LED,G').text, 'LED green');
  assert.equal(describeCommand('LED,OFF').text, 'LED off');
  assert.equal(describeCommand('CAL').text, 'recalibrate');
});
