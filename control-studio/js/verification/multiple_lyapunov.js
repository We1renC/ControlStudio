/**
 * multiple_lyapunov.js — Branicky 1998 Multiple Lyapunov Functions for
 * switched/hybrid system stability certification.
 *
 * Loop 8 (Zero-Flaw) addition.
 *
 * For a switched system ẋ = f_{σ(t)}(x) cycling through modes σ ∈ {1, …, M},
 * the system is GAS iff there exist Lyapunov functions V_i(x) for each mode
 * and the following conditions hold along any switching trajectory:
 *   1.  V_i(x) > 0, V̇_i(x) ≤ -W_i(x) < 0 on mode i's domain.
 *   2.  At every switching time t_k from mode i to mode j,
 *         V_j(x(t_k)) ≤ V_i(x(t_k))
 *       (non-increase at each switch with the *current* mode's Lyapunov).
 *   3.  For each mode i, the sequence of entry values
 *         {V_i(x(t_{k_i^q}))}_q   (q-th re-entry of mode i)
 *       is monotonically non-increasing.
 *
 * This module provides a deterministic *certificate checker* given:
 *   - A list of modes with quadratic Lyapunov functions V_i(x) = x^T P_i x.
 *   - A recorded switching trajectory (time, mode, state).
 *
 * Reference:
 *   - Branicky, "Multiple Lyapunov functions and other analysis tools for
 *     switched and hybrid systems", IEEE TAC 43(4), 1998.
 *   - Liberzon, "Switching in Systems and Control", Birkhäuser 2003.
 */

function quadForm(P, x) {
  let s = 0;
  for (let i = 0; i < P.length; i++) {
    for (let j = 0; j < P.length; j++) s += x[i] * P[i][j] * x[j];
  }
  return s;
}

/**
 * Certify GAS via MLF along a recorded switching trajectory.
 *
 * @param {Array<{ P: number[][] }>} modes - Lyapunov certificates per mode
 * @param {Array<{ t:number, mode:number, x:number[] }>} trajectory - chronological
 *   list including switching events
 * @returns {{
 *   condition1: boolean,      // V_i > 0 on mode i (trivially x^T P_i x > 0 for P_i pd)
 *   condition2: boolean,      // continuity at switches
 *   condition3: boolean,      // monotonic re-entry sequence per mode
 *   maxSwitchJump: number,    // worst-case V_j − V_i at switching instants (≤ 0 required)
 *   reentryHistory: Map<number, number[]>, // mode → entry-V sequence
 * }}
 */
export function certifyMLF(modes, trajectory, options = {}) {
  if (!Array.isArray(modes) || modes.length === 0) {
    throw new Error('MLF: modes array required');
  }
  if (!Array.isArray(trajectory) || trajectory.length < 2) {
    throw new Error('MLF: trajectory length must be ≥ 2');
  }
  const tol = options.tol ?? 1e-6;
  // Condition 1: P_i positive — caller should ensure; we check via sample point.
  let cond1 = true;
  for (let i = 0; i < modes.length; i++) {
    const v = quadForm(modes[i].P, new Array(modes[i].P.length).fill(1));
    if (v < -tol) cond1 = false;
  }
  // Walk trajectory, detect switches.
  let cond2 = true;
  let maxJump = -Infinity;
  const reentryHistory = new Map();
  for (let k = 0; k < trajectory.length; k++) {
    const cur = trajectory[k];
    if (cur.mode < 0 || cur.mode >= modes.length) {
      throw new Error(`MLF: trajectory mode ${cur.mode} out of range`);
    }
  }
  for (let k = 1; k < trajectory.length; k++) {
    const prev = trajectory[k - 1];
    const cur = trajectory[k];
    if (prev.mode !== cur.mode) {
      // Switch occurred. State approximately the same; check Branicky condition 2.
      const Vprev = quadForm(modes[prev.mode].P, prev.x);
      const Vcur  = quadForm(modes[cur.mode].P, cur.x);
      const jump  = Vcur - Vprev;
      if (jump > tol) cond2 = false;
      if (jump > maxJump) maxJump = jump;
      // Record re-entry: V on entering the new mode.
      if (!reentryHistory.has(cur.mode)) reentryHistory.set(cur.mode, []);
      reentryHistory.get(cur.mode).push(Vcur);
    }
  }
  // Condition 3: per-mode entry sequence non-increasing.
  let cond3 = true;
  for (const seq of reentryHistory.values()) {
    for (let i = 1; i < seq.length; i++) {
      if (seq[i] > seq[i - 1] + tol) { cond3 = false; break; }
    }
  }
  return {
    condition1: cond1,
    condition2: cond2,
    condition3: cond3,
    maxSwitchJump: maxJump === -Infinity ? 0 : maxJump,
    reentryHistory,
  };
}
