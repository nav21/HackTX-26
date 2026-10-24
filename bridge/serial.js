// Real serial link: auto-detects the Arduino, opens it, and reconnects when it is unplugged.

import { EventEmitter } from 'node:events';
import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';

// USB vendor ids commonly seen on Arduino boards and clones:
// 2341/2a03 Arduino, 1a86 CH340/CH341 clones, 0403 FTDI, 10c4 CP210x, 239a Adafruit, 1b4f SparkFun, 16c0 PJRC/V-USB
const VENDOR_IDS = new Set(['2341', '2a03', '1a86', '0403', '10c4', '239a', '1b4f', '16c0']);
const MAKER_RE = /arduino|wch\.cn|ftdi|silicon lab|ch340|ch341|cp210|sparkfun|adafruit/i;

export function looksLikeArduino(p) {
  const vid = (p.vendorId || '').toLowerCase();
  return VENDOR_IDS.has(vid) || MAKER_RE.test(p.manufacturer || '');
}

export async function detectPort() {
  const ports = await SerialPort.list();
  return ports.find(looksLikeArduino)?.path ?? null;
}

function friendly(err, path) {
  const m = String(err?.message || err);
  if (/access denied|permission denied|busy|EBUSY|EACCES|locked/i.test(m)) {
    return `${path} is busy or not accessible (${m}). Close the Arduino IDE Serial Monitor / any other program using it.`;
  }
  if (/file not found|no such file|ENOENT|cannot find/i.test(m)) {
    return `${path} not found (${m}). Is the board plugged in? Check SERIAL_PATH.`;
  }
  return `could not open ${path}: ${m}`;
}

/**
 * Events: 'line' (string), 'connected' (path), 'disconnected' (path), 'status' (string, de-duplicated notes)
 */
export class SerialLink extends EventEmitter {
  constructor({ path = '', baudRate = 115200, retryMs = 2000 } = {}) {
    super();
    this.wantedPath = path;
    this.baudRate = baudRate;
    this.retryMs = retryMs;
    this.port = null;
    this.path = null;
    this.busy = false;
    this.timer = null;
    this.lastNote = null;
    this.closing = false;
  }

  get connected() {
    return Boolean(this.port?.isOpen);
  }

  start() {
    this.#tick();
    this.timer = setInterval(() => this.#tick(), this.retryMs);
  }

  note(msg) {
    if (msg === this.lastNote) return;
    this.lastNote = msg;
    this.emit('status', msg);
  }

  async #tick() {
    if (this.port || this.busy || this.closing) return;
    this.busy = true;
    try {
      const path = this.wantedPath || (await detectPort());
      if (!path) {
        this.note('No Arduino found on any serial port. Plug it in (or set SERIAL_PATH). Retrying every 2 s...');
        return;
      }
      await this.#open(path);
    } catch (err) {
      this.note(friendly(err, this.wantedPath || 'serial port') + ' Retrying every 2 s...');
    } finally {
      this.busy = false;
    }
  }

  #open(path) {
    return new Promise((resolve, reject) => {
      const port = new SerialPort({ path, baudRate: this.baudRate, autoOpen: false });
      port.open((err) => {
        if (err) return reject(Object.assign(err, { path }));
        this.port = port;
        this.path = path;
        this.lastNote = null;
        const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));
        parser.on('data', (line) => this.emit('line', line));
        port.on('error', (e) => this.note(`serial error: ${e.message}`));
        port.on('close', () => {
          this.port = null;
          if (!this.closing) this.emit('disconnected', path);
        });
        this.emit('connected', path);
        resolve();
      });
    });
  }

  write(line) {
    return new Promise((resolve, reject) => {
      if (!this.connected) return reject(new Error('serial port not connected'));
      this.port.write(`${line}\n`, (err) => {
        if (err) return reject(err);
        this.port.drain(() => resolve());
      });
    });
  }

  close() {
    this.closing = true;
    clearInterval(this.timer);
    return new Promise((resolve) => {
      if (this.port?.isOpen) this.port.close(() => resolve());
      else resolve();
    });
  }
}
