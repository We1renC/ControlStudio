/**
 * sysid_signals.js — Experiment signal generation for system identification.
 */

/**
 * Generate a Pseudo-Random Binary Sequence (PRBS) using a Linear-Feedback Shift Register (LFSR).
 * 
 * @param {number} length - Number of samples to generate.
 * @param {number} registerSize - LFSR size (e.g., 5 to 11). The period is 2^registerSize - 1.
 * @param {number} amplitude - Amplitude of the binary signal (default 1.0, outputs ±amplitude).
 * @returns {number[]} The PRBS signal array.
 */
export function generatePRBS(length, registerSize = 7, amplitude = 1.0) {
  if (registerSize < 3 || registerSize > 31) {
    throw new Error('PRBS registerSize must be between 3 and 31');
  }

  // Common LFSR feedback polynomial taps for maximum length sequence
  const tapsMap = {
    3: [3, 2],
    4: [4, 3],
    5: [5, 3],
    6: [6, 5],
    7: [7, 6],
    8: [8, 6, 5, 4],
    9: [9, 5],
    10: [10, 7],
    11: [11, 9],
    12: [12, 11, 10, 4],
    13: [13, 12, 11, 8],
    14: [14, 13, 12, 2],
    15: [15, 14],
    16: [16, 14, 13, 11]
  };

  const taps = tapsMap[registerSize] || [registerSize, registerSize - 1]; // Fallback
  let state = (1 << registerSize) - 1; // Initialize with all 1s
  const out = new Array(length);

  for (let i = 0; i < length; i++) {
    const bit = state & 1;
    out[i] = bit ? amplitude : -amplitude;

    // Compute feedback bit.
    // The polynomial x^n + x^k + ... + 1 maps tap t to register bit (n - t).
    // tap=n (leading term) → bit 0 (output / LSB); tap=k → bit (n-k).
    let feedback = 0;
    for (const tap of taps) {
      feedback ^= (state >> (registerSize - tap)) & 1;
    }

    state = (state >> 1) | (feedback << (registerSize - 1));
  }

  return out;
}

/**
 * Generate a swept-frequency cosine signal (Chirp).
 * 
 * @param {number} length - Number of samples.
 * @param {number} f0 - Initial frequency in Hz.
 * @param {number} f1 - Final frequency in Hz.
 * @param {number} Ts - Sample time in seconds (default 1.0).
 * @param {string} method - 'linear' or 'logarithmic' sweep (default 'linear').
 * @returns {number[]} The Chirp signal array.
 */
export function generateChirp(length, f0, f1, Ts = 1.0, method = 'linear') {
  if (length <= 1) throw new Error('Chirp length must be > 1');
  const out = new Array(length);
  const t1 = (length - 1) * Ts;

  for (let i = 0; i < length; i++) {
    const t = i * Ts;
    let phase = 0;

    if (method === 'linear') {
      // f(t) = f0 + (f1 - f0) * (t / t1)
      // phase(t) = 2pi * integral(f) = 2pi * (f0*t + (f1-f0)/(2*t1) * t^2)
      phase = 2 * Math.PI * (f0 * t + ((f1 - f0) / (2 * t1)) * t * t);
    } else if (method === 'logarithmic' || method === 'log') {
      // f(t) = f0 * (f1/f0)^(t/t1)
      if (f0 <= 0 || f1 <= 0) throw new Error('Logarithmic chirp requires f0 > 0 and f1 > 0');
      const k = Math.pow(f1 / f0, 1 / t1);
      phase = 2 * Math.PI * f0 * ((Math.pow(k, t) - 1) / Math.log(k));
    } else {
      throw new Error(`Unknown chirp method: ${method}`);
    }

    out[i] = Math.cos(phase);
  }

  return out;
}

/**
 * Generate a multi-sine signal (sum of sinusoids).
 * 
 * @param {number} length - Number of samples.
 * @param {number[]} frequencies - Array of frequencies in Hz.
 * @param {number[]} [phases] - Array of phases in radians (optional). If omitted, random Schroeder phases are generated to minimize crest factor.
 * @param {number} Ts - Sample time in seconds (default 1.0).
 * @returns {number[]} The Multi-sine signal array.
 */
export function generateMultiSine(length, frequencies, phases = null, Ts = 1.0) {
  if (!Array.isArray(frequencies) || frequencies.length === 0) {
    throw new Error('Frequencies must be a non-empty array');
  }
  
  const N = frequencies.length;
  let p = phases;
  
  // Schroeder phases to minimize crest factor if not provided
  if (!p) {
    p = new Array(N);
    for (let k = 0; k < N; k++) {
      p[k] = -Math.PI * k * (k + 1) / N;
    }
  } else if (p.length !== N) {
    throw new Error('Phases array must have same length as frequencies array');
  }

  const out = new Array(length).fill(0);
  for (let i = 0; i < length; i++) {
    const t = i * Ts;
    let sum = 0;
    for (let k = 0; k < N; k++) {
      sum += Math.sin(2 * Math.PI * frequencies[k] * t + p[k]);
    }
    // Normalize to roughly [-1, 1] bounds (rough heuristic for dense multi-sines: divide by sqrt(N/2))
    out[i] = sum / (Math.sqrt(N) || 1);
  }

  // Find max absolute value to strictly normalize to [-1, 1]
  const maxAbs = Math.max(...out.map(Math.abs));
  if (maxAbs > 0) {
    for (let i = 0; i < length; i++) out[i] /= maxAbs;
  }

  return out;
}
