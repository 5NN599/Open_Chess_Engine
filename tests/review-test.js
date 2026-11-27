/*
 * Node test for the PGN parser and the game review.
 * Run:  node tests/review-test.js
 */
'use strict';
const path = require('path');
const root = path.join(__dirname, '..', 'js', 'engine');
['board', 'tt', 'eval', 'search', 'engine', 'pgn', 'review'].forEach((f) => require(path.join(root, f + '.js')));
const OCE = globalThis.OCE;
let failed = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) failed++; };

// ---- PGN parsing
const pgn = `[Event "Test (club)"]
[White "Alice"]
[Black "Bob"]
[Result "1-0"]

1. e4 {best by test} e5 2. Nf3 (2. f4 exf4) 2... Nc6 $1 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7
6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 Nbd7 ; comment to end of line
11.Nbd2 Bb7 12.Bc2 Re8 1-0

[Event "Second"]
[White "C"]
[Black "D"]

1. d4 d5 2. c4 e6 *`;
const parsed = OCE.parsePgn(pgn);
check(parsed.games.length === 2, 'two games found');
check(!parsed.games[0].error && parsed.games[0].moves.length === 24, `game 1 has 24 plies (${parsed.games[0].moves.length}) ${parsed.games[0].error || ''}`);
check(parsed.games[0].headers.White === 'Alice' && parsed.games[0].result === '1-0', 'headers and result');
check(parsed.games[1].moves.map((m) => m.san).join(' ') === 'd4 d5 c4 e6', 'game 2 moves');
const plain = OCE.parsePgn('e4 e5 Nf3 Nc6 Bb5');
check(plain.games[0].moves.length === 5, 'plain SAN list');
const uciList = OCE.parsePgn('e2e4 e7e5 g1f3');
check(uciList.games[0].moves.length === 3, 'UCI list');
const bad = OCE.parsePgn('1. e4 e5 2. Ke3');
check(bad.games[0].error && bad.games[0].moves.length === 2, 'illegal move reported: ' + bad.games[0].error);
const fenGame = OCE.parsePgn('[SetUp "1"]\n[FEN "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1"]\n\n1. e4 Kd7');
check(fenGame.games[0].moves.length === 2, 'FEN header start position');

// ---- Review: 3...Nf6?? allows Qxf7# (Scholar's mate), so it must be flagged as a blunder
const game = OCE.parsePgn('1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7#').games[0];
check(!game.error && game.moves.length === 7, 'review game parsed');
const engine = new OCE.Engine();
const t0 = Date.now();
const result = OCE.Review.analyzeSync(engine, game, { movetime: 200 });
console.log(`analysed ${game.moves.length} plies in ${Date.now() - t0} ms`);
check(result.plies.length === game.moves.length, 'one entry per ply');
check(result.evals.length === game.moves.length + 1, 'evaluation curve has N+1 points');
const blunder = result.plies.find((p) => p.san === 'Nf6');
check(blunder && blunder.cls === 'blunder', `3...Nf6 flagged as ${blunder && blunder.cls} (best was ${blunder && blunder.bestSan})`);
const mateMove = result.plies.find((p) => p.san === 'Qxf7#');
check(mateMove && mateMove.cls === 'best', 'Qxf7# is the best move');
check(result.accuracy.white > result.accuracy.black, `accuracy W ${result.accuracy.white.toFixed(1)} / B ${result.accuracy.black.toFixed(1)}`);
console.log(result.plies.map((p) => `${p.ply}. ${p.san} [${p.cls}${p.isBest ? '' : ', best ' + p.bestSan}]`).join('\n'));

// ---- Terminal positions (game ending in mate) must not crash
const mate = OCE.parsePgn('1. f3 e5 2. g4 Qh4#').games[0];
const mateResult = OCE.Review.analyzeSync(engine, mate, { movetime: 100 });
check(mateResult.evals[4] <= -9000, 'checkmate position scored as lost for White');

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
