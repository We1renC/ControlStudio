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
assert(appJs.includes("cond(Wc)"),                         'cond(Wc) shown in summary');
assert(appJs.includes("cond(Wo)"),                         'cond(Wo) shown in summary');

// HTML
assert(indexHtml.includes('gramian-detail-panel'),         '#gramian-detail-panel in HTML');
assert(indexHtml.includes('btn-gramian-detail'),           '#btn-gramian-detail in HTML');
assert(indexHtml.includes('gramian-detail-wrap'),          '#gramian-detail-wrap in HTML');
assert(indexHtml.includes('B2-4'),                         'B2-4 label in HTML');

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
