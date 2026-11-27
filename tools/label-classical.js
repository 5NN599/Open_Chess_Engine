#!/usr/bin/env node
/*
 * Open Chess Engine - adds the classical evaluation of every training position.
 * SPDX-License-Identifier: MIT
 *
 *   node tools/label-classical.js data/part1.txt data/part2.txt
 *
 * Writes <file>.cls with one number per input line (classical eval, side-to-move view).
 * tools/tune.py uses it as the baseline when fitting evaluation corrections.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', 'js', 'engine');
['board', 'tt', 'eval'].forEach((f) => require(path.join(root, f + '.js')));
const OCE = globalThis.OCE;
const board = new OCE.Board();

for (const file of process.argv.slice(2)) {
  const out = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const p = line.split(' ');
    board.sq.fill(0); board.cnt.fill(0);
    for (let i = 3; i < p.length; i++) {
      const t = +p[i], piece = t >> 6, s = t & 63;
      board.sq[(s >> 3) * 16 + (s & 7)] = piece; board.cnt[piece]++;
      if ((piece & 7) === 6) board.kingSq[piece >> 3] = (s >> 3) * 16 + (s & 7);
    }
    board.side = +p[2];
    out.push(OCE.evaluate(board));
  }
  fs.writeFileSync(file + '.cls', out.join('\n') + '\n');
  console.log(`${file}: ${out.length} positions`);
}
