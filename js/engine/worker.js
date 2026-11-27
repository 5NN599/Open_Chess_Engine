/*
 * Open Chess Engine - worker.js
 * SPDX-License-Identifier: MIT
 *
 * Runs the engine off the UI thread. Messages in:
 *   { cmd: 'shared', tt, ctrl, id, threads }   (multi-thread mode, see engine-client.js)
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
    case 'shared': // multi-thread mode: { tt, ctrl: SharedArrayBuffers, id, threads }
      engine.attachShared(m.tt, m.ctrl, m.id, m.threads);
      break;
    case 'newgame':
      engine.newGame(!engine.shared); // the host clears a shared table itself
      break;
    case 'option':
      engine.setOption(m.name, m.value);
      break;
    case 'position':
      engine.setPosition(m.fen, m.moves);
      break;
    case 'go': {
      const limits = m.limits || {};
      const move = engine.go(limits, (info) => self.postMessage({ type: 'info', id: m.id, info }));
      if (!limits.helper) self.postMessage({ type: 'bestmove', id: m.id, move }); // helper threads stay silent
      break;
    }
    default:
      break;
  }
};
