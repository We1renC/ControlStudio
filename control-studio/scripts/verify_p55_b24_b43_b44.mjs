/**
 * verify_p55_b24_b43_b44.mjs
 *
 * Verifies P55:
 *   B2-4  Gramian / SVD detail panel
 *   B4-3  python-control bridge panel
 *   B4-4  LaTeX symbol generator panel
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { gramianDiagnostics } from '../js/control/model_reduction.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
const errors = [];

function ok(label)       { console.log(`  ✓ ${label}`); pass++; }
function bad(label, msg) { console.error(`  ✗ ${label}: ${msg}`); fail++; errors.push(label); }
function assert(cond, label, msg = '') { cond ? ok(label) : bad(label, msg || 'condition failed'); }

const appJs     = readFileSync(path.join(ROOT, 'js/app.js'),  'utf8');
const indexHtml = readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// ── B2-4: Gramian / SVD Detail ────────────────────────────────────────────────
console.log('\n▶ B2-4 Gramian / SVD Detail');

assert(appJs.includes('function computeGramianDetail()'),  'computeGramianDetail() defined');
assert(appJs.includes('function renderGramianDetail('),    'renderGramianDetail() defined');
assert(appJs.includes('function initGramianDetail()'),     'initGramianDetail() defined');
assert(appJs.includes('btn-gramian-detail'),               'btn-gramian-detail referenced');
assert(appJs.includes('gramian-detail-wrap'),              'gramian-detail-wrap referenced');
assert(appJs.includes('gramian-table'),                    'gramian-table rendered');
assert(appJs.includes('gramian-summary'),                  'gramian-summary rendered');
assert(appJs.includes('gramian-error'),                    'gramian-error class used');
assert(appJs.includes('gd-bar'),                           'gd-bar progress bar rendered');
assert(appJs.includes("tr(Wc)"),                           'tr(Wc) shown in summary');
assert(appJs.includes("κ₁(Wc)"),                           '1-norm condition number shown for Wc');
assert(appJs.includes("κ₁(Wo)"),                           '1-norm condition number shown for Wo');
assert(appJs.includes("λ(Wc)"),                            'Gramian eigenvalue column named accurately');
assert(appJs.includes("λ(Wo)"),                            'observability eigenvalue column named accurately');
assert(appJs.includes('computeCurrentGramianDiagnostics()'), 'detail panel uses shared exact diagnostic route');
assert(!appJs.includes('truncated impulse-simulation approximation'), 'truncated Gramian approximation removed');
assert(!appJs.includes('diagEig ='),                       'diagonal-eigenvalue heuristic removed');

const close = (actual, expected, tolerance = 1e-9) =>
  Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected));
const A = [[-1, 0], [0, -2]];
const B = [[1], [1]];
const C = [[1, 1]];
const D = [[0]];
const continuous = gramianDiagnostics(A, B, C, D);
assert(close(continuous.Wc[0][0], 0.5) && close(continuous.Wc[0][1], 1 / 3)
    && close(continuous.Wc[1][1], 0.25),
  'continuous controllability Gramian matches analytic Lyapunov solution');
assert(close(continuous.Wo[0][0], 0.5) && close(continuous.Wo[0][1], 1 / 3)
    && close(continuous.Wo[1][1], 0.25),
  'continuous observability Gramian matches analytic Lyapunov solution');
assert(close(continuous.hsv[0], 0.7310001560548973)
    && close(continuous.hsv[1], 0.0189998439451029),
  'continuous HSVs include Gramian off-diagonal coupling');
assert(close(continuous.wcCondition, 50),
  'continuous Wc reports true 1-norm condition number');
assert(continuous.controllabilityResidual < 1e-12 && continuous.observabilityResidual < 1e-12,
  'continuous Lyapunov residuals are numerically closed');

const discrete = gramianDiagnostics([[0.5, 0], [0, 0.2]], B, C, D, { domain: 'discrete' });
assert(close(discrete.Wc[0][0], 4 / 3) && close(discrete.Wc[0][1], 10 / 9)
    && close(discrete.Wc[1][1], 25 / 24),
  'discrete controllability Gramian matches analytic Stein solution');
assert(discrete.controllabilityResidual < 1e-12 && discrete.observabilityResidual < 1e-12,
  'discrete Stein residuals are numerically closed');

let unstableContinuousRejected = false;
try {
  gramianDiagnostics([[0.1]], [[1]], [[1]], [[0]]);
} catch (error) {
  unstableContinuousRejected = /Hurwitz/.test(error.message);
}
assert(unstableContinuousRejected, 'unstable continuous A is rejected');

let unstableDiscreteRejected = false;
try {
  gramianDiagnostics([[1.01]], [[1]], [[1]], [[0]], { domain: 'discrete' });
} catch (error) {
  unstableDiscreteRejected = /Schur-stable/.test(error.message);
}
assert(unstableDiscreteRejected, 'unstable discrete A is rejected');

// HTML
assert(indexHtml.includes('gramian-detail-panel'),         '#gramian-detail-panel in HTML');
assert(indexHtml.includes('btn-gramian-detail'),           '#btn-gramian-detail in HTML');
assert(indexHtml.includes('gramian-detail-wrap'),          '#gramian-detail-wrap in HTML');
assert(indexHtml.includes('B2-4'),                         'B2-4 label in HTML');
assert(indexHtml.includes('以連續 Lyapunov 或離散 Stein 方程'),
  'Gramian UI names the exact continuous/discrete equations');
assert(!indexHtml.includes('以截斷脈衝響應法近似'),
  'obsolete truncated-response Gramian description removed');
assert(indexHtml.includes('js/app.js?v=zf13'),
  'Zero-Flaw Loop 13 module cache key applied');

// CSS
assert(indexHtml.includes('.gramian-table'),               '.gramian-table CSS');
assert(indexHtml.includes('.gramian-summary'),             '.gramian-summary CSS');
assert(indexHtml.includes('.gramian-error'),               '.gramian-error CSS');
assert(indexHtml.includes('.gd-bar'),                      '.gd-bar CSS');
assert(indexHtml.includes('.gd-bar-fill'),                 '.gd-bar-fill CSS');

// ── B4-3: python-control Bridge ───────────────────────────────────────────────
console.log('\n▶ B4-3 python-control Bridge');

assert(appJs.includes('function buildPythonBridgeCode()'), 'buildPythonBridgeCode() defined');
assert(appJs.includes('function initPythonBridge()'),      'initPythonBridge() defined');
assert(appJs.includes('btn-python-bridge-refresh'),        'btn-python-bridge-refresh referenced');
assert(appJs.includes('btn-python-bridge-copy'),           'btn-python-bridge-copy referenced');
assert(appJs.includes('python-bridge-code'),               'python-bridge-code referenced');
assert(appJs.includes('import control as ct'),             'import control as ct in generated code');
assert(appJs.includes('ct.tf('),                           'ct.tf() in generated code');
assert(appJs.includes('ct.feedback('),                     'ct.feedback() in generated code');
assert(appJs.includes('ct.bode_plot('),                    'ct.bode_plot() in generated code');
assert(appJs.includes('window.buildPythonBridgeCode'),     'buildPythonBridgeCode exposed globally');
assert(appJs.includes("plant:changed"),                    'auto-refresh on plant:changed event');

// HTML
assert(indexHtml.includes('python-bridge-panel'),          '#python-bridge-panel in HTML');
assert(indexHtml.includes('btn-python-bridge-refresh'),    '#btn-python-bridge-refresh in HTML');
assert(indexHtml.includes('btn-python-bridge-copy'),       '#btn-python-bridge-copy in HTML');
assert(indexHtml.includes('python-bridge-code'),           '#python-bridge-code in HTML');
assert(indexHtml.includes('B4-3'),                         'B4-3 label in HTML');

// CSS
assert(indexHtml.includes('.python-bridge-code'),          '.python-bridge-code CSS');
assert(indexHtml.includes('.python-bridge-toolbar'),       '.python-bridge-toolbar CSS');

// ── B4-4: LaTeX Symbol Generator ─────────────────────────────────────────────
console.log('\n▶ B4-4 LaTeX Symbol Generator');

assert(appJs.includes('function _polyToLatex('),           '_polyToLatex() helper defined');
assert(appJs.includes('function buildLatexSymbols()'),     'buildLatexSymbols() defined');
assert(appJs.includes('function initLatexGen()'),          'initLatexGen() defined');
assert(appJs.includes('btn-latex-gen-refresh'),            'btn-latex-gen-refresh referenced');
assert(appJs.includes('btn-latex-gen-copy'),               'btn-latex-gen-copy referenced');
assert(appJs.includes('latex-gen-out'),                    'latex-gen-out referenced');
assert(appJs.includes('latex-row'),                        'latex-row rendered');
assert(appJs.includes('latex-label'),                      'latex-label rendered');
assert(appJs.includes('latex-code'),                       'latex-code rendered');
assert(appJs.includes('latex-copy-one'),                   'latex-copy-one button rendered');
assert(appJs.includes('\\\\dfrac'),                        '\\dfrac LaTeX fraction used');
assert(appJs.includes('window.buildLatexSymbols'),         'buildLatexSymbols exposed globally');
assert(appJs.includes('data-latex='),                      'data-latex attribute on copy buttons');

// HTML
assert(indexHtml.includes('latex-gen-panel'),              '#latex-gen-panel in HTML');
assert(indexHtml.includes('btn-latex-gen-refresh'),        '#btn-latex-gen-refresh in HTML');
assert(indexHtml.includes('btn-latex-gen-copy'),           '#btn-latex-gen-copy in HTML');
assert(indexHtml.includes('latex-gen-out'),                '#latex-gen-out in HTML');
assert(indexHtml.includes('B4-4'),                         'B4-4 label in HTML');

// CSS
assert(indexHtml.includes('.latex-row'),                   '.latex-row CSS');
assert(indexHtml.includes('.latex-label'),                 '.latex-label CSS');
assert(indexHtml.includes('.latex-code'),                  '.latex-code CSS');
assert(indexHtml.includes('.latex-copy-one'),              '.latex-copy-one CSS');
assert(indexHtml.includes('#latex-gen-out'),               '#latex-gen-out CSS');

// ── P55 init calls ────────────────────────────────────────────────────────────
console.log('\n▶ P55 DOMContentLoaded init');

assert(appJs.includes('initGramianDetail()'),   'initGramianDetail called');
assert(appJs.includes('initPythonBridge()'),    'initPythonBridge called');
assert(appJs.includes('initLatexGen()'),        'initLatexGen called');

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('');
console.log(`Results: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error('Failed:', errors.join(', '));
  process.exit(1);
}
console.log('✓ P55 B2-4/B4-3/B4-4 Gramian / python-control / LaTeX — all checks passed');
