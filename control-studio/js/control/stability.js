/**
 * stability.js — Stability analysis utilities
 */
import { Complex } from '../math/complex.js';

/**
 * Compute gain margin and phase margin from a transfer function.
 */
export function stabilityMargins(sys) {
  if (!sys) return { gainMargin: Infinity, gainMarginDB: Infinity, phaseMargin: NaN };
  const wMin = 1e-3, wMax = 1e4;
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
  return { gainMargin, gainMarginDB: 20 * Math.log10(gainMargin), phaseMargin };
}

/**
 * Compute step response performance metrics.
 */
export function stepInfo(tArr, yArr, finalValue = null) {
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

  return { riseTime, settlingTime: st, overshoot, steadyStateError: Math.abs(1 - yFinal) };
}
