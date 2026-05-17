/**
 * mimo.js — Phase 9 MIMO foundation
 *
 * MIMOStateSpace represents an n-state, m-input, p-output LTI system.
 * channelTF(i, j) extracts the scalar transfer function from input u_j
 * to output y_i, reusing the existing SISO stateSpaceToTransferFunction
 * helper (which accepts B as n×1, C as 1×n, D as 1×1).
 */
import { TransferFunction } from './transfer-function.js';
import { stateSpaceToTransferFunction } from './state-space.js';
import { matInverse, matMul, matTranspose, matEigenvaluesSymmetric } from '../math/matrix.js';
import { Complex } from '../math/complex.js';

function hermitianEigenvalues(GhG) {
  const n = GhG.length;
  const block = Array.from({ length: 2 * n }, () => new Array(2 * n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const { re, im } = GhG[i][j];
      block[i][j] = re;
      block[i][j + n] = -im;
      block[i + n][j] = im;
      block[i + n][j + n] = re;
    }
  }
  const eigs = matEigenvaluesSymmetric(block).sort((a, b) => b - a);
  const collapsed = [];
  for (const eig of eigs) {
    if (!collapsed.length || Math.abs(eig - collapsed[collapsed.length - 1]) > 1e-8) {
      collapsed.push(eig);
    }
    if (collapsed.length === n) break;
  }
  while (collapsed.length < n) {
    collapsed.push(collapsed[collapsed.length - 1] ?? 0);
  }
  return collapsed.sort((a, b) => a - b);
}

export class MIMOStateSpace {
  constructor(A, B, C, D) {
    this.A = A;  // n × n
    this.B = B;  // n × m
    this.C = C;  // p × n
    this.D = D;  // p × m
    this.n = A.length;
    this.m = B[0]?.length || 0;
    this.p = C.length;
  }

  /** Extract scalar TF G_ij(s) for input j → output i. */
  channelTF(outputIdx, inputIdx) {
    if (outputIdx < 0 || outputIdx >= this.p) {
      throw new Error(`Output index ${outputIdx} out of range [0, ${this.p})`);
    }
    if (inputIdx < 0 || inputIdx >= this.m) {
      throw new Error(`Input index ${inputIdx} out of range [0, ${this.m})`);
    }
    const Bj = this.B.map((row) => [row[inputIdx]]);
    const Ci = [this.C[outputIdx].slice()];
    const Dij = [[this.D[outputIdx][inputIdx]]];
    return stateSpaceToTransferFunction(this.A, Bj, Ci, Dij);
  }

  /** Return p×m grid of scalar TFs. */
  allChannels() {
    const grid = [];
    for (let i = 0; i < this.p; i++) {
      const row = [];
      for (let j = 0; j < this.m; j++) row.push(this.channelTF(i, j));
      grid.push(row);
    }
    return grid;
  }
}

/** Parse MIMO state-space from textarea inputs. */
export function parseMIMOMatrices(aStr, bStr, cStr, dStr) {
  const parseMatrix = (s, name) => {
    const rows = String(s || '')
      .trim()
      .split('\n')
      .map((r) => r.trim())
      .filter((r) => r);
    if (rows.length === 0) throw new Error(`${name} is empty`);
    const M = rows.map((r) =>
      r
        .split(/[\s,]+/)
        .filter((x) => x)
        .map(Number),
    );
    if (M.some((r) => r.some((v) => !Number.isFinite(v)))) {
      throw new Error(`${name} contains non-numeric values`);
    }
    const cols = M[0].length;
    if (M.some((r) => r.length !== cols)) {
      throw new Error(`${name} has inconsistent column count`);
    }
    return M;
  };
  const A = parseMatrix(aStr, 'A');
  const B = parseMatrix(bStr, 'B');
  const C = parseMatrix(cStr, 'C');
  const D = parseMatrix(dStr, 'D');
  const n = A.length;
  if (A[0].length !== n) throw new Error(`A must be square (got ${n}×${A[0].length})`);
  if (B.length !== n) throw new Error(`B must have ${n} rows (got ${B.length})`);
  if (C[0].length !== n) throw new Error(`C must have ${n} cols (got ${C[0].length})`);
  if (D.length !== C.length) throw new Error('D rows must match C rows');
  if (D[0].length !== B[0].length) throw new Error('D cols must match B cols');
  return new MIMOStateSpace(A, B, C, D);
}

// ============================================================
// RGA (Relative Gain Array)
// ============================================================

/** Compute DC gain matrix G(0) = -C·A^{-1}·B + D */
export function dcGain(mimoSys) {
  const { A, B, C, D } = mimoSys;
  const negA = A.map((row) => row.map((v) => -v));
  const Ainv = matInverse(negA); // (-A)^{-1}
  const CA = matMul(C, Ainv);
  const CAB = matMul(CA, B);
  return CAB.map((row, i) => row.map((v, j) => v + D[i][j]));
}

/** Compute RGA = G ⊗ (G^{-T}) for square m×m system at steady state. */
export function rgaSteady(mimoSys) {
  if (mimoSys.m !== mimoSys.p) {
    throw new Error(`RGA requires square system (m=p). Got m=${mimoSys.m}, p=${mimoSys.p}`);
  }
  const G = dcGain(mimoSys);
  const Ginv = matInverse(G);
  const GinvT = matTranspose(Ginv);
  return G.map((row, i) => row.map((v, j) => v * GinvT[i][j]));
}

/**
 * Static decoupler: W = G(0)^{-1} (yields G(0)·W = I).
 * Returns m×m static matrix W. Caller can apply via applyDecoupler.
 */
export function staticDecoupler(mimoSys) {
  if (mimoSys.m !== mimoSys.p) {
    throw new Error(`Decoupler needs square system (m=p). Got m=${mimoSys.m}, p=${mimoSys.p}`);
  }
  const G0 = dcGain(mimoSys);
  const W = matInverse(G0);
  const verification = matMul(G0, W);
  return { W, G0, verification };
}

/**
 * Apply a static decoupler W (m×m) to a MIMO plant: B' = B·W, D' = D·W.
 * Returns a new MIMOStateSpace with decoupled inputs.
 */
export function applyDecoupler(mimoSys, W) {
  const Bnew = matMul(mimoSys.B, W);
  const Dnew = matMul(mimoSys.D, W);
  return new MIMOStateSpace(mimoSys.A, Bnew, mimoSys.C, Dnew);
}

/** Diagnose pairing quality from RGA diagonal. */
export function rgaDiagnosis(rga) {
  const n = rga.length;
  const diagnoses = [];
  for (let i = 0; i < n; i++) {
    const lam = rga[i][i];
    if (lam < 0)
      diagnoses.push({ pair: `y${i + 1}↔u${i + 1}`, lambda: lam, level: 'bad', note: 'Sign reversal — avoid' });
    else if (lam < 0.5)
      diagnoses.push({ pair: `y${i + 1}↔u${i + 1}`, lambda: lam, level: 'warn', note: 'Severe interaction' });
    else if (lam > 5)
      diagnoses.push({ pair: `y${i + 1}↔u${i + 1}`, lambda: lam, level: 'warn', note: 'Strong interaction (gain reduction)' });
    else if (lam < 0.8 || lam > 1.5)
      diagnoses.push({ pair: `y${i + 1}↔u${i + 1}`, lambda: lam, level: 'caution', note: 'Moderate interaction' });
    else diagnoses.push({ pair: `y${i + 1}↔u${i + 1}`, lambda: lam, level: 'good', note: 'Good pairing' });
  }
  let suggestion = null;
  const allGood = diagnoses.every((d) => d.level === 'good');
  if (!allGood && n === 2) {
    const diagSum = rga[0][0] + rga[1][1];
    const swapSum = rga[0][1] + rga[1][0];
    if (Math.abs(swapSum - 2) < Math.abs(diagSum - 2)) {
      suggestion = 'Consider swap: y1↔u2 and y2↔u1';
    }
  }
  return { diagnoses, suggestion };
}

// ============================================================
// Singular Value Bode
// ============================================================

/**
 * Evaluate complex matrix G(jω) = C·(jωI - A)^{-1}·B + D.
 * Returns p×m grid of Complex numbers.
 */
export function evalAtJw(mimoSys, omega) {
  const { A, B, C, D, n, m, p } = mimoSys;
  // Build (jωI - A) as complex matrix
  const M = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => new Complex(-A[i][j], i === j ? omega : 0)),
  );
  const Bc = B.map((row) => row.map((v) => new Complex(v, 0)));
  const X = complexSolve(M, Bc);
  const CX = Array.from({ length: p }, (_, i) =>
    Array.from({ length: m }, (_, j) => {
      let sum = new Complex(0, 0);
      for (let k = 0; k < n; k++) {
        sum = sum.add(new Complex(C[i][k], 0).mul(X[k][j]));
      }
      return sum;
    }),
  );
  return CX.map((row, i) => row.map((v, j) => v.add(new Complex(D[i][j], 0))));
}

/** Complex Gauss elimination M·X = B (M is n×n, B is n×cols of Complex). */
function complexSolve(M, B) {
  const n = M.length;
  const cols = B[0].length;
  const aug = M.map((row, i) => [
    ...row.map((c) => ({ re: c.re, im: c.im })),
    ...B[i].map((c) => ({ re: c.re, im: c.im })),
  ]);
  for (let k = 0; k < n; k++) {
    let maxMag = 0;
    let pivot = k;
    for (let i = k; i < n; i++) {
      const mag = Math.hypot(aug[i][k].re, aug[i][k].im);
      if (mag > maxMag) {
        maxMag = mag;
        pivot = i;
      }
    }
    if (maxMag < 1e-12) throw new Error('Singular matrix in complexSolve');
    if (pivot !== k) [aug[k], aug[pivot]] = [aug[pivot], aug[k]];
    const pv = aug[k][k];
    const pvMag2 = pv.re * pv.re + pv.im * pv.im;
    for (let i = k + 1; i < n; i++) {
      const a = aug[i][k];
      const fRe = (a.re * pv.re + a.im * pv.im) / pvMag2;
      const fIm = (a.im * pv.re - a.re * pv.im) / pvMag2;
      for (let j = k; j < n + cols; j++) {
        const t = aug[k][j];
        aug[i][j] = {
          re: aug[i][j].re - (fRe * t.re - fIm * t.im),
          im: aug[i][j].im - (fRe * t.im + fIm * t.re),
        };
      }
    }
  }
  const X = Array.from({ length: n }, () => Array.from({ length: cols }, () => new Complex(0, 0)));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = 0; j < cols; j++) {
      const s = { re: aug[i][n + j].re, im: aug[i][n + j].im };
      for (let k = i + 1; k < n; k++) {
        const t = aug[i][k];
        const x = X[k][j];
        s.re -= t.re * x.re - t.im * x.im;
        s.im -= t.re * x.im + t.im * x.re;
      }
      const pv = aug[i][i];
      const pvMag2 = pv.re * pv.re + pv.im * pv.im;
      X[i][j] = new Complex(
        (s.re * pv.re + s.im * pv.im) / pvMag2,
        (s.im * pv.re - s.re * pv.im) / pvMag2,
      );
    }
  }
  return X;
}

/** Singular values of complex matrix G via eigenvalues of G^H · G. */
export function singularValues(G) {
  const p = G.length;
  const m = G[0].length;
  const GhG = Array.from({ length: m }, (_, i) =>
    Array.from({ length: m }, (_, j) => {
      let re = 0;
      let im = 0;
      for (let k = 0; k < p; k++) {
        const gki = G[k][i];
        const gkj = G[k][j];
        // conj(gki) * gkj
        re += gki.re * gkj.re + gki.im * gkj.im;
        im += gki.re * gkj.im - gki.im * gkj.re;
      }
      return { re, im };
    }),
  );
  if (m === 1) {
    return [Math.sqrt(Math.max(0, GhG[0][0].re))];
  }
  if (m === 2) {
    const a = GhG[0][0].re;
    const d = GhG[1][1].re;
    const b = GhG[0][1];
    const bMag2 = b.re * b.re + b.im * b.im;
    const tr2 = (a + d) / 2;
    const disc = Math.sqrt(((a - d) / 2) ** 2 + bMag2);
    const l1 = tr2 + disc;
    const l2 = tr2 - disc;
    return [Math.sqrt(Math.max(0, l1)), Math.sqrt(Math.max(0, l2))].sort((x, y) => y - x);
  }
  // For higher-order MIMO, convert Hermitian GhG into an equivalent real
  // symmetric block matrix [[Re, -Im], [Im, Re]]. Its eigenvalues duplicate
  // the Hermitian eigenvalues, preserving the true singular values.
  const eigs = hermitianEigenvalues(GhG);
  return eigs.map((e) => Math.sqrt(Math.max(0, e))).sort((x, y) => y - x);
}

/** Compute σ_max(ω), σ_min(ω) across frequency grid. */
export function singularValueBode(mimoSys, omegas) {
  const sigmaMax = [];
  const sigmaMin = [];
  for (const w of omegas) {
    try {
      const Gjw = evalAtJw(mimoSys, w);
      const sv = singularValues(Gjw);
      sigmaMax.push(sv[0]);
      sigmaMin.push(sv[sv.length - 1]);
    } catch (_) {
      sigmaMax.push(NaN);
      sigmaMin.push(NaN);
    }
  }
  return { omegas: [...omegas], sigmaMax, sigmaMin };
}
