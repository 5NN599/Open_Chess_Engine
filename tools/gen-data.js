#!/usr/bin/env node
/*
 * Open Chess Engine - self-play position generator (data for evaluation tuning).
 * SPDX-License-Identifier: MIT
 *
 *   node tools/gen-data.js --out data/part1.txt --seed 1 --depth 4 --seconds 600
 *
 * The engine plays games against itself from random openings. For every quiet
 * position it writes one line:
 *
 *     <score_cp> <result> <side_to_move> <token> <token> ...
 *
 *   score_cp  search score for the side to move (clipped)
 *   result    final game result from White's view: 1, 0.5 or 0
 *   side      0 = White to move, 1 = Black to move
 *   token     piece * 64 + square64 for every piece (piece code 1..14, square 0..63 with a1 = 0)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', 'js', 'engine');
['board', 'tt', 'eval', 'search', 'engine'].forEach((f) => require(path.join(root, f + '.js')));
const OCE = globalThis.OCE;

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
const outFile = opt('out', 'data/part.txt');
const depth = +opt('depth', 4);
const seconds = +opt('seconds', 60);
let seed = (+opt('seed', 1) * 2654435761) >>> 0 || 1;
const rnd = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; };

const engine = new OCE.Engine();
engine.setOption('Hash', 16);
const board = engine.board;
const out = fs.openSync(outFile, 'w');
const deadline = Date.now() + seconds * 1000;
let games = 0, positions = 0;

function tokens() {
  const t = [];
  for (let s = 0; s < 128; s++) {
    if (s & 0x88) continue;
    const p = board.sq[s];
    if (p) t.push(p * 64 + (s >> 4) * 8 + (s & 7));
  }
  return t.join(' ');
}

while (Date.now() < deadline) {
  engine.newGame();
  board.setFen(OCE.C.START_FEN);
  const moves = [];
  const pending = []; // lines waiting for the game result
  // random opening
  const plies = 6 + Math.floor(rnd() * 5);
  for (let i = 0; i < plies; i++) {
    const legal = board.legalMoves();
    if (!legal.length) break;
    const m = legal[Math.floor(rnd() * legal.length)];
    moves.push(board.moveToUci(m)); board.makeMove(m);
  }
  let result = null, winStreak = 0, lastSide = -1;
  for (let ply = 0; ply < 240 && result === null; ply++) {
    const legal = board.legalMoves();
    if (!legal.length) { result = board.inCheck() ? (board.side === 0 ? 0 : 1) : 0.5; break; }
    if (board.insufficientMaterial() || board.halfmove >= 100 || board.repetitionCount() >= 3) { result = 0.5; break; }
    let score = null, best = null;
    engine.setPosition(OCE.C.START_FEN, moves); // keeps repetition history (cheap at this depth)
    best = engine.go({ depth }, (info) => { if (info.multipv === 1) score = info.score; });
    const cp = score.mate !== undefined ? (score.mate > 0 ? 3000 : -3000) : score.cp;
    const bm = board.parseUci(best);
    const quiet = !(bm & (OCE.C.FLAG_CAPTURE)) && !((bm >> 14) & 7);
    if (quiet && !board.inCheck() && moves.length >= 8 && Math.abs(cp) < 2500) {
      pending.push(`${cp} @ ${board.side} ${tokens()}`);
    }
    // adjudication
    if (Math.abs(cp) >= 1200) { winStreak = lastSide === board.side || winStreak === 0 ? winStreak + 1 : 1; }
    else winStreak = 0;
    if (winStreak >= 8) { result = (cp > 0) === (board.side === 0) ? 1 : 0; break; }
    lastSide = board.side;
    let m = bm;
    if (rnd() < 0.04) m = legal[Math.floor(rnd() * legal.length)]; // a little noise for variety
    moves.push(board.moveToUci(m)); board.makeMove(m);
  }
  if (result === null) result = 0.5;
  fs.writeSync(out, pending.map((l) => l.replace('@', result)).join('\n') + (pending.length ? '\n' : ''));
  positions += pending.length; games++;
  if (games % 20 === 0) process.stderr.write(`\rgames ${games} positions ${positions}`);
}
fs.closeSync(out);
process.stderr.write(`\ndone: ${games} games, ${positions} positions -> ${outFile}\n`);
