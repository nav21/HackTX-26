// In-memory event queue with batching and retry/backoff. Never drops events.
//
// - push() queues; whatever is queued in the same tick goes out as one batch (max batchSize).
// - A failed send keeps the batch at the head of the queue and retries with exponential backoff.
//   The server dedupes by seq, so resending a batch that actually did arrive is safe.
// - If the server says a batch is permanently bad (HTTP 400/422), the batch is split in halves
//   to isolate the offender. A single event that is still rejected is "parked" (kept in memory,
//   retried later) so it cannot block the events behind it.

export class EventQueue {
  constructor({
    send,
    batchSize = 100,
    baseDelayMs = 500,
    maxDelayMs = 15000,
    parkRetryMs = 30000,
    onSent = () => {},
    onRetry = () => {},
    onParked = () => {},
  }) {
    this.send = send;
    this.batchSize = batchSize;
    this.limit = batchSize;
    this.baseDelayMs = baseDelayMs;
    this.maxDelayMs = maxDelayMs;
    this.parkRetryMs = parkRetryMs;
    this.onSent = onSent;
    this.onRetry = onRetry;
    this.onParked = onParked;

    this.items = [];
    this.parked = [];
    this.failures = 0;
    this.inflight = false;
    this.timer = null;
    this.parkTimer = null;
    this.waiters = [];
  }

  /** Events not yet acknowledged by the server (queued + in flight + parked). */
  get pending() {
    return this.items.length + this.parked.length;
  }

  push(event) {
    this.items.push(event);
    this.#schedule(0);
  }

  /** Resolves once everything queued has been acknowledged; rejects after timeoutMs (if > 0). */
  drain(timeoutMs = 0) {
    if (this.#isIdle()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const w = { resolve };
      if (timeoutMs > 0) {
        w.timeout = setTimeout(() => {
          this.waiters = this.waiters.filter((x) => x !== w);
          reject(new Error(`queue not drained after ${timeoutMs} ms (${this.pending} unsent)`));
        }, timeoutMs);
      }
      this.waiters.push(w);
    });
  }

  stop() {
    clearTimeout(this.timer);
    clearTimeout(this.parkTimer);
    this.timer = null;
    this.parkTimer = null;
  }

  #isIdle() {
    return this.items.length === 0 && this.parked.length === 0 && !this.inflight;
  }

  #notifyIdle() {
    if (!this.#isIdle()) return;
    const ws = this.waiters;
    this.waiters = [];
    for (const w of ws) {
      clearTimeout(w.timeout);
      w.resolve();
    }
  }

  #schedule(delay) {
    if (this.timer) return;
    // A timer (even 0 ms) lets several push() calls in one tick share a batch.
    this.timer = setTimeout(() => {
      this.timer = null;
      this.#run();
    }, delay);
  }

  async #run() {
    if (this.inflight || this.items.length === 0) {
      this.#notifyIdle();
      return;
    }
    this.inflight = true;
    const batch = this.items.slice(0, this.limit);
    try {
      const result = await this.send(batch);
      this.items.splice(0, batch.length);
      this.failures = 0;
      this.limit = this.batchSize;
      this.inflight = false;
      this.onSent(batch, result);
      if (this.items.length > 0) this.#schedule(0);
      this.#notifyIdle();
    } catch (err) {
      this.inflight = false;
      if (err?.permanent) {
        if (batch.length > 1) {
          this.limit = Math.ceil(batch.length / 2);
          this.onRetry({ error: err, batch, attempt: 0, delayMs: 0, splitting: true });
        } else {
          this.items.splice(0, 1);
          this.parked.push(batch[0]);
          this.onParked(batch[0], err);
          this.#armParkTimer();
        }
        this.#schedule(0);
        return;
      }
      this.failures += 1;
      const delayMs = Math.min(this.maxDelayMs, this.baseDelayMs * 2 ** (this.failures - 1));
      this.onRetry({ error: err, batch, attempt: this.failures, delayMs, splitting: false });
      this.#schedule(delayMs);
    }
  }

  #armParkTimer() {
    if (this.parkTimer) return;
    this.parkTimer = setTimeout(() => {
      this.parkTimer = null;
      this.items.push(...this.parked);
      this.parked = [];
      this.#schedule(0);
    }, this.parkRetryMs);
  }
}
