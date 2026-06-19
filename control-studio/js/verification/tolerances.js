/**
 * tolerances.js — Centralized numerical tolerance registry.
 *
 * Loop 3 (Zero-Flaw) addition. Before this module each of the 120+
 * verify_*.mjs scripts hard-coded its own tolerance constants
 * (1e-6, 1e-9, 1e-12, …) with no central oversight. Drift in any
 * underlying algorithm could silently relax a tolerance without
 * triggering anyone. This registry pins per-category tolerances
 * and provides a `assertTolerance()` helper that records the
 * comparison so a future audit can compare observed vs allowed.
 *
 * Categories follow Boyd-Vandenberghe / Trefethen-Bau conventions
 * for relative accuracy of the underlying linear-algebra routines.
 */

const REGISTRY = Object.freeze({
  // Linear algebra residuals
  ALG_LINSYS:           1e-9,    // ||Ax - b|| / ||b||
  ALG_LYAPUNOV:         1e-8,    // ||A^T P + P A + Q||
  ALG_RICCATI:          1e-8,    // ||A^T P + P A - P B R^{-1} B^T P + Q||
  ALG_EIGENVALUE:       1e-9,    // ||A v - λ v|| / |λ|

  // Control identities
  CTRL_DC_GAIN:         1e-9,    // G(0) vs C A^{-1} B
  CTRL_STEP_FINAL:      1e-3,    // step response final value
  CTRL_STABILITY_MARGIN: 1e-6,   // PM / GM cross-tool reproducibility

  // Frequency response
  FREQ_BODE_MAG:        1e-9,    // |G(jω)| vs analytic
  FREQ_BODE_PHASE_DEG:  1e-4,    // angle(G(jω)) deg

  // Identification fit
  ID_PARAM_REL:         5e-2,    // 5% relative error on identified parameters
  ID_RESIDUAL_RMS:      1e-3,    // RMS residual on training set

  // Optimization KKT
  OPT_KKT_RESIDUAL:     1e-7,    // QP/SQP KKT first-order condition
  OPT_OBJ_REL:          1e-6,    // relative objective vs ground truth

  // Energy / passivity inequalities
  PHYS_ENERGY_BALANCE:  1e-2,    // ΔH ≤ supply − dissipation (numeric)
  PHYS_KYP_FEASIBILITY: 1e-9,

  // Stochastic / Monte Carlo
  MC_MEAN_REL:          5e-2,    // expectation estimator
  MC_VARIANCE_REL:      1e-1,
});

const OBSERVATIONS = [];

/**
 * Look up a registry tolerance. Throws when the key is unknown so typos
 * fail noisily at test discovery time.
 */
export function tolerance(key) {
  if (!(key in REGISTRY)) throw new Error(`tolerance: unknown key "${key}"`);
  return REGISTRY[key];
}

/**
 * Assertion helper that records observed value against an allowed
 * tolerance. Returns whether the check passed (does not throw); the
 * verify script controls fail/pass reporting itself.
 */
export function assertWithinTolerance(label, observed, key) {
  const allowed = tolerance(key);
  const passed = Number.isFinite(observed) && Math.abs(observed) <= allowed;
  OBSERVATIONS.push({ label, key, allowed, observed, passed });
  return { passed, allowed };
}

export function listRegistry() {
  return Object.entries(REGISTRY).map(([k, v]) => ({ key: k, allowed: v }));
}

export function recentObservations() {
  return OBSERVATIONS.slice(-100);
}

/**
 * Property-based meta check: for each registry entry, confirm the
 * tolerance is strictly positive and finite. Used by the central
 * verify_tolerance_registry.mjs script to catch corruption.
 */
export function checkRegistryWellFormed() {
  for (const [k, v] of Object.entries(REGISTRY)) {
    if (!Number.isFinite(v) || v <= 0) {
      throw new Error(`tolerance registry corrupted: ${k} = ${v}`);
    }
  }
  return true;
}
