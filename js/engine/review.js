/*
 * Open Chess Engine - review.js
 * SPDX-License-Identifier: MIT
 *
 * Game review: turn per-position engine results into move classifications,
 * accuracy scores and an evaluation curve.
 *
 * The maths is independent of how the engine is run, so the browser UI (async,
 * through a worker) and the Node tools (synchronous) share it:
 *
 *   const positions = OCE.Review.preparePositions(game);       // FEN for every position
 *   // ... search each non-terminal position, collect { score, best, pv } ...
 *   const result = OCE.Review.evaluate(game, positions, raw);
 *
 * or, with a synchronous engine:
 *
 *   const result = OCE.Review.analyzeSync(new OCE.Engine(), game, { movetime: 500 });
 *
 * Classification uses the change in win probability caused by the move
 * (same idea as Lichess): best / excellent / good / inaccuracy / mistake / blunder.
 */
(function () {
  'use strict';

  const OCE = (globalThis.OCE = globalThis.OCE || {});

  const MATE_CP = 10000;

  // Thresholds on the win-probability drop (percentage points). TUNE.
  const THRESHOLDS = { excellent: 2, good: 5, inaccuracy: 10, mistake: 20 };

  function scoreToCp(score) {
    if (score.mate !== undefined) return score.mate > 0 ? MATE_CP - score.mate : -MATE_CP - score.mate;
    return score.cp;
  }

  /** Expected score for the side with `cp` centipawns, in percent (Lichess curve). */
  function winPercent(cp) {
    const c = Math.max(-1000, Math.min(1000, cp));
    return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * c)) - 1);
  }

  /** Accuracy of a single move from the win-probability it lost. */
  function moveAccuracy(drop) {
    return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * drop) - 3.1669 + 1));
  }

  function classify(drop, isBest) {
    if (isBest) return 'best';
    if (drop < THRESHOLDS.excellent) return 'excellent';
    if (drop < THRESHOLDS.good) return 'good';
    if (drop < THRESHOLDS.inaccuracy) return 'inaccuracy';
    if (drop < THRESHOLDS.mistake) return 'mistake';
    return 'blunder';
  }

  /** List every position of the game; terminal positions carry a fixed score. */
  function preparePositions(game) {
    const b = new OCE.Board();
    b.setFen(game.startFen);
    const out = [];
    for (let i = 0; i <= game.moves.length; i++) {
      let terminal = null;
      if (!b.legalMoves().length) terminal = { cp: b.inCheck() ? -MATE_CP : 0 };
      else if (b.insufficientMaterial()) terminal = { cp: 0 };
      out.push({ fen: b.getFen(), side: b.side, terminal });
      if (i < game.moves.length) b.makeMove(b.parseUci(game.moves[i].uci));
    }
    return out;
  }

  /**
   * @param game       { startFen, moves: [{uci, san}] }
   * @param positions  result of preparePositions
   * @param raw        raw[i] = { score: {cp|mate}, best: 'e2e4', pv: [...] } (null for terminal positions)
   */
  function evaluate(game, positions, raw) {
    const n = game.moves.length;
    const stm = (i) => (positions[i].terminal ? positions[i].terminal.cp : scoreToCp(raw[i].score)); // side-to-move view
    const white = (i) => (positions[i].side === 0 ? stm(i) : -stm(i));

    const evals = [];
    for (let i = 0; i <= n; i++) evals.push(white(i));

    const board = new OCE.Board();
    const plies = [];
    const acc = [[], []];
    const counts = [{}, {}];
    for (let i = 0; i < n; i++) {
      const color = positions[i].side;
      const before = stm(i);
      const after = -stm(i + 1);
      const best = raw[i] ? raw[i].best : null;
      const isBest = best === game.moves[i].uci;
      let drop = Math.max(0, winPercent(before) - winPercent(after));
      if (isBest) drop = 0;
      const cls = classify(drop, isBest);

      let bestSan = null;
      if (best) {
        board.setFen(positions[i].fen);
        const bm = board.parseUci(best);
        if (bm) bestSan = board.moveToSan(bm);
      }
      plies.push({
        ply: i + 1, color, san: game.moves[i].san, uci: game.moves[i].uci,
        evalAfter: evals[i + 1], best, bestSan, isBest, drop, cls, accuracy: moveAccuracy(drop),
      });
      acc[color].push(moveAccuracy(drop));
      counts[color][cls] = (counts[color][cls] || 0) + 1;
    }
    const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
    const harmonic = (a) => (a.length ? a.length / a.reduce((x, y) => x + 1 / Math.max(y, 1), 0) : 0);
    const accuracy = acc.map((a) => (mean(a) + harmonic(a)) / 2);
    return { evals, plies, accuracy: { white: accuracy[0], black: accuracy[1] }, counts: { white: counts[0], black: counts[1] } };
  }

  /** Blocking analysis with a synchronous engine (Node tools, tests, workers). */
  function analyzeSync(engine, game, opts) {
    opts = opts || {};
    const limits = opts.depth ? { depth: opts.depth } : { movetime: opts.movetime || 500 };
    const positions = preparePositions(game);
    const raw = [];
    positions.forEach((p, i) => {
      if (p.terminal) { raw.push(null); return; }
      engine.setPosition(p.fen, []);
      let last = null;
      const best = engine.go(limits, (info) => { if (info.multipv === 1) last = info; });
      raw.push({ score: last.score, best, pv: last.pv });
      if (opts.onProgress) opts.onProgress(i + 1, positions.length);
    });
    return evaluate(game, positions, raw);
  }

  OCE.Review = { preparePositions, evaluate, analyzeSync, scoreToCp, winPercent, moveAccuracy, classify, THRESHOLDS };
})();
