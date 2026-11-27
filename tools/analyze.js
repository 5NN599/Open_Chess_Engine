#!/usr/bin/env node
/*
 * Open Chess Engine - command line game review.
 * SPDX-License-Identifier: MIT
 *
 *   node tools/analyze.js game.pgn [--time 1000] [--depth 16] [--game 2]
 *
 * Prints every move with its classification, the best alternative and the
 * evaluation, followed by the accuracy of both sides.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', 'js', 'engine');
['board', 'tt', 'eval', 'search', 'engine', 'pgn', 'review'].forEach((f) => require(path.join(root, f + '.js')));
const OCE = globalThis.OCE;

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? Number(args[i + 1]) : def; };
const file = args.find((a) => !a.startsWith('--') && !/^\d+$/.test(a));
if (!file) { console.error('usage: node tools/analyze.js game.pgn [--time ms] [--depth n] [--game n]'); process.exit(1); }

const { games } = OCE.parsePgn(fs.readFileSync(file, 'utf8'));
const game = games[opt('game', 1) - 1];
if (!game) { console.error('game not found'); process.exit(1); }
if (game.error) console.error('warning: ' + game.error);

const engine = new OCE.Engine();
const result = OCE.Review.analyzeSync(engine, game, {
  movetime: opt('time', 1000), depth: opt('depth', 0),
  onProgress: (i, n) => process.stderr.write(`\rposition ${i}/${n}`),
});
process.stderr.write('\n');
const fmt = (cp) => (Math.abs(cp) >= 10000 ? (cp > 0 ? '1-0' : '0-1') : Math.abs(cp) >= 9000 ? (cp > 0 ? '+M' : '-M') + (10000 - Math.abs(cp)) : (cp > 0 ? '+' : '') + (cp / 100).toFixed(2));
for (const p of result.plies) {
  const num = p.color === 0 ? `${Math.ceil(p.ply / 2)}.` : `${Math.ceil(p.ply / 2)}...`;
  console.log(`${num.padEnd(6)}${p.san.padEnd(8)}${fmt(p.evalAfter).padStart(7)}  ${p.cls}${p.isBest ? '' : '  (best: ' + p.bestSan + ')'}`);
}
console.log(`\nAccuracy  White ${result.accuracy.white.toFixed(1)}%   Black ${result.accuracy.black.toFixed(1)}%`);
