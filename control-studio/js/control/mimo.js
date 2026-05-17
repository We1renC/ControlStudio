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
