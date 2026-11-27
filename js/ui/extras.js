/*
 * Open Chess Engine - extras.js
 * SPDX-License-Identifier: MIT
 *
 * Optional interface features that sit on top of app.js (through OCE.app):
 * drag & drop, sound effects, captured pieces, themes, PGN save / open, keyboard shortcuts.
 */
(function () {
  'use strict';

  const OCE = globalThis.OCE;
  const app = OCE.app;
  const $ = (id) => document.getElementById(id);
  const t = (k, p) => OCE.I18N.t(k, p);
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } },
  };

  // ------------------------------------------------------------------ themes
  const root = document.documentElement;
  function setTheme(name) {
    root.dataset.theme = name;
    store.set('oce-theme', name);
    $('btn-theme').innerHTML = name === 'dark' ? '&#9728;' : '&#9790;';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = name === 'dark' ? '#1b1e23' : '#f4f5f7';
  }
  setTheme(store.get('oce-theme', window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));
  $('btn-theme').onclick = () => setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark');

  function setBoardTheme(name) { root.dataset.board = name; store.set('oce-board', name); $('opt-board').value = name; }
  setBoardTheme(store.get('oce-board', 'green'));
  $('opt-board').onchange = () => setBoardTheme($('opt-board').value);

  // ------------------------------------------------------------------- sound
  let audio = null, soundOn = store.get('oce-sound', '1') === '1';
  function ctx() {
    if (!audio) { try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audio = false; } }
    if (audio && audio.state === 'suspended') audio.resume();
    return audio;
  }
  function tone(freq, start, dur, gain, type) {
    const a = ctx(); if (!a) return;
    const o = a.createOscillator(), g = a.createGain(), t0 = a.currentTime + start;
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(a.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function noise(start, dur, gain) {
    const a = ctx(); if (!a) return;
    const n = Math.max(1, Math.floor(a.sampleRate * dur)), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
    const src = a.createBufferSource(), g = a.createGain(), f = a.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 1800; g.gain.value = gain;
    src.buffer = buf; src.connect(f); f.connect(g); g.connect(a.destination); src.start(a.currentTime + start);
  }
  function playSound(kind) {
    if (!soundOn) return;
    if (kind === 'capture') { noise(0, 0.09, 0.5); tone(150, 0, 0.09, 0.25, 'triangle'); }
    else if (kind === 'check') { noise(0, 0.05, 0.3); tone(660, 0, 0.12, 0.18); tone(880, 0.1, 0.16, 0.18); }
    else if (kind === 'end') { tone(523, 0, 0.3, 0.16); tone(392, 0.16, 0.3, 0.16); tone(262, 0.32, 0.5, 0.18); }
    else { noise(0, 0.045, 0.35); tone(210, 0, 0.05, 0.2, 'triangle'); }
  }
  function updateSoundButton() {
    $('btn-sound').innerHTML = soundOn ? '&#128266;' : '&#128263;';
    $('btn-sound').setAttribute('aria-pressed', String(soundOn));
  }
  updateSoundButton();
  $('btn-sound').onclick = () => { soundOn = !soundOn; store.set('oce-sound', soundOn ? '1' : '0'); updateSoundButton(); playSound('move'); };

  app.hooks.onMove = ({ san, over }) => {
    if (over) playSound('end');
    else if (san.includes('+')) playSound('check');
    else if (san.includes('x')) playSound('capture');
    else playSound('move');
  };

  // ------------------------------------------------- captured pieces, names
  const START = [0, 8, 2, 2, 2, 1, 0]; // pawns, knights, bishops, rooks, queen per side (index = piece type)
  const VALUE = [0, 1, 3, 3, 5, 9, 0];
  function renderStrips() {
    const b = app.board, cnt = [new Array(7).fill(0), new Array(7).fill(0)];
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) continue;
      const p = b.sq[sq];
      if (p) cnt[p >> 3][p & 7]++;
    }
    const START_COUNT = [0, 8, 2, 2, 2, 1];
    const material = [0, 0];
    const lost = [[], []]; // pieces each colour has lost (shown next to the opponent)
    for (let c = 0; c < 2; c++) {
      for (let type = 1; type <= 5; type++) {
        material[c] += cnt[c][type] * VALUE[type];
        for (let i = cnt[c][type]; i < START_COUNT[type]; i++) lost[c].push(type);
      }
    }
    const diff = material[0] - material[1]; // > 0: White is ahead
    const order = [5, 4, 3, 2, 1];
    const html = (color) => { // pieces of the opponent that `color` has captured
      const opp = color ^ 1;
      const glyphs = lost[opp].slice().sort((a, b2) => order.indexOf(a) - order.indexOf(b2)).map((tp) => app.GLYPH[tp]).join('');
      const adv = (color === 0 ? diff : -diff);
      return glyphs + (adv > 0 ? `<span class="adv">+${adv}</span>` : '');
    };
    const bottomColor = app.S.flipped ? 1 : 0, topColor = bottomColor ^ 1;
    $('cap-bottom').innerHTML = html(bottomColor);
    $('cap-top').innerHTML = html(topColor);
    const m = app.mode();
    const nm = (color) => {
      if (m === 'free') return t(color === 0 ? 'white' : 'black');
      const human = m === 'white' ? 0 : 1;
      return color === human ? t('you') : t('engine');
    };
    $('name-bottom').textContent = nm(bottomColor);
    $('name-top').textContent = nm(topColor);
  }
  app.hooks.onRender = renderStrips;

  // -------------------------------------------------------------- drag & drop
  const boardEl = $('board');
  let drag = null, suppressClick = false;
  boardEl.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const el = e.target.closest('.sq');
    if (!el || !el.querySelector('.piece')) return;
    const sq = +el.dataset.sq, p = app.board.sq[sq];
    if (app.S.over || app.S.thinking || app.R.running || app.isEngineTurn() || (p >> 3) !== app.board.side) return;
    drag = { sq, x: e.clientX, y: e.clientY, active: false, ghost: null, el, id: e.pointerId };
  });
  window.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (!drag.active) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
      drag.active = true;
      app.selectSquare(drag.sq); // select the piece (shows legal targets)
      const cell = $('board').querySelector(`.sq[data-sq="${drag.sq}"]`);
      const piece = cell && cell.querySelector('.piece');
      if (!piece) { drag = null; return; }
      const size = cell.getBoundingClientRect().width;
      const g = document.createElement('div');
      g.className = 'drag-ghost ' + (piece.classList.contains('w') ? 'w' : 'b');
      g.textContent = piece.textContent;
      g.style.fontSize = size * 0.78 + 'px';
      document.body.appendChild(g);
      piece.classList.add('drag-src');
      drag.ghost = g;
    }
    drag.ghost.style.left = e.clientX + 'px'; drag.ghost.style.top = e.clientY + 'px';
    boardEl.querySelectorAll('.sq.over').forEach((n) => n.classList.remove('over'));
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const sqEl = under && under.closest ? under.closest('.sq') : null;
    if (sqEl) sqEl.classList.add('over');
  });
  window.addEventListener('pointerup', (e) => {
    if (!drag) return;
    const d = drag; drag = null;
    if (!d.active) return; // a plain click is handled by app.js
    if (d.ghost) d.ghost.remove();
    boardEl.querySelectorAll('.sq.over').forEach((n) => n.classList.remove('over'));
    suppressClick = true; setTimeout(() => { suppressClick = false; }, 0);
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const sqEl = under && under.closest ? under.closest('.sq') : null;
    if (sqEl && +sqEl.dataset.sq !== d.sq) app.selectSquare(+sqEl.dataset.sq);
    else app.render();
  });
  window.addEventListener('pointercancel', () => {
    if (drag && drag.ghost) drag.ghost.remove();
    drag = null; app.render();
  });
  boardEl.addEventListener('click', (e) => { if (suppressClick) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);

  // --------------------------------------------------------------- PGN files
  function download(name, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/x-chess-pgn' }));
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  $('btn-save-pgn').onclick = () => download('open-chess-engine-game.pgn', app.pgn() + '\n');
  $('btn-open-pgn').onclick = () => $('file-pgn').click();
  $('file-pgn').onchange = () => {
    const f = $('file-pgn').files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      $('pgn-input').value = String(r.result || '');
      $('pgn-input').dispatchEvent(new Event('input'));
      $('review-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };
    r.readAsText(f);
    $('file-pgn').value = '';
  };

  // ------------------------------------------------------------ shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = (e.target && e.target.tagName) || '';
    if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
    if (e.key === 'f' || e.key === 'F') { $('btn-flip').click(); }
    else if (e.key === 'u' || e.key === 'U') { $('btn-undo').click(); }
  });

  // language switch: names / strips are text built here
  $('lang').addEventListener('change', renderStrips);
  renderStrips();
})();
