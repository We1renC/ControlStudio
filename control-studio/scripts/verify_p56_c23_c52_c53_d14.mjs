/**
 * verify_p56_c23_c52_c53_d14.mjs
 *
 * Verifies P56:
 *   C2-3  Extended common error hints panel
 *   C5-2  Chart screenshot tool
 *   C5-3  Result summary card
 *   D1-4  Code generation options panel
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
const errors = [];

function ok(label)       { console.log(`  ✓ ${label}`); pass++; }
function bad(label, msg) { console.error(`  ✗ ${label}: ${msg}`); fail++; errors.push(label); }
function assert(cond, label, msg = '') { cond ? ok(label) : bad(label, msg || 'condition failed'); }

const appJs     = readFileSync(path.join(ROOT, 'js/app.js'),  'utf8');
const indexHtml = readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// ── C2-3: Common Error Hints ──────────────────────────────────────────────────
console.log('\n▶ C2-3 Extended Common Error Hints');

assert(appJs.includes('const COMMON_ERROR_HINTS'),      'COMMON_ERROR_HINTS defined');
assert(appJs.includes('function initCommonErrorHints()'), 'initCommonErrorHints() defined');
assert(appJs.includes('common-error-hints-list'),       'common-error-hints-list referenced');
assert(appJs.includes('ceh-item'),                      'ceh-item class used in render');
assert(appJs.includes('ceh-q'),                         'ceh-q class used in render');
assert(appJs.includes('ceh-a'),                         'ceh-a class used in render');
assert(appJs.includes('ceh-search'),                    'ceh-search filter wired');
// Check we have enough hints (at least 6)
const hintCount = (appJs.match(/\{\s*q:/g) ?? []).length;
assert(hintCount >= 6, `COMMON_ERROR_HINTS has ≥6 entries (found ${hintCount})`);
// Check some key topics covered
assert(appJs.includes('NaN') || appJs.includes('Infinity'), 'NaN/Infinity hint present');
assert(appJs.includes('LQR') || appJs.includes('lqr'),      'LQR hint present');
assert(appJs.includes('MPC') || appJs.includes('mpc'),      'MPC hint present');

// HTML
assert(indexHtml.includes('common-error-hints-panel'),  '#common-error-hints-panel in HTML');
assert(indexHtml.includes('common-error-hints-list'),   '#common-error-hints-list in HTML');
assert(indexHtml.includes('ceh-search'),                '#ceh-search in HTML');
assert(indexHtml.includes('C2-3'),                      'C2-3 label in HTML');

// CSS
assert(indexHtml.includes('.ceh-item'),                 '.ceh-item CSS');
assert(indexHtml.includes('.ceh-q'),                    '.ceh-q CSS');
assert(indexHtml.includes('.ceh-a'),                    '.ceh-a CSS');
assert(indexHtml.includes('.ceh-search'),               '.ceh-search CSS');

// ── C5-2: Screenshot Tool ─────────────────────────────────────────────────────
console.log('\n▶ C5-2 Chart Screenshot Tool');

assert(appJs.includes('function initScreenshotTool()'), 'initScreenshotTool() defined');
assert(appJs.includes('btn-screenshot-capture'),        'btn-screenshot-capture referenced');
assert(appJs.includes('btn-screenshot-download'),       'btn-screenshot-download referenced');
assert(appJs.includes('screenshot-preview'),            'screenshot-preview referenced');
assert(appJs.includes('Plotly.toImage'),                'Plotly.toImage() used for capture');
assert(appJs.includes("format: 'png'"),                 "PNG format specified");
assert(appJs.includes('_capturedDataUrl'),              '_capturedDataUrl state variable');
assert(appJs.includes('ss-preview-img'),                'ss-preview-img class applied');
assert(appJs.includes('ss-msg'),                        'ss-msg class for status text');

// HTML
assert(indexHtml.includes('screenshot-tool-panel'),     '#screenshot-tool-panel in HTML');
assert(indexHtml.includes('btn-screenshot-capture'),    '#btn-screenshot-capture in HTML');
assert(indexHtml.includes('btn-screenshot-download'),   '#btn-screenshot-download in HTML');
assert(indexHtml.includes('screenshot-preview'),        '#screenshot-preview in HTML');
assert(indexHtml.includes('C5-2'),                      'C5-2 label in HTML');

// CSS
assert(indexHtml.includes('.ss-preview-wrap'),          '.ss-preview-wrap CSS');
assert(indexHtml.includes('.ss-msg'),                   '.ss-msg CSS');
assert(indexHtml.includes('.ss-preview-img'),           '.ss-preview-img CSS');

// ── C5-3: Result Summary Card ─────────────────────────────────────────────────
console.log('\n▶ C5-3 Result Summary Card');

assert(appJs.includes('function buildResultSummary()'), 'buildResultSummary() defined');
assert(appJs.includes('function refreshResultSummary()'), 'refreshResultSummary() defined');
assert(appJs.includes('function initResultSummaryCard()'), 'initResultSummaryCard() defined');
assert(appJs.includes('btn-result-summary-refresh'),    'btn-result-summary-refresh referenced');
assert(appJs.includes('btn-result-summary-copy'),       'btn-result-summary-copy referenced');
assert(appJs.includes('result-summary-rows'),           'result-summary-rows referenced');
assert(appJs.includes('rs-row'),                        'rs-row class rendered');
assert(appJs.includes('rs-label'),                      'rs-label class rendered');
assert(appJs.includes('rs-value'),                      'rs-value class rendered');
assert(appJs.includes('simulation:done'),               'simulation:done event listener');
assert(appJs.includes('window.refreshResultSummary'),   'refreshResultSummary exposed globally');
assert(appJs.includes('Gain Margin'),                   'Gain Margin in summary rows');
assert(appJs.includes('Phase Margin'),                  'Phase Margin in summary rows');

// HTML
assert(indexHtml.includes('result-summary-panel'),      '#result-summary-panel in HTML');
assert(indexHtml.includes('btn-result-summary-refresh'), '#btn-result-summary-refresh in HTML');
assert(indexHtml.includes('btn-result-summary-copy'),   '#btn-result-summary-copy in HTML');
assert(indexHtml.includes('result-summary-rows'),       '#result-summary-rows in HTML');
assert(indexHtml.includes('C5-3'),                      'C5-3 label in HTML');

// CSS
assert(indexHtml.includes('.result-summary-card'),      '.result-summary-card CSS');
assert(indexHtml.includes('.rs-row'),                   '.rs-row CSS');
assert(indexHtml.includes('.rs-label'),                 '.rs-label CSS');
assert(indexHtml.includes('.rs-value'),                 '.rs-value CSS');
assert(indexHtml.includes('.rs-empty'),                 '.rs-empty CSS');
assert(indexHtml.includes('.rs-toolbar'),               '.rs-toolbar CSS');

// ── D1-4: Code Generation Options ────────────────────────────────────────────
console.log('\n▶ D1-4 Code Generation Options');

assert(appJs.includes('const CODEGEN_OPTIONS_KEY'),     'CODEGEN_OPTIONS_KEY defined');
assert(appJs.includes('function getCodegenOptions()'),  'getCodegenOptions() defined');
assert(appJs.includes('function saveCodegenOptions('),  'saveCodegenOptions() defined');
assert(appJs.includes('function initCodegenOptions()'), 'initCodegenOptions() defined');
assert(appJs.includes('codegen-options-panel'),         'codegen-options-panel referenced');
assert(appJs.includes('codegen-options-list'),          'codegen-options-list referenced');
assert(appJs.includes('codegen-opt-cb'),                'codegen-opt-cb class used');
assert(appJs.includes('codegen-opt-row'),               'codegen-opt-row class rendered');
assert(appJs.includes("'comments'"),                    'comments option');
assert(appJs.includes("'validation'"),                  'validation option');
assert(appJs.includes("'plots'"),                       'plots option');
assert(appJs.includes('window.getCodegenOptions'),      'getCodegenOptions exposed globally');
assert(appJs.includes('localStorage.getItem(CODEGEN_OPTIONS_KEY)'), 'options persisted in localStorage');

// HTML
assert(indexHtml.includes('codegen-options-panel'),     '#codegen-options-panel in HTML');
assert(indexHtml.includes('codegen-options-list'),      '#codegen-options-list in HTML');
assert(indexHtml.includes('D1-4'),                      'D1-4 label in HTML');

// CSS
assert(indexHtml.includes('.codegen-opt-row'),          '.codegen-opt-row CSS');
assert(indexHtml.includes('.codegen-opt-cb'),           '.codegen-opt-cb CSS');
assert(indexHtml.includes('#codegen-options-list'),     '#codegen-options-list CSS');

// ── P56 init calls ────────────────────────────────────────────────────────────
console.log('\n▶ P56 DOMContentLoaded init');

assert(appJs.includes('initCommonErrorHints()'),  'initCommonErrorHints called');
assert(appJs.includes('initScreenshotTool()'),    'initScreenshotTool called');
assert(appJs.includes('initResultSummaryCard()'), 'initResultSummaryCard called');
assert(appJs.includes('initCodegenOptions()'),    'initCodegenOptions called');

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('');
console.log(`Results: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error('Failed:', errors.join(', '));
  process.exit(1);
}
console.log('✓ P56 C2-3/C5-2/C5-3/D1-4 error hints / screenshot / summary / codegen opts — all checks passed');
