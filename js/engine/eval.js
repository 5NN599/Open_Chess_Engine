/*
 * Open Chess Engine - eval.js
 * SPDX-License-Identifier: MIT
 *
 * Hand-crafted tapered evaluation (middlegame/endgame blend), in centipawns,
 * returned from the point of view of the side to move.
 *
 * Terms:
 *   - material + piece-square tables (PeSTO tables by Ronald Friederich, public domain)
 *   - bishop pair, piece mobility, rooks on open files
 *   - pawn structure: doubled, isolated, passed pawns
 *   - king safety: pawn shield + attacks on the king zone
 *   - mop-up (drive the lone king to the edge) and drawish-ending scaling
 *
 * Every tunable number lives in PARAMS or the tables below - change them freely.
 */
(function () {
  'use strict';

  const OCE = (globalThis.OCE = globalThis.OCE || {});
  const { WHITE, BLACK, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING } = OCE.C;

  // ------------------------------------------------------------ parameters
  const PARAMS = {
    tempo: 12,
    bishopPairMg: 30, bishopPairEg: 50,
    doubledMg: 10, doubledEg: 20,
    isolatedMg: 12, isolatedEg: 10,
    rookOpenMg: 22, rookOpenEg: 10,
    rookSemiOpenMg: 10, rookSemiOpenEg: 6,
    shieldNear: 12,     // own pawn directly in front of the king
    shieldFar: 6,       // own pawn two ranks in front
    shieldMissing: -10, // no pawn on that file in front of the king
    // Mobility: bonus per square above/below `base`, indexed by piece type.
    mobBase: [0, 0, 4, 5, 6, 13],
    mobMg: [0, 0, 4, 3, 2, 1],
    mobEg: [0, 0, 4, 3, 4, 2],
    // King-zone attack weights per attacking piece type.
    attackWeight: [0, 0, 2, 2, 3, 5],
    // Passed pawn bonus by relative rank (0..7).
    passedMg: [0, 3, 6, 14, 30, 58, 100, 0],
    passedEg: [0, 8, 14, 32, 62, 110, 170, 0],
  };

  const MG_VALUE = [0, 82, 337, 365, 477, 1025, 0];
  const EG_VALUE = [0, 94, 281, 297, 512, 936, 0];

  // Piece-square tables, written from White's point of view with rank 8 first
  // (so they read like a diagram). Index 0 = a8, 63 = h1.
  const PST_MG_RAW = [null,
    // pawn
    [0, 0, 0, 0, 0, 0, 0, 0,
      98, 134, 61, 95, 68, 126, 34, -11,
      -6, 7, 26, 31, 65, 56, 25, -20,
      -14, 13, 6, 21, 23, 12, 17, -23,
      -27, -2, -5, 12, 17, 6, 10, -25,
      -26, -4, -4, -10, 3, 3, 33, -12,
      -35, -1, -20, -23, -15, 24, 38, -22,
      0, 0, 0, 0, 0, 0, 0, 0],
    // knight
    [-167, -89, -34, -49, 61, -97, -15, -107,
      -73, -41, 72, 36, 23, 62, 7, -17,
      -47, 60, 37, 65, 84, 129, 73, 44,
      -9, 17, 19, 53, 37, 69, 18, 22,
      -13, 4, 16, 13, 28, 19, 21, -8,
      -23, -9, 12, 10, 19, 17, 25, -16,
      -29, -53, -12, -3, -1, 18, -14, -19,
      -105, -21, -58, -33, -17, -28, -19, -23],
    // bishop
    [-29, 4, -82, -37, -25, -42, 7, -8,
      -26, 16, -18, -13, 30, 59, 18, -47,
      -16, 37, 43, 40, 35, 50, 37, -2,
      -4, 5, 19, 50, 37, 37, 7, -2,
      -6, 13, 13, 26, 34, 12, 10, 4,
      0, 15, 15, 15, 14, 27, 18, 10,
      4, 15, 16, 0, 7, 21, 33, 1,
      -33, -3, -14, -21, -13, -12, -39, -21],
    // rook
    [32, 42, 32, 51, 63, 9, 31, 43,
      27, 32, 58, 62, 80, 67, 26, 44,
      -5, 19, 26, 36, 17, 45, 61, 16,
      -24, -11, 7, 26, 24, 35, -8, -20,
      -36, -26, -12, -1, 9, -7, 6, -23,
      -45, -25, -16, -17, 3, 0, -5, -33,
      -44, -16, -20, -9, -1, 11, -6, -71,
      -19, -13, 1, 17, 16, 7, -37, -26],
    // queen
    [-28, 0, 29, 12, 59, 44, 43, 45,
      -24, -39, -5, 1, -16, 57, 28, 54,
      -13, -17, 7, 8, 29, 56, 47, 57,
      -27, -27, -16, -16, -1, 17, -2, 1,
      -9, -26, -9, -10, -2, -4, 3, -3,
      -14, 2, -11, -2, -5, 2, 14, 5,
      -35, -8, 11, 2, 8, 15, -3, 1,
      -1, -18, -9, 10, -15, -25, -31, -50],
    // king
    [-65, 23, 16, -15, -56, -34, 2, 13,
      29, -1, -20, -7, -8, -4, -38, -29,
      -9, 24, 2, -16, -20, 6, 22, -22,
      -17, -20, -12, -27, -30, -25, -14, -36,
      -49, -1, -27, -39, -46, -44, -33, -51,
      -14, -14, -22, -46, -44, -30, -15, -27,
      1, 7, -8, -64, -43, -16, 9, 8,
      -15, 36, 12, -54, 8, -28, 24, 14],
  ];

  const PST_EG_RAW = [null,
    [0, 0, 0, 0, 0, 0, 0, 0,
      178, 173, 158, 134, 147, 132, 165, 187,
      94, 100, 85, 67, 56, 53, 82, 84,
      32, 24, 13, 5, -2, 4, 17, 17,
      13, 9, -3, -7, -7, -8, 3, -1,
      4, 7, -6, 1, 0, -5, -1, -8,
      13, 8, 8, 10, 13, 0, 2, -7,
      0, 0, 0, 0, 0, 0, 0, 0],
    [-58, -38, -13, -28, -31, -27, -63, -99,
      -25, -8, -25, -2, -9, -25, -24, -52,
      -24, -20, 10, 9, -1, -9, -19, -41,
      -17, 3, 22, 22, 22, 11, 8, -18,
      -18, -6, 16, 25, 16, 17, 4, -18,
      -23, -3, -1, 15, 10, -3, -20, -22,
      -42, -20, -10, -5, -2, -20, -23, -44,
      -29, -51, -23, -15, -22, -18, -50, -64],
    [-14, -21, -11, -8, -7, -9, -17, -24,
      -8, -4, 7, -12, -3, -13, -4, -14,
      2, -8, 0, -1, -2, 6, 0, 4,
      -3, 9, 12, 9, 14, 10, 3, 2,
      -6, 3, 13, 19, 7, 10, -3, -9,
      -12, -3, 8, 10, 13, 3, -7, -15,
      -14, -18, -7, -1, 4, -9, -15, -27,
      -23, -9, -23, -5, -9, -16, -5, -17],
    [13, 10, 18, 15, 12, 12, 8, 5,
      11, 13, 13, 11, -3, 3, 8, 3,
      7, 7, 7, 5, 4, -3, -5, -3,
      4, 3, 13, 1, 2, 1, -1, 2,
      3, 5, 8, 4, -5, -6, -8, -11,
      -4, 0, -5, -1, -7, -12, -8, -16,
      -6, -6, 0, 2, -9, -9, -11, -3,
      -9, 2, 3, -1, -5, -13, 4, -20],
    [-9, 22, 22, 27, 27, 19, 10, 20,
      -17, 20, 32, 41, 58, 25, 30, 0,
      -20, 6, 9, 49, 47, 35, 19, 9,
      3, 22, 24, 45, 57, 40, 57, 36,
      -18, 28, 19, 47, 31, 34, 39, 23,
      -16, -27, 15, 6, 9, 17, 10, 5,
      -22, -23, -30, -16, -16, -23, -36, -32,
      -33, -28, -22, -43, -5, -32, -20, -41],
    [-74, -35, -18, -18, -11, 15, 4, -17,
      -12, 17, 14, 17, 17, 38, 23, 11,
      10, 17, 23, 15, 20, 45, 44, 13,
      -8, 22, 24, 27, 26, 33, 26, 3,
      -18, -4, 21, 24, 27, 23, 9, -11,
      -19, -3, 11, 21, 23, 16, 7, -9,
      -27, -11, 4, 13, 14, 4, -5, -17,
      -53, -34, -21, -11, -28, -14, -24, -43],
  ];

  // Optional tuned values (generated by tools/tune.py + tools/tune-params.js; delete eval-tuned.js to revert).
  // pstMg / pstEg are deltas added to the raw tables above, 6 pieces x 64 squares (same layout as the raw tables).
  const TUNED = OCE.TUNED;
  if (TUNED) {
    if (TUNED.params) Object.assign(PARAMS, TUNED.params);
    for (let t = 1; t <= 6; t++) {
      for (let i = 0; i < 64; i++) {
        if (TUNED.pstMg) PST_MG_RAW[t][i] += TUNED.pstMg[(t - 1) * 64 + i];
        if (TUNED.pstEg) PST_EG_RAW[t][i] += TUNED.pstEg[(t - 1) * 64 + i];
      }
    }
  }

  // Expand to 0x88-indexed tables indexed by [pieceCode * 128 + square].
  // Values include material and are positive "for the owner".
  const PST_MG = new Int16Array(16 * 128);
  const PST_EG = new Int16Array(16 * 128);
  for (let type = 1; type <= 6; type++) {
    for (let color = 0; color < 2; color++) {
      const piece = type | (color << 3);
      for (let r = 0; r < 8; r++) {
        for (let f = 0; f < 8; f++) {
          const idx = color === WHITE ? (7 - r) * 8 + f : r * 8 + f;
          PST_MG[piece * 128 + r * 16 + f] = MG_VALUE[type] + PST_MG_RAW[type][idx];
          PST_EG[piece * 128 + r * 16 + f] = EG_VALUE[type] + PST_EG_RAW[type][idx];
        }
      }
    }
  }

  const KNIGHT_OFFSETS = [33, 31, 18, 14, -14, -18, -31, -33];
  const KING_OFFSETS = [16, -16, 1, -1, 17, 15, -15, -17];
  const BISHOP_DIRS = [17, 15, -15, -17];
  const ROOK_DIRS = [16, -16, 1, -1];
  const NP_VALUE = [0, 0, 320, 330, 500, 900, 0];

  // Scratch buffers (module level so evaluation never allocates).
  const pawnCnt = new Int8Array(16);
  const pMax = new Int8Array(16);
  const pMin = new Int8Array(16);
  const pawnAtt = [new Uint8Array(128), new Uint8Array(128)];
  const zone = [new Uint8Array(128), new Uint8Array(128)];
  const pieceList = new Int16Array(32);
  const pieceN = new Int8Array(2);
  const pawnList = new Int16Array(32);
  const pawnN = new Int8Array(2);
  const attackers = new Int8Array(2);
  const attackSum = new Int16Array(2);

  const dist = (a, b) => Math.max(Math.abs((a & 7) - (b & 7)), Math.abs((a >> 4) - (b >> 4)));
  const centerDist = (s) => Math.max(3 - (s & 7), (s & 7) - 4) + Math.max(3 - (s >> 4), (s >> 4) - 4);

  /** Static evaluation in centipawns, side-to-move relative. */
  function evaluate(board) {
    const P = PARAMS;
    const sq = board.sq, cnt = board.cnt;
    let mg = 0, eg = 0;

    pawnCnt.fill(0); pMax.fill(-1); pMin.fill(8);
    pawnAtt[0].fill(0); pawnAtt[1].fill(0);
    zone[0].fill(0); zone[1].fill(0);
    pieceN[0] = pieceN[1] = 0; pawnN[0] = pawnN[1] = 0;
    attackers[0] = attackers[1] = 0; attackSum[0] = attackSum[1] = 0;

    // ---- pass 1: material, piece-square tables, collect pieces
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const s = (r << 4) | f;
        const p = sq[s];
        if (p === 0) continue;
        const idx = (p << 7) | s;
        const color = p >> 3, type = p & 7;
        if (color === WHITE) { mg += PST_MG[idx]; eg += PST_EG[idx]; }
        else { mg -= PST_MG[idx]; eg -= PST_EG[idx]; }

        if (type === PAWN) {
          const fi = (color << 3) | f;
          pawnCnt[fi]++;
          if (r > pMax[fi]) pMax[fi] = r;
          if (r < pMin[fi]) pMin[fi] = r;
          pawnList[(color << 4) + pawnN[color]++] = s;
          const a = color === WHITE ? s + 15 : s - 15, b = color === WHITE ? s + 17 : s - 17;
          if (!(a & 0x88)) pawnAtt[color][a] = 1;
          if (!(b & 0x88)) pawnAtt[color][b] = 1;
        } else if (type !== KING) {
          pieceList[(color << 4) + pieceN[color]++] = s;
        }
      }
    }

    // King zones (3x3 around each king)
    const wk = board.kingSq[WHITE], bk = board.kingSq[BLACK];
    zone[WHITE][wk] = 1; zone[BLACK][bk] = 1;
    for (let k = 0; k < 8; k++) {
      let t = wk + KING_OFFSETS[k]; if (!(t & 0x88)) zone[WHITE][t] = 1;
      t = bk + KING_OFFSETS[k]; if (!(t & 0x88)) zone[BLACK][t] = 1;
    }

    // ---- pass 2: per-colour terms
    for (let color = 0; color < 2; color++) {
      const them = color ^ 1, sign = color === WHITE ? 1 : -1;
      const base = color << 4;
      let tmg = 0, teg = 0;

      // Pawn structure by file
      for (let f = 0; f < 8; f++) {
        const n = pawnCnt[(color << 3) | f];
        if (n === 0) continue;
        if (n > 1) { tmg -= P.doubledMg * (n - 1); teg -= P.doubledEg * (n - 1); }
        const left = f > 0 ? pawnCnt[(color << 3) | (f - 1)] : 0;
        const right = f < 7 ? pawnCnt[(color << 3) | (f + 1)] : 0;
        if (left === 0 && right === 0) { tmg -= P.isolatedMg * n; teg -= P.isolatedEg * n; }
      }

      // Passed pawns
      const ownKing = board.kingSq[color], enemyKing = board.kingSq[them];
      for (let i = 0; i < pawnN[color]; i++) {
        const s = pawnList[base + i];
        const f = s & 7, r = s >> 4;
        let passed = true;
        for (let g = Math.max(0, f - 1); g <= Math.min(7, f + 1); g++) {
          const fi = (them << 3) | g;
          if (color === WHITE ? pMax[fi] > r : (pMin[fi] < r && pMin[fi] !== 8)) { passed = false; break; }
        }
        if (!passed) continue;
        const rr = color === WHITE ? r : 7 - r;
        let bm = P.passedMg[rr], be = P.passedEg[rr];
        const stop = color === WHITE ? s + 16 : s - 16;
        if (sq[stop] !== 0) { bm >>= 1; be >>= 1; }
        be += rr * 2 * (dist(enemyKing, stop) - dist(ownKing, stop));
        tmg += bm; teg += be;
      }

      // Pieces: mobility, king-zone attacks, rook files
      const zoneEnemy = zone[them];
      const enemyPawns = pawnAtt[them];
      for (let i = 0; i < pieceN[color]; i++) {
        const s = pieceList[base + i];
        const type = sq[s] & 7;
        let mob = 0, attacks = false;

        if (type === KNIGHT) {
          for (let k = 0; k < 8; k++) {
            const t = s + KNIGHT_OFFSETS[k];
            if (t & 0x88) continue;
            const p = sq[t];
            if (p !== 0 && (p >> 3) === color) continue;
            if (!enemyPawns[t]) mob++;
            if (zoneEnemy[t]) attacks = true;
          }
        } else {
          const rookLike = type === ROOK || type === QUEEN;
          const bishopLike = type === BISHOP || type === QUEEN;
          if (bishopLike) {
            for (let k = 0; k < 4; k++) {
              const d = BISHOP_DIRS[k];
              let t = s + d;
              while (!(t & 0x88)) {
                const p = sq[t];
                if (p !== 0 && (p >> 3) === color) break;
                if (!enemyPawns[t]) mob++;
                if (zoneEnemy[t]) attacks = true;
                if (p !== 0) break;
                t += d;
              }
            }
          }
          if (rookLike) {
            for (let k = 0; k < 4; k++) {
              const d = ROOK_DIRS[k];
              let t = s + d;
              while (!(t & 0x88)) {
                const p = sq[t];
                if (p !== 0 && (p >> 3) === color) break;
                if (!enemyPawns[t]) mob++;
                if (zoneEnemy[t]) attacks = true;
                if (p !== 0) break;
                t += d;
              }
            }
            if (type === ROOK) {
              const f = s & 7;
              if (pawnCnt[(color << 3) | f] === 0) {
                if (pawnCnt[(them << 3) | f] === 0) { tmg += P.rookOpenMg; teg += P.rookOpenEg; }
                else { tmg += P.rookSemiOpenMg; teg += P.rookSemiOpenEg; }
              }
            }
          }
        }
        tmg += (mob - P.mobBase[type]) * P.mobMg[type];
        teg += (mob - P.mobBase[type]) * P.mobEg[type];
        if (attacks) { attackers[color]++; attackSum[color] += P.attackWeight[type]; }
      }

      // Bishop pair
      if (cnt[BISHOP | (color << 3)] >= 2) { tmg += P.bishopPairMg; teg += P.bishopPairEg; }

      // King safety (middlegame only): pawn shield ...
      {
        const ksq = board.kingSq[color];
        const kf = ksq & 7;
        const dir = color === WHITE ? 16 : -16;
        const myPawn = PAWN | (color << 3);
        let shield = 0;
        for (let g = Math.max(0, kf - 1); g <= Math.min(7, kf + 1); g++) {
          const t1 = (ksq & 0x70) + g + dir; // file g, one rank ahead of the king
          const t2 = t1 + dir;               // two ranks ahead
          if (!(t1 & 0x88) && sq[t1] === myPawn) shield += P.shieldNear;
          else if (!(t2 & 0x88) && sq[t2] === myPawn) shield += P.shieldFar;
          else shield += P.shieldMissing;
        }
        tmg += shield;
      }
      // ... and enemy pressure on the king zone (applied below from the attacker's side)

      mg += sign * tmg;
      eg += sign * teg;
    }

    // King danger: attackers[c] attack the zone around the enemy king.
    for (let c = 0; c < 2; c++) {
      if (attackers[c] >= 2) {
        let danger = (attackSum[c] * attackSum[c]) >> 1;
        if (cnt[QUEEN | (c << 3)] === 0) danger >>= 1;
        if (danger > 500) danger = 500;
        mg += c === WHITE ? danger : -danger;
      }
    }

    // ---- game phase (24 = full middlegame, 0 = bare endgame)
    let phase = cnt[2] + cnt[10] + cnt[3] + cnt[11] + 2 * (cnt[4] + cnt[12]) + 4 * (cnt[5] + cnt[13]);
    if (phase > 24) phase = 24;
    let score = ((mg * phase + eg * (24 - phase)) / 24) | 0;

    // ---- endgame knowledge
    const wnp = cnt[2] * 320 + cnt[3] * 330 + cnt[4] * 500 + cnt[5] * 900;
    const bnp = cnt[10] * 320 + cnt[11] * 330 + cnt[12] * 500 + cnt[13] * 900;
    const wp = cnt[PAWN], bp = cnt[PAWN | 8];
    if (score > 0 && wp === 0 && wnp - bnp <= 350) score = (score / 4) | 0;       // cannot convert
    else if (score < 0 && bp === 0 && bnp - wnp <= 350) score = (score / 4) | 0;
    // Mop-up: with a decisive material edge and no enemy pawns, push the lone king to the edge.
    if (wnp - bnp >= 450 && bp === 0) {
      score += 10 * centerDist(bk) + 4 * (14 - dist(wk, bk)) * 2;
    } else if (bnp - wnp >= 450 && wp === 0) {
      score -= 10 * centerDist(wk) + 4 * (14 - dist(wk, bk)) * 2;
    }

    return (board.side === WHITE ? score : -score) + P.tempo;
  }

  OCE.evaluate = evaluate;
  OCE.EVAL_PARAMS = PARAMS;
})();
