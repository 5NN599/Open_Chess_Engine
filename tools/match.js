#!/usr/bin/env node
/*
 * Open Chess Engine - engine vs engine match (to measure whether a change really helps).
 * SPDX-License-Identifier: MIT
 *
 *   node tools/match.js --a ../baseline/js/engine --b js/engine --games 40 --movetime 100 [--seed 1]
 *
 * --a / --b are directories holding two versions of the engine files (e.g. a saved copy vs the working tree).
 * Each version is loaded into its own sandbox, so they cannot interfere.
 * Games start from random openings; every opening is played twice with colours swapped.
 * Prints "A_wins draws B_wins" so several processes can be summed, plus an Elo estimate.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/** Loads one engine version into a private context and returns its OCE namespace. */
function load(dir) {
  const ctx = vm.createContext({ console });
  for (const f of ['board', 'tt', 'eval-tuned', 'eval', 'search', 'engine']) {
    const file = path.resolve(dir, f + '.js');
    if (fs.existsSync(file)) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
  }
  return vm.runInContext('OCE', ctx);
}

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const dirA = opt('a', '../baseline/js/engine'), dirB = opt('b', 'js/engine');
const OCE = load(dirB), OCE_A = load(dirA);
const games = +opt('games', 20), movetime = +opt('movetime', 100);
let seed = (+opt('seed', 1) * 2654435761) >>> 0 || 1;
const rnd = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; };

const A = new OCE_A.Engine(), B = new OCE.Engine();
for (const e of [A, B]) e.setOption('Hash', 16);

function randomOpening(plies) {
  const b = new OCE.Board(); const moves = [];
  for (let i = 0; i < plies; i++) {
    const legal = b.legalMoves(); if (!legal.length) break;
    const m = legal[Math.floor(rnd() * legal.length)];
    moves.push(b.moveToUci(m)); b.makeMove(m);
  }
  return moves;
}

/** Plays one game; returns result from White's view (1, 0.5, 0). */
function play(white, black, opening) {
  white.newGame(); black.newGame();
  const moves = opening.slice();
  const ref = new OCE.Board();
  let streak = 0, streakSign = 0;
  for (let ply = 0; ply < 300; ply++) {
    ref.setFen(OCE.C.START_FEN); moves.forEach((u) => ref.makeMove(ref.parseUci(u)));
    const legal = ref.legalMoves();
    if (!legal.length) return ref.inCheck() ? (ref.side === 0 ? 0 : 1) : 0.5;
    if (ref.insufficientMaterial() || ref.halfmove >= 100 || ref.repetitionCount() >= 3) return 0.5;
    const eng = ref.side === 0 ? white : black;
    eng.setPosition(OCE.C.START_FEN, moves);
    let score = null;
    const best = eng.go({ movetime }, (i) => { if (i.multipv === 1) score = i.score; });
    const cp = score.mate !== undefined ? (score.mate > 0 ? 5000 : -5000) : score.cp;
    const w = ref.side === 0 ? cp : -cp; // white's view
    if (Math.abs(w) >= 900 && Math.sign(w) === streakSign) streak++; else { streak = Math.abs(w) >= 900 ? 1 : 0; streakSign = Math.sign(w); }
    if (streak >= 6) return w > 0 ? 1 : 0;
    moves.push(best);
  }
  return 0.5;
}

let aW = 0, d = 0, bW = 0;
for (let g = 0; g < games; g += 2) {
  const opening = randomOpening(6);
  for (const aWhite of [true, false]) {
    if (g + (aWhite ? 0 : 1) >= games) break;
    const r = aWhite ? play(A, B, opening) : play(B, A, opening);
    const aScore = aWhite ? r : 1 - r;
    if (aScore === 1) aW++; else if (aScore === 0) bW++; else d++;
  }
}
const n = aW + d + bW, score = (aW + d / 2) / n;
const elo = n ? -400 * Math.log10(1 / Math.max(score, 1e-3) - 1) : 0;
console.log(`RESULT A(${dirA}) vs B(${dirB}): +${aW} =${d} -${bW}  score ${(score * 100).toFixed(1)}%  Elo(A-B) ${elo.toFixed(0)}`);
console.log(`COUNTS ${aW} ${d} ${bW}`);
