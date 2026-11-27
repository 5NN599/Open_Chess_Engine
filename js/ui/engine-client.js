/*
 * Open Chess Engine - engine-client.js
 * SPDX-License-Identifier: MIT
 *
 * Talks to the engine. Prefers a Web Worker (UI never freezes). If workers are
 * unavailable (for example the page is opened from file:// in Chrome) it falls
 * back to running the engine on the main thread, one search iteration per tick.
 *
 * Multi-threading:
 *   - Live search ("Lazy SMP"): when the page is cross-origin isolated (see coi.js / README) several workers
 *     search the same position and share one transposition table in a SharedArrayBuffer.
 *   - Game review: AnalysisPool (bottom of this file) analyses different positions on different cores;
 *     that needs no shared memory and works everywhere workers work.
 */
(function () {
  'use strict';

  const OCE = (globalThis.OCE = globalThis.OCE || {});

  class EngineClient {
    constructor() {
      this.options = {};          // remembered so a fresh worker can be re-configured
      this.worker = null;
      this.local = null;
      this.id = 0;
      this.busy = false;
      this.request = null;
      this.mode = 'starting';
      this.workers = [];          // workers[0] is the main search thread, the others are helpers
      this.gen = 0;               // search generation, used as stop-flag value and TT age
      this.threadsWanted = 0;     // 0 = auto (all cores)
      this.spawn();
    }

    /** Can several workers share memory on this page? */
    static canShare() {
      return typeof SharedArrayBuffer !== 'undefined' && typeof Atomics !== 'undefined' && globalThis.crossOriginIsolated === true;
    }

    /** Number of search threads that will be used (1 when memory cannot be shared). */
    get threads() {
      if (this.mode !== 'worker' || !EngineClient.canShare()) return 1;
      const cores = Math.max(1, Math.min(32, navigator.hardwareConcurrency || 2));
      return Math.max(1, Math.min(this.threadsWanted || cores, 32));
    }

    setThreads(n) {
      this.threadsWanted = n | 0;
      if (this.mode === 'worker') { this.cancel(); this.killWorkers(); this.spawn(); }
    }

    killWorkers() {
      for (const w of this.workers) { try { w.terminate(); } catch (e) { /* ignore */ } }
      this.workers = []; this.worker = null;
    }

    allocateShared() {
      const mb = Math.max(1, +this.options.Hash || 32);
      this.ttBuffer = OCE.TranspositionTable.allocate(mb, true);
      this.ctrlBuffer = new SharedArrayBuffer(4 * 80);
      this.ctrl = new Int32Array(this.ctrlBuffer);
    }

    sendShared(w, id, n) { w.postMessage({ cmd: 'shared', tt: this.ttBuffer, ctrl: this.ctrlBuffer, id, threads: n }); }

    spawn() {
      this.killWorkers();
      if (this.mode === 'local') return;
      try {
        const n = this.threads;
        if (n > 1) this.allocateShared();
        for (let i = 0; i < n; i++) {
          const w = new Worker('js/engine/worker.js');
          if (i === 0) w.onmessage = (e) => this.onWorkerMessage(e.data);
          w.onerror = (ev) => {
            if (ev && ev.preventDefault) ev.preventDefault();
            this.switchToLocal();
          };
          this.workers.push(w);
          if (n > 1) this.sendShared(w, i, n);
          for (const name of Object.keys(this.options)) w.postMessage({ cmd: 'option', name, value: this.options[name] });
        }
        this.worker = this.workers[0];
        this.shared = n > 1;
        this.mode = 'worker';
      } catch (err) {
        this.switchToLocal();
      }
    }

    switchToLocal() {
      this.killWorkers();
      this.shared = false;
      this.mode = 'local';
      if (!this.local) {
        this.local = new OCE.Engine();
        for (const name of Object.keys(this.options)) this.local.setOption(name, this.options[name]);
      }
      if (this.busy && this.request) { // restart the interrupted request locally
        const r = this.request;
        this.busy = false;
        this.go(r.fen, r.moves, r.limits, r.onInfo, r.onBest);
      }
    }

    onWorkerMessage(msg) {
      if (msg.id !== this.id || !this.request) return;
      if (msg.type === 'info') this.request.onInfo(msg.info);
      else if (msg.type === 'bestmove') {
        const r = this.request;
        this.busy = false; this.request = null;
        r.onBest(msg.move);
      }
    }

    setOption(name, value) {
      this.options[name] = value;
      if (this.shared && name === 'Hash') { // the shared table has to be reallocated and handed to every thread
        this.cancel();
        this.allocateShared();
        this.workers.forEach((w, i) => this.sendShared(w, i, this.workers.length));
      }
      for (const w of this.workers) w.postMessage({ cmd: 'option', name, value });
      if (this.local) this.local.setOption(name, value);
    }

    newGame() {
      this.cancel();
      if (this.shared) new Int32Array(this.ttBuffer).fill(0);
      for (const w of this.workers) w.postMessage({ cmd: 'newgame' });
      if (this.local) this.local.newGame();
    }

    /** Stop whatever is running. The callbacks of the cancelled search will not fire. */
    cancel() {
      this.id++;
      this.request = null;
      if (this.busy) {
        this.busy = false;
        if (this.shared) Atomics.store(this.ctrl, 0, this.gen); // every thread notices the flag within a few thousand nodes
        else if (this.worker) { this.worker.terminate(); this.spawn(); } // cheapest way to interrupt a synchronous search
        else if (this.local) this.local.stop();
      }
    }

    /**
     * Start a search.
     * @param {string} fen      start position
     * @param {string[]} moves  UCI moves played from `fen`
     * @param {object} limits   { movetime } | { depth } | { infinite: true }
     */
    go(fen, moves, limits, onInfo, onBest) {
      this.cancel();
      const id = this.id;
      this.busy = true;
      this.request = { fen, moves, limits, onInfo, onBest };
      if (this.shared) {
        const gen = ++this.gen, age = (gen % 62) + 1;
        const helpers = (this.options.Skill === undefined || this.options.Skill >= 20) ? this.workers.length : 1; // weakened play: no helpers
        this.workers.forEach((w, i) => {
          if (i >= helpers) return;
          w.postMessage({ cmd: 'position', fen, moves });
          w.postMessage({ cmd: 'go', id, limits: i === 0 ? Object.assign({ gen, age }, limits) : { infinite: true, helper: true, gen, age } });
        });
        return;
      }
      if (this.worker) {
        this.worker.postMessage({ cmd: 'position', fen, moves });
        this.worker.postMessage({ cmd: 'go', id, limits });
        return;
      }
      // Main-thread fallback: iterate with setTimeout so the page can repaint between depths.
      const eng = this.local;
      eng.setPosition(fen, moves);
      eng.begin(limits, (info) => { if (id === this.id) onInfo(info); });
      const tick = () => {
        if (id !== this.id) return;
        if (eng.step()) setTimeout(tick, 0);
        else {
          this.busy = false; this.request = null;
          onBest(eng.result());
        }
      };
      setTimeout(tick, 0);
    }
  }

  /**
   * Analyses many independent positions at the same time, one single-threaded engine per core.
   * Used by the game review: each position is a separate job, so the speed-up is almost linear.
   *   const pool = OCE.AnalysisPool.create(8, 16);       // null if workers are unavailable
   *   const { best, last } = await pool.analyze(fen, { movetime: 700 });
   *   pool.terminate();
   */
  class AnalysisPool {
    static create(size, hashMB) {
      try { return new AnalysisPool(size, hashMB); } catch (e) { return null; }
    }

    constructor(size, hashMB) {
      this.size = Math.max(1, size | 0);
      this.queue = [];
      this.slots = [];
      this.dead = false;
      for (let i = 0; i < this.size; i++) {
        const w = new Worker('js/engine/worker.js');
        const slot = { w, job: null, last: null };
        w.onmessage = (e) => this.onMessage(slot, e.data);
        w.onerror = (ev) => { if (ev && ev.preventDefault) ev.preventDefault(); this.fail(); };
        w.postMessage({ cmd: 'option', name: 'Hash', value: hashMB || 16 });
        w.postMessage({ cmd: 'option', name: 'MultiPV', value: 1 });
        w.postMessage({ cmd: 'option', name: 'Skill', value: 20 });
        this.slots.push(slot);
      }
    }

    fail() {
      this.terminate();
    }

    analyze(fen, limits) {
      return new Promise((resolve, reject) => {
        if (this.dead) { reject(new Error('pool stopped')); return; }
        this.queue.push({ fen, limits, resolve, reject });
        this.pump();
      });
    }

    pump() {
      for (const slot of this.slots) {
        if (slot.job || !this.queue.length) continue;
        const job = this.queue.shift();
        slot.job = job; slot.last = null;
        slot.w.postMessage({ cmd: 'position', fen: job.fen, moves: [] });
        slot.w.postMessage({ cmd: 'go', id: 1, limits: job.limits });
      }
    }

    onMessage(slot, msg) {
      if (!slot.job) return;
      if (msg.type === 'info') { if (msg.info.multipv === 1) slot.last = msg.info; return; }
      if (msg.type === 'bestmove') {
        const job = slot.job, last = slot.last;
        slot.job = null; slot.last = null;
        job.resolve({ best: msg.move, last });
        this.pump();
      }
    }

    terminate() {
      this.dead = true;
      for (const slot of this.slots) { try { slot.w.terminate(); } catch (e) { /* ignore */ } if (slot.job) slot.job.reject(new Error('pool stopped')); slot.job = null; }
      for (const job of this.queue) job.reject(new Error('pool stopped'));
      this.queue = [];
    }
  }

  OCE.EngineClient = EngineClient;
  OCE.AnalysisPool = AnalysisPool;
})();
