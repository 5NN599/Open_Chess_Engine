/*
 * Open Chess Engine - board.js
 * SPDX-License-Identifier: MIT
 *
 * Board representation, move generation, make/unmake, FEN, SAN, SEE.
 *
 * Design notes (kept simple on purpose so the code is easy to modify):
 *  - 0x88 board: square = rank * 16 + file  (a1 = 0, h1 = 7, a8 = 112, h8 = 119).
 *    "sq & 0x88" is non-zero when a square is off the board.
 *  - Piece code = type | (color << 3).  White: 1..6, Black: 9..14.  0 = empty.
 *  - A move is one 32-bit integer:
 *        bits  0-6   from square
 *        bits  7-13  to square
 *        bits 14-16  promotion piece type (0 = none)
 *        bit  17     capture flag
 *        bit  18     en-passant flag
 *        bit  19     castling flag
 *        bit  20     double pawn push flag
 */
(function () {
  'use strict';

  const OCE = (globalThis.OCE = globalThis.OCE || {});

  // ---------------------------------------------------------------- constants
  const C = {
    WHITE: 0, BLACK: 1,
    PAWN: 1, KNIGHT: 2, BISHOP: 3, ROOK: 4, QUEEN: 5, KING: 6,
    FLAG_CAPTURE: 1 << 17, FLAG_EP: 1 << 18, FLAG_CASTLE: 1 << 19, FLAG_DOUBLE: 1 << 20,
    INF: 30000, MATE: 29000, MAX_PLY: 128,
    START_FEN: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  };
  OCE.C = C;

  const { WHITE, BLACK, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING,
    FLAG_CAPTURE, FLAG_EP, FLAG_CASTLE, FLAG_DOUBLE } = C;

  const PIECE_CHARS = ' PNBRQK  pnbrqk';
  const STACK_SIZE = 2048; // maximum game length + search depth in plies

  const KNIGHT_OFFSETS = new Int8Array([33, 31, 18, 14, -14, -18, -31, -33]);
  const KING_OFFSETS = new Int8Array([16, -16, 1, -1, 17, 15, -15, -17]);
  const BISHOP_DIRS = new Int8Array([17, 15, -15, -17]);
  const ROOK_DIRS = new Int8Array([16, -16, 1, -1]);

  // Castling rights bits.
  const CASTLE_WK = 1, CASTLE_WQ = 2, CASTLE_BK = 4, CASTLE_BQ = 8;
  const CASTLE_MASK = new Uint8Array(128).fill(15);
  CASTLE_MASK[0] = 15 & ~CASTLE_WQ;
  CASTLE_MASK[4] = 15 & ~(CASTLE_WK | CASTLE_WQ);
  CASTLE_MASK[7] = 15 & ~CASTLE_WK;
  CASTLE_MASK[112] = 15 & ~CASTLE_BQ;
  CASTLE_MASK[116] = 15 & ~(CASTLE_BK | CASTLE_BQ);
  CASTLE_MASK[119] = 15 & ~CASTLE_BK;

  // Piece values used for SEE / move ordering only (evaluation has its own).
  const SEE_VALUE = new Int32Array([0, 100, 320, 330, 500, 900, 20000]);

  // ------------------------------------------------------------------ zobrist
  let seed = 0x9e3779b9;
  function rand32() { // xorshift32, deterministic so hashes are reproducible
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    return seed | 0;
  }
  const ZP_LO = new Int32Array(16 * 128), ZP_HI = new Int32Array(16 * 128);
  const ZC_LO = new Int32Array(16), ZC_HI = new Int32Array(16);
  const ZE_LO = new Int32Array(8), ZE_HI = new Int32Array(8);
  for (let i = 0; i < ZP_LO.length; i++) { ZP_LO[i] = rand32(); ZP_HI[i] = rand32(); }
  for (let i = 0; i < 16; i++) { ZC_LO[i] = rand32(); ZC_HI[i] = rand32(); }
  for (let i = 0; i < 8; i++) { ZE_LO[i] = rand32(); ZE_HI[i] = rand32(); }
  const ZS_LO = rand32(), ZS_HI = rand32();

  // ------------------------------------------------------------------ helpers
  const sqName = (s) => 'abcdefgh'[s & 7] + ((s >> 4) + 1);
  function parseSq(str) {
    if (!str || str.length < 2) return -1;
    const f = str.charCodeAt(0) - 97, r = str.charCodeAt(1) - 49;
    return f < 0 || f > 7 || r < 0 || r > 7 ? -1 : r * 16 + f;
  }

  class Board {
    constructor() {
      this.sq = new Int8Array(128);
      this.cnt = new Int8Array(16);        // piece counts by piece code
      this.kingSq = new Int16Array(2);
      this.side = WHITE;
      this.castling = 0;
      this.ep = -1;
      this.halfmove = 0;
      this.fullmove = 1;
      this.hashLo = 0;
      this.hashHi = 0;
      this.histPly = 0;
      // Undo stacks
      this.uMove = new Int32Array(STACK_SIZE);
      this.uCaptured = new Int8Array(STACK_SIZE);
      this.uCastling = new Uint8Array(STACK_SIZE);
      this.uEp = new Int16Array(STACK_SIZE);
      this.uHalf = new Int16Array(STACK_SIZE);
      this.uLo = new Int32Array(STACK_SIZE);
      this.uHi = new Int32Array(STACK_SIZE);
      this._perftBufs = null;
      this.setFen(C.START_FEN);
    }

    // ------------------------------------------------------------------ FEN
    setFen(fen) {
      const parts = String(fen).trim().split(/\s+/);
      if (parts.length < 2) return false;
      const sq = this.sq;
      sq.fill(0); this.cnt.fill(0);
      let r = 7, f = 0;
      for (const ch of parts[0]) {
        if (ch === '/') { r--; f = 0; if (r < 0) return false; }
        else if (ch >= '1' && ch <= '8') f += +ch;
        else {
          const p = PIECE_CHARS.indexOf(ch);
          if (p < 1 || ch === ' ' || f > 7) return false;
          sq[r * 16 + f] = p; this.cnt[p]++; f++;
        }
      }
      if (this.cnt[KING] !== 1 || this.cnt[KING | 8] !== 1) return false;
      for (let s = 0; s < 128; s++) {
        if (s & 0x88) continue;
        if (sq[s] === KING) this.kingSq[WHITE] = s;
        else if (sq[s] === (KING | 8)) this.kingSq[BLACK] = s;
      }
      this.side = parts[1] === 'b' ? BLACK : WHITE;
      let c = 0;
      const cs = parts[2] || '-';
      if (cs.includes('K') && sq[4] === KING && sq[7] === ROOK) c |= CASTLE_WK;
      if (cs.includes('Q') && sq[4] === KING && sq[0] === ROOK) c |= CASTLE_WQ;
      if (cs.includes('k') && sq[116] === (KING | 8) && sq[119] === (ROOK | 8)) c |= CASTLE_BK;
      if (cs.includes('q') && sq[116] === (KING | 8) && sq[112] === (ROOK | 8)) c |= CASTLE_BQ;
      this.castling = c;
      // Keep the en-passant square only if a capture is actually possible
      // (keeps hashes consistent for repetition detection).
      this.ep = -1;
      const ep = parseSq(parts[3] || '-');
      if (ep !== -1) {
        const mine = PAWN | (this.side << 3);
        const a = this.side === WHITE ? ep - 15 : ep + 15;
        const b = this.side === WHITE ? ep - 17 : ep + 17;
        if ((!(a & 0x88) && sq[a] === mine) || (!(b & 0x88) && sq[b] === mine)) this.ep = ep;
      }
      this.halfmove = parseInt(parts[4], 10) || 0;
      this.fullmove = parseInt(parts[5], 10) || 1;
      this.histPly = 0;
      this.computeHash();
      return true;
    }

    getFen() {
      let out = '';
      for (let r = 7; r >= 0; r--) {
        let empty = 0;
        for (let f = 0; f < 8; f++) {
          const p = this.sq[r * 16 + f];
          if (!p) { empty++; continue; }
          if (empty) { out += empty; empty = 0; }
          out += PIECE_CHARS[p];
        }
        if (empty) out += empty;
        if (r) out += '/';
      }
      let c = '';
      if (this.castling & CASTLE_WK) c += 'K';
      if (this.castling & CASTLE_WQ) c += 'Q';
      if (this.castling & CASTLE_BK) c += 'k';
      if (this.castling & CASTLE_BQ) c += 'q';
      return `${out} ${this.side === WHITE ? 'w' : 'b'} ${c || '-'} ` +
        `${this.ep === -1 ? '-' : sqName(this.ep)} ${this.halfmove} ${this.fullmove}`;
    }

    computeHash() {
      let lo = 0, hi = 0;
      for (let s = 0; s < 128; s++) {
        if (s & 0x88) continue;
        const p = this.sq[s];
        if (p) { lo ^= ZP_LO[(p << 7) | s]; hi ^= ZP_HI[(p << 7) | s]; }
      }
      lo ^= ZC_LO[this.castling]; hi ^= ZC_HI[this.castling];
      if (this.ep !== -1) { lo ^= ZE_LO[this.ep & 7]; hi ^= ZE_HI[this.ep & 7]; }
      if (this.side === BLACK) { lo ^= ZS_LO; hi ^= ZS_HI; }
      this.hashLo = lo; this.hashHi = hi;
    }

    // -------------------------------------------------------------- attacks
    /** Is square `s` attacked by any piece of colour `by`? */
    isAttacked(s, by) {
      const sq = this.sq;
      let t;
      if (by === WHITE) {
        t = s - 15; if (!(t & 0x88) && sq[t] === PAWN) return true;
        t = s - 17; if (!(t & 0x88) && sq[t] === PAWN) return true;
      } else {
        t = s + 15; if (!(t & 0x88) && sq[t] === (PAWN | 8)) return true;
        t = s + 17; if (!(t & 0x88) && sq[t] === (PAWN | 8)) return true;
      }
      const cb = by << 3;
      const kn = KNIGHT | cb, ki = KING | cb;
      for (let k = 0; k < 8; k++) {
        t = s + KNIGHT_OFFSETS[k]; if (!(t & 0x88) && sq[t] === kn) return true;
        t = s + KING_OFFSETS[k]; if (!(t & 0x88) && sq[t] === ki) return true;
      }
      const bi = BISHOP | cb, ro = ROOK | cb, qu = QUEEN | cb;
      for (let k = 0; k < 4; k++) {
        let d = BISHOP_DIRS[k];
        t = s + d;
        while (!(t & 0x88)) {
          const p = sq[t];
          if (p) { if (p === bi || p === qu) return true; break; }
          t += d;
        }
        d = ROOK_DIRS[k];
        t = s + d;
        while (!(t & 0x88)) {
          const p = sq[t];
          if (p) { if (p === ro || p === qu) return true; break; }
          t += d;
        }
      }
      return false;
    }

    inCheck() { return this.isAttacked(this.kingSq[this.side], this.side ^ 1); }

    // ------------------------------------------------------- move generation
    /**
     * Generate pseudo-legal moves into list[off...]; returns the new end index.
     * capsOnly = captures and queen promotions only (used by quiescence search).
     */
    generateMoves(list, off, capsOnly) {
      const sq = this.sq, us = this.side, them = us ^ 1;
      let n = off;
      const dir = us === WHITE ? 16 : -16;
      const startRank = us === WHITE ? 1 : 6;
      const promoRank = us === WHITE ? 6 : 1;

      for (let r = 0; r < 8; r++) {
        for (let f = 0; f < 8; f++) {
          const from = (r << 4) | f;
          const p = sq[from];
          if (p === 0 || (p >> 3) !== us) continue;
          const type = p & 7;

          if (type === PAWN) {
            const one = from + dir;
            if (sq[one] === 0) {
              if (r === promoRank) {
                const b = from | (one << 7);
                list[n++] = b | (QUEEN << 14);
                if (!capsOnly) {
                  list[n++] = b | (ROOK << 14); list[n++] = b | (BISHOP << 14); list[n++] = b | (KNIGHT << 14);
                }
              } else if (!capsOnly) {
                list[n++] = from | (one << 7);
                if (r === startRank && sq[one + dir] === 0) list[n++] = from | ((one + dir) << 7) | FLAG_DOUBLE;
              }
            }
            for (let c = -1; c <= 1; c += 2) {
              const to = one + c;
              if (to & 0x88) continue;
              const t = sq[to];
              if (t !== 0 && (t >> 3) === them) {
                const b = from | (to << 7) | FLAG_CAPTURE;
                if (r === promoRank) {
                  list[n++] = b | (QUEEN << 14);
                  if (!capsOnly) {
                    list[n++] = b | (ROOK << 14); list[n++] = b | (BISHOP << 14); list[n++] = b | (KNIGHT << 14);
                  }
                } else list[n++] = b;
              } else if (to === this.ep) {
                list[n++] = from | (to << 7) | FLAG_CAPTURE | FLAG_EP;
              }
            }
          } else if (type === KNIGHT || type === KING) {
            const offs = type === KNIGHT ? KNIGHT_OFFSETS : KING_OFFSETS;
            for (let k = 0; k < 8; k++) {
              const to = from + offs[k];
              if (to & 0x88) continue;
              const t = sq[to];
              if (t === 0) { if (!capsOnly) list[n++] = from | (to << 7); }
              else if ((t >> 3) !== us) list[n++] = from | (to << 7) | FLAG_CAPTURE;
            }
            if (type === KING && !capsOnly && from === (us === WHITE ? 4 : 116)) {
              const ks = us === WHITE ? CASTLE_WK : CASTLE_BK;
              const qs = us === WHITE ? CASTLE_WQ : CASTLE_BQ;
              if (this.castling & (ks | qs)) {
                if (!this.isAttacked(from, them)) {
                  if ((this.castling & ks) && sq[from + 1] === 0 && sq[from + 2] === 0 &&
                    !this.isAttacked(from + 1, them) && !this.isAttacked(from + 2, them)) {
                    list[n++] = from | ((from + 2) << 7) | FLAG_CASTLE;
                  }
                  if ((this.castling & qs) && sq[from - 1] === 0 && sq[from - 2] === 0 && sq[from - 3] === 0 &&
                    !this.isAttacked(from - 1, them) && !this.isAttacked(from - 2, them)) {
                    list[n++] = from | ((from - 2) << 7) | FLAG_CASTLE;
                  }
                }
              }
            }
          } else { // bishop, rook, queen
            const dirs = type === BISHOP ? BISHOP_DIRS : type === ROOK ? ROOK_DIRS : KING_OFFSETS;
            for (let k = 0; k < dirs.length; k++) {
              const d = dirs[k];
              let to = from + d;
              while (!(to & 0x88)) {
                const t = sq[to];
                if (t === 0) { if (!capsOnly) list[n++] = from | (to << 7); }
                else {
                  if ((t >> 3) !== us) list[n++] = from | (to << 7) | FLAG_CAPTURE;
                  break;
                }
                to += d;
              }
            }
          }
        }
      }
      return n;
    }

    /** Fully legal moves as a plain array (slow path: UI, root, tests). */
    legalMoves() {
      const list = new Int32Array(256);
      const n = this.generateMoves(list, 0, false);
      const us = this.side, out = [];
      for (let i = 0; i < n; i++) {
        this.makeMove(list[i]);
        if (!this.isAttacked(this.kingSq[us], us ^ 1)) out.push(list[i]);
        this.unmakeMove();
      }
      return out;
    }

    // -------------------------------------------------------------- make/unmake
    makeMove(m) {
      const sq = this.sq, cnt = this.cnt;
      const from = m & 127, to = (m >> 7) & 127, promo = (m >> 14) & 7;
      const us = this.side, them = us ^ 1;
      const piece = sq[from];
      const h = this.histPly++;
      let lo = this.hashLo, hi = this.hashHi;

      this.uMove[h] = m; this.uCastling[h] = this.castling; this.uEp[h] = this.ep;
      this.uHalf[h] = this.halfmove; this.uLo[h] = lo; this.uHi[h] = hi;

      if (this.ep !== -1) { lo ^= ZE_LO[this.ep & 7]; hi ^= ZE_HI[this.ep & 7]; this.ep = -1; }
      lo ^= ZC_LO[this.castling]; hi ^= ZC_HI[this.castling];

      let captured = 0;
      this.halfmove++;
      if (m & FLAG_EP) {
        const cs = to + (us === WHITE ? -16 : 16);
        captured = sq[cs]; sq[cs] = 0; cnt[captured]--;
        lo ^= ZP_LO[(captured << 7) | cs]; hi ^= ZP_HI[(captured << 7) | cs];
        this.halfmove = 0;
      } else if (m & FLAG_CAPTURE) {
        captured = sq[to]; cnt[captured]--;
        lo ^= ZP_LO[(captured << 7) | to]; hi ^= ZP_HI[(captured << 7) | to];
        this.halfmove = 0;
      }
      this.uCaptured[h] = captured;
      if ((piece & 7) === PAWN) this.halfmove = 0;

      sq[from] = 0;
      lo ^= ZP_LO[(piece << 7) | from]; hi ^= ZP_HI[(piece << 7) | from];
      let placed = piece;
      if (promo) { placed = promo | (us << 3); cnt[piece]--; cnt[placed]++; }
      sq[to] = placed;
      lo ^= ZP_LO[(placed << 7) | to]; hi ^= ZP_HI[(placed << 7) | to];

      if ((piece & 7) === KING) this.kingSq[us] = to;

      if (m & FLAG_CASTLE) {
        let rf, rt;
        if (to > from) { rf = to + 1; rt = to - 1; } else { rf = to - 2; rt = to + 1; }
        const rook = sq[rf];
        sq[rf] = 0; sq[rt] = rook;
        lo ^= ZP_LO[(rook << 7) | rf] ^ ZP_LO[(rook << 7) | rt];
        hi ^= ZP_HI[(rook << 7) | rf] ^ ZP_HI[(rook << 7) | rt];
      }

      if (m & FLAG_DOUBLE) {
        const enemyPawn = PAWN | (them << 3);
        const a = to - 1, b = to + 1;
        if ((!(a & 0x88) && sq[a] === enemyPawn) || (!(b & 0x88) && sq[b] === enemyPawn)) {
          this.ep = (from + to) >> 1;
          lo ^= ZE_LO[this.ep & 7]; hi ^= ZE_HI[this.ep & 7];
        }
      }

      this.castling &= CASTLE_MASK[from] & CASTLE_MASK[to];
      lo ^= ZC_LO[this.castling]; hi ^= ZC_HI[this.castling];
      lo ^= ZS_LO; hi ^= ZS_HI;
      this.side = them;
      if (us === BLACK) this.fullmove++;
      this.hashLo = lo; this.hashHi = hi;
    }

    unmakeMove() {
      const h = --this.histPly;
      const sq = this.sq, cnt = this.cnt;
      const m = this.uMove[h];
      const from = m & 127, to = (m >> 7) & 127, promo = (m >> 14) & 7;
      this.side ^= 1;
      const us = this.side;
      const captured = this.uCaptured[h];
      let piece = sq[to];
      if (promo) { cnt[piece]--; piece = PAWN | (us << 3); cnt[piece]++; }
      sq[from] = piece;
      if (m & FLAG_EP) {
        sq[to] = 0;
        sq[to + (us === WHITE ? -16 : 16)] = captured; cnt[captured]++;
      } else {
        sq[to] = captured;
        if (captured) cnt[captured]++;
      }
      if (m & FLAG_CASTLE) {
        let rf, rt;
        if (to > from) { rf = to + 1; rt = to - 1; } else { rf = to - 2; rt = to + 1; }
        sq[rf] = sq[rt]; sq[rt] = 0;
      }
      if ((piece & 7) === KING) this.kingSq[us] = from;
      this.castling = this.uCastling[h]; this.ep = this.uEp[h]; this.halfmove = this.uHalf[h];
      this.hashLo = this.uLo[h]; this.hashHi = this.uHi[h];
      if (us === BLACK) this.fullmove--;
    }

    makeNull() {
      const h = this.histPly++;
      this.uMove[h] = 0; this.uCastling[h] = this.castling; this.uEp[h] = this.ep;
      this.uHalf[h] = this.halfmove; this.uLo[h] = this.hashLo; this.uHi[h] = this.hashHi;
      if (this.ep !== -1) { this.hashLo ^= ZE_LO[this.ep & 7]; this.hashHi ^= ZE_HI[this.ep & 7]; this.ep = -1; }
      this.hashLo ^= ZS_LO; this.hashHi ^= ZS_HI;
      this.side ^= 1;
      this.halfmove++;
    }

    unmakeNull() {
      const h = --this.histPly;
      this.side ^= 1;
      this.ep = this.uEp[h]; this.halfmove = this.uHalf[h];
      this.hashLo = this.uLo[h]; this.hashHi = this.uHi[h];
    }

    // ------------------------------------------------------------ draw rules
    /** True if the current position occurred earlier within the reversible window. */
    isRepetition() {
      const end = Math.max(0, this.histPly - this.halfmove);
      for (let i = this.histPly - 2; i >= end; i -= 2) {
        if (this.uLo[i] === this.hashLo && this.uHi[i] === this.hashHi) return true;
      }
      return false;
    }

    /** How many times the current position has occurred (including now). */
    repetitionCount() {
      let n = 1;
      const end = Math.max(0, this.histPly - this.halfmove);
      for (let i = this.histPly - 2; i >= end; i -= 2) {
        if (this.uLo[i] === this.hashLo && this.uHi[i] === this.hashHi) n++;
      }
      return n;
    }

    /** K vs K, K+minor vs K. */
    insufficientMaterial() {
      const c = this.cnt;
      if (c[1] + c[9] + c[4] + c[12] + c[5] + c[13] > 0) return false;
      return c[2] + c[3] + c[10] + c[11] <= 1;
    }

    hasNonPawnMaterial(side) {
      const b = side << 3;
      return (this.cnt[KNIGHT | b] + this.cnt[BISHOP | b] + this.cnt[ROOK | b] + this.cnt[QUEEN | b]) > 0;
    }

    // ------------------------------------------------------------------- SEE
    /** Lowest-valued piece of colour `side` attacking square `to` (or -1). */
    leastValuableAttacker(to, side) {
      const sq = this.sq, cb = side << 3;
      let t;
      if (side === WHITE) {
        t = to - 15; if (!(t & 0x88) && sq[t] === PAWN) return t;
        t = to - 17; if (!(t & 0x88) && sq[t] === PAWN) return t;
      } else {
        t = to + 15; if (!(t & 0x88) && sq[t] === (PAWN | 8)) return t;
        t = to + 17; if (!(t & 0x88) && sq[t] === (PAWN | 8)) return t;
      }
      const kn = KNIGHT | cb;
      for (let k = 0; k < 8; k++) {
        t = to + KNIGHT_OFFSETS[k]; if (!(t & 0x88) && sq[t] === kn) return t;
      }
      const bi = BISHOP | cb, ro = ROOK | cb, qu = QUEEN | cb;
      let bs = -1, rs = -1, qs = -1;
      for (let k = 0; k < 4; k++) {
        let d = BISHOP_DIRS[k];
        t = to + d;
        while (!(t & 0x88)) {
          const p = sq[t];
          if (p) { if (p === bi) { if (bs < 0) bs = t; } else if (p === qu) { if (qs < 0) qs = t; } break; }
          t += d;
        }
        d = ROOK_DIRS[k];
        t = to + d;
        while (!(t & 0x88)) {
          const p = sq[t];
          if (p) { if (p === ro) { if (rs < 0) rs = t; } else if (p === qu) { if (qs < 0) qs = t; } break; }
          t += d;
        }
      }
      if (bs >= 0) return bs;
      if (rs >= 0) return rs;
      if (qs >= 0) return qs;
      const ki = KING | cb;
      for (let k = 0; k < 8; k++) {
        t = to + KING_OFFSETS[k]; if (!(t & 0x88) && sq[t] === ki) return t;
      }
      return -1;
    }

    /** Static exchange evaluation of a capture (centipawns, from the mover's view). */
    see(m) {
      const sq = this.sq;
      const from = m & 127, to = (m >> 7) & 127;
      const piece = sq[from];
      const gain = SEE_GAIN;
      const remSq = SEE_REM_SQ, remPc = SEE_REM_PC;
      let nr = 0, d = 0;
      gain[0] = (m & FLAG_EP) ? SEE_VALUE[PAWN] : SEE_VALUE[sq[to] & 7];
      remSq[nr] = from; remPc[nr] = piece; nr++;
      sq[from] = 0;
      let attackerVal = SEE_VALUE[piece & 7];
      let side = (piece >> 3) ^ 1;
      while (true) {
        d++;
        gain[d] = attackerVal - gain[d - 1];
        const a = this.leastValuableAttacker(to, side);
        if (a < 0) break;
        const p = sq[a];
        remSq[nr] = a; remPc[nr] = p; nr++;
        sq[a] = 0;
        attackerVal = SEE_VALUE[p & 7];
        side ^= 1;
        if (Math.max(-gain[d - 1], gain[d]) < 0) break;
      }
      while (--d > 0) gain[d - 1] = -Math.max(-gain[d - 1], gain[d]);
      for (let i = 0; i < nr; i++) sq[remSq[i]] = remPc[i];
      return gain[0];
    }

    // ------------------------------------------------------ notation helpers
    moveToUci(m) {
      const promo = (m >> 14) & 7;
      return sqName(m & 127) + sqName((m >> 7) & 127) + (promo ? 'nbrq'[promo - 2] : '');
    }

    /** Find the legal move matching a UCI string such as "e2e4" or "e7e8q". Returns 0 if none. */
    parseUci(str) {
      if (!str || str.length < 4) return 0;
      const from = parseSq(str.slice(0, 2)), to = parseSq(str.slice(2, 4));
      if (from < 0 || to < 0) return 0;
      const promo = str.length > 4 ? 'nbrq'.indexOf(str[4].toLowerCase()) + 2 : 0;
      for (const m of this.legalMoves()) {
        if ((m & 127) === from && ((m >> 7) & 127) === to && ((m >> 14) & 7) === promo) return m;
      }
      return 0;
    }

    /** Standard algebraic notation. Must be called BEFORE the move is made. */
    moveToSan(m) {
      const from = m & 127, to = (m >> 7) & 127, promo = (m >> 14) & 7;
      const piece = this.sq[from], type = piece & 7;
      let san;
      if (m & FLAG_CASTLE) san = to > from ? 'O-O' : 'O-O-O';
      else if (type === PAWN) {
        san = (m & FLAG_CAPTURE) ? 'abcdefgh'[from & 7] + 'x' + sqName(to) : sqName(to);
        if (promo) san += '=' + ' PNBRQK'[promo];
      } else {
        san = ' PNBRQK'[type];
        let sameFile = false, sameRank = false, ambiguous = false;
        for (const o of this.legalMoves()) {
          const of = o & 127;
          if (o !== m && ((o >> 7) & 127) === to && of !== from && this.sq[of] === piece) {
            ambiguous = true;
            if ((of & 7) === (from & 7)) sameFile = true;
            if ((of >> 4) === (from >> 4)) sameRank = true;
          }
        }
        if (ambiguous) {
          if (!sameFile) san += 'abcdefgh'[from & 7];
          else if (!sameRank) san += (from >> 4) + 1;
          else san += sqName(from);
        }
        if (m & FLAG_CAPTURE) san += 'x';
        san += sqName(to);
      }
      this.makeMove(m);
      if (this.inCheck()) san += this.legalMoves().length ? '+' : '#';
      this.unmakeMove();
      return san;
    }

    // ------------------------------------------------------------------ perft
    perft(depth) {
      if (!this._perftBufs) this._perftBufs = Array.from({ length: 64 }, () => new Int32Array(256));
      if (depth === 0) return 1;
      const list = this._perftBufs[depth];
      const n = this.generateMoves(list, 0, false);
      const us = this.side;
      let total = 0;
      for (let i = 0; i < n; i++) {
        this.makeMove(list[i]);
        if (!this.isAttacked(this.kingSq[us], us ^ 1)) total += depth === 1 ? 1 : this.perft(depth - 1);
        this.unmakeMove();
      }
      return total;
    }
  }

  const SEE_GAIN = new Int32Array(40);
  const SEE_REM_SQ = new Int16Array(40);
  const SEE_REM_PC = new Int8Array(40);

  OCE.Board = Board;
  OCE.sqName = sqName;
  OCE.parseSq = parseSq;
  OCE.SEE_VALUE = SEE_VALUE;
  OCE.PIECE_CHARS = PIECE_CHARS;
})();
