/**
 * manipulator_dynamics.js — Rigid-body manipulator dynamics and
 * computed-torque control baseline.
 *
 * Loop 5 (Zero-Flaw) addition. ControlStudio had no joint-space inverse
 * dynamics or RNE-style recursive algorithm; without these, Spong-Hutchinson-
 * Vidyasagar, Siciliano-Khatib, Featherstone, Lynch-Park manipulator
 * literature could not be replicated.
 *
 * Manipulator equation of motion (joint space):
 *
 *   M(q) q̈ + C(q, q̇) q̇ + g(q) = τ
 *
 *   M(q) : n×n positive-definite inertia matrix
 *   C(q, q̇) q̇ : Coriolis / centrifugal vector
 *   g(q) : gravity vector
 *   τ : joint torques
 *
 * The computed-torque control law:
 *
 *   τ = M(q) (q̈_d + K_v ė + K_p e) + C(q, q̇) q̇ + g(q)
 *   with e = q_d − q,  ė = q̇_d − q̇
 *
 * yields the linear error dynamics ë + K_v ė + K_p e = 0, which makes the
 * task-space tracking error globally exponentially stable when (K_p, K_v)
 * are SPD. The implementation is provided in the symbolic style expected
 * by Spong §6 and works for arbitrary n-DOF manipulators that supply
 * M, C, g closures.
 *
 * Reference:
 *   - Spong, Hutchinson, Vidyasagar, "Robot Modeling and Control", Wiley.
 *   - Siciliano, Sciavicco, Villani, Oriolo, "Robotics: Modelling, Planning
 *     and Control", Springer.
 *   - Featherstone, "Rigid Body Dynamics Algorithms", Springer.
 */

import { matMul, matVecMul, matAdd, matCreate, matInverse } from '../math/matrix.js';

function assertVector(v, n, label) {
  if (!Array.isArray(v) || v.length !== n) throw new Error(`${label}: expected length-${n} vector`);
  for (const x of v) if (!Number.isFinite(x)) throw new Error(`${label}: non-finite entry`);
}

/**
 * Forward dynamics: solve q̈ = M(q)^{-1} (τ − C q̇ − g).
 */
export function forwardDynamics(model, q, qDot, tau) {
  const n = q.length;
  assertVector(qDot, n, 'fd: qDot');
  assertVector(tau, n, 'fd: tau');
  const M = model.M(q);
  const C = model.C(q, qDot);
  const g = model.g(q);
  const Cqdot = matVecMul(C, qDot);
  const rhs = new Array(n);
  for (let i = 0; i < n; i++) rhs[i] = tau[i] - Cqdot[i] - g[i];
  const Minv = matInverse(M);
  return matVecMul(Minv, rhs);
}

/**
 * Inverse dynamics (Newton-Euler-style for closed-form M, C, g):
 *   τ = M(q) q̈ + C(q, q̇) q̇ + g(q)
 */
export function inverseDynamics(model, q, qDot, qDDot) {
  const n = q.length;
  assertVector(qDot, n, 'id: qDot');
  assertVector(qDDot, n, 'id: qDDot');
  const M = model.M(q);
  const C = model.C(q, qDot);
  const g = model.g(q);
  const tau = new Array(n).fill(0);
  const Mqdd = matVecMul(M, qDDot);
  const Cqdot = matVecMul(C, qDot);
  for (let i = 0; i < n; i++) tau[i] = Mqdd[i] + Cqdot[i] + g[i];
  return tau;
}

/**
 * Computed-torque control step:
 *   τ = M(q)(q̈_d + K_v ė + K_p e) + C(q, q̇) q̇ + g(q)
 *
 * Returns the commanded torque vector.
 */
export function computedTorqueStep(model, q, qDot, desired, gains) {
  const n = q.length;
  const { qd, qdDot, qdDDot } = desired;
  assertVector(qd, n, 'CT: qd');
  assertVector(qdDot, n, 'CT: qd_dot');
  assertVector(qdDDot, n, 'CT: qd_ddot');
  const Kp = gains.Kp;
  const Kv = gains.Kv;
  const e = new Array(n), eDot = new Array(n);
  for (let i = 0; i < n; i++) {
    e[i] = qd[i] - q[i];
    eDot[i] = qdDot[i] - qDot[i];
  }
  const inner = new Array(n);
  const Kpe = matVecMul(Kp, e);
  const KvEdot = matVecMul(Kv, eDot);
  for (let i = 0; i < n; i++) inner[i] = qdDDot[i] + KvEdot[i] + Kpe[i];
  const M = model.M(q);
  const Mqdd = matVecMul(M, inner);
  const C = model.C(q, qDot);
  const Cqdot = matVecMul(C, qDot);
  const g = model.g(q);
  const tau = new Array(n);
  for (let i = 0; i < n; i++) tau[i] = Mqdd[i] + Cqdot[i] + g[i];
  return tau;
}

/**
 * Standard 2-DOF planar manipulator (Spong §6.5):
 *   q = [q1, q2]^T
 *   M_11 = m1 l_c1^2 + m2 (l1^2 + l_c2^2 + 2 l1 l_c2 cos q2) + I1 + I2
 *   M_12 = m2 (l_c2^2 + l1 l_c2 cos q2) + I2
 *   M_22 = m2 l_c2^2 + I2
 *   h = -m2 l1 l_c2 sin q2
 *   C = [ h q̇_2,    h (q̇_1 + q̇_2) ;
 *         -h q̇_1,   0 ]
 *   g_1 = (m1 l_c1 + m2 l1) g cos q1 + m2 l_c2 g cos(q1 + q2)
 *   g_2 = m2 l_c2 g cos(q1 + q2)
 */
export function twoLinkPlanarModel(params = {}) {
  const m1 = params.m1 ?? 1.0;
  const m2 = params.m2 ?? 1.0;
  const l1 = params.l1 ?? 1.0;
  const lc1 = params.lc1 ?? 0.5;
  const lc2 = params.lc2 ?? 0.5;
  const I1 = params.I1 ?? 0.05;
  const I2 = params.I2 ?? 0.05;
  const gconst = params.g ?? 9.81;
  return {
    M(q) {
      const c2 = Math.cos(q[1]);
      const M11 = m1 * lc1 * lc1 + m2 * (l1 * l1 + lc2 * lc2 + 2 * l1 * lc2 * c2) + I1 + I2;
      const M12 = m2 * (lc2 * lc2 + l1 * lc2 * c2) + I2;
      const M22 = m2 * lc2 * lc2 + I2;
      return [[M11, M12], [M12, M22]];
    },
    C(q, qd) {
      const h = -m2 * l1 * lc2 * Math.sin(q[1]);
      return [
        [h * qd[1], h * (qd[0] + qd[1])],
        [-h * qd[0], 0],
      ];
    },
    g(q) {
      const g1 = (m1 * lc1 + m2 * l1) * gconst * Math.cos(q[0])
                 + m2 * lc2 * gconst * Math.cos(q[0] + q[1]);
      const g2 = m2 * lc2 * gconst * Math.cos(q[0] + q[1]);
      return [g1, g2];
    },
  };
}
