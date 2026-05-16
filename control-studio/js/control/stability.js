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

