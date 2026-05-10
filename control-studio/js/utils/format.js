/**
 * format.js — Number and polynomial formatting utilities
 */

export function fmtNum(n, digits = 4) {
  if (n === Infinity || n === -Infinity) return '∞';
  if (isNaN(n)) return '—';
  if (Math.abs(n) < 1e-10) return '0';
  if (Math.abs(n) >= 1e4 || (Math.abs(n) < 0.01 && Math.abs(n) > 0)) {
    return n.toExponential(2);
  }
  return parseFloat(n.toFixed(digits)).toString();
}

export function fmtDeg(n) { return fmtNum(n, 1) + '°'; }
export function fmtDB(n) { return fmtNum(n, 1) + ' dB'; }
export function fmtTime(n) {
  if (isNaN(n) || n === null) return '—';
  return fmtNum(n, 3) + ' s';
}
export function fmtPercent(n) {
  if (isNaN(n) || n === null) return '—';
  return fmtNum(n, 1) + '%';
}

/**
 * Parse polynomial from string input.
 * Extremely robust: extracts all numbers regardless of brackets/parentheses.
 */
export function parsePolyString(str) {
  if (!str) return null;
  // Match all numbers (including decimals and signs)
  const matches = str.match(/-?\d*\.?\d+/g);
  if (!matches) return null;
  const parts = matches.map(Number);
  if (parts.length === 0 || parts.some(isNaN)) return null;
  return parts;
}
