/**
 * hybrid_mpc.js - Tier G4: hybrid MPC helpers over switched logic.
 */

import { solveMixedIntegerMPC } from '../optimization/mixed_integer_mpc.js';

export function bigMImplication({ binaryIndex, lhs, rhs, M = 1e4 }) {
  return {
    // z=1 => lhs*x <= rhs  becomes lhs*x <= rhs + M(1-z)
    row: [...lhs, M],
    bound: rhs + M,
    binaryIndex,
  };
}

export function solveHybridMPC(config) {
  return solveMixedIntegerMPC(config);
}

export default { bigMImplication, solveHybridMPC };
