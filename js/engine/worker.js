/*
 * Open Chess Engine - worker.js
 * SPDX-License-Identifier: MIT
 *
 * Runs the engine off the UI thread. Messages in:
 *   { cmd: 'newgame' }
 *   { cmd: 'option',   name, value }
 *   { cmd: 'position', fen, moves: ['e2e4', ...] }
 *   { cmd: 'go',       id, limits: { movetime | depth | nodes | infinite | wtime/btime/winc/binc } }
 * Messages out:
 *   { type: 'info',     id, info }     one per analysed line per completed depth
 *   { type: 'bestmove', id, move }     UCI string, or null if there is no legal move
 *
 * The search runs synchronously; to cancel it the host simply terminates the worker.
 */
importScripts('board.js', 'tt.js', 'eval-tuned.js', 'eval.js', 'search.js', 'engine.js');

const engine = new OCE.Engine();

self.onmessage = (e) => {
  const m = e.data;
  switch (m.cmd) {
    case 'newgame':
      engine.newGame();
      break;
    case 'option':
      engine.setOption(m.name, m.value);
      break;
    case 'position':
      engine.setPosition(m.fen, m.moves);
      break;
    case 'go': {
      const move = engine.go(m.limits || {}, (info) => self.postMessage({ type: 'info', id: m.id, info }));
      self.postMessage({ type: 'bestmove', id: m.id, move });
      break;
    }
    default:
      break;
  }
};
