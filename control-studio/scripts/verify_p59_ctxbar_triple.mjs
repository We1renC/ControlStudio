/**
 * verify_p59_ctxbar_triple.mjs
 *
 * Verifies P59 — F1-2 Context Bar / view-nav / A5-1 Triple Pane
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

// ── F1-2: View nav (Dashboard ↔ Block Diagram) ────────────────────────────────
console.log('\n▶ F1-2 View Nav (Dashboard ↔ Block Diagram)');

assert(indexHtml.includes('id="view-dashboard"'),     '#view-dashboard button in HTML');
assert(indexHtml.includes('id="view-editor"'),        '#view-editor button in HTML');
assert(indexHtml.includes('class="view-nav"'),        '.view-nav container in HTML');
assert(indexHtml.includes('.view-nav {'),             '.view-nav CSS defined');
assert(indexHtml.includes('.view-nav-btn'),           '.view-nav-btn CSS defined');
assert(indexHtml.includes('.view-nav-btn.active'),    '.view-nav-btn.active CSS defined');
assert(appJs.includes("getElementById('view-dashboard')"), 'view-dashboard referenced in JS');
assert(appJs.includes("getElementById('view-editor')"),    'view-editor referenced in JS');

// ── F1-2: Context Bar ─────────────────────────────────────────────────────────
console.log('\n▶ F1-2 Context Bar');

assert(appJs.includes('function updateContextBar()'),   'updateContextBar() function defined');
assert(appJs.includes('window.updateContextBar'),       'updateContextBar exposed globally');
assert(appJs.includes("'ctx-sys-name'"),                'ctx-sys-name element referenced');
assert(appJs.includes("'ctx-ctrl-chip'"),               'ctx-ctrl-chip element referenced');
assert(appJs.includes("'ctx-spec-status'"),             'ctx-spec-status element referenced');
assert(appJs.includes('updateContextBar?.()'),          'updateContextBar called from refreshAllCharts');

assert(indexHtml.includes('id="ctx-bar"'),              '#ctx-bar in HTML');
assert(indexHtml.includes('id="ctx-sys-name"'),         '#ctx-sys-name in HTML');
assert(indexHtml.includes('id="ctx-ctrl-chip"'),        '#ctx-ctrl-chip in HTML');
assert(indexHtml.includes('id="ctx-spec-status"'),      '#ctx-spec-status in HTML');
assert(indexHtml.includes('.ctx-bar {'),                '.ctx-bar CSS defined');
assert(indexHtml.includes('.ctx-sys {'),                '.ctx-sys CSS defined');
assert(indexHtml.includes('.ctx-chip {'),               '.ctx-chip CSS defined');
assert(indexHtml.includes('.ctx-spec.pass'),            '.ctx-spec.pass CSS defined');
assert(indexHtml.includes('.ctx-spec.fail'),            '.ctx-spec.fail CSS defined');

// ── A5-1: Triple Pane — intentionally removed ────────────────────────────────
console.log('\n▶ A5-1 Triple Pane (removed — single chart-active layout)');

assert(!indexHtml.includes('id="btn-triple-pane"'),      '#btn-triple-pane removed from HTML');
assert(!indexHtml.includes('id="triple-pane-view"'),     '#triple-pane-view removed from HTML');
assert(!indexHtml.includes('id="chart-triple-step"'),    '#chart-triple-step removed from HTML');
assert(!indexHtml.includes('id="chart-triple-bode"'),    '#chart-triple-bode removed from HTML');
assert(!indexHtml.includes('id="chart-triple-nyquist"'), '#chart-triple-nyquist removed from HTML');
assert(!indexHtml.includes('.triple-pane-grid {'),       '.triple-pane-grid CSS removed');
assert(!indexHtml.includes('.triple-pane-cell {'),       '.triple-pane-cell CSS removed');
assert(!appJs.includes('window.refreshTriplePane'),      'refreshTriplePane removed from JS');

// ── P59 init ──────────────────────────────────────────────────────────────────
console.log('\n▶ P59 DOMContentLoaded init');

assert(!appJs.includes('initTriplePane()'),  'initTriplePane not called in init (removed)');
assert(appJs.includes('updateContextBar()'), 'updateContextBar called in init');

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('');
console.log(`Results: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error('Failed:', errors.join(', '));
  process.exit(1);
}
console.log('✓ P59 F1-2 Context Bar / view-nav / A5-1 Triple Pane — all checks passed');
