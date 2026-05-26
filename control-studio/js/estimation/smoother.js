/**
 * smoother.js - Tier C4: Rauch-Tung-Striebel smoother.
 */

import { matAdd, matInverse, matMul, matSub, matTranspose, matVecMul } from '../math/matrix.js';

function outer(A, v) {
  return matVecMul(A, v);
}

export function rtsSmoother({ A, filtered, predicted } = {}) {
  if (!A || !filtered || !predicted || filtered.length !== predicted.length) {
    throw new Error('rtsSmoother requires A, filtered, and predicted arrays');
  }
  const n = filtered.length;
  const smoothed = filtered.map((item) => ({ x: item.x.slice(), P: item.P.map((row) => row.slice()) }));
  for (let k = n - 2; k >= 0; k--) {
    const Pk = filtered[k].P;
    const Ppred = predicted[k + 1].P;
    const G = matMul(matMul(Pk, matTranspose(A)), matInverse(Ppred));
    const dx = smoothed[k + 1].x.map((value, i) => value - predicted[k + 1].x[i]);
    smoothed[k].x = filtered[k].x.map((value, i) => value + outer(G, dx)[i]);
    const covDiff = matSub(smoothed[k + 1].P, Ppred);
    smoothed[k].P = matAdd(Pk, matMul(matMul(G, covDiff), matTranspose(G)));
  }
  return { smoothed };
}

export default { rtsSmoother };
