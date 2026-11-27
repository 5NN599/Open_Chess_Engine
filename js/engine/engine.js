/*
 * Open Chess Engine - engine.js
 * SPDX-License-Identifier: MIT
 *
 * Public engine API. Used by the Web Worker (worker.js), by the main-thread
 * fallback in the UI, and by the Node tests.
 *
 *   const engine = new OCE.Engine();
 *   engine.setOption('Hash', 64);
 *   engine.setPosition(fen, ['e2e4', 'e7e5']);          // fen = start position FEN
 *   const best = engine.go({ movetime: 1000 }, info => console.log(info));
 *   // best -> 'g1f3'  (UCI notation) or null when there are no legal moves
 *
 * Options:
 *   Hash     transposition table size in MB (default 32)
 *   MultiPV  number of lines to analyse (default 1)
 *   Skill    0..20, 20 = full strength (default 20)
 */
(function () {
  'use strict';

  const OCE = (globalThis.OCE = globalThis.OCE || {});

  // Depth cap per skill level (index = skill 0..19). Skill 20 = unlimited.
  const SKILL_DEPTH = [1, 1, 2, 2, 3, 3, 4, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 18];

  class Engine {
    constructor() {
      this.board = new OCE.Board();
      this.tt = new OCE.TranspositionTable(32);
      this.search = new OCE.Search(this.board, this.tt, OCE.evaluate);
      this.options = { Hash: 32, MultiPV: 1, Skill: 20 };
      this.net = null;
      this.setPosition(OCE.C.START_FEN, []);
    }

    newGame() {
      this.tt.clear();
      this.search.clearHistory();
    }

    setOption(name, value) {
      const v = Number(value);
      if (name === 'Hash') {
        this.options.Hash = Math.max(1, Math.min(1024, v | 0));
        this.tt.resize(this.options.Hash);
      } else if (name === 'MultiPV') {
        this.options.MultiPV = Math.max(1, Math.min(10, v | 0));
      } else if (name === 'Skill') {
        this.options.Skill = Math.max(0, Math.min(20, v | 0));
      }
    }

    /** Set the position from a FEN plus a list of UCI moves. Returns false on illegal input. */
    setPosition(fen, moves) {
      if (!this.board.setFen(fen || OCE.C.START_FEN)) return false;
      for (const uci of moves || []) {
        const m = this.board.parseUci(uci);
        if (!m) return false;
        this.board.makeMove(m);
      }
      return true;
    }

    // ---- incremental API (lets a host interleave searching with other work)
    begin(limits, onInfo) {
      const skill = this.options.Skill;
      limits = Object.assign({}, limits);
      let multiPV = this.options.MultiPV;
      if (skill < 20) {
        limits.depth = Math.min(limits.depth || 99, SKILL_DEPTH[skill]);
        multiPV = Math.max(multiPV, 4); // extra lines let weaker levels pick a non-best move
      }
      this.search.begin(limits, onInfo, { multiPV, emitLines: this.options.MultiPV });
    }

    /** One iterative-deepening step; returns true while more steps remain. */
    step() { return this.search.step(); }

    stop() { this.search.stop(); }

    /** Best move in UCI notation (null if the position has no legal move). */
    result() {
      const s = this.search;
      if (!s.bestMove) return null;
      let move = s.bestMove;
      const skill = this.options.Skill;
      if (skill < 20 && s.lines.length > 1) {
        // Pick randomly among lines that are within a margin of the best one.
        const margin = (20 - skill) * 12;
        const top = s.lines[0].score;
        const pool = s.lines.filter((l) => l.score >= top - margin);
        move = pool[Math.floor(Math.random() * pool.length)].move;
      }
      return this.board.moveToUci(move);
    }

    /** Blocking search. Returns the best move in UCI notation. */
    go(limits, onInfo) {
      this.begin(limits, onInfo);
      while (this.step());
      return this.result();
    }
  }

  OCE.Engine = Engine;
})();
