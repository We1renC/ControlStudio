/**
 * verify_p46_b5_b2.mjs
 *
 * Verifies P46 — B5-1~3 Computation Steps / Tooltip / Condition Warnings
 *              + B2-1 Matrix Expand Panel
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import {
  classifySymmetricDefiniteness,
  estimateCondition,
} from '../js/math/conditioning.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
const errors = [];

function ok(label)       { console.log(`  ✓ ${label}`); pass++; }
function bad(label, msg) { console.error(`  ✗ ${label}: ${msg}`); fail++; errors.push(label); }
function assert(cond, label, msg = '') { cond ? ok(label) : bad(label, msg || 'condition failed'); }

const appJs     = readFileSync(path.join(ROOT, 'js/app.js'),  'utf8');
const indexHtml = readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// ── Shared numerics ───────────────────────────────────────────────────────────
console.log('\n▶ Shared numeric helpers');

assert(appJs.includes('return estimateCondition(M);'), 'computeConditionNumber() uses 1-norm condition estimator');
assert(appJs.includes('function _kappaClass('),           '_kappaClass() defined');
assert(appJs.includes("return 'good'"),                   "kappa class 'good'");
assert(appJs.includes("return 'warn'"),                   "kappa class 'warn'");
assert(appJs.includes("return 'bad'"),                    "kappa class 'bad'");
assert(appJs.includes('function _matDetSmall('),          '_matDetSmall() defined');
assert(appJs.includes('return classifySymmetricDefiniteness(M);'),
  '_pdClass() uses symmetric eigenvalue classification');

const nearSingular = [[1, 1], [1, 1 + 1e-12]];
const nearSingularKappa = estimateCondition(nearSingular);
assert(nearSingularKappa > 1e12,
  'near-singular equal-row matrix reports severe condition number',
  `kappa=${nearSingularKappa}`);
assert(estimateCondition([[1, 1], [1, 1]]) === Infinity,
  'singular matrix condition number is Infinity');
assert(Math.abs(estimateCondition([[1, 0], [0, 1]]) - 1) < 1e-12,
  'identity matrix condition number is one');
assert(classifySymmetricDefiniteness([[2, -1], [-1, 2]]) === 'positive-definite',
  'symmetric positive-definite matrix classified from eigenvalues');
assert(classifySymmetricDefiniteness([[1, 1], [1, 1]]) === 'positive-semidefinite',
  'rank-deficient Gram matrix classified positive-semidefinite');
assert(classifySymmetricDefiniteness([[1, 2], [2, 1]]) === 'indefinite',
  'positive diagonal does not hide an indefinite matrix');
assert(classifySymmetricDefiniteness([[-1, 1], [0, -2]]) === 'non-symmetric',
  'non-symmetric state matrix has no definiteness label');
assert(classifySymmetricDefiniteness([[1], [2]]) === 'non-square',
  'rectangular matrix has no definiteness label');

// ── B5-1: Calculation Steps Panel ────────────────────────────────────────────
console.log('\n▶ B5-1 Calculation Steps Panel');

assert(appJs.includes('function _buildCalcStep('),       '_buildCalcStep() defined');
assert(appJs.includes('function showCalcSteps('),        'showCalcSteps() defined');
assert(appJs.includes('calc-steps-outer'),               'calc-steps-outer referenced');
assert(appJs.includes('calc-steps-list'),                'calc-steps-list referenced');
assert(appJs.includes('calc-step-item'),                 'calc-step-item class');
assert(appJs.includes('calc-step-header'),               'calc-step-header class');
assert(appJs.includes('calc-step-body'),                 'calc-step-body class');
assert(appJs.includes('calc-step-num'),                  'calc-step-num class');
assert(appJs.includes('calc-step-kappa'),                'calc-step-kappa class');
assert(appJs.includes('function initCalcSteps()'),       'initCalcSteps() defined');
assert(appJs.includes('btn-calc-steps-collapse'),        'btn-calc-steps-collapse referenced');
assert(appJs.includes('window.showCalcSteps'),           'showCalcSteps exposed globally');

assert(indexHtml.includes('calc-steps-outer'),           '#calc-steps-outer in HTML');
assert(indexHtml.includes('calc-steps-list'),            '#calc-steps-list in HTML');
assert(indexHtml.includes('btn-calc-steps-collapse'),    '#btn-calc-steps-collapse in HTML');
assert(indexHtml.includes('.calc-steps-panel'),          '.calc-steps-panel CSS');
assert(indexHtml.includes('.calc-step-item'),            '.calc-step-item CSS');
assert(indexHtml.includes('.calc-step-header'),          '.calc-step-header CSS');
assert(indexHtml.includes('.calc-step-body'),            '.calc-step-body CSS');
assert(indexHtml.includes('.calc-step-kappa'),           '.calc-step-kappa CSS');
assert(indexHtml.includes('.calc-step-kappa.good'),      '.calc-step-kappa.good CSS');
assert(indexHtml.includes('.calc-step-kappa.warn'),      '.calc-step-kappa.warn CSS');
assert(indexHtml.includes('.calc-step-kappa.bad'),       '.calc-step-kappa.bad CSS');

// ── B5-2: Intermediate Tooltip ────────────────────────────────────────────────
console.log('\n▶ B5-2 Intermediate Value Tooltip');

assert(appJs.includes('function attachIntermediateTooltip('), 'attachIntermediateTooltip() defined');
assert(appJs.includes('function initIntermediateTooltip()'), 'initIntermediateTooltip() defined');
assert(appJs.includes('chart-val-tooltip'),                  'chart-val-tooltip class');
assert(appJs.includes("'bode_mag'"),                         "bode_mag chart type");
assert(appJs.includes("'bode_phase'"),                       "bode_phase chart type");
assert(appJs.includes("'step'"),                             "step chart type");
assert(appJs.includes("'nyquist'"),                          "nyquist chart type");
assert(appJs.includes("'rl'"),                               "root locus chart type");
assert(appJs.includes('plotly_hover'),                       'plotly_hover event used');
assert(appJs.includes('plotly_unhover'),                     'plotly_unhover event used');
assert(appJs.includes('|dist(-1)|'),                         'Nyquist tooltip includes distance to -1');
assert(appJs.includes('Math.hypot(x + 1, y)'),              'distance to -1 computed');
assert(appJs.includes('window.attachIntermediateTooltip'),   'attachIntermediateTooltip exposed');

// ── B5-3: Condition Number Warning ────────────────────────────────────────────
console.log('\n▶ B5-3 Condition Number / Precision Warning');

assert(appJs.includes('HEALTH_CHECKS'),                   'HEALTH_CHECKS array defined');
assert(appJs.includes('function showCondWarn('),          'showCondWarn() defined');
assert(appJs.includes('function checkNumericalHealth('),  'checkNumericalHealth() defined');
assert(appJs.includes('cond-warn-bar'),                   'cond-warn-bar referenced');
assert(appJs.includes('cond-warn-banner'),                'cond-warn-banner class used');
assert(appJs.includes('cond-warn-close'),                 'cond-warn-close button');
assert(appJs.includes("severity: 'error'"),               "error severity defined");
assert(appJs.includes("severity: 'warn'"),                "warn severity defined");
assert(appJs.includes('kappa > 1e8'),                     'κ > 1e8 → error threshold');
assert(appJs.includes('kappa > 1000'),                    'κ > 1000 → warn threshold');
assert(appJs.includes('window.showCondWarn'),             'showCondWarn exposed globally');
assert(appJs.includes('window.checkNumericalHealth'),     'checkNumericalHealth exposed globally');

assert(indexHtml.includes('cond-warn-bar'),               '#cond-warn-bar in HTML');
assert(indexHtml.includes('.cond-warn-banner'),           '.cond-warn-banner CSS');
assert(indexHtml.includes('.cond-warn-banner.warn'),      '.cond-warn-banner.warn CSS');
assert(indexHtml.includes('.cond-warn-banner.error'),     '.cond-warn-banner.error CSS');
assert(indexHtml.includes('.cond-warn-close'),            '.cond-warn-close CSS');

// ── B2-1: Matrix Expand Panel ─────────────────────────────────────────────────
console.log('\n▶ B2-1 Matrix Expand Panel');

assert(appJs.includes('function renderMatrixGrid('),     'renderMatrixGrid() defined');
assert(appJs.includes('function matrixToLatex('),        'matrixToLatex() defined');
assert(appJs.includes('function initMatrixExpandPanel()'), 'initMatrixExpandPanel() defined');
assert(appJs.includes('matrix-expand-content'),          'matrix-expand-content referenced');
assert(appJs.includes('matrix-block'),                   'matrix-block class');
assert(appJs.includes('matrix-grid-table'),              'matrix-grid-table class');
assert(appJs.includes('matrix-meta'),                    'matrix-meta class');
assert(appJs.includes('matrix-pd-badge'),                'matrix-pd-badge class');
assert(appJs.includes('κ₁ ='),                           'matrix panel names the 1-norm condition number');
assert(appJs.includes('N/A（非方陣）'),                  'rectangular condition number shown as unavailable');
assert(appJs.includes('正定性 N/A（非對稱）'),           'non-symmetric definiteness shown as unavailable');
assert(appJs.includes('btn-matrix-expand'),              'btn-matrix-expand referenced');
assert(appJs.includes('btn-matrix-copy-json'),           'btn-matrix-copy-json referenced');
assert(appJs.includes('btn-matrix-copy-latex'),          'btn-matrix-copy-latex referenced');
assert(appJs.includes('window._currentSS'),              '_currentSS global state used');
assert(appJs.includes('pmatrix'),                        'LaTeX pmatrix format');
assert(appJs.includes('\\\\begin{pmatrix}'),             'LaTeX begin pmatrix');

assert(indexHtml.includes('matrix-expand-panel'),        '#matrix-expand-panel in HTML');
assert(indexHtml.includes('matrix-expand-content'),      '#matrix-expand-content in HTML');
assert(indexHtml.includes('btn-matrix-expand'),          '#btn-matrix-expand in HTML');
assert(indexHtml.includes('btn-matrix-copy-json'),       '#btn-matrix-copy-json in HTML');
assert(indexHtml.includes('btn-matrix-copy-latex'),      '#btn-matrix-copy-latex in HTML');
assert(indexHtml.includes('.matrix-grid-table'),         '.matrix-grid-table CSS');
assert(indexHtml.includes('.matrix-meta'),               '.matrix-meta CSS');
assert(indexHtml.includes('.matrix-pd-badge'),           '.matrix-pd-badge CSS');
assert(indexHtml.includes('.matrix-pd-badge.pd'),        '.matrix-pd-badge.pd CSS');
assert(indexHtml.includes('.matrix-pd-badge.spd'),       '.matrix-pd-badge.spd CSS');
assert(indexHtml.includes('.matrix-pd-badge.npd'),       '.matrix-pd-badge.npd CSS');
assert(indexHtml.includes('.matrix-copy-row'),           '.matrix-copy-row CSS');
assert(indexHtml.includes('.matrix-block-header'),       '.matrix-block-header CSS');

// ── P46 init ──────────────────────────────────────────────────────────────────
console.log('\n▶ P46 DOMContentLoaded init');

assert(appJs.includes('initCalcSteps()'),           'initCalcSteps called in init');
assert(appJs.includes('initIntermediateTooltip()'), 'initIntermediateTooltip called in init');
assert(appJs.includes('initMatrixExpandPanel()'),   'initMatrixExpandPanel called in init');

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('');
console.log(`Results: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error('Failed:', errors.join(', '));
  process.exit(1);
}
console.log('✓ P46 B5/B2 Calc Steps + Matrix Expand — all checks passed');
