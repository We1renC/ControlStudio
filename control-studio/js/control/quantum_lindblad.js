/**
 * quantum_lindblad.js — Lindblad master equation simulator for open quantum
 * systems.
 *
 * Loop 15 (Zero-Flaw) addition.
 *
 * Lindblad form (Gorini-Kossakowski-Sudarshan-Lindblad 1976):
 *   ρ̇ = − i [H, ρ] + Σ_k (L_k ρ L_k† − (1/2){L_k† L_k, ρ})
 *
 * where ρ is the density matrix (Hermitian, trace 1, positive semidefinite),
 * H is the system Hamiltonian, and L_k are the Lindblad (jump) operators
 * describing decoherence channels.
 *
 * The simulator integrates ρ(t) using a fourth-order Runge-Kutta step and
 * provides scalar observable expectation values ⟨A⟩ = tr(ρ A).
 *
 * For verification we provide the canonical examples:
 *   - Single qubit with σ_z Hamiltonian and σ_- amplitude-damping channel.
 *   - Decoherence-free pure unitary evolution recovers the Schrödinger
 *     equation result.
 *
 * Reference:
 *   - Lindblad, "On the generators of quantum dynamical semigroups", Comm.
 *     Math. Phys. 48 (1976).
 *   - Gorini, Kossakowski, Sudarshan, "Completely positive dynamical
 *     semigroups of N-level systems", J. Math. Phys. 17 (1976).
 *   - D'Alessandro, "Introduction to Quantum Control and Dynamics",
 *     Chapman & Hall 2007.
 *   - Wiseman, Milburn, "Quantum Measurement and Control", CUP 2010.
 */

// Complex-matrix utilities working on {re, im} entries.
function cAdd(a, b) { return { re: a.re + b.re, im: a.im + b.im }; }
function cSub(a, b) { return { re: a.re - b.re, im: a.im - b.im }; }
function cMul(a, b) { return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }; }
function cConj(a) { return { re: a.re, im: -a.im }; }
function cScale(a, s) { return { re: a.re * s, im: a.im * s }; }
function cZero() { return { re: 0, im: 0 }; }

function makeZero(n, m) {
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = new Array(m);
    for (let j = 0; j < m; j++) out[i][j] = cZero();
  }
  return out;
}

function matMulC(A, B) {
  const n = A.length, p = B[0].length, m = B.length;
  const out = makeZero(n, p);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < p; j++) {
      let acc = cZero();
      for (let k = 0; k < m; k++) acc = cAdd(acc, cMul(A[i][k], B[k][j]));
      out[i][j] = acc;
    }
  }
  return out;
}

function adjoint(A) {
  const n = A.length, m = A[0].length;
  const out = makeZero(m, n);
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) out[j][i] = cConj(A[i][j]);
  return out;
}

function matAddC(A, B) {
  const n = A.length, m = A[0].length;
  const out = makeZero(n, m);
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) out[i][j] = cAdd(A[i][j], B[i][j]);
  return out;
}

function matScaleC(A, s) {
  return A.map((row) => row.map((c) => cScale(c, s)));
}

function commutator(A, B) {
  const AB = matMulC(A, B);
  const BA = matMulC(B, A);
  return A.map((row, i) => row.map((_, j) => cSub(AB[i][j], BA[i][j])));
}

function anticommutator(A, B) {
  const AB = matMulC(A, B);
  const BA = matMulC(B, A);
  return A.map((row, i) => row.map((_, j) => cAdd(AB[i][j], BA[i][j])));
}

/**
 * Right-hand side of Lindblad equation: ρ̇ = − i [H, ρ] + dissipator.
 */
function lindbladRHS(H, jumpOps, rho) {
  // -i [H, ρ]
  const comm = commutator(H, rho);
  const minusIComm = comm.map((row) => row.map((c) => ({ re: c.im, im: -c.re }))); // -i z
  let result = minusIComm;
  for (const L of jumpOps) {
    const Ldag = adjoint(L);
    const LdagL = matMulC(Ldag, L);
    const term1 = matMulC(matMulC(L, rho), Ldag);
    const anti = anticommutator(LdagL, rho);
    const term2 = matScaleC(anti, 0.5);
    result = matAddC(result, matAddC(term1, matScaleC(term2, -1)));
  }
  return result;
}

/**
 * Simulate Lindblad master equation with RK4.
 *
 * @param {object} system - { H, jumpOps: complex matrices }
 * @param {complex[][]} rho0 - initial density matrix
 * @param {object} options - { T, dt }
 * @returns trajectory of ρ(t) plus observable expectations if requested
 */
export function simulateLindblad(system, rho0, options = {}) {
  const T = options.T ?? 1;
  const dt = options.dt ?? 1e-3;
  const steps = Math.floor(T / dt);
  const observables = options.observables ?? [];
  let rho = rho0.map((row) => row.map((c) => ({ re: c.re, im: c.im })));
  const t = new Array(steps + 1);
  const observableTraj = observables.map(() => new Array(steps + 1));
  const trace = new Array(steps + 1);
  t[0] = 0;
  trace[0] = traceReal(rho);
  observables.forEach((O, k) => { observableTraj[k][0] = expectation(rho, O); });
  for (let s = 0; s < steps; s++) {
    const k1 = lindbladRHS(system.H, system.jumpOps, rho);
    const rho2 = matAddC(rho, matScaleC(k1, 0.5 * dt));
    const k2 = lindbladRHS(system.H, system.jumpOps, rho2);
    const rho3 = matAddC(rho, matScaleC(k2, 0.5 * dt));
    const k3 = lindbladRHS(system.H, system.jumpOps, rho3);
    const rho4 = matAddC(rho, matScaleC(k3, dt));
    const k4 = lindbladRHS(system.H, system.jumpOps, rho4);
    const sum = matAddC(k1, matAddC(matScaleC(k2, 2), matAddC(matScaleC(k3, 2), k4)));
    rho = matAddC(rho, matScaleC(sum, dt / 6));
    // Numeric hermitisation to fight roundoff
    rho = rho.map((row, i) => row.map((c, j) => ({
      re: 0.5 * (c.re + rho[j][i].re),
      im: 0.5 * (c.im - rho[j][i].im),
    })));
    t[s + 1] = (s + 1) * dt;
    trace[s + 1] = traceReal(rho);
    observables.forEach((O, k) => { observableTraj[k][s + 1] = expectation(rho, O); });
  }
  return { t, rho, trace, observables: observableTraj };
}

function traceReal(rho) {
  let tr = 0;
  for (let i = 0; i < rho.length; i++) tr += rho[i][i].re;
  return tr;
}

function expectation(rho, O) {
  // tr(ρ O)
  const prod = matMulC(rho, O);
  return traceReal(prod);
}

// ── canonical Pauli matrices ──────────────────────────────────────────────
const I2 = [
  [{ re: 1, im: 0 }, { re: 0, im: 0 }],
  [{ re: 0, im: 0 }, { re: 1, im: 0 }],
];
const SIGMA_X = [
  [{ re: 0, im: 0 }, { re: 1, im: 0 }],
  [{ re: 1, im: 0 }, { re: 0, im: 0 }],
];
const SIGMA_Y = [
  [{ re: 0, im: 0 }, { re: 0, im: -1 }],
  [{ re: 0, im: 1 }, { re: 0, im: 0 }],
];
const SIGMA_Z = [
  [{ re: 1, im: 0 }, { re: 0, im: 0 }],
  [{ re: 0, im: 0 }, { re: -1, im: 0 }],
];
// σ_- = |0⟩⟨1| (lowering operator): brings |1⟩ down to |0⟩.
const SIGMA_MINUS = [
  [{ re: 0, im: 0 }, { re: 1, im: 0 }],
  [{ re: 0, im: 0 }, { re: 0, im: 0 }],
];

export const PAULI = {
  I: I2, X: SIGMA_X, Y: SIGMA_Y, Z: SIGMA_Z,
  minus: SIGMA_MINUS,
};
