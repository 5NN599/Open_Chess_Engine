/*
 * Node test: perft correctness, tactical puzzles and a speed check.
 * Run:  node tests/engine-test.js            (add "quick" to skip the slow parts)
 */
'use strict';
const path = require('path');
const root = path.join(__dirname, '..', 'js', 'engine');
['board', 'tt', 'eval', 'search', 'engine'].forEach((f) => require(path.join(root, f + '.js')));
const OCE = globalThis.OCE;
const quick = process.argv.includes('quick');
let failed = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) failed++; };

// ---- perft (known node counts from the chess programming wiki)
const board = new OCE.Board();
const perfts = [
  ['startpos', OCE.C.START_FEN, 5, 4865609],
  ['kiwipete', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', 4, 4085603],
  ['position 3', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', 5, 674624],
  ['position 4', 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', 4, 422333],
  ['position 5', 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', 4, 2103487],
  ['position 6', 'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10', 4, 3894594],
];
for (const [name, fen, depth, expected] of perfts) {
  board.setFen(fen);
  const n = board.perft(depth);
  check(n === expected, `perft ${name} depth ${depth}: ${n}`);
}

// ---- search puzzles
const engine = new OCE.Engine();
engine.setOption('Hash', 64);
const puzzles = [
  ['mate in 1 (back rank)', '6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1', ['a1a8'], 1000],
  ['mate in 2', 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4', ['h5f7'], 1000],
  ['WAC.001 queen sacrifice', '2rr3k/pp3pp1/1nnqbN1p/3pN3/2pP4/2P3Q1/PPB4P/R4RK1 w - - 0 1', ['g3g6'], 8000],
  ['WAC.003 rook lift', '5rk1/1ppb3p/p1pb4/6q1/3P1p1r/2P1R2P/PP1BQ1P1/5RKN w - - 0 1', ['e3g3'], 2000],
  ['WAC.004 Qxh7+', 'r1bq2rk/pp3pbp/2p1p1pQ/7P/3P4/2PB1N2/PP3PPR/2KR4 w - - 0 1', ['h6h7'], 2000],
  ['WAC.006 rook endgame', '7k/p7/1R5K/6r1/6p1/6P1/8/8 w - - 0 1', ['b6b7'], 2000],
  ['avoid stalemate, mate in 2', '7k/8/6K1/8/8/8/8/Q7 w - - 0 1', ['a1g7', 'a1a8', 'a1h1', 'a1b1', 'a1c1', 'a1d1', 'a1e1', 'a1f1', 'a1a7', 'g6g7', 'a1h8', 'a1f6'], 1000],
  ['capture hanging queen', 'rnb1kbnr/pppp1ppp/8/4p3/4P2q/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 1', ['f3h4'], 1000],
  ['KQ vs K mate', '8/8/8/4k3/8/8/8/KQ6 w - - 0 1', null, 1500],
  ['Lucena-like pawn race (promote)', '8/P7/8/8/8/8/k1K5/8 w - - 0 1', ['a7a8q'], 800],
];
for (const [name, fen, expected, ms] of puzzles) {
  engine.newGame();
  engine.setPosition(fen, []);
  let last = null;
  const best = engine.go({ movetime: ms }, (i) => { if (i.multipv === 1) last = i; });
  const ok = expected ? expected.includes(best) : !!best;
  check(ok, `${name}: ${best}  (depth ${last && last.depth}, score ${JSON.stringify(last && last.score)})`);
}

// ---- speed
if (!quick) {
  engine.newGame();
  engine.setPosition(OCE.C.START_FEN, []);
  let last = null;
  engine.go({ movetime: 3000 }, (i) => { last = i; });
  console.log(`startpos 3s: depth ${last.depth}, nodes ${last.nodes}, nps ${last.nps}`);
  engine.newGame();
  engine.setPosition('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', []);
  engine.go({ movetime: 3000 }, (i) => { last = i; });
  console.log(`kiwipete 3s: depth ${last.depth}, nps ${last.nps}, pv ${last.pv.slice(0, 6).join(' ')}`);
}

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
