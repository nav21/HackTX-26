// Runs engine.tick every 15 s (SPEC §10). Skips a beat instead of overlapping.
import { tick } from './index.js';

const INTERVAL_MS = 15_000;
let timer = null;
let running = false;

async function runOnce() {
  if (running) return;
  running = true;
  try {
    await tick(new Date());
  } catch (err) {
    console.error('[scheduler] tick failed:', err.message);
  } finally {
    running = false;
  }
}

export function startScheduler() {
  if (timer) return;
  if (process.env.DISABLE_SCHEDULER === 'true') {
    console.log('[scheduler] disabled (DISABLE_SCHEDULER=true)');
    return;
  }
  timer = setInterval(runOnce, INTERVAL_MS);
  setTimeout(runOnce, 2_000);
  console.log(`[scheduler] ticking every ${INTERVAL_MS / 1000}s`);
}

export function stopScheduler() {
  clearInterval(timer);
  timer = null;
}
