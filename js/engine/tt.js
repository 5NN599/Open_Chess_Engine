/*
 * Open Chess Engine - tt.js
 * SPDX-License-Identifier: MIT
 *
 * Transposition table. Each entry is three 32-bit words in one Int32Array:
 *   [0] key ^ data1 ^ data2   (lock-less "XOR trick": a torn write by another thread fails the check)
 *   [1] data1 = score (16 bits) | depth (8 bits) << 16 | flag (2 bits) << 24 | age (6 bits) << 26
 *   [2] data2 = best move
 * Because the table is a single typed array it can live in a SharedArrayBuffer, which is how
 * several worker threads search together (Lazy SMP, see engine-client.js).
 */
(function () {
  'use strict';

  const OCE = (globalThis.OCE = globalThis.OCE || {});
  const { MATE, MAX_PLY } = OCE.C;
  const MATE_BOUND = MATE - MAX_PLY;

  const TT_NONE = 0, TT_LOWER = 1, TT_UPPER = 2, TT_EXACT = 3;
  const WORDS = 3, BYTES_PER_ENTRY = WORDS * 4;

  class TranspositionTable {
    /**
     * @param megabytes  table size (ignored when `buffer` is given)
     * @param buffer     optional ArrayBuffer / SharedArrayBuffer made by TranspositionTable.allocate
     */
    constructor(megabytes, buffer) {
      if (buffer) this.attach(buffer);
      else this.resize(megabytes || 32);
    }

    /** Allocate a buffer for about `megabytes` MB; `shared` makes it a SharedArrayBuffer. */
    static allocate(megabytes, shared) {
      const bytes = Math.max(1, megabytes) * 1048576;
      let n = 1;
      while (n * 2 * BYTES_PER_ENTRY <= bytes) n *= 2;
      const size = n * BYTES_PER_ENTRY;
      return shared ? new SharedArrayBuffer(size) : new ArrayBuffer(size);
    }

    attach(buffer) {
      this.buffer = buffer;
      this.data = new Int32Array(buffer);
      this.size = this.data.length / WORDS;
      this.mask = this.size - 1;
      this.age = 1;
      this.hMove = 0; this.hScore = 0; this.hDepth = 0; this.hFlag = 0; // result of the last probe()
    }

    resize(megabytes) { this.attach(TranspositionTable.allocate(megabytes, false)); }

    clear() { this.data.fill(0); this.age = 1; }

    /** Call once at the start of every search so old entries become replaceable. */
    newSearch() { this.age = (this.age + 1) & 63; if (this.age === 0) this.age = 1; }

    /**
     * Look the position up. On a hit returns true and fills hMove, hScore (as stored), hDepth, hFlag.
     */
    probe(lo, hi) {
      const d = this.data, i = (lo & this.mask) * WORDS;
      const d1 = d[i + 1], d2 = d[i + 2];
      if ((d1 >>> 24 & 3) === 0 || (d[i] ^ d1 ^ d2) !== hi) return false;
      this.hMove = d2;
      this.hScore = (d1 << 16) >> 16;
      this.hDepth = (d1 << 8) >> 24;
      this.hFlag = (d1 >>> 24) & 3;
      return true;
    }

    store(lo, hi, depth, score, flag, move, ply) {
      const d = this.data, i = (lo & this.mask) * WORDS;
      const o1 = d[i + 1], o2 = d[i + 2];
      const oFlag = (o1 >>> 24) & 3;
      if (oFlag !== 0) {
        const oDepth = (o1 << 8) >> 24, oAge = o1 >>> 26;
        if ((d[i] ^ o1 ^ o2) === hi) {
          if (move === 0) move = o2; // keep the old best move
          if (flag !== TT_EXACT && depth < oDepth - 3 && oAge === this.age) {
            if (move) { d[i + 2] = move; d[i] = hi ^ o1 ^ move; }
            return;
          }
        } else if (oAge === this.age && depth + 4 < oDepth) {
          return; // keep a much deeper entry from the current search
        }
      }
      if (score >= MATE_BOUND) score += ply;
      else if (score <= -MATE_BOUND) score -= ply;
      const d1 = (score & 0xffff) | ((depth & 0xff) << 16) | (flag << 24) | (this.age << 26);
      d[i + 1] = d1; d[i + 2] = move; d[i] = hi ^ d1 ^ move;
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
      for (let k = 0; k < sample; k++) {
        const d1 = this.data[k * WORDS + 1];
        if (((d1 >>> 24) & 3) !== 0 && (d1 >>> 26) === this.age) used++;
      }
      return Math.round((used * 1000) / sample);
    }
  }

  OCE.TT = { NONE: TT_NONE, LOWER: TT_LOWER, UPPER: TT_UPPER, EXACT: TT_EXACT };
  OCE.TranspositionTable = TranspositionTable;
})();
