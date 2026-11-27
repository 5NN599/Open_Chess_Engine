/*
 * Open Chess Engine - pgn.js
 * SPDX-License-Identifier: MIT
 *
 * PGN / SAN parsing. Understands headers, comments {..} and ;.., variations (..),
 * NAGs ($1), move numbers glued to moves ("1.e4"), annotation marks (!?), castling
 * written with zeros, multiple games in one text, and the SetUp/FEN header.
 * Plain move lists without headers ("e4 e5 Nf3 Nc6") and UCI move lists
 * ("e2e4 e7e5") also work.
 *
 *   const { games } = OCE.parsePgn(text);
 *   games[0] -> { headers, startFen, moves: [{ uci, san }], result, error }
 */
(function () {
  'use strict';

  const OCE = (globalThis.OCE = globalThis.OCE || {});
  const { PAWN, FLAG_CASTLE, START_FEN } = OCE.C;

  /** Find the legal move matching a SAN string (tolerant of annotations). Returns 0 if none. */
  function parseSan(board, str) {
    let s = String(str).replace(/[+#!?]+$/g, '').replace(/e\.p\./i, '').trim();
    if (!s) return 0;
    const legal = board.legalMoves();

    if (/^[0O]-[0O](-[0O])?$/.test(s)) {
      const queenSide = s.split('-').length === 3;
      for (const m of legal) {
        if ((m & FLAG_CASTLE) && (((m >> 7) & 127) < (m & 127)) === queenSide) return m;
      }
      return 0;
    }

    const re = /^([NBRQK])?([a-h])?([1-8])?[x:-]?([a-h][1-8])(?:=?([NBRQnbrq]))?$/;
    const t = re.exec(s);
    if (t) {
      const type = t[1] ? ' PNBRQK'.indexOf(t[1]) : PAWN;
      const to = OCE.parseSq(t[4]);
      const promo = t[5] ? ' PNBRQK'.indexOf(t[5].toUpperCase()) : 0;
      const found = legal.filter((m) => {
        const from = m & 127;
        if ((board.sq[from] & 7) !== type || ((m >> 7) & 127) !== to || ((m >> 14) & 7) !== promo) return false;
        if (t[2] && 'abcdefgh'[from & 7] !== t[2]) return false;
        if (t[3] && String((from >> 4) + 1) !== t[3]) return false;
        return true;
      });
      if (found.length === 1) return found[0];
      if (found.length > 1) return 0; // ambiguous
    }
    return board.parseUci(s.toLowerCase()); // maybe it is a UCI move such as "g1f3"
  }

  /** Split text into tag tokens and movetext words, dropping comments and variations. */
  function tokenize(text) {
    const tokens = [];
    const n = text.length;
    let i = 0;
    const skipBraces = () => { while (i < n && text[i] !== '}') i++; i++; };
    while (i < n) {
      const c = text[i];
      if (c === '{') { i++; skipBraces(); }
      else if (c === ';') { while (i < n && text[i] !== '\n') i++; }
      else if (c === '%' && (i === 0 || text[i - 1] === '\n')) { while (i < n && text[i] !== '\n') i++; }
      else if (c === '(') {
        let depth = 0;
        while (i < n) {
          if (text[i] === '{') { i++; skipBraces(); continue; }
          if (text[i] === '(') depth++;
          else if (text[i] === ')') { depth--; if (depth === 0) { i++; break; } }
          i++;
        }
      } else if (c === '[') {
        const m = /^\[\s*(\w+)\s+"((?:[^"\\]|\\.)*)"\s*\]/.exec(text.slice(i, i + 2000));
        if (m) { tokens.push({ tag: m[1], value: m[2].replace(/\\(.)/g, '$1') }); i += m[0].length; }
        else i++;
      } else if (/\s/.test(c)) i++;
      else {
        let j = i;
        while (j < n && !/[\s{(;[]/.test(text[j])) j++;
        tokens.push({ word: text.slice(i, j) });
        i = j;
      }
    }
    return tokens;
  }

  function parsePgn(text) {
    const games = [];
    let cur = null;
    const begin = () => ({ headers: {}, sanTokens: [], result: '*', finished: false });
    for (const tok of tokenize(String(text))) {
      if (tok.tag) {
        if (!cur || cur.sanTokens.length || cur.finished) { if (cur) games.push(cur); cur = begin(); }
        cur.headers[tok.tag] = tok.value;
        continue;
      }
      if (!cur) cur = begin();
      let w = tok.word;
      if (/^(1-0|0-1|1\/2-1\/2|\*)$/.test(w)) { cur.result = w; cur.finished = true; continue; }
      if (cur.finished) { games.push(cur); cur = begin(); }
      if (/^\$\d+$/.test(w)) continue;                 // NAG
      w = w.replace(/^\d+\.+/, '');                     // "1.e4" / "12...Nf6"
      if (!w || /^\.+$/.test(w)) continue;
      if (/^\d+$/.test(w)) continue;                    // bare move number
      cur.sanTokens.push(w);
    }
    if (cur && (cur.sanTokens.length || Object.keys(cur.headers).length)) games.push(cur);

    const out = [];
    for (const g of games) {
      const fen = g.headers.FEN && g.headers.SetUp !== '0' ? g.headers.FEN : START_FEN;
      const board = new OCE.Board();
      const game = { headers: g.headers, startFen: fen, moves: [], result: g.result, error: null };
      if (!board.setFen(fen)) { game.error = 'Invalid FEN header'; out.push(game); continue; }
      game.startFen = board.getFen();
      for (let i = 0; i < g.sanTokens.length; i++) {
        const m = parseSan(board, g.sanTokens[i]);
        if (!m) { game.error = `Cannot read move "${g.sanTokens[i]}" (ply ${i + 1})`; break; }
        game.moves.push({ uci: board.moveToUci(m), san: board.moveToSan(m) });
        board.makeMove(m);
      }
      out.push(game);
    }
    return { games: out };
  }

  OCE.parseSan = parseSan;
  OCE.parsePgn = parsePgn;
})();
