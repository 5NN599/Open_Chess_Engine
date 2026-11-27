/*
 * Open Chess Engine - tt.js
 * SPDX-License-Identifier: MIT
 *
 * Transposition table: typed arrays, one entry per slot, index = low hash bits,
 * verification = the other 32 hash bits.
 */
(function () {
  'use strict';

  const OCE = (globalThis.OCE = globalThis.OCE || {});
  const { MATE, MAX_PLY } = OCE.C;
  const MATE_BOUND = MATE - MAX_PLY;

  const TT_NONE = 0, TT_LOWER = 1, TT_UPPER = 2, TT_EXACT = 3;
  const BYTES_PER_ENTRY = 13;

  class TranspositionTable {
    constructor(megabytes) { this.resize(megabytes || 32); }

    resize(megabytes) {
      const bytes = Math.max(1, megabytes) * 1048576;
      let n = 1;
      while (n * 2 * BYTES_PER_ENTRY <= bytes) n *= 2;
      this.size = n;
      this.mask = n - 1;
      this.keys = new Int32Array(n);
      this.moves = new Int32Array(n);
      this.scores = new Int16Array(n);
      this.depths = new Int8Array(n);
      this.flags = new Uint8Array(n);
      this.ages = new Uint8Array(n);
      this.age = 1;
    }

    clear() {
      this.keys.fill(0); this.moves.fill(0); this.scores.fill(0);
      this.depths.fill(0); this.flags.fill(0); this.ages.fill(0);
      this.age = 1;
    }

    /** Call once at the start of every search so old entries become replaceable. */
    newSearch() { this.age = (this.age + 1) & 255; }

    store(lo, hi, depth, score, flag, move, ply) {
      const i = lo & this.mask;
      const occupied = this.flags[i] !== 0;
      if (occupied && this.keys[i] === hi) {
        if (move === 0) move = this.moves[i]; // keep the old best move
        if (flag !== TT_EXACT && depth < this.depths[i] - 3 && this.ages[i] === this.age) {
          if (move) this.moves[i] = move;
          return;
        }
      } else if (occupied && this.ages[i] === this.age && depth + 4 < this.depths[i]) {
        return; // keep a much deeper entry from the current search
      }
      if (score >= MATE_BOUND) score += ply;
      else if (score <= -MATE_BOUND) score -= ply;
      this.keys[i] = hi; this.moves[i] = move; this.scores[i] = score;
      this.depths[i] = depth; this.flags[i] = flag; this.ages[i] = this.age;
    }

    /** Convert a stored score back to a root-relative score. */
    static scoreFromTT(score, ply) {
      if (score >= MATE_BOUND) return score - ply;
      if (score <= -MATE_BOUND) return score + ply;
      return score;
    }

    /** Permille of sampled entries that belong to the current search. */
    hashfull() {
      const sample = Math.min(1000, this.size);
      let used = 0;
      for (let i = 0; i < sample; i++) if (this.flags[i] !== 0 && this.ages[i] === this.age) used++;
      return Math.round((used * 1000) / sample);
    }
  }

  OCE.TT = { NONE: TT_NONE, LOWER: TT_LOWER, UPPER: TT_UPPER, EXACT: TT_EXACT };
  OCE.TranspositionTable = TranspositionTable;
})();
