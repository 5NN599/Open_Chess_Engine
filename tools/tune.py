#!/usr/bin/env python3
# Open Chess Engine - Texel-style tuning of the piece-square tables.
# SPDX-License-Identifier: MIT
#
#   node tools/label-classical.js data/*.txt          # classical eval of every position (once)
#   python3 tools/tune.py --data "data/part*.txt" --test data/leaf2.txt
#
# The evaluation is linear in the piece-square values, so the exact gradient of the
# logistic loss is cheap: we fit additive deltas (middlegame + endgame, 6 x 64 each)
# with Adam + L2 shrinkage, choose the shrinkage on a held-out set, and write
# js/engine/eval-tuned.js.  Pure numpy/scipy, no neural network.
import argparse, glob, json, os
import numpy as np
import scipy.sparse as sp

K = 400.0
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")


def load(files, lam):
    rows, cols, vals, ys, cls, stms = [], [], [], [], [], []
    n0 = 0
    for f in files:
        text = open(f).read()
        c = np.array(open(f + ".cls").read().split(), dtype=np.float64)
        flat = np.fromstring(text.replace("\n", " 1000000000 "), sep=" ")
        ends = np.flatnonzero(flat == 1e9)
        starts = np.concatenate(([0], ends[:-1] + 1))
        keep = ends > starts + 3
        ends, starts = ends[keep], starts[keep]
        assert len(starts) == len(c), (f, len(starts), len(c))
        mask = np.ones(flat.shape[0], dtype=bool)
        mask[ends] = False
        for k in range(3):
            mask[starts + k] = False
        cp, res, stm = flat[starts], flat[starts + 1], flat[starts + 2].astype(np.int8)
        tok = flat[mask].astype(np.int64)
        nt = ends - starts - 3
        sample = np.repeat(np.arange(len(cp)), nt)
        piece, sq = tok >> 6, tok & 63
        color, typ = piece >> 3, (piece & 7)
        r, fl = sq >> 3, sq & 7
        idx = np.where(color == 0, (7 - r) * 8 + fl, r * 8 + fl) + (typ - 1) * 64
        # phase (24 = full middlegame)
        w = np.array([0, 0, 1, 1, 2, 4, 0])[typ]
        phase = np.minimum(np.bincount(sample, weights=w, minlength=len(cp)), 24)
        sgn = np.where(color == 0, 1.0, -1.0) * np.where(stm[sample] == 0, 1.0, -1.0)
        wmg = phase[sample] / 24.0
        # drop kings' contribution? no - king tables are tuned too.
        rows += [sample + n0, sample + n0]
        cols += [idx, idx + 384]
        vals += [(sgn * wmg).astype(np.float32), (sgn * (1 - wmg)).astype(np.float32)]
        r_stm = np.where(stm == 0, res, 1 - res)
        ys.append(lam / (1 + np.exp(-cp / K)) + (1 - lam) * r_stm)
        cls.append(c)
        n0 += len(cp)
    X = sp.csr_matrix((np.concatenate(vals), (np.concatenate(rows), np.concatenate(cols))), shape=(n0, 768))
    return X, np.concatenate(ys).astype(np.float32), np.concatenate(cls).astype(np.float32)


def loss(X, y, c, d):
    x = c + X @ d
    p = 1 / (1 + np.exp(-x / K))
    return float(np.mean((p - y) ** 2))


def fit(X, y, c, reg, epochs, lr, batch, rng, Xt=None, yt=None, ct=None):
    d = np.zeros(768, dtype=np.float32)
    m = np.zeros_like(d); v = np.zeros_like(d); t = 0
    n = X.shape[0]
    best = (1e9, d.copy(), 0)
    for ep in range(epochs):
        perm = rng.permutation(n)
        for i in range(0, n, batch):
            b = perm[i:i + batch]
            Xb = X[b]
            x = c[b] + Xb @ d
            p = 1 / (1 + np.exp(-x / K))
            g = Xb.T @ ((p - y[b]) * p * (1 - p) * 2 / K) / len(b) + 2 * reg * d
            t += 1
            m = 0.9 * m + 0.1 * g; v = 0.999 * v + 0.001 * g * g
            d = d - lr * (m / (1 - 0.9 ** t)) / (np.sqrt(v / (1 - 0.999 ** t)) + 1e-8)
        if Xt is not None:
            tl = loss(Xt, yt, ct, d)
            if tl < best[0]:
                best = (tl, d.copy(), ep + 1)
            print(f"  epoch {ep + 1:2d} train {loss(X, y, c, d):.5f} test {tl:.5f}", flush=True)
    return best if Xt is not None else (None, d, epochs)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="data/part*.txt")
    ap.add_argument("--test", default="data/leaf2.txt")
    ap.add_argument("--lam", type=float, default=0.75)
    ap.add_argument("--epochs", type=int, default=12)
    ap.add_argument("--lr", type=float, default=0.4)
    ap.add_argument("--batch", type=int, default=8192)
    ap.add_argument("--regs", default="0,1e-7,1e-6")
    ap.add_argument("--out", default=os.path.join(ROOT, "js", "engine", "eval-tuned.js"))
    a = ap.parse_args()
    rng = np.random.default_rng(1)
    X, y, c = load(sorted(glob.glob(a.data)), a.lam)
    Xt, yt, ct = load(sorted(glob.glob(a.test)), a.lam)
    print(f"train {X.shape[0]} test {Xt.shape[0]}; baseline test loss {loss(Xt, yt, ct, np.zeros(768, np.float32)):.5f}")
    best = None
    for reg in [float(r) for r in a.regs.split(",")]:
        print(f"reg {reg}")
        tl, d, ep = fit(X, y, c, reg, a.epochs, a.lr, a.batch, rng, Xt, yt, ct)
        if best is None or tl < best[0]:
            best = (tl, d, reg)
    tl, d, reg = best
    print(f"best reg {reg}: test loss {tl:.5f}")
    d = np.round(d).astype(int)
    out = {"pstMg": d[:384].tolist(), "pstEg": d[384:].tolist()}
    with open(a.out, "w") as f:
        f.write("/*\n * Open Chess Engine - eval-tuned.js (generated by tools/tune.py; safe to delete or edit)\n"
                " * SPDX-License-Identifier: MIT\n */\n(function () {\n  'use strict';\n"
                "  const OCE = (globalThis.OCE = globalThis.OCE || {});\n  OCE.TUNED = "
                + json.dumps(out) + ";\n})();\n")
    print("wrote", a.out)


if __name__ == "__main__":
    main()
