/*
 * Open Chess Engine - engine-client.js
 * SPDX-License-Identifier: MIT
 *
 * Talks to the engine. Prefers a Web Worker (UI never freezes). If workers are
 * unavailable (for example the page is opened from file:// in Chrome) it falls
 * back to running the engine on the main thread, one search iteration per tick.
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
      this.spawn();
    }

    spawn() {
      this.worker = null;
      if (this.mode === 'local') return;
      try {
        const w = new Worker('js/engine/worker.js');
        w.onmessage = (e) => this.onWorkerMessage(e.data);
        w.onerror = (ev) => {
          if (ev && ev.preventDefault) ev.preventDefault();
          this.switchToLocal();
        };
        this.worker = w;
        this.mode = 'worker';
        for (const name of Object.keys(this.options)) w.postMessage({ cmd: 'option', name, value: this.options[name] });
      } catch (err) {
        this.switchToLocal();
      }
    }

    switchToLocal() {
      if (this.worker) { try { this.worker.terminate(); } catch (e) { /* ignore */ } }
      this.worker = null;
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
      if (this.worker) this.worker.postMessage({ cmd: 'option', name, value });
      if (this.local) this.local.setOption(name, value);
    }

    newGame() {
      this.cancel();
      if (this.worker) this.worker.postMessage({ cmd: 'newgame' });
      if (this.local) this.local.newGame();
    }

    /** Stop whatever is running. The callbacks of the cancelled search will not fire. */
    cancel() {
      this.id++;
      this.request = null;
      if (this.busy) {
        this.busy = false;
        if (this.worker) { this.worker.terminate(); this.spawn(); } // cheapest way to interrupt a synchronous search
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

  OCE.EngineClient = EngineClient;
})();
