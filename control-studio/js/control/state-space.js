import { TransferFunction } from './transfer-function.js';
import { polyadd, polyscale, polymul, polydiv, trimPoly } from '../math/polynomial.js';
import { matMul } from '../math/matrix.js';

export function parseMatrixInput(str, expectedCols = null) {
  const rows = String(str || '')
    .trim()
    .split(/[;\n]+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/[,\s]+/).filter(Boolean).map(Number);
      if (parts.length === 0 || parts.some(Number.isNaN)) {
        throw new Error('狀態空間矩陣包含無效數值');
      }
      return parts;
    });

  if (rows.length === 0) {
    throw new Error('請輸入狀態空間矩陣');
  }

  const width = expectedCols ?? rows[0].length;
  if (rows.some((row) => row.length !== width)) {
    throw new Error('狀態空間矩陣列數不一致');
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
function _matIdentity(n) {
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
  );
}

function _matAddScaled(A, B, scale) {
  // Returns A + scale * B (numerical n×n matrices)
  const n = A.length;
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => A[i][j] + scale * B[i][j])
  );
}

function _trace(A) {
  let t = 0;
  for (let i = 0; i < A.length; i++) t += A[i][i];
  return t;
}

// ---------------------------------------------------------------------------
// Faddeev-LeVerrier algorithm — O(n^4)
// Computes characteristic polynomial and adjugate of (sI-A).
//
// Returns:
//   charPoly  — [1, c1, ..., cn] (high-degree-first)
//   B_mats    — [B0, B1, ..., B_{n-1}] where B_k is an n×n numerical matrix
//               adj(sI-A) = B0·s^{n-1} + B1·s^{n-2} + ... + B_{n-1}·s^0
// ---------------------------------------------------------------------------
function faddeevLeVerrier(A) {
  const n = A.length;
  const I = _matIdentity(n);
  const c = [1]; // c[0]=1, c[1..n] = Faddeev coefficients
  const B_mats = [I]; // B_0 = I
  let Bk = I;

  for (let k = 1; k <= n; k++) {
    const Mk = matMul(A, Bk); // M_k = A · B_{k-1}
    const ck = -_trace(Mk) / k;
    c.push(ck);
    if (k < n) {
      Bk = _matAddScaled(Mk, I, ck); // B_k = M_k + c_k·I
      B_mats.push(Bk);
    }
  }
  return { charPoly: c, B_mats };
}

// ---------------------------------------------------------------------------
// State-space → Transfer Function (SISO)
// Uses Faddeev-LeVerrier instead of O(n!) cofactor expansion.
// ---------------------------------------------------------------------------
export function stateSpaceToTransferFunction(A, B, C, D) {
  const n = A.length;
  if (!A.every((row) => row.length === n)) {
    throw new Error('A 必須是方陣');
  }
  if (B.length !== n || B.some((row) => row.length !== 1)) {
    throw new Error('目前只支援 SISO，B 必須是 n x 1');
  }
  if (C.length !== 1 || C[0].length !== n) {
    throw new Error('目前只支援 SISO，C 必須是 1 x n');
  }
  if (D.length !== 1 || D[0].length !== 1) {
    throw new Error('目前只支援 SISO，D 必須是 1 x 1');
  }

  if (n === 0) {
    // Pure feedthrough: G(s) = D
    return new TransferFunction([D[0][0]], [1]);
  }

  const { charPoly, B_mats } = faddeevLeVerrier(A);

  // Numerator without D: coefficient of s^{n-1-k} = C · B_mats[k] · B
  const numCoeffs = new Array(n).fill(0);
  for (let k = 0; k < n; k++) {
    let val = 0;
    for (let i = 0; i < n; i++) {
      let tmp = 0;
      for (let j = 0; j < n; j++) tmp += B_mats[k][i][j] * B[j][0];
      val += C[0][i] * tmp;
    }
    numCoeffs[k] = val; // coefficient of s^{n-1-k}
  }

  const D00 = D[0][0];
  let finalNum;
  if (Math.abs(D00) < 1e-15) {
    finalNum = numCoeffs;
  } else {
    // D · charPoly has degree n; numCoeffs has degree n-1
    finalNum = new Array(n + 1).fill(0);
    finalNum[0] = D00; // D·s^n coefficient
    for (let i = 1; i <= n; i++) {
      finalNum[i] = (i - 1 < numCoeffs.length ? numCoeffs[i - 1] : 0) + D00 * charPoly[i];
    }
  }

  return new TransferFunction(finalNum, charPoly);
}

// ---------------------------------------------------------------------------
// TF → Controllable Canonical State-Space form
// Now supports biproper TFs (deg num = deg den) by extracting the D term.
// ---------------------------------------------------------------------------
export function tfToControllableCanonical(num, den) {
  if (!Array.isArray(num) || !Array.isArray(den) || den.length < 2) {
    throw new Error('tfToControllableCanonical 需要有效的 num / den');
  }
  const lead = den[0];
  if (Math.abs(lead) < 1e-15) throw new Error('den 首項係數不可為 0');
  const denN = den.map((c) => c / lead);
  const numN = num.map((c) => c / lead);
  const n = denN.length - 1;
  const m = numN.length - 1;

  if (m > n) {
    throw new Error('tfToControllableCanonical: 系統不是 proper (deg num > deg den)');
  }

  let strictNum = numN;
  let D00 = 0;

  if (m === n) {
    // Biproper: extract feedthrough D via polynomial long division
    const { quotient, remainder } = polydiv(numN, denN);
    D00 = quotient.length > 0 ? quotient[quotient.length - 1] : 0;
    strictNum = remainder.length ? remainder : [0];
  }

  // Build A (companion matrix), B, C from strictly-proper part
  const A = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n - 1; i++) A[i][i + 1] = 1;
  for (let j = 0; j < n; j++) A[n - 1][j] = -denN[n - j];

  const B = Array.from({ length: n }, () => [0]);
  B[n - 1][0] = 1;

  // Pad strictNum so it has exactly n entries (degree n-1 polynomial)
  const padded = [...new Array(n - strictNum.length).fill(0), ...strictNum];
  const C = [new Array(n).fill(0)];
  for (let i = 0; i < n; i++) C[0][i] = padded[n - 1 - i];

  const D = [[D00]];
  return { A, B, C, D };
}

export function controllabilityMatrix(A, B) {
  const n = A.length;
  if (!n) return [];
  const C = B.map(row => [...row]);
  let AnB = B.map(row => [...row]);
  for (let i = 1; i < n; i++) {
    AnB = matMul(A, AnB);
    for (let r = 0; r < n; r++) C[r].push(...AnB[r]);
  }
  return C;
}

export function observabilityMatrix(A, C_mat) {
  const n = A.length;
  if (!n) return [];
  const O = C_mat.map(row => [...row]);
  let CAn = C_mat.map(row => [...row]);
  for (let i = 1; i < n; i++) {
    CAn = matMul(CAn, A);
    for (let r = 0; r < CAn.length; r++) O.push([...CAn[r]]);
  }
  return O;
}
