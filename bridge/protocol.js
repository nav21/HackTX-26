// Pure helpers for the BWS serial line protocol (SPEC.md section 4.3).
// No I/O in here so it is trivially unit-testable.

const UINT = /^\d{1,9}$/;
const FW_VERSION = /^[A-Za-z0-9._+-]{1,32}$/;

function toUint(s) {
  return typeof s === 'string' && UINT.test(s) ? Number(s) : null;
}

function invalid(reason) {
  return { kind: 'invalid', reason };
}

/**
 * Parse one line sent by the device.
 *
 * Returns one of:
 *   { kind: 'event', event: { type, seq, ldr?, fw_version?, at } }
 *   { kind: 'comment', text }          lines starting with '#' (firmware debug output)
 *   { kind: 'empty' }
 *   { kind: 'invalid', reason }
 *
 * BOOT carries no seq on the wire; we send seq 0 (the server resets its counter on BOOT).
 */
export function parseLine(raw, now = new Date()) {
  const line = String(raw ?? '').trim();
  if (line === '') return { kind: 'empty' };
  if (line.startsWith('#')) return { kind: 'comment', text: line.slice(1).trim() };

  const parts = line.split(',').map((p) => p.trim());
  const at = now.toISOString();

  switch (parts[0]) {
    case 'EVT': {
      if (parts.length !== 3) return invalid('EVT needs 2 fields');
      const type = { OPEN: 'OPEN', CLOSE: 'CLOSE' }[parts[1]];
      if (!type) return invalid(`unknown EVT kind "${parts[1]}"`);
      const seq = toUint(parts[2]);
      if (seq === null) return invalid(`bad seq "${parts[2]}"`);
      return { kind: 'event', event: { type, seq, at } };
    }
    case 'HB': {
      if (parts.length !== 3) return invalid('HB needs 2 fields');
      const seq = toUint(parts[1]);
      if (seq === null) return invalid(`bad seq "${parts[1]}"`);
      const ldr = toUint(parts[2]);
      if (ldr === null || ldr > 1023) return invalid(`bad ldr "${parts[2]}"`);
      return { kind: 'event', event: { type: 'HB', seq, ldr, at } };
    }
    case 'BOOT': {
      if (parts.length !== 2) return invalid('BOOT needs 1 field');
      if (!FW_VERSION.test(parts[1])) return invalid(`bad fw_version "${parts[1]}"`);
      return { kind: 'event', event: { type: 'BOOT', seq: 0, fw_version: parts[1], at } };
    }
    default:
      return invalid(`unknown line type "${parts[0].slice(0, 20)}"`);
  }
}

const COMMAND = /^(?:LED,(?:G|Y|R|B|OFF)(?:,BLINK)?|CAL)$/;

/** True if `cmd` is a host-to-device line we are willing to write to the board. */
export function isValidCommand(cmd) {
  return typeof cmd === 'string' && COMMAND.test(cmd);
}

const COLOR_NAMES = { G: 'green', Y: 'yellow', R: 'red', B: 'blue' };

/** Human description of a command for logs / the mock. */
export function describeCommand(cmd) {
  if (cmd === 'CAL') return { text: 'recalibrate', color: null, blink: false };
  const [, c, blink] = cmd.split(',');
  if (c === 'OFF') return { text: 'LED off', color: null, blink: false };
  const name = COLOR_NAMES[c] ?? c;
  return { text: `LED ${name}${blink ? ' blinking' : ''}`, color: c, blink: Boolean(blink) };
}

/** Build the lines the firmware prints. Used by the mock device. */
export const formatLine = {
  evt: (kind, seq) => `EVT,${kind},${seq}`,
  hb: (seq, ldr) => `HB,${seq},${ldr}`,
  boot: (fw) => `BOOT,${fw}`,
};
