/*
 * Open Chess Engine - search.js
 * SPDX-License-Identifier: MIT
 *
 * Iterative-deepening principal-variation search (negamax alpha-beta) with:
 *   transposition table, aspiration windows, MultiPV, quiescence search,
 *   check extensions, null-move pruning, razoring, reverse futility pruning,
 *   futility pruning, late-move pruning, late-move reductions, SEE pruning,
 *   internal iterative reduction, singular extensions, quiescence TT,
 *   killer / history / continuation-history / counter-move ordering.
 *
 * Every pruning margin is a plain number in the code, tagged "TUNE" where it is
 * worth experimenting with.
 */
(function () {
  'use strict';

  const OCE = (globalThis.OCE = globalThis.OCE || {});
  const { PAWN, QUEEN, FLAG_CAPTURE, FLAG_EP, INF, MATE, MAX_PLY } = OCE.C;
  const { TT, TranspositionTable, SEE_VALUE } = OCE;
  const MATE_BOUND = MATE - MAX_PLY;

  // Move-ordering score bands.
  const S_TT = 10000000, S_GOOD_CAP = 5000000, S_PROMO_Q = 4900000;
  const S_KILLER1 = 4000000, S_KILLER2 = 3900000, S_COUNTER = 3800000;
  const S_BAD_CAP = -5000000, S_UNDERPROMO = -6000000;

  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  // Late-move-reduction table: LMR[depth][moveNumber]
  const LMR = new Int8Array(64 * 64);
  for (let d = 1; d < 64; d++) {
    for (let m = 1; m < 64; m++) LMR[d * 64 + m] = Math.floor(0.75 + (Math.log(d) * Math.log(m)) / 2.25); // TUNE
  }

  class Search {
    /**
     * @param {Board} board
     * @param {TranspositionTable} tt
     * @param {function} evaluate  (board) => centipawns, side-to-move relative
     */
    constructor(board, tt, evaluate) {
      this.board = board;
      this.tt = tt;
      this.evaluate = evaluate;
      this.moveList = new Int32Array(MAX_PLY * 256);
      this.moveScore = new Int32Array(MAX_PLY * 256);
      this.killers = new Int32Array(MAX_PLY * 2);
      this.history = new Int32Array(2 * 16384);
      this.counter = new Int32Array(16 * 128);
      // Continuation history: [previous (piece,to)][current (piece,to)], 1 ply and 2 plies back.
      this.cont1 = new Int16Array(2048 * 2048);
      this.cont2 = new Int16Array(2048 * 2048);
      this.excl = new Int32Array(MAX_PLY);
      this.saveList = new Int32Array(MAX_PLY * 256);
      this.saveScore = new Int32Array(MAX_PLY * 256);
      this.pv = new Int32Array(MAX_PLY * MAX_PLY);
      this.pvLen = new Int32Array(MAX_PLY);
      this.evalStack = new Int16Array(MAX_PLY);
      this.lastMove = new Int32Array(MAX_PLY + 1);
      this.lastPiece = new Int32Array(MAX_PLY + 1);
      this.quiets = new Int32Array(MAX_PLY * 64);
      this.rootExcluded = [];
      this.stopRequested = false;
      this.done = true;
    }

    clearHistory() {
      this.history.fill(0); this.killers.fill(0); this.counter.fill(0); this.cont1.fill(0); this.cont2.fill(0);
    }

    stop() { this.stopRequested = true; }

    // ---------------------------------------------------------------- driver
    /**
     * Prepare a search. limits: { depth, nodes, movetime, infinite, wtime, btime, winc, binc, movestogo }
     * opts: { multiPV, emitLines }
     */
    begin(limits, onInfo, opts) {
      const board = this.board;
      opts = opts || {};
      this.onInfo = onInfo || null;
      this.startTime = now();
      this.nodes = 0;
      this.selDepth = 0;
      this.stopped = false;
      this.stopRequested = false;
      this.depthDone = 0;
      this.done = false;
      this.maxDepth = Math.min(limits.depth || 64, MAX_PLY - 8);
      this.maxNodes = limits.nodes || 0;
      this.infinite = !!limits.infinite;
      this.softTime = 0; this.hardTime = 0;

      if (limits.movetime) {
        this.softTime = this.hardTime = limits.movetime;
      } else if (!limits.infinite && !limits.depth && !limits.nodes) {
        const white = board.side === 0;
        const remaining = white ? limits.wtime : limits.btime;
        if (remaining != null) {
          const inc = (white ? limits.winc : limits.binc) || 0;
          const mtg = limits.movestogo || 28;
          const optimum = Math.max(20, remaining / mtg + inc * 0.75);
          this.softTime = Math.min(optimum, remaining * 0.4);
          this.hardTime = Math.max(20, Math.min(optimum * 3, remaining * 0.6));
        }
      }

      this.tt.newSearch();
      for (let i = 0; i < this.history.length; i++) this.history[i] >>= 1; // age history
      for (let i = 0; i < this.cont1.length; i++) { this.cont1[i] >>= 1; this.cont2[i] >>= 1; }
      this.excl.fill(0);
      this.killers.fill(0);
      this.counter.fill(0);
      this.lastMove.fill(0); this.lastPiece.fill(0);

      this.rootMoves = board.legalMoves();
      this.multiPV = Math.max(1, Math.min(opts.multiPV || 1, this.rootMoves.length));
      this.emitLines = Math.min(opts.emitLines || this.multiPV, this.multiPV);
      this.lines = [];
      this.prevScores = new Array(this.multiPV).fill(0);
      this.bestMove = this.rootMoves.length ? this.rootMoves[0] : 0;
      this.bestScore = 0;
      this.rootExcluded = [];
      if (this.rootMoves.length === 0) this.done = true;
      else if (this.rootMoves.length === 1 && !this.infinite) this.maxDepth = Math.min(this.maxDepth, 6);
    }

    /** Run one iterative-deepening iteration. Returns true if more work remains. */
    step() {
      if (this.done) return false;
      const depth = this.depthDone + 1;
      this.selDepth = 0;
      const newLines = [];
      const excluded = [];

      for (let pvIdx = 0; pvIdx < this.multiPV; pvIdx++) {
        this.rootExcluded = excluded;
        this.iterMove = 0;
        const score = this.aspiration(depth, this.prevScores[pvIdx]);
        if (this.stopped) {
          // Accept a partial result for the first line only: any move that raised alpha is real.
          if (pvIdx === 0 && this.iterMove && this.multiPV === 1) {
            newLines.push({ move: this.iterMove, score: this.iterScore, pv: this.iterPv });
          }
          break;
        }
        this.prevScores[pvIdx] = score;
        newLines.push({ move: this.iterMove, score, pv: this.extendPv(this.iterPv, depth) });
        excluded.push(this.iterMove);
      }
      this.rootExcluded = [];

      if (newLines.length === this.multiPV) {
        newLines.sort((a, b) => b.score - a.score);
        this.lines = newLines;
        this.depthDone = depth;
      } else if (newLines.length > 0 && this.multiPV === 1) {
        this.lines = newLines; // partial iteration, first line only
      }
      if (this.lines.length) { this.bestMove = this.lines[0].move; this.bestScore = this.lines[0].score; }
      if (!this.stopped || newLines.length === this.multiPV) this.emit();

      if (this.stopped) { this.done = true; return false; }

      const elapsed = now() - this.startTime;
      if (depth >= this.maxDepth) this.done = true;
      else if (this.softTime && elapsed >= this.softTime * 0.6) this.done = true; // next iteration unlikely to finish
      else if (!this.infinite && Math.abs(this.bestScore) >= MATE_BOUND && depth >= MATE - Math.abs(this.bestScore)) this.done = true;
      return !this.done;
    }

    /** Aspiration-window wrapper around the root search. */
    aspiration(depth, prev) {
      let alpha = -INF, beta = INF, delta = 18; // TUNE
      if (depth >= 5 && Math.abs(prev) < MATE_BOUND) {
        alpha = Math.max(-INF, prev - delta);
        beta = Math.min(INF, prev + delta);
      }
      for (;;) {
        this.iterMove = 0;
        const s = this.search(depth, alpha, beta, 0, false);
        if (this.stopped) return s;
        if (s <= alpha && alpha > -INF) {
          beta = (alpha + beta) >> 1;
          alpha = Math.max(-INF, s - delta);
        } else if (s >= beta && beta < INF) {
          beta = Math.min(INF, s + delta);
        } else return s;
        delta += (delta >> 1) + 5;
        if (delta > 500) { alpha = -INF; beta = INF; }
      }
    }

    emit() {
      if (!this.onInfo) return;
      const t = now() - this.startTime;
      for (let i = 0; i < this.emitLines && i < this.lines.length; i++) {
        const l = this.lines[i];
        let score;
        if (l.score >= MATE_BOUND) score = { mate: Math.ceil((MATE - l.score) / 2) };
        else if (l.score <= -MATE_BOUND) score = { mate: -Math.ceil((MATE + l.score) / 2) };
        else score = { cp: l.score };
        this.onInfo({
          depth: this.depthDone || 1, seldepth: this.selDepth, multipv: i + 1, score,
          nodes: this.nodes, time: Math.round(t), nps: t > 0 ? Math.round((this.nodes * 1000) / t) : 0,
          hashfull: this.tt.hashfull(), pv: l.pv.map((m) => this.board.moveToUci(m)),
        });
      }
    }

    /** Extend a short PV by following best moves stored in the transposition table. */
    extendPv(pv, depth) {
      const board = this.board, out = pv.slice(), made = [];
      const seen = new Set();
      for (const m of out) { board.makeMove(m); made.push(m); }
      while (out.length < depth && out.length < 40) {
        const key = board.hashLo + ':' + board.hashHi;
        if (seen.has(key)) break;
        seen.add(key);
        const i = board.hashLo & this.tt.mask;
        if (this.tt.keys[i] !== board.hashHi || this.tt.flags[i] === 0) break;
        const m = this.tt.moves[i];
        if (!m || !board.legalMoves().includes(m)) break;
        board.makeMove(m); out.push(m); made.push(m);
      }
      for (let i = made.length; i > 0; i--) board.unmakeMove();
      return out;
    }

    result() { return { move: this.bestMove, score: this.bestScore, lines: this.lines }; }

    // ---------------------------------------------------------------- limits
    checkLimits() {
      if (this.depthDone < 1) return; // always finish depth 1 so there is a move
      if (this.stopRequested) this.stopped = true;
      else if (this.hardTime && now() - this.startTime >= this.hardTime) this.stopped = true;
      else if (this.maxNodes && this.nodes >= this.maxNodes) this.stopped = true;
    }

    // ----------------------------------------------------------- move ordering
    scoreMoves(off, n, ttMove, ply) {
      const board = this.board, sq = board.sq, us = board.side;
      const list = this.moveList, scores = this.moveScore;
      const k1 = this.killers[ply * 2], k2 = this.killers[ply * 2 + 1];
      const prev = this.lastMove[ply];
      const counter = prev ? this.counter[(this.lastPiece[ply] << 7) | ((prev >> 7) & 127)] : 0;
      const c1 = prev ? ((this.lastPiece[ply] << 7) | ((prev >> 7) & 127)) << 11 : -1;
      const prev2 = ply >= 1 ? this.lastMove[ply - 1] : 0;
      const c2 = prev2 ? ((this.lastPiece[ply - 1] << 7) | ((prev2 >> 7) & 127)) << 11 : -1;
      for (let i = off; i < off + n; i++) {
        const m = list[i];
        let s;
        if (m === ttMove) s = S_TT;
        else if (m & FLAG_CAPTURE) {
          const victim = (m & FLAG_EP) ? PAWN : sq[(m >> 7) & 127] & 7;
          const attacker = sq[m & 127] & 7;
          s = SEE_VALUE[victim] * 8 - attacker;
          if (SEE_VALUE[victim] >= SEE_VALUE[attacker] || board.see(m) >= 0) s += S_GOOD_CAP;
          else s += S_BAD_CAP;
        } else if ((m >> 14) & 7) {
          s = ((m >> 14) & 7) === QUEEN ? S_PROMO_Q : S_UNDERPROMO;
        } else if (m === k1) s = S_KILLER1;
        else if (m === k2) s = S_KILLER2;
        else if (m === counter) s = S_COUNTER;
        else {
          s = this.history[(us << 14) | (m & 16383)];
          const ci = ((sq[m & 127] << 7) | ((m >> 7) & 127));
          if (c1 >= 0) s += this.cont1[c1 | ci];
          if (c2 >= 0) s += this.cont2[c2 | ci];
        }
        scores[i] = s;
      }
    }

    updateQuietStats(m, ply, depth, qOff, qCount) {
      const us = this.board.side;
      if (this.killers[ply * 2] !== m) { this.killers[ply * 2 + 1] = this.killers[ply * 2]; this.killers[ply * 2] = m; }
      const prev = this.lastMove[ply];
      if (prev) this.counter[(this.lastPiece[ply] << 7) | ((prev >> 7) & 127)] = m;
      const bonus = Math.min(depth * depth, 400);
      const h = this.history, sq = this.board.sq;
      const c1 = prev ? ((this.lastPiece[ply] << 7) | ((prev >> 7) & 127)) << 11 : -1;
      const prev2 = ply >= 1 ? this.lastMove[ply - 1] : 0;
      const c2 = prev2 ? ((this.lastPiece[ply - 1] << 7) | ((prev2 >> 7) & 127)) << 11 : -1;
      for (let i = 0; i < qCount; i++) {
        const q = this.quiets[qOff + i];
        const idx = (us << 14) | (q & 16383);
        const sign = q === m ? 1 : -1;
        const ci = (sq[q & 127] << 7) | ((q >> 7) & 127);
        h[idx] += sign * bonus - ((h[idx] * bonus) >> 14);
        if (c1 >= 0) { const j = c1 | ci; this.cont1[j] += sign * bonus - ((this.cont1[j] * bonus) >> 14); }
        if (c2 >= 0) { const j = c2 | ci; this.cont2[j] += sign * bonus - ((this.cont2[j] * bonus) >> 14); }
      }
    }

    // ----------------------------------------------------------------- search
    search(depth, alpha, beta, ply, canNull) {
      const board = this.board;
      this.pvLen[ply] = ply;
      const pvNode = beta - alpha > 1;
      const inCheck = board.inCheck();
      const excluded = this.excl[ply];

      if (ply > 0) {
        if (board.isRepetition() || board.insufficientMaterial() || (board.halfmove >= 100 && !inCheck)) return 0;
        if (ply >= MAX_PLY - 2) return inCheck ? 0 : this.evaluate(board);
        // Mate-distance pruning
        if (alpha < -MATE + ply) alpha = -MATE + ply;
        if (beta > MATE - ply - 1) beta = MATE - ply - 1;
        if (alpha >= beta) return alpha;
      }

      if (inCheck) depth++; // check extension
      if (depth <= 0) return this.qsearch(alpha, beta, ply);

      this.nodes++;
      if (ply > this.selDepth) this.selDepth = ply;
      if ((this.nodes & 2047) === 0) this.checkLimits();
      if (this.stopped) return 0;

      // ---- transposition table probe
      const tt = this.tt, lo = board.hashLo, hi = board.hashHi;
      const slot = lo & tt.mask;
      let ttMove = 0, ttScore = 0, ttFlag = 0, ttDepth = -1;
      if (tt.keys[slot] === hi && tt.flags[slot] !== 0) {
        ttMove = tt.moves[slot]; ttDepth = tt.depths[slot]; ttFlag = tt.flags[slot];
        ttScore = TranspositionTable.scoreFromTT(tt.scores[slot], ply);
        if (!pvNode && ply > 0 && ttDepth >= depth && !excluded) {
          if (ttFlag === TT.EXACT) return ttScore;
          if (ttFlag === TT.LOWER && ttScore >= beta) return ttScore;
          if (ttFlag === TT.UPPER && ttScore <= alpha) return ttScore;
        }
      }

      // ---- static evaluation
      let staticEval = -INF, ev = -INF;
      if (!inCheck) {
        staticEval = ev = this.evaluate(board);
        if (ttFlag !== 0) { // a TT score is a better estimate than the raw evaluation
          if (ttFlag === TT.EXACT || (ttFlag === TT.LOWER && ttScore > ev) || (ttFlag === TT.UPPER && ttScore < ev)) ev = ttScore;
        }
      }
      this.evalStack[ply] = staticEval;
      const improving = !inCheck && ply >= 2 && this.evalStack[ply - 2] !== -INF && staticEval > this.evalStack[ply - 2];

      // ---- node-level pruning (never in PV nodes, in check, or near mate scores)
      if (!pvNode && !inCheck && ply > 0 && Math.abs(beta) < MATE_BOUND) {
        // Razoring
        if (depth <= 2 && ev + 250 * depth <= alpha) { // TUNE
          const q = this.qsearch(alpha, alpha + 1, ply);
          if (q <= alpha) return q;
        }
        // Reverse futility pruning
        if (depth <= 8 && ev - (80 * depth - (improving ? 50 : 0)) >= beta) return ev; // TUNE
        // Null-move pruning
        if (canNull && !excluded && depth >= 3 && ev >= beta && board.hasNonPawnMaterial(board.side)) {
          const R = 3 + (depth >> 2) + Math.min(3, ((ev - beta) / 200) | 0); // TUNE
          this.lastMove[ply + 1] = 0; this.lastPiece[ply + 1] = 0;
          board.makeNull();
          const s = -this.search(depth - 1 - R, -beta, -beta + 1, ply + 1, false);
          board.unmakeNull();
          if (this.stopped) return 0;
          if (s >= beta) return s >= MATE_BOUND ? beta : s;
        }
      }

      // Internal iterative reduction: no hash move -> search a bit shallower
      if (!ttMove && depth >= 5) depth--;

      // ---- move loop
      const off = ply * 256, qOff = ply * 64;
      const list = this.moveList, scores = this.moveScore;
      const n = board.generateMoves(list, off, false) - off;
      this.scoreMoves(off, n, ttMove, ply);
      const k1 = this.killers[ply * 2], k2 = this.killers[ply * 2 + 1];
      const us = board.side;
      const alphaOrig = alpha;
      let best = -INF, bestMove = 0, legal = 0, qCount = 0, skipQuiets = false;

      for (let i = 0; i < n; i++) {
        // pick the best-scored remaining move (selection sort)
        let bi = off + i, bs = scores[bi];
        for (let j = off + i + 1; j < off + n; j++) if (scores[j] > bs) { bs = scores[j]; bi = j; }
        const m = list[bi];
        list[bi] = list[off + i]; scores[bi] = scores[off + i];
        list[off + i] = m; scores[off + i] = bs;

        if (m === excluded) continue;
        if (ply === 0 && this.rootExcluded.length && this.rootExcluded.includes(m)) continue;
        const isCapture = (m & FLAG_CAPTURE) !== 0;
        const promo = (m >> 14) & 7;
        // A pawn reaching its 7th rank is tactically critical: never prune or reduce it.
        const toSq = (m >> 7) & 127;
        const pawnTo7th = (board.sq[m & 127] & 7) === PAWN && ((toSq >> 4) === (us === 0 ? 6 : 1));
        const isQuiet = !isCapture && promo === 0 && !pawnTo7th;
        if (isQuiet && skipQuiets) continue;

        const piece = board.sq[m & 127];

        // Singular extension: if the hash move is much better than all alternatives, search it deeper.
        let ext = 0;
        if (m === ttMove && ply > 0 && !excluded && depth >= 8 && ttDepth >= depth - 3 &&
            (ttFlag === TT.LOWER || ttFlag === TT.EXACT) && Math.abs(ttScore) < MATE_BOUND) { // TUNE
          const sBeta = ttScore - 2 * depth;
          this.saveList.set(list.subarray(off, off + n), off); this.saveScore.set(scores.subarray(off, off + n), off);
          this.excl[ply] = m;
          const sc = this.search((depth - 1) >> 1, sBeta - 1, sBeta, ply, false);
          this.excl[ply] = 0;
          list.set(this.saveList.subarray(off, off + n), off); scores.set(this.saveScore.subarray(off, off + n), off);
          if (this.stopped) return 0;
          if (sc < sBeta) ext = 1;
          else if (ttScore >= beta) ext = -1;
        }

        board.makeMove(m);
        if (board.isAttacked(board.kingSq[us], us ^ 1)) { board.unmakeMove(); continue; }
        legal++;
        const givesCheck = board.inCheck();

        // ---- move-level pruning
        if (!pvNode && !inCheck && !givesCheck && best > -MATE_BOUND && legal > 1) {
          if (isQuiet) {
            if (depth <= 6 && legal > ((3 + depth * depth) >> (improving ? 0 : 1))) { // late-move pruning  TUNE
              skipQuiets = true; board.unmakeMove(); continue;
            }
            if (depth <= 6 && ev + 90 + 100 * depth <= alpha) { // futility pruning  TUNE
              skipQuiets = true; board.unmakeMove(); continue;
            }
          } else if (isCapture && depth <= 5 && bs < 0) { // bad captures are scored below zero
            board.unmakeMove(); continue; // clearly losing capture (SEE < 0)
          }
        }

        if (isQuiet && qCount < 64) this.quiets[qOff + qCount++] = m;
        this.lastMove[ply + 1] = m; this.lastPiece[ply + 1] = piece;

        const newDepth = depth - 1 + ext;
        let score;
        if (legal === 1) {
          score = -this.search(newDepth, -beta, -alpha, ply + 1, true);
        } else {
          // Late-move reductions
          let r = 0;
          // Never reduce good captures or queen promotions; at the root and in PV nodes
          // be conservative (captures are never reduced there, other moves only after several tries).
          const noReduce = (isCapture && (bs > 0 || pvNode)) || promo === QUEEN || pawnTo7th || (ply === 0 && legal < 6);
          if (depth >= 3 && legal >= 3 && !noReduce) {
            r = LMR[Math.min(depth, 63) * 64 + Math.min(legal, 63)];
            if (!pvNode) r++;
            if (!improving) r++;
            if (givesCheck || inCheck) r--;
            if (isQuiet) {
              if (m === k1 || m === k2) r--;
              const h = this.history[(us << 14) | (m & 16383)];
              r -= Math.max(-2, Math.min(2, (h / 4000) | 0));
            } else r--;
            if (r < 0) r = 0;
            if (r > newDepth - 1) r = newDepth - 1;
            if (r < 0) r = 0;
          }
          score = -this.search(newDepth - r, -alpha - 1, -alpha, ply + 1, true);
          if (r > 0 && score > alpha) score = -this.search(newDepth, -alpha - 1, -alpha, ply + 1, true);
          if (pvNode && score > alpha && score < beta) score = -this.search(newDepth, -beta, -alpha, ply + 1, true);
        }
        board.unmakeMove();
        if (this.stopped) return 0;

        if (score > best) {
          best = score;
          if (score > alpha) {
            bestMove = m;
            alpha = score;
            // update principal variation
            const row = ply * MAX_PLY, child = (ply + 1) * MAX_PLY, cl = this.pvLen[ply + 1];
            this.pv[row + ply] = m;
            for (let j = ply + 1; j < cl; j++) this.pv[row + j] = this.pv[child + j];
            this.pvLen[ply] = cl > ply + 1 ? cl : ply + 1;
            if (ply === 0) {
              this.iterMove = m; this.iterScore = score;
              this.iterPv = Array.from(this.pv.subarray(0, this.pvLen[0]));
            }
            if (score >= beta) {
              if (isQuiet) this.updateQuietStats(m, ply, depth, qOff, qCount);
              break;
            }
          }
        }
      }

      if (legal === 0) return excluded ? alpha : inCheck ? -MATE + ply : 0;

      if (!excluded && !(ply === 0 && this.rootExcluded.length)) {
        const flag = best >= beta ? TT.LOWER : best > alphaOrig ? TT.EXACT : TT.UPPER;
        tt.store(lo, hi, depth, best, flag, bestMove, ply);
      }
      return best;
    }

    // ------------------------------------------------------------ quiescence
    qsearch(alpha, beta, ply) {
      const board = this.board;
      this.pvLen[ply] = ply;
      this.nodes++;
      if (ply > this.selDepth) this.selDepth = ply;
      if ((this.nodes & 2047) === 0) this.checkLimits();
      if (this.stopped) return 0;
      if (ply >= MAX_PLY - 2) return this.evaluate(board);

      const inCheck = board.inCheck();
      const tt = this.tt, lo = board.hashLo, hi = board.hashHi, slot = lo & tt.mask;
      const alphaOrig = alpha;
      let ttMove = 0, ttHit = false;
      if (tt.keys[slot] === hi && tt.flags[slot] !== 0) {
        ttHit = true;
        ttMove = tt.moves[slot];
        const f = tt.flags[slot];
        const sc = TranspositionTable.scoreFromTT(tt.scores[slot], ply);
        if (beta - alpha === 1) {
          if (f === TT.EXACT || (f === TT.LOWER && sc >= beta) || (f === TT.UPPER && sc <= alpha)) return sc;
        }
      }
      let best = -INF, standPat = -INF;
      if (!inCheck) {
        standPat = best = this.evaluate(board);
        if (standPat >= beta) return standPat;
        if (standPat > alpha) alpha = standPat;
      }

      const sq = board.sq, list = this.moveList, scores = this.moveScore;
      const off = ply * 256;
      const n = board.generateMoves(list, off, !inCheck) - off;
      for (let i = off; i < off + n; i++) {
        const m = list[i];
        if (m & FLAG_CAPTURE) {
          const victim = (m & FLAG_EP) ? PAWN : sq[(m >> 7) & 127] & 7;
          scores[i] = SEE_VALUE[victim] * 8 - (sq[m & 127] & 7);
        } else scores[i] = ((m >> 14) & 7) === QUEEN ? 7000 : 0;
        if (m === ttMove) scores[i] += 100000;
      }

      const us = board.side;
      let legal = 0;
      for (let i = 0; i < n; i++) {
        let bi = off + i, bs = scores[bi];
        for (let j = off + i + 1; j < off + n; j++) if (scores[j] > bs) { bs = scores[j]; bi = j; }
        const m = list[bi];
        list[bi] = list[off + i]; scores[bi] = scores[off + i];
        list[off + i] = m; scores[off + i] = bs;

        if (!inCheck) {
          const isCap = (m & FLAG_CAPTURE) !== 0;
          const victimVal = isCap ? ((m & FLAG_EP) ? 100 : SEE_VALUE[sq[(m >> 7) & 127] & 7]) : 0;
          const promoGain = ((m >> 14) & 7) ? 800 : 0;
          if (standPat + victimVal + promoGain + 200 <= alpha) continue; // delta pruning  TUNE
          if (isCap && victimVal < SEE_VALUE[sq[m & 127] & 7] && board.see(m) < 0) continue;
        }

        board.makeMove(m);
        if (board.isAttacked(board.kingSq[us], us ^ 1)) { board.unmakeMove(); continue; }
        legal++;
        const score = -this.qsearch(-beta, -alpha, ply + 1);
        board.unmakeMove();
        if (this.stopped) return 0;
        if (score > best) {
          best = score;
          if (score > alpha) { alpha = score; if (score >= beta) break; }
        }
      }

      if (inCheck && legal === 0) return -MATE + ply;
      // Store (depth 0) unless a deeper entry for this position exists.
      if (!(ttHit && tt.depths[slot] > 0)) {
        const flag = best >= beta ? TT.LOWER : best > alphaOrig ? TT.EXACT : TT.UPPER;
        tt.store(lo, hi, 0, best, flag, 0, ply);
      }
      return best;
    }
  }

  OCE.Search = Search;
})();
