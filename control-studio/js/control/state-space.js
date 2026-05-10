import { TransferFunction } from './transfer-function.js';
import { polyadd, polyscale, polymul, trimPoly } from '../math/polynomial.js';

function polyMatrix(rows, cols, fill = [0]) {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => fill.slice()));
}

function polySub(a, b) {
  return polyadd(a, polyscale(b, -1));
}

function polyMatMul(A, B) {
  const rows = A.length;
  const cols = B[0].length;
  const inner = B.length;
  const out = polyMatrix(rows, cols);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      let acc = [0];
      for (let k = 0; k < inner; k++) {
        acc = polyadd(acc, polymul(A[i][k], B[k][j]));
      }
      out[i][j] = trimPoly(acc);
    }
  }
  return out;
}

function polyDet(M) {
  const n = M.length;
  if (n === 1) return trimPoly(M[0][0]);
  let out = [0];
  for (let j = 0; j < n; j++) {
    const minor = M.slice(1).map((row) => row.filter((_, idx) => idx !== j));
    const term = polymul(M[0][j], polyDet(minor));
    out = polyadd(out, j % 2 === 0 ? term : polyscale(term, -1));
  }
  return trimPoly(out);
}

function polyCofactorMatrix(M) {
  const n = M.length;
  const cof = polyMatrix(n, n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const minor = M
        .filter((_, rowIdx) => rowIdx !== i)
        .map((row) => row.filter((_, colIdx) => colIdx !== j));
      const det = polyDet(minor);
      cof[i][j] = (i + j) % 2 === 0 ? det : polyscale(det, -1);
    }
  }
  return cof;
}

function transpose(M) {
  return M[0].map((_, j) => M.map((row) => row[j]));
}

export function parseMatrixInput(str, expectedCols = null) {
  const rows = String(str || '')
    .trim()
    .split(/\n+/)
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

  const sIminusA = polyMatrix(n, n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      sIminusA[i][j] = i === j ? [1, -A[i][j]] : [-A[i][j]];
    }
  }

  const den = polyDet(sIminusA);
  const adj = transpose(polyCofactorMatrix(sIminusA));
  const Bpoly = B.map((row) => [row[0] === 0 ? [0] : [row[0]]]);
  const Cpoly = [C[0].map((value) => (value === 0 ? [0] : [value]))];
  const Dval = D[0][0];

  const numeratorFromState = polyMatMul(polyMatMul(Cpoly, adj), Bpoly)[0][0];
  const num = polyadd(numeratorFromState, Dval === 0 ? [0] : polymul([Dval], den));

  return new TransferFunction(num, den);
}
