/*
 * Open Chess Engine - app.js
 * SPDX-License-Identifier: MIT
 *
 * Board UI: click-to-move, engine play, live analysis, eval bar, move list, FEN/PGN.
 * This file only talks to the engine through OCE.EngineClient (engine-client.js).
 */
(function () {
  'use strict';

  const OCE = globalThis.OCE;
  const C = OCE.C;
  const $ = (id) => document.getElementById(id);
  const t = (key, params) => OCE.I18N.t(key, params);

  // Solid glyphs for both colours; colour comes from CSS. U+FE0E forces text (not emoji) style.
  const GLYPH = ['', '♟︎', '♞︎', '♝︎', '♜︎', '♛︎', '♚︎'];

  const board = new OCE.Board();          // the game being played
  const scratch = new OCE.Board();        // used to convert engine lines into SAN
  const client = new OCE.EngineClient();

  const S = {
    startFen: C.START_FEN,
    hist: [],             // [{ m, san, uci }]
    flipped: false,
    selected: -1,
    targets: [],          // legal moves from the selected square
    lastMove: 0,
    lines: [],            // latest engine info per MultiPV line
    searchSide: 0,        // side to move when the current search started
    thinking: false,      // engine is choosing its own move
    over: null,           // result key (mateWhite, stalemate, ...) once the game has ended
    stats: null,
  };

  // Game review state (see the "Game review" section further down).
  const R = { game: null, result: null, running: false, token: 0, games: [], info: null, fen: null };
  const SYMBOL = { best: '\u2605', inaccuracy: '?!', mistake: '?', blunder: '??' }; // shown next to moves in the list
  // Badge drawn on the destination square of the reviewed move (like chess.com's move icons).
  const BADGE = { best: '\u2605', excellent: '!', good: '\u2713', inaccuracy: '?!', mistake: '?', blunder: '??' };
  const label = (c) => t('c_' + c);

  /** Status line under the board and engine-stats line are kept as (key, params) so a language switch can redraw them. */
  function setStats(key, params) { S.stats = [key, params]; $('engine-stats').textContent = t(key, params); }
  function setInfo(key, params) { R.info = key ? [key, params] : null; $('review-info').textContent = key ? t(key, params) : ''; }

  const boardEl = $('board');
  let cells = [];

  // ----------------------------------------------------------------- helpers
  const mode = () => $('opt-mode').value;
  /** Colour played by the engine, or -1 for analysis-board mode. */
  function engineSide() {
    const m = mode();
    return m === 'white' ? C.BLACK : m === 'black' ? C.WHITE : -1;
  }
  const isEngineTurn = () => engineSide() === board.side;
  const uciHistory = () => S.hist.map((h) => h.uci);

  function formatScore(score) {
    if (score.mate !== undefined) return (score.mate < 0 ? '-M' : '+M') + Math.abs(score.mate);
    const v = score.cp / 100;
    return (v > 0 ? '+' : '') + v.toFixed(2);
  }

  /** Convert a side-to-move-relative score into a White-relative one. */
  function whiteScore(score, side) {
    const k = side === C.WHITE ? 1 : -1;
    return score.mate !== undefined ? { mate: score.mate * k } : { cp: score.cp * k };
  }

  function pvToSan(fen, pv, limit) {
    scratch.setFen(fen);
    const out = [];
    for (let i = 0; i < pv.length && i < limit; i++) {
      const m = scratch.parseUci(pv[i]);
      if (!m) break;
      const num = scratch.fullmove;
      let prefix = '';
      if (scratch.side === C.WHITE) prefix = num + '. ';
      else if (i === 0) prefix = num + '... ';
      out.push(prefix + scratch.moveToSan(m));
      scratch.makeMove(m);
    }
    return out.join(' ');
  }

  // ------------------------------------------------------------------- board
  function buildBoard() {
    boardEl.innerHTML = '';
    cells = new Array(128);
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const rank = S.flipped ? row : 7 - row;
        const file = S.flipped ? 7 - col : col;
        const sq = rank * 16 + file;
        const el = document.createElement('div');
        el.className = 'sq ' + ((rank + file) % 2 === 0 ? 'dark' : 'light');
        el.dataset.sq = sq;
        if (col === 0) el.dataset.rankLabel = rank + 1;
        if (row === 7) el.dataset.fileLabel = 'abcdefgh'[file];
        boardEl.appendChild(el);
        cells[sq] = el;
      }
    }
    $('evalbar').classList.toggle('flipped', S.flipped);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'arrows';
    svg.setAttribute('viewBox', '0 0 8 8');
    boardEl.appendChild(svg);
  }

  /** Centre of a 0x88 square in the 8x8 SVG overlay (respects board flipping). */
  function squareCentre(sq) {
    const file = sq & 7, rank = sq >> 4;
    return [(S.flipped ? 7 - file : file) + 0.5, (S.flipped ? rank : 7 - rank) + 0.5];
  }

  /** Draw (or clear) the arrow showing the better move in game review. */
  function drawArrow(uci) {
    const svg = $('arrows');
    if (!svg) return;
    svg.innerHTML = '';
    if (!uci) return;
    const sqOf = (s) => (s.charCodeAt(1) - 49) * 16 + (s.charCodeAt(0) - 97);
    const [x1, y1] = squareCentre(sqOf(uci.slice(0, 2)));
    const [x2, y2] = squareCentre(sqOf(uci.slice(2, 4)));
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    const ux = (x2 - x1) / len, uy = (y2 - y1) / len;
    const head = 0.42, w = 0.17;
    const bx = x2 - ux * head, by = y2 - uy * head; // base of the arrow head
    const color = 'rgba(106,168,79,0.92)';
    svg.innerHTML =
      `<line x1="${x1 + ux * 0.2}" y1="${y1 + uy * 0.2}" x2="${bx}" y2="${by}" stroke="${color}" stroke-width="${w}" stroke-linecap="round"/>` +
      `<polygon points="${x2},${y2} ${bx - uy * 0.27},${by + ux * 0.27} ${bx + uy * 0.27},${by - ux * 0.27}" fill="${color}"/>`;
  }

  function render() {
    const checkSq = board.inCheck() ? board.kingSq[board.side] : -1;
    const lf = S.lastMove ? S.lastMove & 127 : -1;
    const lt = S.lastMove ? (S.lastMove >> 7) & 127 : -1;
    const targetSet = new Map(S.targets.map((m) => [(m >> 7) & 127, m]));
    // In game review: the verdict of the move just played (badge) and the better move (arrow).
    const reviewed = R.game && R.result && !R.running && S.hist.length ? R.result.plies[S.hist.length - 1] : null;
    for (let sq = 0; sq < 128; sq++) {
      const el = cells[sq];
      if (!el) continue;
      const p = board.sq[sq];
      let html = '';
      if (el.dataset.rankLabel) html += `<span class="coord rank">${el.dataset.rankLabel}</span>`;
      if (el.dataset.fileLabel) html += `<span class="coord file">${el.dataset.fileLabel}</span>`;
      if (p) html += `<span class="piece ${p >> 3 ? 'b' : 'w'}">${GLYPH[p & 7]}</span>`;
      if (sq === lt && reviewed) html += `<span class="badge b-${reviewed.cls}" title="${label(reviewed.cls)}">${BADGE[reviewed.cls] || ''}</span>`;
      el.innerHTML = html;
      let cls = 'sq ' + (((sq >> 4) + (sq & 7)) % 2 === 0 ? 'dark' : 'light');
      if (sq === lf || sq === lt) cls += ' last';
      if (sq === S.selected) cls += ' sel';
      if (sq === checkSq) cls += ' check';
      if (targetSet.has(sq)) cls += ' target' + (board.sq[sq] || (targetSet.get(sq) & C.FLAG_EP) ? ' capture' : '');
      el.className = cls;
    }
    drawArrow(reviewed && !reviewed.isBest && reviewed.best && $('opt-arrow').checked ? reviewed.best : null);
    $('fen').value = board.getFen();
    renderMoves();
    renderReviewState();
  }

  function renderMoves() {
    const el = $('moves');
    const list = R.game ? R.game.moves : S.hist;
    const cur = S.hist.length;
    const parts = S.startFen.split(/\s+/);
    let num = parseInt(parts[5], 10) || 1;
    const cell = (i) => {
      if (!list[i]) return '<span></span>';
      const q = R.result ? R.result.plies[i] : null;
      const sym = q && SYMBOL[q.cls] ? `<sup>${SYMBOL[q.cls]}</sup>` : '';
      const cls = (R.game ? ' mv' : '') + (q ? ' c-' + q.cls : '') + (i + 1 === cur ? ' cur' : '');
      return `<span class="${cls.trim()}" data-ply="${i + 1}">${list[i].san}${sym}</span>`;
    };
    let html = '';
    let i = 0;
    if (parts[1] === 'b' && list.length) {
      html += `<span class="num">${num}.</span><span>\u2026</span>${cell(0)}`;
      i = 1; num++;
    }
    for (; i < list.length; i += 2) html += `<span class="num">${num++}.</span>${cell(i)}${cell(i + 1)}`;
    el.innerHTML = html;
    const c = el.querySelector('.cur');
    if (c) el.scrollTop = c.offsetTop - el.clientHeight / 2;
    else el.scrollTop = R.game ? 0 : el.scrollHeight;
  }

  function setStatus() {
    const el = $('status');
    if (S.over) { el.textContent = t(S.over); return; }
    const white = board.side === C.WHITE;
    let text = t(white ? 'whiteToMove' : 'blackToMove');
    if (board.inCheck()) text += t('check');
    if (S.thinking) text = t('thinking', { side: t(white ? 'white' : 'black') });
    el.textContent = text;
  }

  // ------------------------------------------------------------ eval + lines
  function setEvalBar(score) {
    let pct, text;
    if (score.mate !== undefined) {
      pct = score.mate > 0 ? 100 : 0;
      text = (score.mate > 0 ? '' : '-') + 'M' + Math.abs(score.mate);
    } else {
      pct = 50 + 50 * (2 / (1 + Math.exp(-score.cp / 400)) - 1);
      text = (score.cp / 100).toFixed(1);
    }
    $('evalfill').style.height = pct + '%';
    $('evaltext').textContent = text;
  }

  function renderLines() {
    const box = $('lines');
    const fen = S.searchFen;
    box.innerHTML = '';
    S.lines.forEach((info) => {
      if (!info) return;
      const ws = whiteScore(info.score, S.searchSide);
      const row = document.createElement('div');
      row.className = 'line';
      const sc = document.createElement('span');
      sc.className = 'sc';
      sc.textContent = formatScore(ws);
      const pv = document.createElement('span');
      pv.className = 'pv';
      pv.textContent = pvToSan(fen, info.pv, 10);
      row.append(sc, pv);
      box.appendChild(row);
    });
  }

  function onInfo(info) {
    S.lines[info.multipv - 1] = info;
    if (info.multipv === 1) {
      const kn = (info.nodes / 1000) | 0;
      setStats('stats', {
        d: info.depth, sd: info.seldepth, nodes: kn >= 1000 ? (kn / 1000).toFixed(1) + 'M' : kn + 'k',
        nps: (info.nps / 1000) | 0, hash: (info.hashfull / 10).toFixed(0),
      });
      setEvalBar(whiteScore(info.score, S.searchSide));
    }
    renderLines();
  }

  // ------------------------------------------------------------- game flow
  function getResult() {
    if (!board.legalMoves().length) {
      if (board.inCheck()) return board.side === C.WHITE ? 'mateBlack' : 'mateWhite';
      return 'stalemate';
    }
    if (board.insufficientMaterial()) return 'insufficient';
    if (board.repetitionCount() >= 3) return 'threefold';
    if (board.halfmove >= 100) return 'fifty';
    return null;
  }

  function startSearch(limits, onBest) {
    S.lines = [];
    S.searchSide = board.side;
    S.searchFen = board.getFen(); // engine PVs start from the current position
    $('lines').innerHTML = '';
    client.go(S.startFen, uciHistory(), limits, onInfo, onBest);
  }

  function afterChange() {
    if (!R.running) client.cancel();
    S.thinking = false;
    S.selected = -1; S.targets = [];
    S.over = getResult();
    render();
    if (S.over) { setStatus(); setStats('gameOver'); return; }
    if (R.running) { setStatus(); return; }

    if (isEngineTurn()) {
      S.thinking = true;
      setStatus();
      startEngineMove();
    } else {
      setStatus();
      if ($('opt-analysis').checked) {
        startSearch({ infinite: true }, () => {});
      } else {
        setStats('analysisOff');
        $('lines').innerHTML = '';
      }
    }
  }

  function startEngineMove() {
    const limits = { movetime: +$('opt-time').value };
    startSearch(limits, (uci) => {
      S.thinking = false;
      const m = uci ? board.parseUci(uci) : 0;
      if (m) playMove(m);
      else setStatus();
    });
  }

  function playMove(m) {
    const san = board.moveToSan(m);
    const uci = board.moveToUci(m);
    board.makeMove(m);
    S.hist.push({ m, san, uci });
    S.lastMove = m;
    if (R.game) {
      const expected = R.game.moves[S.hist.length - 1];
      if (!expected || expected.uci !== uci) exitReview(); // the user left the analysed game
    }
    afterChange();
  }

  function newGame(fen) {
    exitReview();
    client.newGame();
    const f = fen || C.START_FEN;
    board.setFen(f);
    S.startFen = board.getFen();
    S.hist = []; S.lastMove = 0; S.over = null;
    S.flipped = mode() === 'black';
    buildBoard();
    afterChange();
  }

  function undo() {
    if (!S.hist.length) return;
    client.cancel();
    do {
      board.unmakeMove();
      S.hist.pop();
    } while (S.hist.length && engineSide() !== -1 && board.side === engineSide());
    S.lastMove = S.hist.length ? S.hist[S.hist.length - 1].m : 0;
    afterChange();
  }

  // ------------------------------------------------------------------ input
  function onSquareClick(sq) {
    if (S.over || S.thinking || R.running || isEngineTurn()) return;
    const p = board.sq[sq];
    if (S.selected !== -1) {
      const options = S.targets.filter((m) => ((m >> 7) & 127) === sq);
      if (options.length) {
        if (options.length > 1) { askPromotion(options); return; }
        playMove(options[0]);
        return;
      }
    }
    if (p && (p >> 3) === board.side) {
      S.selected = sq;
      S.targets = board.legalMoves().filter((m) => (m & 127) === sq);
    } else { S.selected = -1; S.targets = []; }
    render();
  }

  function askPromotion(options) {
    const dlg = $('promo');
    dlg.innerHTML = '';
    for (const type of [C.QUEEN, C.ROOK, C.BISHOP, C.KNIGHT]) {
      const m = options.find((o) => ((o >> 14) & 7) === type);
      const b = document.createElement('button');
      b.textContent = GLYPH[type];
      b.onclick = () => { dlg.classList.add('hidden'); playMove(m); };
      dlg.appendChild(b);
    }
    dlg.classList.remove('hidden');
  }

  boardEl.addEventListener('click', (e) => {
    const el = e.target.closest('.sq');
    if (el) onSquareClick(+el.dataset.sq);
  });
  $('promo').addEventListener('click', (e) => { if (e.target === $('promo')) { $('promo').classList.add('hidden'); } });

  // --------------------------------------------------------------- controls
  function pgn() {
    const res = S.over ? (S.over === 'mateWhite' ? '1-0' : S.over === 'mateBlack' ? '0-1' : '1/2-1/2') : '*';
    let out = '[Event "Open Chess Engine game"]\n[Result "' + res + '"]\n';
    if (S.startFen !== C.START_FEN) out += `[SetUp "1"]\n[FEN "${S.startFen}"]\n`;
    out += '\n';
    let num = parseInt(S.startFen.split(/\s+/)[5], 10) || 1;
    let black = S.startFen.split(/\s+/)[1] === 'b';
    S.hist.forEach((h, i) => {
      if (!black) out += num + '. ';
      else if (i === 0) out += num + '... ';
      out += h.san + ' ';
      if (black) num++;
      black = !black;
    });
    return out.trim() + ' ' + res;
  }

  function restartSearchOnly() { // settings changed: re-run whatever should be running
    if (S.over || S.thinking || R.running) return;
    afterChange();
  }

  $('btn-new').onclick = () => newGame();
  $('btn-undo').onclick = undo;
  $('btn-flip').onclick = () => { S.flipped = !S.flipped; buildBoard(); render(); };
  $('btn-engine-move').onclick = () => {
    if (S.over || S.thinking || R.running) return;
    client.cancel();
    S.thinking = true;
    setStatus();
    startEngineMove();
  };
  $('btn-load-fen').onclick = () => {
    const fen = $('fen').value.trim();
    if (!scratch.setFen(fen)) { $('status').textContent = t('invalidFen'); return; }
    newGame(fen);
  };
  $('btn-copy-pgn').onclick = () => {
    const text = pgn();
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(() => window.prompt('PGN', text));
    else window.prompt('PGN', text);
  };

  $('opt-mode').onchange = () => { S.flipped = mode() === 'black'; buildBoard(); afterChange(); };
  $('opt-skill').onchange = () => { client.setOption('Skill', +$('opt-skill').value); };
  $('opt-analysis').onchange = restartSearchOnly;
  $('opt-multipv').onchange = () => { client.setOption('MultiPV', +$('opt-multipv').value); restartSearchOnly(); };
  $('opt-hash').onchange = () => { client.setOption('Hash', +$('opt-hash').value); restartSearchOnly(); };


  // ------------------------------------------------------------ game review
  const REVIEW_CLASSES = ['best', 'excellent', 'good', 'inaccuracy', 'mistake', 'blunder'];
  const fmtCp = (cp) => {
    if (Math.abs(cp) >= 10000) return cp > 0 ? '1-0' : '0-1'; // checkmate on the board
    if (Math.abs(cp) >= 9000) return (cp > 0 ? '+M' : '-M') + (10000 - Math.abs(cp));
    return (cp > 0 ? '+' : '') + (cp / 100).toFixed(2);
  };
  const cpToScore = (cp) => (Math.abs(cp) >= 9000 ? { mate: (cp > 0 ? 1 : -1) * (10000 - Math.abs(cp)) } : { cp });

  /** Leave review mode (the board keeps its current position). */
  function exitReview() {
    R.token++;
    if (R.running) { R.running = false; restoreReviewOptions(); }
    R.game = null; R.result = null;
    ['review-progress', 'review-graph', 'review-nav', 'btn-review-cancel'].forEach((id) => $(id).classList.add('hidden'));
    $('review-summary').innerHTML = '';
    $('review-comment').innerHTML = '';
  }

  let savedOptions = null;
  function restoreReviewOptions() {
    if (!savedOptions) return;
    client.setOption('MultiPV', savedOptions.multipv);
    client.setOption('Skill', savedOptions.skill);
    savedOptions = null;
  }

  /** Read the textarea: fills the game list, or loads a FEN directly. */
  function readInput() {
    const text = $('pgn-input').value.trim();
    R.games = [];
    $('review-game').classList.add('hidden');
    if (!text) { setInfo(null); return; }
    const oneLine = text.split('\n').length === 1;
    if (oneLine && /^([pnbrqkPNBRQK1-8]+\/){7}[pnbrqkPNBRQK1-8]+\s+[wb]\b/.test(text) && scratch.setFen(text)) {
      setInfo('fenRecognised');
      R.fen = text;
      return;
    }
    R.fen = null;
    const games = OCE.parsePgn(text).games.filter((g) => g.moves.length || g.error);
    R.games = games;
    if (!games.length) { setInfo('noMoves'); return; }
    const sel = $('review-game');
    sel.innerHTML = '';
    games.forEach((g, i) => {
      const o = document.createElement('option');
      o.value = i;
      o.textContent = t('gameEntry', { i: i + 1, w: g.headers.White || '?', b: g.headers.Black || '?', n: g.moves.length });
      sel.appendChild(o);
    });
    sel.classList.toggle('hidden', games.length < 2);
    describeSelectedGame();
  }

  function describeSelectedGame() {
    const g = R.games[+$('review-game').value || 0];
    if (!g) return;
    setInfo(g.error ? 'pliesReadErr' : 'pliesRead', { n: g.moves.length, err: g.error });
  }

  function searchPosition(fen, limits) {
    return new Promise((resolve) => {
      let last = null;
      client.go(fen, [], limits, (info) => { if (info.multipv === 1) last = info; }, (best) => resolve({ best, last }));
    });
  }

  function setProgress(frac) {
    $('review-bar').style.width = (frac * 100).toFixed(1) + '%';
    $('review-pct').textContent = Math.round(frac * 100) + '%';
  }

  async function runReview(game) {
    if (!game.moves.length) { setInfo('noMovesToAnalyze'); return; }
    client.cancel();
    S.thinking = false;
    exitReview();
    const token = ++R.token;
    $('opt-mode').value = 'free';
    S.flipped = false;
    buildBoard();
    S.startFen = game.startFen;
    R.game = game; R.result = null; R.running = true;
    savedOptions = { multipv: +$('opt-multipv').value, skill: +$('opt-skill').value };
    client.setOption('MultiPV', 1); client.setOption('Skill', 20);
    $('review-progress').classList.remove('hidden');
    $('btn-review-cancel').classList.remove('hidden');
    $('review-summary').innerHTML = '';
    $('lines').innerHTML = '';
    setStats('reviewing');
    setProgress(0);

    const positions = OCE.Review.preparePositions(game);
    const raw = [];
    const limits = { movetime: +$('review-time').value };
    for (let i = 0; i < positions.length; i++) {
      goToPly(i);
      if (positions[i].terminal) raw.push(null);
      else {
        const r = await searchPosition(positions[i].fen, limits);
        if (token !== R.token) return; // cancelled
        raw.push({ score: r.last ? r.last.score : { cp: 0 }, best: r.best, pv: r.last ? r.last.pv : [] });
      }
      setProgress((i + 1) / positions.length);
    }
    R.running = false;
    restoreReviewOptions();
    R.result = OCE.Review.evaluate(game, positions, raw);
    $('review-progress').classList.add('hidden');
    $('btn-review-cancel').classList.add('hidden');
    setStats('reviewDone');
    showSummary();
    goToPly(0);
  }

  /** Put the board at ply k of the reviewed game. */
  function goToPly(k) {
    if (!R.game) return;
    k = Math.max(0, Math.min(R.game.moves.length, k));
    board.setFen(R.game.startFen);
    S.hist = [];
    for (let i = 0; i < k; i++) {
      const uci = R.game.moves[i].uci;
      const m = board.parseUci(uci);
      const san = board.moveToSan(m);
      board.makeMove(m);
      S.hist.push({ m, san, uci });
    }
    S.lastMove = k ? S.hist[k - 1].m : 0;
    afterChange();
  }

  function showSummary() {
    const g = R.game, r = R.result;
    const name = (c) => (g.headers && g.headers[c]) || t(c.toLowerCase());
    const f = (x) => x.toFixed(1);
    let html = '<table><tr><th></th>' +
      `<th>${name('White')}</th><th>${name('Black')}</th></tr>` +
      `<tr><td>${t('accuracy')}</td><td><b>${f(r.accuracy.white)}%</b></td><td><b>${f(r.accuracy.black)}%</b></td></tr>`;
    for (const c of REVIEW_CLASSES) {
      html += `<tr><td>${label(c)}</td><td class="c-${c}">${r.counts.white[c] || 0}</td><td class="c-${c}">${r.counts.black[c] || 0}</td></tr>`;
    }
    $('review-summary').innerHTML = html + '</table>';
    $('review-graph').classList.remove('hidden');
    $('review-nav').classList.remove('hidden');
  }

  function renderGraph() {
    const r = R.result;
    const n = r.evals.length - 1;
    const W = 400, H = 90;
    const x = (i) => (n ? (i / n) * W : 0);
    const y = (cp) => H - (OCE.Review.winPercent(cp) / 100) * H;
    let pts = '';
    r.evals.forEach((cp, i) => { pts += `${x(i).toFixed(1)},${y(cp).toFixed(1)} `; });
    const cur = S.hist.length;
    let dots = '';
    r.plies.forEach((p) => {
      if (p.cls === 'mistake' || p.cls === 'blunder') {
        dots += `<circle cx="${x(p.ply).toFixed(1)}" cy="${y(p.evalAfter).toFixed(1)}" r="3" fill="${p.cls === 'blunder' ? '#f44336' : '#ff9800'}"/>`;
      }
    });
    $('review-graph').innerHTML =
      `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">` +
      `<polygon points="0,${H} ${pts}${W},${H}" fill="#e8e8e8"/>` +
      `<line x1="0" x2="${W}" y1="${H / 2}" y2="${H / 2}" stroke="#888" stroke-width="0.6" stroke-dasharray="3 3"/>` +
      `<line x1="${x(cur)}" x2="${x(cur)}" y1="0" y2="${H}" stroke="#6aa84f" stroke-width="2"/>${dots}</svg>`;
  }

  function renderReviewState() {
    if (!R.game || !R.result) return;
    renderGraph();
    const k = S.hist.length;
    let html;
    if (k === 0) html = t('startPosition');
    else {
      const p = R.result.plies[k - 1];
      html = `<b class="c-${p.cls}">${Math.ceil(k / 2)}${p.color ? '...' : '.'} ${p.san}</b> - ${label(p.cls)}`;
      if (!p.isBest && p.bestSan) html += `. ${t('bestWas')} <b>${p.bestSan}</b>`;
      html += ` &middot; ${t('evalWord')} ${fmtCp(R.result.evals[k])}`;
    }
    $('review-comment').innerHTML = html;
    setEvalBar(cpToScore(R.result.evals[k])); // live analysis (if on) will refine it
  }

  function startReviewFromInput() {
    if (R.fen) { $('pgn-input').blur(); newGame(R.fen); return; }
    const g = R.games[+$('review-game').value || 0];
    if (!g) { setInfo('pasteFirst'); return; }
    runReview(g);
  }

  $('pgn-input').addEventListener('input', readInput);
  $('review-game').onchange = describeSelectedGame;
  $('btn-review').onclick = startReviewFromInput;
  $('btn-review-current').onclick = () => {
    const moves = R.game ? R.game.moves : S.hist.map((h) => ({ uci: h.uci, san: h.san }));
    runReview({ headers: R.game ? R.game.headers : {}, startFen: S.startFen, moves, result: '*', error: null });
  };
  $('btn-review-cancel').onclick = () => {
    R.token++; R.running = false;
    client.cancel(); restoreReviewOptions();
    $('review-progress').classList.add('hidden');
    $('btn-review-cancel').classList.add('hidden');
    setInfo('reviewCancelled');
    afterChange();
  };
  $('rv-first').onclick = () => goToPly(0);
  $('rv-prev').onclick = () => goToPly(S.hist.length - 1);
  $('rv-next').onclick = () => goToPly(S.hist.length + 1);
  $('rv-last').onclick = () => R.game && goToPly(R.game.moves.length);
  $('moves').addEventListener('click', (e) => {
    const el = e.target.closest('[data-ply]');
    if (el && R.game && !R.running) goToPly(+el.dataset.ply);
  });
  $('review-graph').addEventListener('click', (e) => {
    if (!R.result || R.running) return;
    const rect = $('review-graph').getBoundingClientRect();
    goToPly(Math.round(((e.clientX - rect.left) / rect.width) * (R.result.evals.length - 1)));
  });
  document.addEventListener('keydown', (e) => {
    if (!R.game || R.running || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
    if (e.key === 'ArrowLeft') { goToPly(S.hist.length - 1); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { goToPly(S.hist.length + 1); e.preventDefault(); }
    else if (e.key === 'Home') { goToPly(0); e.preventDefault(); }
    else if (e.key === 'End') { goToPly(R.game.moves.length); e.preventDefault(); }
  });

  $('opt-arrow').onchange = render;
  $('lang').onchange = () => {
    OCE.I18N.setLang($('lang').value);
    setStatus();
    if (S.stats) setStats(S.stats[0], S.stats[1]);
    if (R.info) setInfo(R.info[0], R.info[1]);
    if (R.games.length) { // game list entries
      const sel = $('review-game');
      R.games.forEach((g, i) => { sel.options[i].textContent = t('gameEntry', { i: i + 1, w: g.headers.White || '?', b: g.headers.Black || '?', n: g.moves.length }); });
    }
    if (R.game && R.result) showSummary();
    render();
  };

  // ------------------------------------------------------------------ start
  OCE.I18N.apply();
  setStats('idle');
  client.setOption('Hash', +$('opt-hash').value);
  client.setOption('MultiPV', +$('opt-multipv').value);
  client.setOption('Skill', +$('opt-skill').value);
  newGame();
})();
