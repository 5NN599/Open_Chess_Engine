/*
 * Open Chess Engine - i18n.js
 * SPDX-License-Identifier: MIT
 *
 * Tiny translation layer. English is the default; add a language by adding a new
 * object to STRINGS (same keys as `en`) and an <option> to #lang in index.html.
 *   - static text:     <span data-i18n="key">, data-i18n-title="key", data-i18n-ph="key"
 *   - dynamic text:    OCE.I18N.t('key', { name: value })   ({name} placeholders)
 */
(function () {
  'use strict';
  const OCE = (globalThis.OCE = globalThis.OCE || {});

  const STRINGS = {
    en: {
      tag: 'runs 100% in your browser · no external engine',
      lang: 'Language',
      evalbarTitle: 'Evaluation (White advantage on top when White is at the bottom)',
      newGame: 'New game', undo: 'Undo', flip: 'Flip board', engineMove: 'Engine move',
      engineMoveTitle: 'Let the engine play the side to move',
      game: 'Game', iPlay: 'I play',
      modeWhite: 'White (engine plays Black)', modeBlack: 'Black (engine plays White)', modeFree: 'Both sides (analysis board)',
      strength: 'Engine strength',
      skill20: 'Maximum', skill17: 'Master', skill14: 'Strong club', skill11: 'Club', skill8: 'Casual', skill5: 'Beginner', skill2: 'Very easy',
      thinkTime: 'Think time',
      t03: '0.3 s', t1: '1 s', t3: '3 s', t10: '10 s', t30: '30 s',
      review: 'Game review',
      pgnPlaceholder: 'Paste a PGN, a list of moves (1. e4 e5 2. Nf3 ...) or a FEN here',
      timePerMove: 'Time per move', r03: '0.3 s (fast)', r07: '0.7 s', r2: '2 s', r5: '5 s (deep)',
      analyzeGame: 'Analyze game', analyzeCurrent: 'Analyze current game', cancel: 'Cancel',
      showBest: 'Show the better move on the board',
      graphTitle: 'Click to jump to a move',
      navFirst: 'Start (Home)', navPrev: 'Previous (Left arrow)', navNext: 'Next (Right arrow)', navLast: 'End (End)',
      moves: 'Moves', loadFen: 'Load FEN', copyPgn: 'Copy PGN',
      analysis: 'Analysis', continuous: 'Continuous analysis when it is my turn',
      multipv: 'Lines (MultiPV)', hash: 'Hash memory',
      idle: 'engine idle',
      analysisDepth: 'Analysis depth', depthUnlimited: 'Unlimited (keeps running)',
      analysisDone: 'analysis complete (depth {d})',
      threads: 'CPU threads', threadsAuto: 'Auto (all cores)',
      threadHint: 'Live analysis is single-threaded here. Open the page over http(s) (e.g. a local server or GitHub Pages) to use all CPU cores; game review already uses all cores.',
      reviewingN: 'reviewing game on {n} cores...',
      statsMT: 'depth {d}/{sd} \u00b7 {nodes} nodes \u00b7 {nps}k n/s \u00b7 {th} threads \u00b7 hash {hash}%',
      promoTitle: 'Choose promotion piece',
      // dynamic
      white: 'White', black: 'Black',
      whiteToMove: 'White to move', blackToMove: 'Black to move', check: ' (check)',
      thinking: '{side} (engine) is thinking...',
      mateWhite: 'Checkmate - White wins', mateBlack: 'Checkmate - Black wins',
      stalemate: 'Draw by stalemate', insufficient: 'Draw - insufficient material',
      threefold: 'Draw by threefold repetition', fifty: 'Draw by the fifty-move rule',
      invalidFen: 'Invalid FEN',
      stats: 'depth {d}/{sd} · {nodes} nodes · {nps}k n/s · hash {hash}%',
      analysisOff: 'analysis off', gameOver: 'game over', reviewing: 'reviewing game...', reviewDone: 'review finished',
      fenRecognised: 'FEN recognised - press "Analyze game" to set up the position.',
      noMoves: 'No moves found.', noMovesToAnalyze: 'There are no moves to analyze.', pasteFirst: 'Paste a game first.',
      reviewCancelled: 'Review cancelled.',
      pliesRead: '{n} plies read', pliesReadErr: '{n} plies read - stopped: {err}',
      gameEntry: '{i}. {w} - {b} ({n} plies)',
      accuracy: 'Accuracy',
      startPosition: 'Start position',
      bestWas: 'Best was', evalWord: 'eval',
      c_best: 'Best move', c_excellent: 'Excellent', c_good: 'Good', c_inaccuracy: 'Inaccuracy', c_mistake: 'Mistake', c_blunder: 'Blunder',
      betterMove: 'Better move: {san}',
    },
    ko: {
      tag: '브라우저에서 100% 실행 · 외부 엔진 없음',
      lang: '언어',
      evalbarTitle: '평가 막대 (백이 아래쪽일 때 백이 유리하면 위쪽이 밝음)',
      newGame: '새 게임', undo: '무르기', flip: '판 뒤집기', engineMove: '엔진 수',
      engineMoveTitle: '엔진이 현재 차례의 수를 둡니다',
      game: '게임', iPlay: '내가 두는 색',
      modeWhite: '백 (엔진이 흑)', modeBlack: '흑 (엔진이 백)', modeFree: '양쪽 모두 (분석판)',
      strength: '엔진 강도',
      skill20: '최대', skill17: '마스터', skill14: '강한 클럽', skill11: '클럽', skill8: '캐주얼', skill5: '초보', skill2: '아주 쉬움',
      thinkTime: '생각 시간',
      t03: '0.3초', t1: '1초', t3: '3초', t10: '10초', t30: '30초',
      review: '대국 분석',
      pgnPlaceholder: 'PGN, 기보(1. e4 e5 2. Nf3 ...) 또는 FEN을 여기에 붙여넣으세요',
      timePerMove: '수당 분석 시간', r03: '0.3초 (빠름)', r07: '0.7초', r2: '2초', r5: '5초 (깊게)',
      analyzeGame: '대국 분석', analyzeCurrent: '현재 대국 분석', cancel: '취소',
      showBest: '더 좋았던 수를 판 위에 표시',
      graphTitle: '클릭하면 해당 수로 이동',
      navFirst: '처음 (Home)', navPrev: '이전 (왼쪽 화살표)', navNext: '다음 (오른쪽 화살표)', navLast: '끝 (End)',
      moves: '기보', loadFen: 'FEN 불러오기', copyPgn: 'PGN 복사',
      analysis: '분석', continuous: '내 차례에 계속 분석',
      multipv: '변화 수 (MultiPV)', hash: '해시 메모리',
      idle: '엔진 대기 중',
      analysisDepth: '분석 깊이', depthUnlimited: '무제한 (계속 분석)',
      analysisDone: '분석 완료 (깊이 {d})',
      threads: 'CPU 스레드', threadsAuto: '자동 (모든 코어)',
      threadHint: '이 환경에서는 실시간 분석이 1스레드로 동작합니다. 페이지를 http(s)로 열면(로컬 서버, GitHub Pages 등) 모든 CPU 코어를 쓰고, 대국 분석은 이미 모든 코어를 사용합니다.',
      reviewingN: '{n}개 코어로 대국 분석 중...',
      statsMT: '깊이 {d}/{sd} \u00b7 노드 {nodes} \u00b7 {nps}k n/s \u00b7 {th}스레드 \u00b7 해시 {hash}%',
      promoTitle: '승급할 기물 선택',
      white: '백', black: '흑',
      whiteToMove: '백 차례', blackToMove: '흑 차례', check: ' (체크)',
      thinking: '{side}(엔진)이 생각 중...',
      mateWhite: '체크메이트 - 백 승리', mateBlack: '체크메이트 - 흑 승리',
      stalemate: '스테일메이트 무승부', insufficient: '무승부 - 기물 부족',
      threefold: '동형 3회 반복 무승부', fifty: '50수 규칙 무승부',
      invalidFen: '잘못된 FEN',
      stats: '깊이 {d}/{sd} · 노드 {nodes} · {nps}k n/s · 해시 {hash}%',
      analysisOff: '분석 꺼짐', gameOver: '게임 종료', reviewing: '대국 분석 중...', reviewDone: '분석 완료',
      fenRecognised: 'FEN을 인식했습니다 - "대국 분석"을 누르면 이 局面을 불러옵니다.',
      noMoves: '수를 찾지 못했습니다.', noMovesToAnalyze: '분석할 수가 없습니다.', pasteFirst: '먼저 대국을 붙여넣으세요.',
      reviewCancelled: '분석을 취소했습니다.',
      pliesRead: '{n}수(플라이) 읽음', pliesReadErr: '{n}수(플라이) 읽음 - 중단됨: {err}',
      gameEntry: '{i}. {w} - {b} ({n}수)',
      accuracy: '정확도',
      startPosition: '시작 局面',
      bestWas: '최선', evalWord: '평가',
      c_best: '최선의 수', c_excellent: '훌륭한 수', c_good: '좋은 수', c_inaccuracy: '부정확', c_mistake: '실수', c_blunder: '큰 실수',
      betterMove: '더 좋은 수: {san}',
    },
  };
  // "局面" is not natural in everyday Korean; use plain words.
  STRINGS.ko.fenRecognised = 'FEN을 인식했습니다 - "대국 분석"을 누르면 이 포지션을 불러옵니다.';
  STRINGS.ko.startPosition = '시작 포지션';

  let lang = 'en';
  try {
    const saved = localStorage.getItem('oce-lang');
    if (saved && STRINGS[saved]) lang = saved; // English unless the user picked another language before
  } catch (e) { /* storage may be unavailable */ }

  function t(key, params) {
    let s = (STRINGS[lang] && STRINGS[lang][key]) || STRINGS.en[key] || key;
    if (params) for (const k in params) s = s.split('{' + k + '}').join(params[k]);
    return s;
  }

  /** Translate every element marked with data-i18n* attributes. */
  function apply() {
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });
    document.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
    const sel = document.getElementById('lang');
    if (sel) sel.value = lang;
  }

  function setLang(l) {
    if (!STRINGS[l]) return;
    lang = l;
    try { localStorage.setItem('oce-lang', l); } catch (e) { /* ignore */ }
    apply();
  }

  OCE.I18N = { t, apply, setLang, get lang() { return lang; } };
})();
