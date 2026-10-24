// Fake Arduino for --mock. Produces exactly the lines the firmware would print
// (same shared seq counter for EVT and HB, BOOT first, HB every 10 s) so the rest of the
// bridge runs the same code path as with real hardware.

import { EventEmitter } from 'node:events';
import { describeCommand, formatLine } from './protocol.js';
import { log, paint } from './log.js';

export const MOCK_FW_VERSION = 'mock-1.0';

const LED_BG = { G: '42', Y: '43', R: '41', B: '44' };

export class MockDevice extends EventEmitter {
  constructor({ heartbeatMs = 10000 } = {}) {
    super();
    this.heartbeatMs = heartbeatMs;
    this.seq = 0;
    this.lidOpen = false;
    this.timer = null;
  }

  start() {
    // BOOT first, then periodic heartbeats. Deferred so listeners are attached.
    setImmediate(() => this.emit('line', formatLine.boot(MOCK_FW_VERSION)));
    this.timer = setInterval(() => this.heartbeat(), this.heartbeatMs);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }

  nextSeq() {
    return ++this.seq;
  }

  open() {
    if (this.lidOpen) return log.dim('(mock) lid is already open');
    this.lidOpen = true;
    this.emit('line', formatLine.evt('OPEN', this.nextSeq()));
  }

  close() {
    if (!this.lidOpen) return log.dim('(mock) lid is already closed');
    this.lidOpen = false;
    this.emit('line', formatLine.evt('CLOSE', this.nextSeq()));
  }

  heartbeat() {
    const base = this.lidOpen ? 620 : 40;
    const ldr = Math.max(0, Math.min(1023, Math.round(base + (Math.random() - 0.5) * 30)));
    this.emit('line', formatLine.hb(this.nextSeq(), ldr));
  }

  /** Receive a host command line, like the firmware would. Prints it prominently. */
  receive(cmd) {
    const d = describeCommand(cmd);
    const swatch = d.color ? paint.bg(LED_BG[d.color], '    ') + ' ' : '';
    const colorFn = { G: paint.green, Y: paint.yellow, R: paint.red, B: paint.blue }[d.color] ?? paint.bold;
    const label = cmd === 'CAL' ? 'CAL → recalibrate' : d.text.replace('LED ', 'LED → ');
    log.info(`${paint.bold('▶')} ${swatch}${colorFn(paint.bold(label))} ${paint.dim(`(${cmd})`)}`);
  }
}
