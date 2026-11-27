# Open Chess Engine

A chess engine and analysis board that runs **entirely in your browser**. No server, no external engine
(no Stockfish, no WASM blobs, no network calls) - every line of the engine is plain, readable JavaScript in `js/engine/`.

## Run it

```bash
cd open-chess-engine
python3 -m http.server 8000      # or: npx serve .
# open http://localhost:8000
```

Opening `index.html` directly from disk also works; the engine then runs on the main thread
(the page is a bit less smooth while it thinks) because browsers block Web Workers on `file://`.

## Features

* Play against the engine (strength levels, think time) or use it as an analysis board.
* Live analysis with MultiPV lines, depth, nodes/s and an evaluation bar.
* **Game review**: paste a PGN (or a plain move list, or a FEN) -> every move is analysed and classified
  (best / excellent / good / inaccuracy / mistake / blunder), with accuracy for both sides, an evaluation graph,
  the best alternative for each mistake, and arrow-key navigation. "Analyze current game" reviews the game you just played.
* FEN loading, PGN export.

## The engine

| Part | File | Notes |
|------|------|-------|
| Board, move generation, make/unmake, SEE, SAN | `js/engine/board.js` | 0x88 board, Zobrist hashing, passes the standard perft suite |
| Transposition table | `js/engine/tt.js` | typed arrays, configurable size |
| Evaluation | `js/engine/eval.js` | tapered PeSTO tables + mobility, pawn structure, king safety, bishop pair, rook files, passed pawns, mop-up. All numbers in `PARAMS` |
| Search | `js/engine/search.js` | iterative deepening PVS, aspiration windows, MultiPV, quiescence, null move, razoring, reverse futility, futility, late-move pruning/reductions, SEE pruning, killers/history/counter moves |
| Public API | `js/engine/engine.js` | `setPosition`, `go`, `setOption` (Hash, MultiPV, Skill) |
| Worker | `js/engine/worker.js` | runs the engine off the UI thread |
| Tuned values (optional) | `js/engine/eval-tuned.js` | generated overrides for the evaluation tables, see below |
| PGN parser | `js/engine/pgn.js` | headers, comments, variations, NAGs, several games per file |
| Game review maths | `js/engine/review.js` | win-probability based classification and accuracy |

```js
const engine = new OCE.Engine();
engine.setOption('Hash', 64);
engine.setPosition('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', ['e2e4', 'e7e5']);
console.log(engine.go({ movetime: 1000 }, (info) => console.log(info.depth, info.score, info.pv.join(' '))));
```

## Using all CPU cores

* **Game review** analyses different positions on different cores at the same time (`OCE.AnalysisPool` in `js/ui/engine-client.js`), so a review is roughly `cores` times faster. It works wherever Web Workers work.
* Live analysis stops at the chosen depth (default 20, "Analysis depth" in the Analysis card) so the evaluation bar settles; choose "Unlimited" for endless analysis.
* **Live analysis / engine moves** use Lazy SMP: several workers search the same position and share one transposition table in a `SharedArrayBuffer` (lock-less XOR-checked entries, see `js/engine/tt.js`). This needs a *cross-origin isolated* page. Open the page over `http(s)` (a local server such as `python3 -m http.server`, or GitHub Pages): `js/ui/coi.js` + `coi-sw.js` add the required headers with a small service worker and reload once. On `file://` live analysis stays single-threaded. Choose the thread count in the Analysis card ("CPU threads", default: all cores).
* Measured on a 2-core test machine: about 1.3x faster time-to-depth at depth 19 with 2 threads; the gain grows with more cores and deeper searches.

## Languages, icons and review overlays

* `js/ui/i18n.js` holds all UI text (English + Korean). English is the default; use the language selector in the header (the choice is remembered); to add a language, copy the `en` block, translate it and add an `<option>` to `#lang`. Static text uses `data-i18n` attributes, dynamic text `OCE.I18N.t(key, params)`.
* `favicon.svg` is the tab icon.
* In game review the move just played gets a badge on its destination square (best / excellent / good / inaccuracy / mistake / blunder),
  and for non-best moves an arrow shows the better move (toggle: "Show the better move on the board").

## Measuring and tuning (no neural network)

The engine is purely classical: search + hand-written evaluation. Tools to improve it with numbers instead of guesses:

* `tools/match.js` - plays two *versions* of the engine against each other (`--a` / `--b` are engine directories, e.g. a saved
  copy vs the working tree) from random openings with colours swapped, and prints W/D/L plus an Elo estimate.
  `node tools/match.js --a ../baseline/js/engine --b js/engine --games 60 --movetime 100`
  Note: 60 games only resolve differences of roughly +-60 Elo; use several processes and many games.
* `tools/gen-data.js` + `tools/label-classical.js` + `tools/tune.py` - Texel-style tuning: the evaluation is linear in the
  piece-square values, so the exact logistic-loss gradient is cheap. `tune.py` fits additive corrections with Adam and writes
  `js/engine/eval-tuned.js` (delete that file's contents to revert). With ~1M self-play positions the PeSTO tables turned out to be
  already near-optimal (held-out loss 0.02163 -> 0.02160), so the shipped file is empty.

Search features added by measurement: quiescence hash table, 1- and 2-ply continuation history, singular extensions.
Against the previous version: 25 wins / 14 draws / 21 losses in 60 games at 200 ms per move (about +20 Elo, error bar +-60).

## Tweaking

* Evaluation weights: `PARAMS` and the tables at the top of `eval.js`.
* Pruning/reduction margins: look for `TUNE` comments in `search.js`.
* Review strictness: `THRESHOLDS` in `review.js`.
* Strength levels: `SKILL_DEPTH` in `engine.js`.

## Tests and tools (Node 18+)

```bash
node tests/engine-test.js        # perft + tactics + speed
node tests/selfplay-test.js      # engine plays itself, every move must be legal
node tests/review-test.js        # PGN parsing + game review
node tools/analyze.js game.pgn --time 1000     # command line game review
```

## Honest note on strength

The engine is a classical alpha-beta engine with a hand-crafted evaluation, written for readability. In a browser
it searches roughly 300-400k nodes/s and typically reaches depth 18-22 in a few seconds, which makes it a strong
club/master-level analysis partner. Chess.com uses Stockfish with NNUE, a neural-network evaluation, compiled to native or WASM code
with multithreading; matching it exactly would require a trained network and much faster search.
The code is structured so these can be added later (a better `evaluate`, piece lists for faster move generation, Lazy SMP in more workers).

## License

MIT. Add your `LICENSE` file at the project root; source files carry an `SPDX-License-Identifier: MIT` header.

Piece-square tables are the PeSTO tables by Ronald Friederich (Rofchade), published for free use.
