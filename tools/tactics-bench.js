#!/usr/bin/env node
/*
 * Open Chess Engine - tactics-bench.js
 * SPDX-License-Identifier: MIT
 *
 * Measures how well a version of the engine finds "hidden" moves: positions where a shallow search picks a
 * different move than a long reference search.
 *
 *   node tools/tactics-bench.js make --data data/part1.txt --count 80 --offset 0 --ref 1500 > set0.jsonl
 *   node tools/tactics-bench.js run  --dir js/engine --set set0.jsonl --movetime 300
 *
 * `make` keeps positions whose depth-8 move differs from the reference move; `run` reports how many of them
 * a given engine directory solves within the time limit (run it for two versions to compare them).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function load(dir, sp) {
  const ctx = vm.createContext({ console });
  if (sp) vm.runInContext('globalThis.OCE = { SP: ' + sp + ' };', ctx);
  for (const f of ['board', 'tt', 'eval-tuned', 'eval', 'search', 'engine']) {
    const file = path.resolve(dir, f + '.js');
    if (fs.existsSync(file)) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
  }
  return vm.runInContext('OCE', ctx);
}
const args = process.argv.slice(2);
const cmd = args[0];
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };

function tokensToFen(stm, tokens) {
  const rows = [];
  const grid = Array.from({ length: 8 }, () => Array(8).fill(''));
  const letters = ['', 'p', 'n', 'b', 'r', 'q', 'k'];
  for (const t of tokens) {
    const piece = t >> 6, sq = t & 63, type = piece & 7, color = piece >> 3;
    const ch = letters[type];
    grid[sq >> 3][sq & 7] = color === 0 ? ch.toUpperCase() : ch;
  }
  for (let r = 7; r >= 0; r--) {
    let s = '', n = 0;
    for (let f = 0; f < 8; f++) { if (grid[r][f]) { if (n) s += n; n = 0; s += grid[r][f]; } else n++; }
    rows.push(s + (n || ''));
  }
  return rows.join('/') + ' ' + (stm === 0 ? 'w' : 'b') + ' - - 0 1';
}

if (cmd === 'make') {
  // Reference move = a move on which two differently tuned configurations agree after a long search, so the set does
  // not simply reward whichever configuration produced it.
  const SAFE = '{"lmrDiv":3.0,"badCapDepth":1,"rfp":110,"futMul":140,"lmpBase":6}';
  const A = load('js/engine', null), B = load('js/engine', SAFE);
  const lines = fs.readFileSync(opt('data', 'data/part1.txt'), 'utf8').split('\n').filter(Boolean);
  const count = +opt('count', 80), offset = +opt('offset', 0), ref = +opt('ref', 1500);
  const step = 37;
  let kept = 0;
  const ea = new A.Engine(), eb = new B.Engine();
  ea.setOption('Hash', 32); eb.setOption('Hash', 32);
  for (let i = offset; i < lines.length && kept < count; i += step) {
    const p = lines[i].trim().split(/\s+/).map(Number);
    if (p.slice(3).length < 14) continue; // skip endgames
    const fen = tokensToFen(p[2], p.slice(3));
    ea.newGame(); if (!ea.setPosition(fen, [])) continue;
    const shallow = ea.go({ depth: 8 }, () => {});
    if (!shallow) continue;
    ea.newGame(); ea.setPosition(fen, []);
    let last = null;
    const bestA = ea.go({ movetime: ref }, (info) => { if (info.multipv === 1) last = info; });
    if (!bestA || bestA === shallow || !last || last.depth < 14 || last.score.cp === undefined || Math.abs(last.score.cp) > 600) continue;
    eb.newGame(); eb.setPosition(fen, []);
    const bestB = eb.go({ movetime: ref }, () => {});
    if (bestB === bestA) { console.log(JSON.stringify({ fen, best: bestA, depth: last.depth })); kept++; }
  }
} else if (cmd === 'run') {
  const OCE = load(opt('dir', 'js/engine'), opt('sp', null));
  const set = fs.readFileSync(opt('set'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const mt = +opt('movetime', 300), nodes = +opt('nodes', 0);
  const e = new OCE.Engine(); e.setOption('Hash', 32);
  let solved = 0;
  for (const s of set) {
    e.newGame(); e.setPosition(s.fen, []);
    const mv = e.go(nodes ? { nodes } : { movetime: mt }, () => {});
    if (mv === s.best) solved++;
  }
  console.log(`${opt('dir', 'js/engine')} ${opt('sp', '')}: solved ${solved}/${set.length} at ${nodes ? nodes + ' nodes' : mt + ' ms'}`);
}
