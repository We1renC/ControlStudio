/**
 * c2d.js — Continuous-to-discrete (and discrete-to-continuous) conversion.
 * Methods: Tustin (bilinear), Tustin with prewarping, ZOH, Matched-Z,
 *          Impulse-Invariant, and d2cTustin (inverse bilinear).
 */
import { polymul, polyscale, polyadd, polydiv, rootsToRealPoly, polyroots, polyderiv, polyvalReal } from '../math/polynomial.js?v=p5';
import { matCreate, matExp } from '../math/matrix.js?v=p5';
import { stateSpaceToTransferFunction, tfToControllableCanonical } from './state-space.js?v=p5';
import { TransferFunction } from './transfer-function.js';
import { DiscreteTransferFunction } from './discrete-transfer-function.js';
import { Complex } from '../math/complex.js';

function validateTs(Ts) {
  if (!Number.isFinite(Ts) || Ts <= 0) throw new Error('Sample time must be a positive number');
}

/**
 * Substitute s = K*(z-1)/(z+1) into a polynomial (high-degree-first).
 * After multiplying through by (z+1)^n, returns the resulting polynomial in z.
 */
function tustinPoly(coeffs, Ts, K = null) {
  const n = coeffs.length - 1;
  if (K === null) K = 2 / Ts;
  const zm1 = [[1]];
  const zp1 = [[1]];
  for (let i = 1; i <= n; i++) {
    zm1.push(polymul(zm1[i - 1], [1, -1]));
    zp1.push(polymul(zp1[i - 1], [1, 1]));
  }
  const result = new Array(n + 1).fill(0);
  for (let j = 0; j <= n; j++) {
    const a = coeffs[n - j];
    if (Math.abs(a) < 1e-15) continue;
    const term = polyscale(polymul(zm1[j], zp1[n - j]), a * Math.pow(K, j));
    for (let i = 0; i < term.length; i++) result[i] += term[i];
  }
  return result;
}

/**
 * Substitute z^{-1} → (2 - Ts·s)/(2 + Ts·s) into a DTF polynomial.
 * dtfCoeffs[k] = coefficient of z^{-k}.
 * After multiplying by (2 + Ts·s)^n, returns polynomial in s (high-degree-first).
 */
function d2cTustinPoly(dtfCoeffs, Ts) {
  const n = dtfCoeffs.length - 1;
  // (2 - Ts·s)^k * (2 + Ts·s)^{n-k}: build iteratively using polymul
  // high-degree-first: (2-Ts·s) = [-Ts, 2],  (2+Ts·s) = [Ts, 2]
  const Mms = [1]; // (2-Ts·s)^0 = 1
  const Mps = [1]; // (2+Ts·s)^0 = 1
  const Mms_pow = [[1]]; // (2-Ts·s)^k
  const Mps_pow = [[1]]; // (2+Ts·s)^k
  for (let i = 1; i <= n; i++) {
    Mms_pow.push(polymul(Mms_pow[i - 1], [-Ts, 2]));
    Mps_pow.push(polymul(Mps_pow[i - 1], [Ts, 2]));
  }
  const result = new Array(n + 1).fill(0);
  for (let k = 0; k <= n; k++) {
    const a = dtfCoeffs[k];
    if (Math.abs(a) < 1e-15) continue;
    const term = polyscale(polymul(Mms_pow[k], Mps_pow[n - k]), a);
    for (let i = 0; i < term.length; i++) result[i] += term[i];
  }
  return result;
}

// ---------------------------------------------------------------------------
// c2dTustin — Tustin (bilinear) discretization
// ---------------------------------------------------------------------------
export function c2dTustin(sys, Ts) {
  validateTs(Ts);
  const n = sys.den.length - 1;
  const m = sys.num.length - 1;
  if (m > n) throw new Error('System must be proper (numerator degree ≤ denominator degree)');
  const paddedNum = [...new Array(n - m).fill(0), ...sys.num];
  const denZ = tustinPoly(sys.den, Ts);
  const numZ = tustinPoly(paddedNum, Ts);
  const lead = denZ[0];
  return new DiscreteTransferFunction(numZ.map((c) => c / lead), denZ.map((c) => c / lead), Ts);
}

// ---------------------------------------------------------------------------
// c2dTustinPrewarp — Tustin with frequency prewarping at ω_prewarp
// ---------------------------------------------------------------------------
export function c2dTustinPrewarp(sys, Ts, omegaPrewarp) {
  validateTs(Ts);
  if (!Number.isFinite(omegaPrewarp) || omegaPrewarp <= 0) {
    throw new Error('omegaPrewarp must be a positive finite number (rad/s)');
  }
  const halfPeriod = omegaPrewarp * Ts / 2;
  const tanHalf = Math.tan(halfPeriod);
  if (!Number.isFinite(tanHalf) || Math.abs(tanHalf) < 1e-12) {
    throw new Error('Prewarping: ω_prewarp·Ts/2 is too close to π/2; reduce Ts or ω_prewarp');
  }
  const K = omegaPrewarp / tanHalf;
  const n = sys.den.length - 1;
  const m = sys.num.length - 1;
  if (m > n) throw new Error('System must be proper (numerator degree ≤ denominator degree)');
  const paddedNum = [...new Array(n - m).fill(0), ...sys.num];
  const denZ = tustinPoly(sys.den, Ts, K);
  const numZ = tustinPoly(paddedNum, Ts, K);
  const lead = denZ[0];
  return new DiscreteTransferFunction(numZ.map((c) => c / lead), denZ.map((c) => c / lead), Ts);
}

// ---------------------------------------------------------------------------
// c2dMatchedZ — Matched-Z (pole-zero mapping)
// ---------------------------------------------------------------------------
export function c2dMatchedZ(sys, Ts) {
  validateTs(Ts);
  if (sys.num.length > sys.den.length) {
    throw new Error('Matched-Z: system must be proper (numerator degree <= denominator degree)');
  }
  const mapToZ = (s) => {
    const mag = Math.exp(s.re * Ts);
    return { re: mag * Math.cos(s.im * Ts), im: mag * Math.sin(s.im * Ts) };
  };

  const contPoles = sys.poles();
  const contZeros = sys.zeros();
  const discPoles = contPoles.map(mapToZ);
  const discZeros = contZeros.map(mapToZ);

  // Add z=-1 zeros for excess poles (standard convention)
  const nExcess = contPoles.length - contZeros.length;
  for (let i = 0; i < nExcess; i++) discZeros.push({ re: -1, im: 0 });

  const leadingGain = sys.num[0] / sys.den[0];
  const numZ = rootsToRealPoly(discZeros).map((c) => c * leadingGain);
  const denZ = rootsToRealPoly(discPoles);

  // Match DC gain using the DTF low-frequency limit. Direct coefficient sums
  // fail when removable z=1 pole-zero factors make both sums zero.
  const dcCont = sys.dcGain();
  const baseDtf = new DiscreteTransferFunction(numZ, denZ, Ts);
  const dcBase = baseDtf.dcGain();
  let gainFactor = 1;
  let gainNormalized = false;
  if (Number.isFinite(dcCont) && Number.isFinite(dcBase) && Math.abs(dcBase) > 1e-14) {
    gainFactor = dcCont / dcBase;
    gainNormalized = true;
  } else if (Number.isFinite(dcCont) && Math.abs(dcCont) < 1e-14 && Math.abs(dcBase) < 1e-14) {
    gainNormalized = true;
  } else if (!Number.isFinite(dcCont)) {
    // Integrating plant: gain normalization skipped — warn via returned metadata
    console.warn('c2dMatchedZ: integrating plant (DC gain = ∞); gain normalization skipped. ' +
      'The discrete gain at z=1 may not match the continuous limit. Consider using ZOH or Tustin instead.');
  }
  const scaledNum = numZ.map((c) => c * gainFactor);
  const dtf = new DiscreteTransferFunction(scaledNum, denZ, Ts);
  dtf._gainNormalized = gainNormalized;
  return dtf;
}

// ---------------------------------------------------------------------------
// c2dZOH — Zero-Order Hold discretization (all orders, biproper + integrators)
// ---------------------------------------------------------------------------
export function c2dZOH(sys, Ts) {
  validateTs(Ts);
  if (sys.num.length > sys.den.length) throw new Error('ZOH：分子次數不得超過分母次數（improper system）');
  const n = sys.den.length - 1;
  if (n === 0) throw new Error('ZOH 需要至少一階系統');

  // -----------------------------------------------------------------------
  // Fast path for first-order: exact closed-form formula.
  // Handles strictly proper, biproper, and integrators correctly.
  //
  // G(s) = (b1·s + b0) / (a1·s + a0)
  //
  // Split feedthrough: D = b1/a1, G_sp(s) = (b0 - D·a0)/(a1·s + a0)
  // ZOH[G] = D + ZOH[G_sp]  where ZOH uses the step-invariant formula.
  //
  // Integrator (a0=0): ZOH[b0/s] = b0·Ts·z^{-1}/(1-z^{-1})
  // Non-integrator:    ZOH[K/(s+p)] = K/p·(1-e^{-p·Ts})·z^{-1}/(1-e^{-p·Ts}·z^{-1})
  //
  // In z^{-1} form (num/den stored as [z^0, z^{-1}] coefficients):
  //   non-integrator: num=[D, K/p·(1-zp) - D·zp], den=[1, -zp]
  //   integrator:     num=[D, b0·Ts - D],           den=[1, -1]
  // -----------------------------------------------------------------------
  if (n === 1) {
    const a1 = sys.den[0];
    const a0 = sys.den[1];
    if (Math.abs(a1) < 1e-12) throw new Error('ZOH：分母首項係數不可為 0');
    const isBiproper = sys.num.length === 2;
    const b0 = sys.num[sys.num.length - 1];
    const b1 = isBiproper ? sys.num[0] : 0;
    const D  = b1 / a1; // feedthrough (0 for strictly proper)

    if (Math.abs(a0) < 1e-12) {
      // Integrator: G(s) = (b1·s + b0)/s = D + b0/s
      // ZOH[G] = D + b0·Ts·z^{-1}/(1-z^{-1})
      // = [D + (b0·Ts - D)·z^{-1}] / [1 - z^{-1}]
      return new DiscreteTransferFunction([D, b0 * Ts - D], [1, -1], Ts);
    }

    const p  = a0 / a1; // pole magnitude
    const zp = Math.exp(-p * Ts);
    // ZOH[G_sp] where G_sp = (b0-D·a0)/(a1·s+a0) = (b0-D·a0)/(a1·(s+p))
    // K/p = (b0 - D·a0) / a0
    const K_over_p = (b0 - D * a0) / a0;
    const stepGain = K_over_p * (1 - zp);
    // ZOH numerator: [D, stepGain - D·zp]
    return new DiscreteTransferFunction([D, stepGain - D * zp], [1, -zp], Ts);
  }

  // -----------------------------------------------------------------------
  // General N-th order: augmented matrix exponential via SS.
  // For biproper TFs, extract D term first so tfToControllableCanonical
  // receives a strictly-proper system.
  // -----------------------------------------------------------------------
  const { A, B: Bss, C, D } = tfToControllableCanonical(sys.num, sys.den);
  const D00 = D[0][0];

  const aug = matCreate(n + 1, n + 1, 0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) aug[i][j] = A[i][j] * Ts;
    aug[i][n] = Bss[i][0] * Ts;
  }
  const expAug = matExp(aug);
  const Ad = matCreate(n, n);
  const Bd = matCreate(n, 1);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) Ad[i][j] = expAug[i][j];
    Bd[i][0] = expAug[i][n];
  }
  const tf = stateSpaceToTransferFunction(Ad, Bd, C, [[D00]]);
  return tfToDtf(tf, Ts);
}

// ---------------------------------------------------------------------------
// c2dImpulseInvariant — Impulse-Invariant discretization
//
// G_d(z) = Ts · Σ_{k} R_k / (1 - e^{p_k·Ts} · z^{-1})
//
// where R_k = lim_{s→p_k} (s-p_k)·G(s) = N(p_k)/D'(p_k) (simple poles only).
// Complex conjugate poles are handled by combining conjugate residue pairs
// into real second-order sections.
//
// Limitation: assumes simple (non-repeated) poles. For systems with repeated
// poles, use Tustin or ZOH instead.
// ---------------------------------------------------------------------------
export function c2dImpulseInvariant(sys, Ts) {
  validateTs(Ts);
  if (sys.num.length > sys.den.length) {
    throw new Error('Impulse-invariant: system must be proper');
  }
  const poles = sys.poles();
  const denDeriv = polyderiv(sys.den);
  if (denDeriv.every(c => Math.abs(c) < 1e-15)) {
    throw new Error('Impulse-invariant: cannot compute — denominator derivative is zero');
  }

  // Compute residues R_k = N(p_k) / D'(p_k)
  // For complex poles, group conjugate pairs into real 2nd-order sections
  const used = new Array(poles.length).fill(false);
  let numAccum = [1]; // will be built as product of section denominators * section numerators
  let denAccum = [1];

  // We compute G_d(z) as partial fractions and combine:
  // Start with G_d(z) = 0, add each section
  // Represent as (numAccum / denAccum) accumulated sum

  // Initialize accumulator as 0/1
  numAccum = [0];
  denAccum = [1];

  for (let i = 0; i < poles.length; i++) {
    if (used[i]) continue;
    const p = poles[i];

    if (Math.abs(p.im) < 1e-9) {
      // Real pole
      used[i] = true;
      // Residue: R = evalNum(p) / evalDenDeriv(p) — both real
      const pR = p.re;
      const numAtP = polyvalReal(sys.num, pR);
      const dDenAtP = polyvalReal(denDeriv, pR);
      if (Math.abs(dDenAtP) < 1e-15) continue; // repeated pole, skip
      const R = numAtP / dDenAtP;
      // Section: Ts·R / (1 - e^{p·Ts}·z^{-1})
      // In z^{-1} form: num=[Ts·R], den=[1, -e^{p·Ts}]
      const zp = Math.exp(pR * Ts);
      const secNum = [Ts * R];
      const secDen = [1, -zp];
      // Add to accumulator: numAccum/denAccum + secNum/secDen
      numAccum = polyadd(polymul(numAccum, secDen), polymul(secNum, denAccum));
      denAccum = polymul(denAccum, secDen);
    } else {
      // Complex conjugate pair
      let conjIdx = -1;
      for (let j = i + 1; j < poles.length; j++) {
        if (!used[j] && Math.abs(poles[j].re - p.re) < 1e-9 && Math.abs(poles[j].im + p.im) < 1e-9) {
          conjIdx = j; break;
        }
      }
      used[i] = true;
      if (conjIdx >= 0) used[conjIdx] = true;

      // Residue at p (complex): R = N(p)/D'(p)
      const pc = new Complex(p.re, p.im);
      const numAtP = evalComplexPolyAt(sys.num, pc);
      const dDenAtP = evalComplexPolyAt(denDeriv, pc);
      if (dDenAtP.magnitude < 1e-15) continue;
      const Rc = numAtP.div(dDenAtP);

      // Combined section from pair (p, p*):
      // Ts·[R/(1-z_p·z^{-1}) + R*/(1-z_p*·z^{-1})]
      //   = Ts·[2·Re(R) - 2·(Re(R)·Re(z_p)+Im(R)·Im(z_p))·z^{-1}]
      //       / [(1-z_p·z^{-1})(1-z_p*·z^{-1})]
      // denominator = 1 - 2·Re(z_p)·z^{-1} + |z_p|^2·z^{-2}
      const mag = Math.exp(p.re * Ts);
      const zpRe = mag * Math.cos(p.im * Ts);
      const zpIm = mag * Math.sin(p.im * Ts);
      const zp2 = mag * mag; // |z_p|^2

      const RRe = Rc.re, RIm = Rc.im;
      const secNum = [
        Ts * 2 * RRe,
        Ts * (-2) * (RRe * zpRe + RIm * zpIm),
      ];
      const secDen = [1, -2 * zpRe, zp2];

      numAccum = polyadd(polymul(numAccum, secDen), polymul(secNum, denAccum));
      denAccum = polymul(denAccum, secDen);
    }
  }

  return new DiscreteTransferFunction(numAccum, denAccum, Ts);
}

// ---------------------------------------------------------------------------
// d2cTustin — Inverse Tustin (bilinear) discrete→continuous
//
// Applies z^{-1} → (2-Ts·s)/(2+Ts·s) to recover G_c(s) from G_d(z).
// The inverse of c2dTustin (exact match if same Ts).
// ---------------------------------------------------------------------------
export function d2cTustin(dtf) {
  validateTs(dtf.sampleTime);
  const Ts = dtf.sampleTime;
  // Substitute z^{-1} → (2-Ts·s)/(2+Ts·s) in numerator and denominator
  const numS = d2cTustinPoly(dtf.num, Ts);
  const denS = d2cTustinPoly(dtf.den, Ts);
  return new TransferFunction(numS, denS);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
function tfToDtf(tf, Ts) {
  const denArr = tf.den.map(Number);
  let numArr = tf.num.map(Number);
  const diff = denArr.length - numArr.length;
  if (diff > 0) numArr = [...new Array(diff).fill(0), ...numArr];
  return new DiscreteTransferFunction(numArr, denArr, Ts);
}

function evalComplexPolyAt(coeffs, z) {
  // Evaluate polynomial with real coefficients at complex point z
  let out = new Complex(0, 0);
  for (const c of coeffs) out = out.mul(z).add(new Complex(c, 0));
  return out;
}
