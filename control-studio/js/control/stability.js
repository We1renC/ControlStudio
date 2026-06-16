/**
 * stability.js — Stability analysis utilities
 */
import { Complex } from '../math/complex.js';

function interpolateLogFrequency(w0, w1, y0, y1, target) {
  if (!Number.isFinite(w0) || !Number.isFinite(w1) || w0 <= 0 || w1 <= 0) return w1;
  if (Math.abs(y1 - y0) < 1e-15) return Math.sqrt(w0 * w1);
  const t = (target - y0) / (y1 - y0);
  const clamped = Math.min(1, Math.max(0, t));
  return Math.pow(10, Math.log10(w0) + (Math.log10(w1) - Math.log10(w0)) * clamped);
}

function evaluateMarginPoint(sys, w) {
  const g = sys.evalAt(new Complex(0, w));
  return {
    mag: g.magnitude,
    phase: g.angleDeg,
  };
}

/**
 * Compute gain margin and phase margin from a transfer function.
 *
 * Collects ALL gain crossings (|G|=1) and ALL phase crossings (∠G=-180°),
 * then returns the worst-case (minimum) PM and GM so that non-minimum-phase
 * or high-order systems with multiple crossings are handled correctly.
 *
 * Returns:
 *   gainMargin         — minimum GM across all phase crossings (Infinity if none)
 *   gainMarginDB       — 20·log10(gainMargin)
 *   phaseMargin        — minimum PM across all gain crossings (NaN if none)
 *   gainCrossover      — ω where the worst-case PM occurs (first if equal)
 *   phaseCrossover     — ω where the worst-case GM occurs (first if equal)
 *   allGainCrossings   — [{ omega, phaseMargin }] sorted by omega (all unit-gain crossings)
 *   allPhaseCrossings  — [{ omega, gainMargin, gainMarginDB }] sorted by omega (all -180° crossings)
 */
export function stabilityMargins(sys) {
  if (!sys) return {
    gainMargin: Infinity, gainMarginDB: Infinity,
    phaseMargin: NaN, gainCrossover: NaN, phaseCrossover: NaN,
    allGainCrossings: [], allPhaseCrossings: [],
  };

  // Auto-extend the frequency window to cover all pole/zero break frequencies
  // (clamped to [1e-4, 1e6]). Fixed-window scans silently miss crossovers far
  // from the default range.
  const breaks = [];
  try {
    for (const p of sys.poles()) { const m = Math.hypot(p.re, p.im); if (m > 0) breaks.push(m); }
    for (const z of sys.zeros()) { const m = Math.hypot(z.re, z.im); if (m > 0) breaks.push(m); }
  } catch { /* ignore */ }
  const minBreak = breaks.length ? Math.min(...breaks) : 1;
  const maxBreak = breaks.length ? Math.max(...breaks) : 1;
  const wMin = Math.max(1e-4, Math.min(1e-3, minBreak / 100));
  const wMax = Math.min(1e6, Math.max(1e4, maxBreak * 100));
  const nPoints = 2000;
  const logMin = Math.log10(wMin), logMax = Math.log10(wMax);

  const allGainCrossings = [];   // [{omega, phaseMargin}]
  const allPhaseCrossings = [];  // [{omega, gainMargin, gainMarginDB}]

  let prevPhase = null, prevMag = null, prevW = null;

  for (let i = 0; i < nPoints; i++) {
    const w = Math.pow(10, logMin + (logMax - logMin) * i / (nPoints - 1));
    const g = sys.evalAt(new Complex(0, w));
    const mag = g.magnitude;
    let phase = g.angleDeg;
    if (prevPhase !== null) {
      while (phase - prevPhase > 180) phase -= 360;
      while (phase - prevPhase < -180) phase += 360;
    }

    // Gain crossover: |G(jω)| crosses 1 from either direction
    if (prevMag !== null && ((prevMag >= 1 && mag < 1) || (prevMag < 1 && mag >= 1))) {
      const wGc = interpolateLogFrequency(prevW, w, prevMag, mag, 1);
      const pt = evaluateMarginPoint(sys, wGc);
      allGainCrossings.push({ omega: wGc, phaseMargin: 180 + pt.phase });
    }

    // Phase crossover: ∠G(jω) crosses -180° from either direction
    if (prevPhase !== null && ((prevPhase > -180 && phase <= -180) || (prevPhase < -180 && phase >= -180))) {
      const wPc = interpolateLogFrequency(prevW, w, prevPhase, phase, -180);
      const pt = evaluateMarginPoint(sys, wPc);
      const gm = pt.mag > 0 ? 1 / pt.mag : Infinity;
      allPhaseCrossings.push({ omega: wPc, gainMargin: gm, gainMarginDB: 20 * Math.log10(gm) });
    }

    prevPhase = phase; prevMag = mag; prevW = w;
  }

  // Worst-case (minimum) phase margin
  let phaseMargin = NaN, gainCrossover = NaN;
  for (const gc of allGainCrossings) {
    if (isNaN(phaseMargin) || gc.phaseMargin < phaseMargin) {
      phaseMargin = gc.phaseMargin;
      gainCrossover = gc.omega;
    }
  }

  // Worst-case (minimum) gain margin
  let gainMargin = Infinity, phaseCrossover = NaN;
  for (const pc of allPhaseCrossings) {
    if (pc.gainMargin < gainMargin) {
      gainMargin = pc.gainMargin;
      phaseCrossover = pc.omega;
    }
  }

  return {
    gainMargin,
    gainMarginDB: 20 * Math.log10(gainMargin),
    phaseMargin,
    gainCrossover,
    phaseCrossover,
    allGainCrossings,
    allPhaseCrossings,
  };
}

/**
 * Compute step response performance metrics.
 */
export function stepInfo(tArr, yArr, finalValue = null, reference = null) {
  const invalid = (reason) => ({
    riseTime: null,
    settlingTime: null,
    overshoot: NaN,
    steadyStateError: NaN,
    valid: false,
    reason,
  });
  if (!Array.isArray(tArr) || !Array.isArray(yArr)) return invalid('time and output arrays are required');
  if (tArr.length !== yArr.length) return invalid('time and output arrays must have the same length');
  if (tArr.length < 5) return invalid('at least five response samples are required');
  if (!tArr.every(Number.isFinite) || !yArr.every(Number.isFinite)) return invalid('time and output samples must be finite');
  for (let i = 1; i < tArr.length; i++) {
    if (tArr[i] <= tArr[i - 1]) return invalid('time samples must be strictly increasing');
  }
  const n = tArr.length;
  const yInit = yArr[0];
  const yFinal = finalValue != null ? Number(finalValue) : yArr[n - 1];
  if (!Number.isFinite(yFinal)) return invalid('final value must be finite');
  const amp = yFinal - yInit;
  const ref = reference != null ? Number(reference) : 1;
  if (!Number.isFinite(ref)) return invalid('reference value must be finite');

  if (Math.abs(amp) < 1e-6) {
    return {
      riseTime: null,
      settlingTime: 0,
      overshoot: 0,
      steadyStateError: Math.abs(ref - yFinal),
      valid: true,
    };
  }

  const t10Idx = yArr.findIndex(y => amp > 0 ? y >= yInit + 0.1 * amp : y <= yInit + 0.1 * amp);
  const t90Idx = yArr.findIndex(y => amp > 0 ? y >= yInit + 0.9 * amp : y <= yInit + 0.9 * amp);

  const riseTime = (t10Idx !== -1 && t90Idx !== -1) ? (tArr[t90Idx] - tArr[t10Idx]) : null;

  let peak = yInit;
  for (let v of yArr) if (amp > 0 ? v > peak : v < peak) peak = v;
  const overshoot = (Math.abs(peak - yFinal) / Math.abs(amp)) * 100;

  let st = null;
  const band = 0.02 * Math.abs(amp);
  for (let i = n - 1; i >= 0; i--) {
    if (Math.abs(yArr[i] - yFinal) > band) { st = tArr[i]; break; }
  }

  // SSE = |setpoint − steady-state output|. Caller should pass the reference setpoint
  // (e.g. step amplitude). For backward compatibility, default is 1 (unit step from 0).
  const steadyStateError = Math.abs(ref - yFinal);
  return { riseTime, settlingTime: st, overshoot, steadyStateError, valid: true };
}

/**
 * Compute the Routh-Hurwitz stability table for a given denominator polynomial.
 * @param {number[]} den - Denominator coefficients [high → low]
 * @returns {{ table: number[][], stable: boolean, signChanges: number }}
 */
export function routhTable(den) {
  if (!Array.isArray(den)) {
    throw new Error('Routh-Hurwitz denominator must be an array of coefficients');
  }
  if (den.length < 2) {
    throw new Error('Routh-Hurwitz denominator must contain at least two coefficients');
  }
  const coeffs = den.map((value) => Number(value));
  if (!coeffs.every(Number.isFinite)) {
    throw new Error('Routh-Hurwitz denominator coefficients must be finite');
  }
  if (coeffs.every((value) => Math.abs(value) < 1e-15)) {
    throw new Error('Routh-Hurwitz denominator must not be the zero polynomial');
  }
  if (Math.abs(coeffs[0]) < 1e-15) {
    throw new Error('Routh-Hurwitz leading denominator coefficient must be nonzero');
  }
  const n = coeffs.length;
  const cols = Math.ceil(n / 2);
  const table = [];
  let hasZeroRow = false;

  // First two rows from coefficients
  const row0 = new Array(cols).fill(0);
  const row1 = new Array(cols).fill(0);
  for (let i = 0; i < n; i++) {
    if (i % 2 === 0) row0[i / 2] = coeffs[i];
    else row1[(i - 1) / 2] = coeffs[i];
  }
  table.push(row0);
  table.push(row1);

  // Subsequent rows
  for (let i = 2; i < n; i++) {
    const prev2 = table[i - 2];
    let prev1 = table[i - 1];
    const row = new Array(cols).fill(0);
    if (prev1.every((value) => Math.abs(value) < 1e-12)) {
      hasZeroRow = true;
      const order = n - i + 1;
      for (let j = 0; j < cols; j++) {
        const power = order - 2 * j;
        row[j] = power > 0 ? power * prev2[j] : 0;
      }
      table[i - 1] = row.slice();
      prev1 = table[i - 1];
    }
    const pivot = prev1[0];

    if (Math.abs(pivot) < 1e-15) {
      // Replace zero pivot with epsilon
      table[i - 1][0] = 1e-6;
      const fixedPivot = 1e-6;
      for (let j = 0; j < cols - 1; j++) {
        row[j] = (fixedPivot * prev2[j + 1] - prev2[0] * prev1[j + 1]) / fixedPivot;
      }
    } else {
      for (let j = 0; j < cols - 1; j++) {
        row[j] = (pivot * prev2[j + 1] - prev2[0] * prev1[j + 1]) / pivot;
      }
    }
    table.push(row);
  }

  // Count sign changes in first column
  let signChanges = 0;
  for (let i = 1; i < table.length; i++) {
    if (table[i][0] * table[i - 1][0] < 0) signChanges++;
  }

  return { table, stable: signChanges === 0 && !hasZeroRow, marginal: hasZeroRow, signChanges };
}

/**
 * Engineering stability summary for continuous or discrete SISO systems.
 *
 * Continuous systems are stable when every pole is in the open LHP.
 * Discrete systems are stable when every pole is inside the unit circle.
 */
export function analyzeStability(sys, options = {}) {
  if (!sys || typeof sys.poles !== 'function') {
    return {
      domain: options.domain || 's',
      status: 'unknown',
      risk: 'unknown',
      summary: 'No system model available.',
      poles: [],
      dominantPole: null,
      recommendations: ['Create or update a plant model before running stability analysis.'],
    };
  }

  const domain = options.domain || (Number.isFinite(sys.sampleTime) ? 'z' : 's');
  const poles = sys.poles();
  const margins = options.margins || null;
  const poleDetails = domain === 'z'
    ? poles.map((pole) => discretePoleMetrics(pole, sys.sampleTime))
    : poles.map(continuousPoleMetrics);
  const dominantPole = poleDetails.length
    ? poleDetails.reduce((best, pole) => pole.dominance > best.dominance ? pole : best, poleDetails[0])
    : null;

  const unstablePoles = poleDetails.filter((pole) => pole.stability === 'unstable');
  const marginalPoles = poleDetails.filter((pole) => pole.stability === 'marginal');
  const minDamping = finiteMin(poleDetails.map((pole) => pole.dampingRatio));
  const minDistance = finiteMin(poleDetails.map((pole) => pole.stabilityMargin));

  let status = 'stable';
  if (unstablePoles.length > 0) status = 'unstable';
  else if (marginalPoles.length > 0) status = 'marginal';

  const warnings = [];
  const recommendations = [];

  if (status === 'unstable') {
    warnings.push(domain === 'z'
      ? `${unstablePoles.length} pole(s) outside the unit circle.`
      : `${unstablePoles.length} pole(s) in the right-half plane.`);
    recommendations.push('Retune the controller or reduce loop gain before using this design.');
  } else if (status === 'marginal') {
    warnings.push(domain === 'z'
      ? `${marginalPoles.length} pole(s) on or very close to the unit circle.`
      : `${marginalPoles.length} pole(s) on or very close to the imaginary axis.`);
    recommendations.push('Add damping or move the dominant poles farther inside the stable region.');
  }

  if (status === 'stable') {
    if (domain === 's' && Number.isFinite(minDistance) && minDistance < 0.1) {
      warnings.push('Dominant pole is close to the imaginary axis.');
      recommendations.push('Increase damping or shift closed-loop poles farther left.');
    }
    if (domain === 'z' && Number.isFinite(minDistance) && minDistance < 0.05) {
      warnings.push('Dominant pole is close to the unit circle.');
      recommendations.push('Increase damping or use a smaller effective closed-loop pole radius.');
    }
  }

  if (Number.isFinite(minDamping) && minDamping < 0.35 && status !== 'unstable') {
    warnings.push('Low damping ratio may lead to oscillatory response.');
    recommendations.push('Use derivative action, Lead compensation, or reduce aggressive gain.');
  }

  if (margins && domain === 's') {
    if (Number.isFinite(margins.phaseMargin) && margins.phaseMargin < 30) {
      warnings.push('Phase margin is below 30 deg.');
      recommendations.push('Raise phase margin before deployment; target at least 45-60 deg.');
    } else if (Number.isFinite(margins.phaseMargin) && margins.phaseMargin < 45) {
      warnings.push('Phase margin is below the common 45 deg engineering target.');
      recommendations.push('Consider Lead compensation or lower crossover frequency.');
    }

    if (Number.isFinite(margins.gainMarginDB) && margins.gainMarginDB < 6) {
      warnings.push('Gain margin is below 6 dB.');
      recommendations.push('Reduce loop gain or add compensation to improve robustness.');
    }
  }

  if (recommendations.length === 0) {
    recommendations.push(status === 'stable'
      ? 'Design has acceptable pole stability. Validate against actuator limits and disturbances next.'
      : 'Review plant/controller parameters and rerun stability analysis.');
  }

  const risk = classifyRisk(status, warnings, margins, domain);
  const summary = buildStabilitySummary({ status, risk, domain, dominantPole, warnings });

  return {
    domain,
    status,
    risk,
    summary,
    poles: poleDetails,
    dominantPole,
    minDamping,
    stabilityMargin: minDistance,
    warnings,
    recommendations: [...new Set(recommendations)],
  };
}

function continuousPoleMetrics(pole) {
  const omegaN = Math.hypot(pole.re, pole.im);
  const dampingRatio = omegaN > 1e-12 ? -pole.re / omegaN : NaN;
  const stabilityMargin = -pole.re;
  let stability = 'stable';
  if (pole.re > 1e-8) stability = 'unstable';
  else if (Math.abs(pole.re) <= 1e-8) stability = 'marginal';
  return {
    re: pole.re,
    im: pole.im,
    magnitude: omegaN,
    dampingRatio,
    naturalFrequency: omegaN,
    decayRate: -pole.re,
    timeConstant: pole.re < -1e-12 ? -1 / pole.re : Infinity,
    stabilityMargin,
    stability,
    dominance: pole.re,
  };
}

function discretePoleMetrics(pole, sampleTime = 1) {
  const radius = Math.hypot(pole.re, pole.im);
  const angle = Math.atan2(pole.im, pole.re);
  const Ts = Number.isFinite(sampleTime) && sampleTime > 0 ? sampleTime : 1;
  const sigma = radius > 1e-15 ? Math.log(radius) / Ts : -Infinity;
  const omegaD = angle / Ts;
  const omegaN = Math.hypot(sigma, omegaD);
  const dampingRatio = Number.isFinite(omegaN) && omegaN > 1e-12 ? -sigma / omegaN : NaN;
  const stabilityMargin = 1 - radius;
  let stability = 'stable';
  if (radius > 1 + 1e-8) stability = 'unstable';
  else if (Math.abs(radius - 1) <= 1e-8) stability = 'marginal';
  return {
    re: pole.re,
    im: pole.im,
    magnitude: radius,
    dampingRatio,
    naturalFrequency: omegaN,
    decayRate: -sigma,
    timeConstant: sigma < -1e-12 ? -1 / sigma : Infinity,
    stabilityMargin,
    stability,
    equivalentSigma: sigma,
    equivalentOmegaD: omegaD,
    dominance: radius,
  };
}

function finiteMin(values) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? Math.min(...finite) : NaN;
}

function classifyRisk(status, warnings, margins, domain) {
  if (status === 'unstable') return 'critical';
  if (status === 'marginal') return 'high';
  if (warnings.length >= 2) return 'medium';
  if (warnings.length === 1) return 'watch';
  if (domain === 's' && margins && Number.isFinite(margins.phaseMargin) && margins.phaseMargin >= 60) return 'low';
  return 'low';
}

function buildStabilitySummary({ status, risk, domain, dominantPole, warnings }) {
  const region = domain === 'z' ? 'unit circle' : 'left-half plane';
  if (status === 'unstable') return `Unstable: at least one pole violates the ${region} criterion.`;
  if (status === 'marginal') return `Marginal: pole(s) are on the stability boundary.`;
  const dominant = dominantPole ? formatPoleSummary(dominantPole, domain) : 'no dominant pole';
  if (warnings.length > 0) return `Stable but ${risk}: ${dominant}; ${warnings[0]}`;
  return `Stable: all poles satisfy the ${region} criterion; dominant pole ${dominant}.`;
}

function formatPoleSummary(pole, domain) {
  const re = Number.isFinite(pole.re) ? pole.re.toFixed(3) : String(pole.re);
  const imAbs = Number.isFinite(pole.im) ? Math.abs(pole.im).toFixed(3) : String(Math.abs(pole.im));
  const sign = pole.im >= 0 ? '+' : '-';
  const base = `${re} ${sign} j${imAbs}`;
  if (domain === 'z') return `z = ${base} (|z|=${pole.magnitude.toFixed(3)})`;
  return `s = ${base}`;
}
