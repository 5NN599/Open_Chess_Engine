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
      tag: '',
      skip: 'Skip to the board', navPlay: 'Play', navFeatures: 'Features', navHow: 'How it works', navFaq: 'FAQ',
      themeTitle: 'Light / dark theme', soundTitle: 'Sound on/off',
      lead: 'A free, open-source chess engine, analysis board and game reviewer written in JavaScript.',
      ctaPlay: 'Play now', ctaReview: 'Review a game', ctaStar: 'Star on GitHub',
      resign: 'Resign', boardTheme: 'Board colors', bGreen: 'Green', bBrown: 'Brown', bBlue: 'Blue', bGray: 'Gray',
      openPgn: 'Open PGN file', savePgn: 'Save PGN', you: 'You', engine: 'Engine',
      resignWhite: 'White resigned - Black wins', resignBlack: 'Black resigned - White wins',
      featuresTitle: 'Features',
      f1t: 'Alpha-beta search', f1d: 'Iterative deepening with a transposition table, null-move pruning, late-move reductions, singular extensions and a quiescence search.',
      f2t: 'Game review', f2d: 'Paste a PGN, FEN or move list. Each move is rated from best move to blunder, with accuracy scores, an evaluation graph and the better move drawn on the board.',
      f3t: 'Uses every CPU core', f3d: 'Game review analyzes positions on all cores at once. Live analysis can search with several threads that share one hash table.',
      f4t: 'Seven playing levels', f4d: 'From a relaxed beginner game to full strength, with adjustable think time.',
      f5t: 'Easy to read and change', f5d: 'Plain JavaScript with no build step and no dependencies. Search constants and evaluation terms sit in single, commented files.',
      f6t: 'MIT licensed', f6d: 'Use it, fork it or embed it in your own project. Contributions are welcome on GitHub.',
      howTitle: 'How it works',
      s1t: 'Play', s1d: 'Pick a side and a strength, then move the pieces by dragging or clicking. The evaluation bar shows who is better.',
      s2t: 'Analyze', s2d: "Switch to the analysis board to see the engine's best lines for any position, up to the depth you choose.",
      s3t: 'Review', s3d: 'Paste a finished game and press Analyze game. Step through it to see mistakes, blunders and what you should have played.',
      faqTitle: 'Frequently asked questions',
      q1: 'What is Open Chess Engine?', a1: 'A free, open-source chess engine with a built-in analysis board and game reviewer. You can play against it, analyze any position and review a PGN game.',
      q2: 'How do I review a game?', a2: 'Paste a PGN, a list of moves or a FEN into the Game review box and press Analyze game. You can also open a .pgn file.',
      q3: 'How strong is the engine?', a3: 'Strength depends on your device and the think time. It is a classical alpha-beta engine with a hand-written evaluation, so it does not match the strongest engines such as Stockfish.',
      q4: 'Can I run it myself?', a4: 'Yes. Download the repository and serve the folder with any static web server, for example python3 -m http.server. There is nothing to build.',
      q5: 'How do I contribute?', a5: 'Open an issue or a pull request on GitHub. Ideas for the evaluation, the search or the interface are all welcome.',
      footMit: 'Released under the MIT License.', footIssues: 'Report an issue', footDocs: 'Documentation',
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
      followUp: 'checking the follow-up moves...',
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
      tag: '',
      skip: '체스판으로 건너뛰기', navPlay: '대국', navFeatures: '기능', navHow: '사용법', navFaq: '자주 묻는 질문',
      themeTitle: '라이트 / 다크 테마', soundTitle: '효과음 켜기/끄기',
      lead: 'JavaScript로 만든 무료 오픈소스 체스 엔진, 분석판, 대국 리뷰 도구입니다.',
      ctaPlay: '바로 두기', ctaReview: '대국 분석하기', ctaStar: 'GitHub에서 별 주기',
      resign: '기권', boardTheme: '체스판 색', bGreen: '초록', bBrown: '갈색', bBlue: '파랑', bGray: '회색',
      openPgn: 'PGN 파일 열기', savePgn: 'PGN 저장', you: '나', engine: '엔진',
      resignWhite: '백 기권 - 흑 승리', resignBlack: '흑 기권 - 백 승리',
      featuresTitle: '기능',
      f1t: '알파-베타 탐색', f1d: '반복 심화, 전치 테이블, 널무브 가지치기, 늦은 수 감축, 특이 수 확장, 정지 탐색을 사용합니다.',
      f2t: '대국 리뷰', f2d: 'PGN, FEN, 기보를 붙여넣으면 모든 수를 최선부터 큰 실수까지 평가하고, 정확도와 평가 그래프, 더 좋았던 수를 판 위에 보여줍니다.',
      f3t: '모든 CPU 코어 사용', f3d: '대국 리뷰는 모든 코어가 동시에 국면을 분석하고, 실시간 분석은 해시 테이블을 공유하는 여러 스레드로 탐색할 수 있습니다.',
      f4t: '7단계 난이도', f4d: '가벼운 초보 대국부터 최대 강도까지, 생각 시간도 조절할 수 있습니다.',
      f5t: '읽고 고치기 쉬움', f5d: '빌드 과정과 의존성이 없는 순수 JavaScript입니다. 탐색 상수와 평가 항목이 각각 하나의 주석 달린 파일에 모여 있습니다.',
      f6t: 'MIT 라이선스', f6d: '자유롭게 사용, 포크, 내 프로젝트에 포함할 수 있습니다. GitHub에서 기여도 환영합니다.',
      howTitle: '사용법',
      s1t: '대국', s1d: '색과 강도를 고르고 기물을 끌어서 또는 클릭해서 움직이세요. 평가 막대가 누가 유리한지 보여줍니다.',
      s2t: '분석', s2d: '분석판으로 바꾸면 어떤 국면이든 선택한 깊이까지 엔진의 최선 변화를 볼 수 있습니다.',
      s3t: '리뷰', s3d: '끝난 대국을 붙여넣고 "대국 분석"을 누르세요. 한 수씩 넘기며 실수와 큰 실수, 더 좋았던 수를 확인할 수 있습니다.',
      faqTitle: '자주 묻는 질문',
      q1: 'Open Chess Engine이 뭔가요?', a1: '분석판과 대국 리뷰 기능이 들어 있는 무료 오픈소스 체스 엔진입니다. 엔진과 대국하고, 어떤 국면이든 분석하고, PGN 대국을 리뷰할 수 있습니다.',
      q2: '대국은 어떻게 분석하나요?', a2: '대국 분석 칸에 PGN, 기보, FEN을 붙여넣고 "대국 분석"을 누르세요. .pgn 파일을 열 수도 있습니다.',
      q3: '엔진은 얼마나 강한가요?', a3: '기기 성능과 생각 시간에 따라 달라집니다. 직접 만든 평가식을 쓰는 고전적인 알파-베타 엔진이라 Stockfish 같은 최강 엔진에는 미치지 못합니다.',
      q4: '직접 실행할 수 있나요?', a4: '네. 저장소를 내려받아 python3 -m http.server 같은 정적 웹 서버로 폴더를 열면 됩니다. 빌드할 것은 없습니다.',
      q5: '기여하려면 어떻게 하나요?', a5: 'GitHub에서 이슈나 풀 리퀘스트를 열어 주세요. 평가식, 탐색, 인터페이스 아이디어 모두 환영합니다.',
      footMit: 'MIT 라이선스로 공개되어 있습니다.', footIssues: '문제 신고', footDocs: '문서',
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
      followUp: '이어지는 수까지 다시 확인하는 중...',
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
