/**
 * sysid_freq.js — Frequency-Domain System Identification (P23-01)
 *
 * Implements:
 *   1. estimateFRF    — Non-parametric FRF estimation via Welch's averaged
 *                       cross-spectrum method (H1 estimator).
 *   2. fitTFfromFRF   — Levy's complex curve-fitting method to fit a rational
 *                       TF G(jω) = B(jω)/A(jω) to measured FRF data.
 *
 * Both functions operate entirely in the frequency domain and are therefore
 * complementary to the time-domain methods in sysid.js.
 */

// ---------------------------------------------------------------------------
// Internal DFT helper (real→complex, no external FFT library)
// ---------------------------------------------------------------------------

/**
 * Compute the DFT of a real signal x of length N.
 * Returns { re: Float64Array, im: Float64Array } of length N/2+1 (one-sided).
 * Uses the Cooley-Tukey FFT if N is a power of 2, else DFT via Bluestein's.
 * For simplicity this implementation uses O(N²) DFT — acceptable for N≤4096.
 *
 * @param {number[]} x   - Real input signal
 * @returns {{ re: Float64Array, im: Float64Array, N: number }}
 */
function realDFT(x) {
  const N    = x.length;
  const Nh   = Math.floor(N / 2) + 1;
  const re   = new Float64Array(Nh);
  const im   = new Float64Array(Nh);
  for (let k = 0; k < Nh; k++) {
    let sumRe = 0, sumIm = 0;
    const phi = -2 * Math.PI * k / N;
    for (let n = 0; n < N; n++) {
      sumRe += x[n] * Math.cos(phi * n);
      sumIm += x[n] * Math.sin(phi * n);
    }
    re[k] = sumRe;
    im[k] = sumIm;
  }
  return { re, im, N };
}

/** Hann window coefficients. */
function hannWindow(M) {
  return Array.from({ length: M }, (_, n) => 0.5 * (1 - Math.cos(2 * Math.PI * n / (M - 1))));
}

// ---------------------------------------------------------------------------
// 1. FRF Estimation (H1 Estimator — Welch's Method)
// ---------------------------------------------------------------------------

/**
 * Estimate the Frequency Response Function (FRF) from input u and output y
 * using Welch's averaged cross-spectrum method (H1 estimator):
 *
 *   H1(ω) = Syu(ω) / Suu(ω)
 *
 * where Syu is the cross-spectrum and Suu is the auto-spectrum of u,
 * both averaged over overlapping Hann-windowed segments.
 *
 * @param {number[]} u      - Input signal (length N)
 * @param {number[]} y      - Output signal (length N)
 * @param {number}   Ts     - Sample time (s)
 * @param {object}  [opts]
 * @param {number}  [opts.segLen=256]   - FFT segment length (rounded to even)
 * @param {number}  [opts.overlap=0.5]  - Segment overlap fraction [0, 1)
 * @returns {{
 *   omega:     number[],   // Angular frequencies [0, π/Ts] (rad/s)
 *   freq:      number[],   // Frequencies [0, fs/2] (Hz)
 *   magDB:     number[],   // |H(jω)| in dB
 *   phaseRad:  number[],   // ∠H(jω) in radians
 *   H_re:      number[],   // Re{H(jω)}
 *   H_im:      number[],   // Im{H(jω)}
 *   coherence: number[],   // γ²(ω) ∈ [0, 1] — quality indicator
 *   nSegments: number,
 * }}
 */
export function estimateFRF(u, y, Ts, opts = {}) {
  const N      = u.length;
  if (N !== y.length) throw new Error('estimateFRF: u and y must have equal length');
  if (N < 8)          throw new Error('estimateFRF: need at least 8 samples');

  const segLen  = Math.max(8, Math.min(opts.segLen ?? 256, N));
  const overlap = Math.max(0, Math.min(opts.overlap ?? 0.5, 0.9));
  const step    = Math.max(1, Math.floor(segLen * (1 - overlap)));
  const Nh      = Math.floor(segLen / 2) + 1;
  const win     = hannWindow(segLen);
  // Window power normalisation (for power spectral density)
  const winPow  = win.reduce((s, w) => s + w * w, 0);

  // Accumulators for cross/auto spectra (complex)
  const Suu_re = new Float64Array(Nh);
  const Suu_im = new Float64Array(Nh);
  const Syu_re = new Float64Array(Nh);
  const Syu_im = new Float64Array(Nh);
  const Syy_re = new Float64Array(Nh);
  const Syy_im = new Float64Array(Nh);
  let nSeg = 0;

  for (let start = 0; start + segLen <= N; start += step) {
    const uSeg = Array.from({ length: segLen }, (_, i) => u[start + i] * win[i]);
    const ySeg = Array.from({ length: segLen }, (_, i) => y[start + i] * win[i]);
    const Uf   = realDFT(uSeg);
    const Yf   = realDFT(ySeg);

    for (let k = 0; k < Nh; k++) {
      const ur = Uf.re[k], ui = Uf.im[k];
      const yr = Yf.re[k], yi = Yf.im[k];
      // Suu += U · conj(U)
      Suu_re[k] += ur * ur + ui * ui;
      // Syu += Y · conj(U)
      Syu_re[k] += yr * ur + yi * ui;
      Syu_im[k] += yi * ur - yr * ui;
      // Syy += Y · conj(Y)
      Syy_re[k] += yr * yr + yi * yi;
    }
    nSeg++;
  }

  if (nSeg === 0) throw new Error('estimateFRF: no complete segments — reduce segLen');

  // H1 = Syu / Suu (complex division, Suu is real since auto-spectrum)
  const H_re    = new Array(Nh);
  const H_im    = new Array(Nh);
  const magDB   = new Array(Nh);
  const phaseRad = new Array(Nh);
  const coherence = new Array(Nh);
  const omega   = new Array(Nh);
  const freq    = new Array(Nh);
  const fs      = 1.0 / Ts;

  for (let k = 0; k < Nh; k++) {
    const suu = Suu_re[k];
    if (suu < 1e-300) {
      H_re[k] = 0; H_im[k] = 0;
      magDB[k] = -Infinity; phaseRad[k] = 0; coherence[k] = 0;
    } else {
      H_re[k]    = Syu_re[k] / suu;
      H_im[k]    = Syu_im[k] / suu;
      const mag  = Math.sqrt(H_re[k] ** 2 + H_im[k] ** 2);
      magDB[k]   = 20 * Math.log10(mag + 1e-300);
      phaseRad[k] = Math.atan2(H_im[k], H_re[k]);
      // Coherence: γ² = |Syu|² / (Suu · Syy)
      const syu2 = Syu_re[k] ** 2 + Syu_im[k] ** 2;
      coherence[k] = Math.min(1, syu2 / (suu * Math.max(Syy_re[k], 1e-300)));
    }
    freq[k]  = k * fs / segLen;
    omega[k] = 2 * Math.PI * freq[k];
  }

  return { omega, freq, magDB, phaseRad, H_re, H_im, coherence, nSegments: nSeg };
}

// ---------------------------------------------------------------------------
// 2. TF Fitting from FRF (Levy's Method)
// ---------------------------------------------------------------------------

/**
 * Fit a rational transfer function G(jω) = B(jω)/A(jω) to complex FRF data
 * using Levy's iterative weighted complex curve-fitting method.
 *
 * Model:  G(jω) = (b₀ + b₁(jω) + … + bₙ_b(jω)^nb)
 *                / (1 + a₁(jω) + … + aₙ_a(jω)^na)
 *
 * Algorithm (Levy 1959):
 *   1. Form weighted linear system from Re/Im of data
 *   2. Solve for [b, a] via least-squares (Sanathanan-Koerner iteration
 *      for improved accuracy)
 *   3. Compute fit quality (fitPercent on |H| in dB)
 *
 * @param {number[]} omega  - Angular frequencies (rad/s), length M
 * @param {number[]} H_re   - Re{H(jω)}, length M
 * @param {number[]} H_im   - Im{H(jω)}, length M
 * @param {number}   na     - Denominator order (excluding leading 1)
 * @param {number}   nb     - Numerator order
 * @param {object}  [opts]
 * @param {number}  [opts.maxIter=5]  - SK iteration count
 * @param {number}  [opts.Ts=0]       - Sample time (0 = continuous s-domain)
 * @returns {{
 *   num:        number[],   // numerator coefficients [b_nb, …, b_1, b_0]
 *   den:        number[],   // denominator [1, a_na, …, a_1]
 *   fitPercent: number,     // NRMSE fit % on |H| (dB scale)
 *   residualRMS: number,
 * }}
 */
export function fitTFfromFRF(omega, H_re, H_im, na, nb, opts = {}) {
  const M       = omega.length;
  const maxIter = opts.maxIter ?? 5;
  if (M < na + nb + 2) {
    throw new Error(`fitTFfromFRF: need at least ${na + nb + 2} frequency points`);
  }

  /**
   * Build the Levy regression matrix and solve for coefficients.
   * Parameterisation: jω → s (continuous), or jω used directly.
   *
   * Unknown vector θ = [b_0, b_1, …, b_nb, a_1, a_2, …, a_na]
   * Equation: Y(jω) · A(jω) = B(jω)  →  rearranged to linear system.
   */
  function buildAndSolve(weights) {
    const nParams = (nb + 1) + na;
    // Build 2M×nParams real system (separate Re and Im rows)
    const Phi = Array.from({ length: 2 * M }, () => new Array(nParams).fill(0));
    const rhs = new Array(2 * M).fill(0);

    for (let m = 0; m < M; m++) {
      const jw  = omega[m]; // magnitude of jω
      const Hr  = H_re[m];
      const Hi  = H_im[m];
      const w   = weights ? weights[m] : 1.0;
      const wr  = w, wi = w;

      // Powers of (jω): (jω)^k = j^k · ω^k
      // j^0=1+0j, j^1=0+1j, j^2=-1+0j, j^3=0-1j, j^4=1+0j, …
      function jwPower(k) {
        const mag = Math.pow(jw, k);
        switch (k % 4) {
          case 0: return { re: mag, im: 0 };
          case 1: return { re: 0, im: mag };
          case 2: return { re: -mag, im: 0 };
          case 3: return { re: 0, im: -mag };
        }
      }

      // B coefficients: b_k contributes (jω)^k
      for (let k = 0; k <= nb; k++) {
        const { re, im } = jwPower(k);
        Phi[m][k]     += wr * re;    // real row
        Phi[M + m][k] += wi * im;    // imag row
      }

      // A coefficients: a_k contributes -H(jω)·(jω)^k  [moved to LHS]
      for (let k = 1; k <= na; k++) {
        const { re, im } = jwPower(k);
        // -H · (jω)^k = -(Hr+j·Hi)(re+j·im) = -(Hr·re-Hi·im) - j(Hr·im+Hi·re)
        Phi[m][nb + k]     += -wr * (Hr * re - Hi * im);
        Phi[M + m][nb + k] += -wi * (Hr * im + Hi * re);
      }

      // RHS: H(jω) · a₀ = H(jω) (since a₀=1)
      rhs[m]     = wr * Hr;
      rhs[M + m] = wi * Hi;
    }

    // Solve via normal equations: (PhiT·Phi)·theta = PhiT·rhs
    // Gauss-Jordan on the augmented matrix
    const nPhi = nParams;
    const A = Array.from({ length: nPhi }, (_, i) => {
      const row = new Array(nPhi + 1).fill(0);
      for (let j = 0; j < nPhi; j++) {
        for (let k = 0; k < 2 * M; k++) row[j] += Phi[k][i] * Phi[k][j];
      }
      for (let k = 0; k < 2 * M; k++) row[nPhi] += Phi[k][i] * rhs[k];
      return row;
    });

    // Gaussian elimination with partial pivoting
    for (let col = 0; col < nPhi; col++) {
      let maxRow = col;
      for (let r = col + 1; r < nPhi; r++)
        if (Math.abs(A[r][col]) > Math.abs(A[maxRow][col])) maxRow = r;
      [A[col], A[maxRow]] = [A[maxRow], A[col]];
      const piv = A[col][col];
      if (Math.abs(piv) < 1e-14) continue;
      for (let r = 0; r < nPhi; r++) {
        if (r === col) continue;
        const f = A[r][col] / piv;
        for (let c = col; c <= nPhi; c++) A[r][c] -= f * A[col][c];
      }
    }
    return A.map((row, i) => Math.abs(row[i]) > 1e-14 ? row[nPhi] / row[i] : 0);
  }

  // ── SK iteration ────────────────────────────────────────────────────────
  let weights = null;
  let theta   = buildAndSolve(null);

  for (let iter = 0; iter < maxIter; iter++) {
    // Update weights: w_m = 1 / |A(jω_m)|²
    const newWeights = new Array(M);
    for (let m = 0; m < M; m++) {
      let Ar = 1.0, Ai = 0.0; // a₀ = 1
      const jw = omega[m];
      for (let k = 1; k <= na; k++) {
        const ak = theta[nb + k];
        const mag = Math.pow(jw, k);
        switch (k % 4) {
          case 0: Ar += ak * mag;  break;
          case 1: Ai += ak * mag;  break;
          case 2: Ar -= ak * mag;  break;
          case 3: Ai -= ak * mag;  break;
        }
      }
      const denom = Ar * Ar + Ai * Ai;
      newWeights[m] = denom > 1e-20 ? 1.0 / denom : 1.0;
    }
    weights = newWeights;
    theta   = buildAndSolve(weights);
  }

  // ── Extract coefficients ────────────────────────────────────────────────
  // theta = [b_0, b_1, …, b_nb, a_1, …, a_na]
  // Conventional polynomial form (high-degree first):
  //   num = [b_nb, …, b_1, b_0]
  //   den = [1, a_na, …, a_1]
  const bCoeffs = theta.slice(0, nb + 1);       // b_0..b_nb (low→high)
  const aCoeffs = theta.slice(nb + 1, nb + 1 + na); // a_1..a_na

  // Standard polynomial form (high-degree-first, matching TransferFunction convention):
  //   num: [b_nb, …, b_1, b_0]              ← constant term last
  //   den: [a_na, …, a_1, 1]               ← leading 1 from Levy's A(0)=1 at constant term
  // e.g. for na=1: A(s)=1+a₁·s → [a_1, 1] = a₁·s+1 (pole at -1/a₁)
  const num = [...bCoeffs].reverse();            // [b_nb, …, b_0]
  const den = [...[...aCoeffs].reverse(), 1];    // [a_na, …, a_1, 1]

  // ── Fit quality on magnitude (dB) ──────────────────────────────────────
  const measMagDB = Array.from({ length: M }, (_, m) =>
    20 * Math.log10(Math.sqrt(H_re[m] ** 2 + H_im[m] ** 2) + 1e-300)
  );
  const predMagDB = Array.from({ length: M }, (_, m) => {
    const jw = omega[m];
    let Br = 0, Bi = 0, Ar = 1.0, Ai = 0.0;
    for (let k = 0; k <= nb; k++) {
      const bk = bCoeffs[k];
      const mag = Math.pow(jw, k);
      switch (k % 4) {
        case 0: Br += bk * mag; break;
        case 1: Bi += bk * mag; break;
        case 2: Br -= bk * mag; break;
        case 3: Bi -= bk * mag; break;
      }
    }
    for (let k = 1; k <= na; k++) {
      const ak = aCoeffs[k - 1];
      const mag = Math.pow(jw, k);
      switch (k % 4) {
        case 0: Ar += ak * mag; break;
        case 1: Ai += ak * mag; break;
        case 2: Ar -= ak * mag; break;
        case 3: Ai -= ak * mag; break;
      }
    }
    const Hmag = Math.sqrt((Br * Ar + Bi * Ai) ** 2 + (Bi * Ar - Br * Ai) ** 2)
               / (Ar * Ar + Ai * Ai);
    return 20 * Math.log10(Hmag + 1e-300);
  });

  const yMean  = measMagDB.reduce((s, v) => s + v, 0) / M;
  const sse    = measMagDB.reduce((s, v, i) => s + (v - predMagDB[i]) ** 2, 0);
  const sst    = measMagDB.reduce((s, v) => s + (v - yMean) ** 2, 0);
  const fitPercent  = sst > 1e-12 ? Math.max(0, (1 - Math.sqrt(sse / sst)) * 100) : NaN;
  const residualRMS = Math.sqrt(sse / M);

  return { num, den, fitPercent, residualRMS };
}
