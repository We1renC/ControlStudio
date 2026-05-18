// latex.js — KaTeX-based formula rendering for ControlStudio
// Converts coefficient arrays to LaTeX polynomial and rational forms.

/**
 * Format a polynomial coefficient array (high-order first) into a LaTeX string.
 * Examples:
 *   [1] → "1"
 *   [1, 0] → "s"
 *   [1, 3, 2] → "s^2 + 3s + 2"
 *   [-1, 2] → "-s + 2"
 *
 * @param {number[]} coeffs
 * @param {string} variable - "s" or "z"
 */
export function polyToLatex(coeffs, variable = 's') {
  if (!coeffs || coeffs.length === 0) return '0';
  const n = coeffs.length - 1;
  const terms = [];
  for (let i = 0; i < coeffs.length; i++) {
    const c = coeffs[i];
    const power = n - i;
    if (Math.abs(c) < 1e-12) continue;
    const absC = Math.abs(c);
    const sign = c < 0 ? '-' : '+';
    let coefStr = '';
    if (power === 0 || absC !== 1) {
      // Format coefficient: integer or up to 4 sig digits
      coefStr = formatNumber(absC);
    }
    let varStr = '';
    if (power === 1) varStr = variable;
    else if (power > 1) varStr = `${variable}^{${power}}`;
    const term = (coefStr && varStr) ? `${coefStr}${varStr}` : (coefStr || varStr);
    if (terms.length === 0) {
      terms.push(c < 0 ? `-${term}` : term);
    } else {
      terms.push(` ${sign} ${term}`);
    }
  }
  return terms.length === 0 ? '0' : terms.join('');
}

function formatNumber(x) {
  if (!Number.isFinite(x)) return String(x);
  if (Number.isInteger(x)) return String(x);
  const formatted = Number(x.toPrecision(4));
  return String(formatted);
}

/**
 * Build a LaTeX rational TF \frac{num}{den}.
 */
export function tfToLatex(num, den, variable = 's') {
  return `\\frac{${polyToLatex(num, variable)}}{${polyToLatex(den, variable)}}`;
}

/**
 * Render a LaTeX string into a DOM element using KaTeX (loaded async via CDN).
 * Falls back to plain text if KaTeX is unavailable.
 */
export function renderLatex(el, latex, options = {}) {
  if (!el) return;
  if (typeof window !== 'undefined' && window.katex) {
    try {
      window.katex.render(latex, el, {
        throwOnError: false,
        displayMode: options.displayMode !== false,
        output: 'html',
      });
      return;
    } catch (err) {
      el.textContent = latex;
    }
  } else {
    // KaTeX not loaded yet — retry once after a short delay
    el.textContent = latex;
    setTimeout(() => {
      if (typeof window !== 'undefined' && window.katex) {
        try {
          window.katex.render(latex, el, { throwOnError: false, displayMode: options.displayMode !== false, output: 'html' });
        } catch { /* keep plain text */ }
      }
    }, 250);
  }
}

/**
 * Convenience: render a TF directly.
 */
export function renderTfLatex(el, num, den, options = {}) {
  const tf = tfToLatex(num, den, options.variable || 's');
  const prefix = options.label ? `${options.label}(${options.variable || 's'}) = ` : '';
  renderLatex(el, prefix + tf, options);
}

/** PID transfer function as LaTeX: K_p + K_i/s + K_d s */
export function pidToLatex(Kp, Ki, Kd, N = null) {
  const parts = [];
  if (Math.abs(Kp) > 1e-12) parts.push(formatNumber(Kp));
  if (Math.abs(Ki) > 1e-12) parts.push(`\\frac{${formatNumber(Ki)}}{s}`);
  if (Math.abs(Kd) > 1e-12) {
    if (N && N > 0) parts.push(`\\frac{${formatNumber(Kd * N)} s}{s + ${formatNumber(N)}}`);
    else parts.push(`${formatNumber(Kd)} s`);
  }
  return parts.length === 0 ? '0' : parts.join(' + ');
}
