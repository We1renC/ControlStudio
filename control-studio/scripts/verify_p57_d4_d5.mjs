/**
 * verify_p57_d4_d5.mjs
 *
 * Verifies P57:
 *   D4-1  Unit test template generator (pytest / Jest)
 *   D4-2  MATLAB ↔ Python diff mode panel
 *   D4-3  HIL CSV export
 *   D5-1  Init docs generator
 *   D5-2  Wiring diagram (SVG block diagram)
 *   D5-3  Design warnings panel
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

// ── D4-1: Unit Test Templates ─────────────────────────────────────────────────
console.log('\n▶ D4-1 Unit Test Templates');

assert(appJs.includes('function buildUnitTestTemplate('), 'buildUnitTestTemplate() defined');
assert(appJs.includes('function initUnitTestPanel()'),    'initUnitTestPanel() defined');
assert(appJs.includes('unit-test-lang'),                  'unit-test-lang selector referenced');
assert(appJs.includes('unit-test-code'),                  'unit-test-code element referenced');
assert(appJs.includes('btn-unit-test-copy'),              'btn-unit-test-copy referenced');
assert(appJs.includes('btn-unit-test-download'),          'btn-unit-test-download referenced');
assert(appJs.includes("'jest'"),                          'jest lang option handled');
assert(appJs.includes("'python'"),                        'python lang option handled');
assert(appJs.includes('import pytest') || appJs.includes('import control as ct'), 'pytest/python-control code in template');
assert(appJs.includes('describe(') || appJs.includes('test('),  'jest test structure in template');
assert(appJs.includes('window.buildUnitTestTemplate'),    'buildUnitTestTemplate exposed globally');

// HTML
assert(indexHtml.includes('unit-test-panel'),             '#unit-test-panel in HTML');
assert(indexHtml.includes('unit-test-lang'),              '#unit-test-lang in HTML');
assert(indexHtml.includes('unit-test-code'),              '#unit-test-code in HTML');
assert(indexHtml.includes('btn-unit-test-copy'),          '#btn-unit-test-copy in HTML');
assert(indexHtml.includes('btn-unit-test-download'),      '#btn-unit-test-download in HTML');
assert(indexHtml.includes('D4-1'),                        'D4-1 label in HTML');

// CSS
assert(indexHtml.includes('.unit-test-toolbar'),          '.unit-test-toolbar CSS');
assert(indexHtml.includes('.unit-test-code'),             '.unit-test-code CSS');

// ── D4-2: Code Diff Mode ──────────────────────────────────────────────────────
console.log('\n▶ D4-2 MATLAB ↔ Python Diff Mode');

assert(appJs.includes('function renderCodeDiff()'),       'renderCodeDiff() defined');
assert(appJs.includes('function initCodeDiff()'),         'initCodeDiff() defined');
assert(appJs.includes('diff-matlab-col'),                 'diff-matlab-col referenced');
assert(appJs.includes('diff-python-col'),                 'diff-python-col referenced');
assert(appJs.includes('btn-code-diff-refresh'),           'btn-code-diff-refresh referenced');
assert(appJs.includes('toMatlabScript'),                  'toMatlabScript called in diff');
assert(appJs.includes('toPythonScript'),                  'toPythonScript called in diff');

// HTML
assert(indexHtml.includes('code-diff-panel'),             '#code-diff-panel in HTML');
assert(indexHtml.includes('diff-matlab-col'),             '#diff-matlab-col in HTML');
assert(indexHtml.includes('diff-python-col'),             '#diff-python-col in HTML');
assert(indexHtml.includes('btn-code-diff-refresh'),       '#btn-code-diff-refresh in HTML');
assert(indexHtml.includes('D4-2'),                        'D4-2 label in HTML');

// CSS
assert(indexHtml.includes('.code-diff-grid'),             '.code-diff-grid CSS');
assert(indexHtml.includes('.code-diff-col'),              '.code-diff-col CSS');
assert(indexHtml.includes('.code-diff-pre'),              '.code-diff-pre CSS');
assert(indexHtml.includes('.code-diff-label'),            '.code-diff-label CSS');

// ── D4-3: HIL CSV Export ──────────────────────────────────────────────────────
console.log('\n▶ D4-3 HIL CSV Export');

assert(appJs.includes('function exportHILCSV()'),         'exportHILCSV() defined');
assert(appJs.includes('function initHILExport()'),        'initHILExport() defined');
assert(appJs.includes('btn-hil-export'),                  'btn-hil-export referenced');
assert(appJs.includes('HIL CSV'),                         'HIL CSV label in generated code');
assert(appJs.includes('SampleRate_Hz'),                   'SampleRate_Hz metadata header');
assert(appJs.includes('time_s,input_u,output_y'),         'CSV column headers');
assert(appJs.includes("hil-data-"),                       'hil-data- download filename');
assert(appJs.includes('window.exportHILCSV'),             'exportHILCSV exposed globally');

// HTML
assert(indexHtml.includes('hil-export-panel'),            '#hil-export-panel in HTML');
assert(indexHtml.includes('btn-hil-export'),              '#btn-hil-export in HTML');
assert(indexHtml.includes('D4-3'),                        'D4-3 label in HTML');

// CSS
assert(indexHtml.includes('.hil-export-info'),            '.hil-export-info CSS');

// ── D5-1: Init Docs Generator ─────────────────────────────────────────────────
console.log('\n▶ D5-1 Init Docs Generator');

assert(appJs.includes('function buildInitDocs()'),        'buildInitDocs() defined');
assert(appJs.includes('function initInitDocs()'),         'initInitDocs() defined');
assert(appJs.includes('init-docs-code'),                  'init-docs-code referenced');
assert(appJs.includes('btn-init-docs-copy'),              'btn-init-docs-copy referenced');
assert(appJs.includes('btn-init-docs-download'),          'btn-init-docs-download referenced');
assert(appJs.includes('Prerequisites'),                   'Prerequisites section in docs');
assert(appJs.includes('INIT.md'),                         'INIT.md download filename');
assert(appJs.includes('window.buildInitDocs'),            'buildInitDocs exposed globally');

// HTML
assert(indexHtml.includes('init-docs-panel'),             '#init-docs-panel in HTML');
assert(indexHtml.includes('init-docs-code'),              '#init-docs-code in HTML');
assert(indexHtml.includes('btn-init-docs-copy'),          '#btn-init-docs-copy in HTML');
assert(indexHtml.includes('btn-init-docs-download'),      '#btn-init-docs-download in HTML');
assert(indexHtml.includes('D5-1'),                        'D5-1 label in HTML');

// CSS
assert(indexHtml.includes('.init-docs-code'),             '.init-docs-code CSS');
assert(indexHtml.includes('.init-docs-toolbar'),          '.init-docs-toolbar CSS');

// ── D5-2: Wiring Diagram ──────────────────────────────────────────────────────
console.log('\n▶ D5-2 Wiring Diagram');

assert(appJs.includes('function renderWiringDiagram()'),  'renderWiringDiagram() defined');
assert(appJs.includes('function initWiringDiagram()'),    'initWiringDiagram() defined');
assert(appJs.includes('wiring-diagram-svg'),              'wiring-diagram-svg referenced');
assert(appJs.includes('<svg'),                            'SVG generated');
assert(appJs.includes('wiring-svg'),                      'wiring-svg class on SVG');
assert(appJs.includes('K('),                              'K(s)/K(z) block in diagram');
assert(appJs.includes('G('),                              'G(s)/G(z) block in diagram');
assert(appJs.includes('marker-end'),                      'arrow markers in SVG');
assert(appJs.includes('window.renderWiringDiagram'),      'renderWiringDiagram exposed globally');

// HTML
assert(indexHtml.includes('wiring-diagram-panel'),        '#wiring-diagram-panel in HTML');
assert(indexHtml.includes('wiring-diagram-svg'),          '#wiring-diagram-svg in HTML');
assert(indexHtml.includes('D5-2'),                        'D5-2 label in HTML');

// CSS
assert(indexHtml.includes('.wiring-svg'),                 '.wiring-svg CSS');

// ── D5-3: Design Warnings Panel ───────────────────────────────────────────────
console.log('\n▶ D5-3 Design Warnings Panel');

assert(appJs.includes('function collectDesignWarnings()'), 'collectDesignWarnings() defined');
assert(appJs.includes('function refreshWarningsPanel()'), 'refreshWarningsPanel() defined');
assert(appJs.includes('function initWarningsPanel()'),    'initWarningsPanel() defined');
assert(appJs.includes('warnings-panel-list'),             'warnings-panel-list referenced');
assert(appJs.includes('warnings-badge'),                  'warnings-badge referenced');
assert(appJs.includes('btn-warnings-refresh'),            'btn-warnings-refresh referenced');
assert(appJs.includes('warning-row'),                     'warning-row class rendered');
assert(appJs.includes('warn-icon'),                       'warn-icon span rendered');
assert(appJs.includes('warn-msg'),                        'warn-msg span rendered');
assert(appJs.includes("level: 'error'"),                  "error level used");
assert(appJs.includes("level: 'warn'"),                   "warn level used");
assert(appJs.includes("level: 'ok'"),                     "ok level used");
assert(appJs.includes('Phase Margin') || appJs.includes('phaseMargin'), 'phase margin check');
assert(appJs.includes('window.collectDesignWarnings'),    'collectDesignWarnings exposed globally');
assert(appJs.includes('window.refreshWarningsPanel'),     'refreshWarningsPanel exposed globally');

// HTML
assert(indexHtml.includes('warnings-panel'),              '#warnings-panel in HTML');
assert(indexHtml.includes('warnings-panel-list'),         '#warnings-panel-list in HTML');
assert(indexHtml.includes('warnings-badge'),              '#warnings-badge in HTML');
assert(indexHtml.includes('btn-warnings-refresh'),        '#btn-warnings-refresh in HTML');
assert(indexHtml.includes('D5-3'),                        'D5-3 label in HTML');

// CSS
assert(indexHtml.includes('.warning-row'),                '.warning-row CSS');
assert(indexHtml.includes('.warning-row-error'),          '.warning-row-error CSS');
assert(indexHtml.includes('.warning-row-warn'),           '.warning-row-warn CSS');
assert(indexHtml.includes('.warning-row-ok'),             '.warning-row-ok CSS');
assert(indexHtml.includes('.warn-icon'),                  '.warn-icon CSS');
assert(indexHtml.includes('.warn-msg'),                   '.warn-msg CSS');
assert(indexHtml.includes('.warnings-badge'),             '.warnings-badge CSS');
assert(indexHtml.includes('.badge-error'),                '.badge-error CSS');
assert(indexHtml.includes('.badge-warn'),                 '.badge-warn CSS');

// ── P57 init calls ────────────────────────────────────────────────────────────
console.log('\n▶ P57 DOMContentLoaded init');

assert(appJs.includes('initUnitTestPanel()'),   'initUnitTestPanel called');
assert(appJs.includes('initCodeDiff()'),        'initCodeDiff called');
assert(appJs.includes('initHILExport()'),       'initHILExport called');
assert(appJs.includes('initInitDocs()'),        'initInitDocs called');
assert(appJs.includes('initWiringDiagram()'),   'initWiringDiagram called');
assert(appJs.includes('initWarningsPanel()'),   'initWarningsPanel called');

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('');
console.log(`Results: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error('Failed:', errors.join(', '));
  process.exit(1);
}
console.log('✓ P57 D4-1/D4-2/D4-3/D5-1/D5-2/D5-3 — all checks passed');
