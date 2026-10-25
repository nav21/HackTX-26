#!/usr/bin/env node
// TSWIFT bridge: Arduino (USB serial) <-> TSWIFT server. A dumb pipe.
//   node index.js                      real serial
//   node index.js --mock               keyboard-driven fake box (o = open, c = close, h = heartbeat, q = quit)
//   node index.js --script "o,c,o"     mock, non-interactive: one step per second, exit when the queue drains

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { loadConfig, parseArgs } from './config.js';
import { log, paint } from './log.js';
import { parseLine, isValidCommand } from './protocol.js';
import { createApi } from './api.js';
import { EventQueue } from './queue.js';
import { MockDevice } from './mock.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const COMMAND_POLL_MS = 1000;

const HELP = `TSWIFT bridge

Usage:
  npm start                        real Arduino over USB serial
  npm run mock                     fake box, keys: o = open, c = close, h = heartbeat, q = quit
  node index.js --script "o,c,o"   mock, no keyboard: sends the steps 1 s apart, exits when sent
    --script-interval <ms>         spacing between script steps (default 1000)

Settings come from bridge/.env (see .env.example): API_URL, DEVICE_ID, DEVICE_SECRET, SERIAL_PATH.
`;

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  process.stdout.write(HELP);
  process.exit(0);
}
if (args.errors.length) {
  args.errors.forEach((e) => log.error(e));
  process.stdout.write('\n' + HELP);
  process.exit(2);
}

dotenv.config({ path: path.join(HERE, '.env'), quiet: true });
const { config, errors } = loadConfig(process.env);
if (!config) {
  errors.forEach((e) => log.error(e));
  log.error(`Create ${path.join(HERE, '.env')} from .env.example and fill it in.`);
  log.error('DEVICE_ID / DEVICE_SECRET come from `npm run create-device` in /server.');
  process.exit(1);
}

// ---------------------------------------------------------------- plumbing

const api = createApi({
  apiUrl: config.apiUrl,
  deviceId: config.deviceId,
  deviceSecret: config.deviceSecret,
});

const queue = new EventQueue({
  send: (events) => api.postEvents(events),
  onSent: (batch, res) => {
    const n = batch.length;
    const extra = res && typeof res === 'object' ? paint.dim(` (accepted ${res.accepted}, duplicates ${res.duplicates})`) : '';
    log.tx(`POST ${n} event${n === 1 ? '' : 's'} ok${extra}`);
  },
  onRetry: ({ error, batch, attempt, delayMs, splitting }) => {
    const n = batch.length;
    if (splitting) {
      log.warn(`server rejected a batch of ${n} (${error.message}); splitting it to find the bad event`);
      return;
    }
    log.warn(
      `POST ${n} event${n === 1 ? '' : 's'} failed: ${error.message}. ` +
        `${queue.pending} queued, retry #${attempt} in ${(delayMs / 1000).toFixed(1)}s`,
    );
  },
  onParked: (event, error) => {
    log.error(
      `server keeps rejecting ${JSON.stringify(event)} (${error.message}). Parked in memory, retrying in 30 s; later events are not blocked.`,
    );
  },
});

function handleDeviceLine(line) {
  const text = String(line).replace(/\r$/, '');
  if (text.trim() === '') return;
  log.rx(text);
  const parsed = parseLine(text);
  switch (parsed.kind) {
    case 'event':
      queue.push(parsed.event);
      break;
    case 'comment':
      break; // already logged above
    case 'invalid':
      log.warn(`ignoring malformed line "${text.slice(0, 60)}": ${parsed.reason}`);
      break;
    default:
      break;
  }
}

// ---------------------------------------------------------------- device side (mock or serial)

let mock = null;
let serial = null;
let rawModeOn = false;

async function deliverCommand(cmd) {
  if (!isValidCommand(cmd)) {
    log.warn(`ignoring unknown command from server: ${JSON.stringify(cmd)}`);
    return;
  }
  if (mock) {
    mock.receive(cmd);
    return;
  }
  try {
    await serial.write(cmd);
    log.tx(`${cmd} ${paint.dim('(serial)')}`);
  } catch (err) {
    log.warn(`could not write "${cmd}" to the board: ${err.message}`);
  }
}

// ---------------------------------------------------------------- command polling

let stopping = false;
let pollErr = null;
let pollTimer = null;

async function pollCommands() {
  if (stopping) return;
  // In real mode, leave commands queued on the server until the board is attached.
  if (mock || serial.connected) {
    try {
      const cmds = await api.getCommands();
      if (pollErr) {
        log.info(paint.green('command polling recovered'));
        pollErr = null;
      }
      for (const cmd of cmds) {
        log.rx(`server command ${cmd}`);
        await deliverCommand(cmd);
      }
    } catch (err) {
      if (err.message !== pollErr) {
        pollErr = err.message;
        log.warn(`GET /api/device/commands failed: ${err.message} (will keep trying every ${COMMAND_POLL_MS / 1000}s)`);
      }
    }
  }
  if (!stopping) pollTimer = setTimeout(pollCommands, COMMAND_POLL_MS);
}

// ---------------------------------------------------------------- shutdown

async function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  clearTimeout(pollTimer);
  if (rawModeOn) {
    process.stdin.setRawMode(false);
    rawModeOn = false;
  }
  mock?.stop();
  if (queue.pending > 0) {
    log.info(`flushing ${queue.pending} unsent event(s)...`);
    await queue.drain(3000).catch((e) => log.warn(e.message));
  }
  queue.stop();
  await serial?.close();
  log.info('bye');
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

// ---------------------------------------------------------------- mock mode

function startMock() {
  mock = new MockDevice();
  mock.on('line', handleDeviceLine);
  mock.start();

  const press = (k) => {
    if (k === 'o') mock.open();
    else if (k === 'c') mock.close();
    else if (k === 'h') mock.heartbeat();
  };

  if (args.script) {
    runScript(args.script, press);
    return;
  }

  if (!process.stdin.isTTY) {
    log.warn('stdin is not a terminal, so keyboard control is off. Use --script "o,c,o" for non-interactive runs.');
    return;
  }
  process.stdin.setRawMode(true);
  rawModeOn = true;
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    for (const ch of chunk) {
      const k = ch.toLowerCase();
      if (k === 'q' || ch === '\u0003') return shutdown(0);
      press(k);
    }
  });
  log.info(paint.bold('mock box ready') + paint.dim('   o = open lid   c = close lid   h = heartbeat   q = quit'));
}

async function runScript(steps, press) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  log.info(`script: ${steps.join(', ')} (one step every ${args.scriptIntervalMs} ms)`);
  for (const step of steps) {
    await sleep(args.scriptIntervalMs);
    press(step);
  }
  try {
    await queue.drain(30000);
  } catch (err) {
    log.error(`script finished but ${err.message}`);
    return shutdown(1);
  }
  await sleep(COMMAND_POLL_MS * 1.5); // let one command poll show any LED reaction
  log.info('script done');
  shutdown(0);
}

// ---------------------------------------------------------------- real serial mode

async function startRealSerial() {
  // Imported lazily so --mock never touches the native serial bindings.
  const { SerialLink } = await import('./serial.js');
  serial = new SerialLink({ path: config.serialPath });
  serial.on('line', handleDeviceLine);
  serial.on('status', (m) => log.warn(m));
  serial.on('connected', (p) => log.info(paint.green(`serial connected: ${p}`)));
  serial.on('disconnected', (p) => log.warn(`serial disconnected (${p}); looking for the board every 2 s...`));
  serial.start();
}

// ---------------------------------------------------------------- go

log.info(
  `${paint.bold('TSWIFT bridge')} ${args.mock ? paint.magenta('[MOCK]') : '[serial]'} ` +
    paint.dim(`-> ${config.apiUrl}  device ${config.deviceId.slice(0, 8)}...`),
);
if (!args.mock) {
  log.info(paint.dim(config.serialPath ? `serial port: ${config.serialPath}` : 'serial port: auto-detect'));
}

if (args.mock) startMock();
else await startRealSerial();
pollTimer = setTimeout(pollCommands, COMMAND_POLL_MS);
