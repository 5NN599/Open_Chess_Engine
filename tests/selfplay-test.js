/*
 * Node stress test: the engine plays itself for a few short games and every
 * move it returns must be legal. Run:  node tests/selfplay-test.js
 */
'use strict';
const path = require('path');
const root = path.join(__dirname, '..', 'js', 'engine');
['board', 'tt', 'eval', 'search', 'engine'].forEach((f) => require(path.join(root, f + '.js')));
const OCE = globalThis.OCE;

const openings = [[], ['e2e4', 'c7c5'], ['d2d4', 'g8f6', 'c2c4', 'e7e6'], ['g1f3', 'd7d5', 'g2g3']];
let problems = 0;
openings.forEach((opening, g) => {
  const engine = new OCE.Engine();
  engine.setOption('MultiPV', g % 2 ? 2 : 1);
  engine.setOption('Skill', g === 3 ? 8 : 20);
  const moves = opening.slice();
  const ref = new OCE.Board();
  let result = '*';
  for (let ply = 0; ply < 160; ply++) {
    engine.setPosition(OCE.C.START_FEN, moves);
    ref.setFen(OCE.C.START_FEN);
    moves.forEach((u) => ref.makeMove(ref.parseUci(u)));
    const legal = ref.legalMoves();
    if (!legal.length) { result = ref.inCheck() ? (ref.side ? '1-0' : '0-1') : '1/2-1/2 (stalemate)'; break; }
    if (ref.halfmove >= 100 || ref.repetitionCount() >= 3 || ref.insufficientMaterial()) { result = '1/2-1/2 (rule)'; break; }
    const best = engine.go({ movetime: 60 });
    if (!best || !ref.parseUci(best)) { console.log(`game ${g}: ILLEGAL/NULL move ${best} in ${ref.getFen()}`); problems++; break; }
    moves.push(best);
  }
  console.log(`game ${g + 1}: ${moves.length} plies, result ${result}`);
});
console.log(problems ? 'FAILED' : 'Self-play OK');
process.exit(problems ? 1 : 0);
