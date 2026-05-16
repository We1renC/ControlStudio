/**
 * stability.js — Stability analysis utilities
 */
import { Complex } from '../math/complex.js';

/**
 * Compute gain margin and phase margin from a transfer function.
 */
export function stabilityMargins(sys) {
  if (!sys) return { gainMargin: Infinity, gainMarginDB: Infinity, phaseMargin: NaN, gainCrossover: NaN, phaseCrossover: NaN };
  // Auto-extend the frequency window to cover all pole/zero break frequencies
  // (clamped to a reasonable [1e-4, 1e6]). Fixed-window scans silently miss
  // crossovers far from the default range.
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

  let gmFreq = NaN, pmFreq = NaN;
  let gainMargin = Infinity, phaseMargin = NaN;
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

    if (prevMag !== null && ((prevMag >= 1 && mag <= 1) || (prevMag <= 1 && mag >= 1))) {
      if (isNaN(pmFreq)) { pmFreq = w; phaseMargin = 180 + phase; }
    }
    if (prevPhase !== null && ((prevPhase > -180 && phase <= -180) || (prevPhase < -180 && phase >= -180))) {
      if (isNaN(gmFreq)) { gmFreq = w; gainMargin = 1 / mag; }
    }
    prevPhase = phase; prevMag = mag; prevW = w;
  }
  return { gainMargin, gainMarginDB: 20 * Math.log10(gainMargin), phaseMargin, gainCrossover: pmFreq, phaseCrossover: gmFreq };
}

/**
 * Compute step response performance metrics.
 */
export function stepInfo(tArr, yArr, finalValue = null, reference = null) {
  if (!tArr || tArr.length < 5) return { riseTime: null, settlingTime: null, overshoot: 0 };
  const n = tArr.length;
  const yInit = yArr[0];
  const yFinal = finalValue !== null ? finalValue : yArr[n - 1];
  const amp = yFinal - yInit;

  if (Math.abs(amp) < 1e-6) return { riseTime: null, settlingTime: 0, overshoot: 0 };

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
  const ref = reference !== null ? reference : 1;
  const steadyStateError = Math.abs(ref - yFinal);
  return { riseTime, settlingTime: st, overshoot, steadyStateError };
}

/**
 * Compute the Routh-Hurwitz stability table for a given denominator polynomial.
 * @param {number[]} den - Denominator coefficients [high → low]
 * @returns {{ table: number[][], stable: boolean, signChanges: number }}
 */
export function routhTable(den) {
  if (!den || den.length < 2) return { table: [], stable: true, signChanges: 0 };
  const n = den.length;
  const cols = Math.ceil(n / 2);
  const table = [];

  // First two rows from coefficients
  const row0 = new Array(cols).fill(0);
  const row1 = new Array(cols).fill(0);
  for (let i = 0; i < n; i++) {
    if (i % 2 === 0) row0[i / 2] = den[i];
    else row1[(i - 1) / 2] = den[i];
  }
  table.push(row0);
  table.push(row1);

  // Subsequent rows
  for (let i = 2; i < n; i++) {
    const prev2 = table[i - 2];
    const prev1 = table[i - 1];
    const row = new Array(cols).fill(0);
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

  return { table, stable: signChanges === 0, signChanges };
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
