/**
 * verify_p53_a1234.mjs
 *
 * Verifies P53:
 *   A1-2  SysID Entry panel (drop-zone, methods, run, accept, residuals)
 *   A1-3  Example Library (8 examples, search, tabs, cards)
 *   A1-4  Model Health Badge + popover
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

// ── A1-2: SysID Entry ─────────────────────────────────────────────────────────
console.log('\n▶ A1-2 SysID Entry Panel');

// JS functions
assert(appJs.includes('function _parseSysIDCSV('),   '_parseSysIDCSV() defined');
assert(appJs.includes('function _computeFitPercent('), '_computeFitPercent() defined');
assert(appJs.includes('function _renderSysIDResidual('), '_renderSysIDResidual() defined');
assert(appJs.includes('function initSysIDEntry()'),   'initSysIDEntry() defined');
assert(appJs.includes('_sysidMethod'),                '_sysidMethod state variable');
assert(appJs.includes('_sysidData'),                  '_sysidData state variable');
assert(appJs.includes('_sysidModel'),                 '_sysidModel state variable');
assert(appJs.includes('btn-sysid-run'),               'btn-sysid-run referenced');
assert(appJs.includes('btn-sysid-auto'),              'btn-sysid-auto referenced');
assert(appJs.includes('btn-sysid-accept'),            'btn-sysid-accept referenced');
assert(appJs.includes('sysid-drop-zone'),             'sysid-drop-zone referenced');
assert(appJs.includes('sysid-residual-chart'),        'sysid-residual-chart referenced');
assert(appJs.includes("dataset.method"),              'method selector uses dataset.method');
assert(appJs.includes('identifyARX') || appJs.includes('autoARXOrder'), 'uses ARX identification');

// HTML structure
assert(indexHtml.includes('sysid-entry-panel'),       '#sysid-entry-panel in HTML');
assert(indexHtml.includes('sysid-drop-zone'),         '#sysid-drop-zone in HTML');
assert(indexHtml.includes('btn-sysid-run'),           '#btn-sysid-run in HTML');
assert(indexHtml.includes('btn-sysid-auto'),          '#btn-sysid-auto in HTML');
assert(indexHtml.includes('btn-sysid-accept'),        '#btn-sysid-accept in HTML');
assert(indexHtml.includes('sysid-residual-chart'),    '#sysid-residual-chart in HTML');
assert(indexHtml.includes('data-method="arx"'),       'ARX method button in HTML');
assert(indexHtml.includes('data-method="armax"'),     'ARMAX method button in HTML');
assert(indexHtml.includes('data-method="oe"'),        'OE method button in HTML');
assert(indexHtml.includes('data-method="n4sid"'),     'N4SID method button in HTML');

// CSS classes
assert(indexHtml.includes('.sysid-drop-zone'),        '.sysid-drop-zone CSS');
assert(indexHtml.includes('.sysid-drop-zone.drag-over'), '.sysid-drop-zone.drag-over CSS');
assert(indexHtml.includes('.sysid-method-btn'),       '.sysid-method-btn CSS');
assert(indexHtml.includes('.sysid-method-btn.active'), '.sysid-method-btn.active CSS');
assert(indexHtml.includes('.sysid-fit-badge'),        '.sysid-fit-badge CSS');
assert(indexHtml.includes('.sysid-residual-wrap'),    '.sysid-residual-wrap CSS');

// ── A1-3: Example Library ─────────────────────────────────────────────────────
console.log('\n▶ A1-3 Example Library');

// JS functions & data
assert(appJs.includes('const EXAMPLE_LIBRARY'),       'EXAMPLE_LIBRARY defined');
assert(appJs.includes('function _renderExampleCards()'), '_renderExampleCards() defined');
assert(appJs.includes('function initExampleLibrary()'), 'initExampleLibrary() defined');
assert(appJs.includes("'dc_motor'") || appJs.includes('"dc_motor"'), 'dc_motor example');
assert(appJs.includes("'mass_spring'") || appJs.includes('"mass_spring"'), 'mass_spring example');
assert(appJs.includes("'double_integrator'") || appJs.includes('"double_integrator"'), 'double_integrator example');
assert(appJs.includes("'inverted_pendulum'") || appJs.includes('"inverted_pendulum"'), 'inverted_pendulum example');
assert(appJs.includes("'heat_exchanger'") || appJs.includes('"heat_exchanger"'), 'heat_exchanger example');
assert(appJs.includes("'flexible_arm'") || appJs.includes('"flexible_arm"'), 'flexible_arm example');
assert(appJs.includes("'first_order'") || appJs.includes('"first_order"'), 'first_order example');
assert(appJs.includes("'unstable_sys'") || appJs.includes('"unstable_sys"'), 'unstable_sys example');
// 8 examples total
const exLibMatch = appJs.match(/const EXAMPLE_LIBRARY\s*=\s*\[[\s\S]*?\n\];/);
assert(exLibMatch !== null, 'EXAMPLE_LIBRARY is an array');
const idCount = (appJs.match(/\bid:\s*['"][a-z_]+['"]/g) ?? []).length;
assert(idCount >= 8, `EXAMPLE_LIBRARY has ≥8 examples (found ${idCount})`);
// Category system
assert(appJs.includes("cat:'classic'") || appJs.includes('cat:"classic"') || appJs.includes("cat: 'classic'") || appJs.includes('cat: "classic"'), 'classic category used');
assert(appJs.includes("cat:'academic'") || appJs.includes('cat:"academic"') || appJs.includes("cat: 'academic'") || appJs.includes('cat: "academic"'), 'academic category used');
assert(appJs.includes("cat:'industry'") || appJs.includes('cat:"industry"') || appJs.includes("cat: 'industry'") || appJs.includes('cat: "industry"'), 'industry category used');
assert(appJs.includes('_exampleLibCat'),               '_exampleLibCat state variable');
assert(appJs.includes('_exampleLibSearch'),            '_exampleLibSearch state variable');
assert(appJs.includes('example-lib-search'),           'example-lib-search referenced');
assert(appJs.includes('example-lib-tabs'),             'example-lib-tabs referenced');
assert(appJs.includes('example-card-list'),            'example-card-list referenced');
assert(appJs.includes('data-load-ex') || appJs.includes('data-cat') || appJs.includes('dataset.loadEx') || appJs.includes('dataset.cat'), 'data attributes used for load/filter');

// HTML
assert(indexHtml.includes('example-library-panel'),   '#example-library-panel in HTML');
assert(indexHtml.includes('example-lib-search'),      '#example-lib-search in HTML');
assert(indexHtml.includes('example-lib-tabs'),        '#example-lib-tabs in HTML');
assert(indexHtml.includes('example-card-list'),       '#example-card-list in HTML');
assert(indexHtml.includes('data-cat="all"'),          'all-category tab in HTML');

// CSS
assert(indexHtml.includes('.example-lib-search'),     '.example-lib-search CSS');
assert(indexHtml.includes('.example-lib-tabs'),       '.example-lib-tabs CSS');
assert(indexHtml.includes('.example-lib-tab'),        '.example-lib-tab CSS');
assert(indexHtml.includes('.example-lib-tab.active'), '.example-lib-tab.active CSS');
assert(indexHtml.includes('.example-card-list'),      '.example-card-list CSS');
assert(indexHtml.includes('.example-card'),           '.example-card CSS');
assert(indexHtml.includes('.example-card-header'),    '.example-card-header CSS');
assert(indexHtml.includes('.example-card-body'),      '.example-card-body CSS');
assert(indexHtml.includes('.example-card.open'),      '.example-card.open CSS');
assert(indexHtml.includes('.example-card-math'),      '.example-card-math CSS');

// ── A1-4: Model Health Badge ──────────────────────────────────────────────────
console.log('\n▶ A1-4 Model Health Badge');

// JS
assert(appJs.includes('function computeModelHealth()'), 'computeModelHealth() defined');
assert(appJs.includes('function updateHealthBadge()'),  'updateHealthBadge() defined');
assert(appJs.includes('function initHealthBadge()'),    'initHealthBadge() defined');
assert(appJs.includes('health-badge-btn'),              'health-badge-btn referenced');
assert(appJs.includes('health-popover'),                'health-popover referenced');
assert(appJs.includes('health-popover-rows'),           'health-popover-rows referenced');
assert(appJs.includes('health-badge-btn healthy'),      "healthy class applied");
assert(appJs.includes("'warn'"),                        "warn class used");
assert(appJs.includes("'error'") || appJs.includes('"error"'), "error class used");
assert(appJs.includes("'idle'") || appJs.includes('"idle"'),   "idle class used");

// HTML
assert(indexHtml.includes('health-badge-btn'),         '#health-badge-btn in HTML');
assert(indexHtml.includes('health-popover'),           '#health-popover in HTML');
assert(indexHtml.includes('health-popover-rows'),      '#health-popover-rows in HTML');
assert(indexHtml.includes('health-popover-close'),     '#health-popover-close button in HTML');
assert(indexHtml.includes('health-popover-title'),     '#health-popover-title in HTML');

// CSS
assert(indexHtml.includes('.health-badge-btn'),        '.health-badge-btn CSS');
assert(indexHtml.includes('.health-badge-btn.healthy'), '.health-badge-btn.healthy CSS');
assert(indexHtml.includes('.health-badge-btn.warn'),   '.health-badge-btn.warn CSS');
assert(indexHtml.includes('.health-badge-btn.error'),  '.health-badge-btn.error CSS');
assert(indexHtml.includes('.health-badge-btn.idle'),   '.health-badge-btn.idle CSS');
assert(indexHtml.includes('.health-popover'),          '.health-popover CSS');
assert(indexHtml.includes('.health-popover.open'),     '.health-popover.open CSS');
assert(indexHtml.includes('.health-popover-title'),    '.health-popover-title CSS');

// ── P53 init calls ────────────────────────────────────────────────────────────
console.log('\n▶ P53 DOMContentLoaded init');

assert(appJs.includes('initSysIDEntry()'),    'initSysIDEntry called');
assert(appJs.includes('initExampleLibrary()'), 'initExampleLibrary called');
assert(appJs.includes('initHealthBadge()'),   'initHealthBadge called');

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('');
console.log(`Results: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error('Failed:', errors.join(', '));
  process.exit(1);
}
console.log('✓ P53 A1-2/A1-3/A1-4 SysID / Example Library / Health Badge — all checks passed');
