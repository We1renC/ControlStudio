/**
 * verify_p54_a4.mjs
 *
 * Verifies P54:
 *   A4-1  designWizard full integration (panel navigation on step change)
 *   A4-2  Method complexity labels (METHOD_COMPLEXITY map + badge rendering)
 *   A4-3  Recommendation explanation panel (WHY_EXPLAIN + showRecommendExplain)
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

// ── A4-1: designWizard full integration ───────────────────────────────────────
console.log('\n▶ A4-1 designWizard Full Integration');

assert(appJs.includes('WIZARD_STEP_PANELS'),             'WIZARD_STEP_PANELS defined');
assert(appJs.includes('WIZARD_STEP_SCROLL'),             'WIZARD_STEP_SCROLL defined for focus targets');
assert(appJs.includes("switchSidebarPanel(panelName)"),  'switchSidebarPanel called on step change');
assert(appJs.includes("wizard:step"),                    'wizard:step custom event dispatched');
// P60: WIZARD_STEP_PANELS updated to new workflow tab names (identify/design/analyse)
assert(appJs.includes("'identify'") && appJs.includes('WIZARD_STEP_PANELS'),
                                                          'identify in WIZARD_STEP_PANELS (P60 update)');
assert(appJs.includes('scrollIntoView'),                 'scrollIntoView used for spec focus');
assert(appJs.includes("dispatchEvent") && appJs.includes("CustomEvent"),
                                                          'CustomEvent dispatched for integration hooks');

// ── A4-2: Method Complexity Labels ────────────────────────────────────────────
console.log('\n▶ A4-2 Method Complexity Labels');

assert(appJs.includes('const METHOD_COMPLEXITY'),         'METHOD_COMPLEXITY defined');
assert(appJs.includes('function initMethodComplexityLabels()'), 'initMethodComplexityLabels() defined');
assert(appJs.includes("pid:"),                            'pid entry in METHOD_COMPLEXITY');
assert(appJs.includes("lead:"),                           'lead entry in METHOD_COMPLEXITY');
assert(appJs.includes("lqr:"),                            'lqr entry in METHOD_COMPLEXITY');
assert(appJs.includes("mpc:"),                            'mpc entry in METHOD_COMPLEXITY');
assert(appJs.includes("hinf:"),                           'hinf entry in METHOD_COMPLEXITY');
assert(appJs.includes("adaptive:"),                       'adaptive entry in METHOD_COMPLEXITY');
assert(appJs.includes("'method-complexity-badge'"),       'method-complexity-badge class applied');
assert(appJs.includes('mcb-stars'),                       'mcb-stars span rendered');
assert(appJs.includes('mcb-label'),                       'mcb-label span rendered');
assert(appJs.includes('window.METHOD_COMPLEXITY'),        'METHOD_COMPLEXITY exposed globally');

// CSS classes
assert(indexHtml.includes('.method-complexity-badge'),    '.method-complexity-badge CSS');
assert(indexHtml.includes('.mcb-stars'),                  '.mcb-stars CSS');
assert(indexHtml.includes('.mcb-label'),                  '.mcb-label CSS');

// ── A4-3: Recommendation Explanation Panel ────────────────────────────────────
console.log('\n▶ A4-3 Recommendation Explanation Panel');

assert(appJs.includes('const WHY_EXPLAIN'),               'WHY_EXPLAIN defined');
assert(appJs.includes('function showRecommendExplain('),  'showRecommendExplain() defined');
assert(appJs.includes('function initRecommendExplain()'), 'initRecommendExplain() defined');
assert(appJs.includes("'recommend-explain-panel'"),       'recommend-explain-panel referenced');
assert(appJs.includes('rec-explain-header'),              'rec-explain-header rendered');
assert(appJs.includes('rec-explain-title'),               'rec-explain-title rendered');
assert(appJs.includes('rec-explain-close'),               'rec-explain-close button rendered');
assert(appJs.includes('rec-explain-body'),                'rec-explain-body rendered');
assert(appJs.includes('when_good'),                       'when_good field in WHY_EXPLAIN');
assert(appJs.includes('caution'),                         'caution field in WHY_EXPLAIN');
// Verify all 8 methods covered
const whyMethods = ['pid', 'lead', 'lag', 'leadlag', 'lqr', 'mpc', 'hinf', 'adaptive'];
whyMethods.forEach(m => {
  assert(appJs.includes(`WHY_EXPLAIN`) && appJs.match(new RegExp(`  ${m}:\\s*\\{`)),
         `WHY_EXPLAIN.${m} entry defined`);
});
assert(appJs.includes('window.showRecommendExplain'),     'showRecommendExplain exposed globally');
assert(appJs.includes('[data-rec-explain]'),              'data-rec-explain delegation handler');
assert(appJs.includes("wizard:step"),                     'wizard:step listener in initRecommendExplain');

// HTML
assert(indexHtml.includes('recommend-explain-panel'),     '#recommend-explain-panel in HTML');
assert(indexHtml.includes('aria-live="polite"'),          'aria-live for dynamic content');

// CSS
assert(indexHtml.includes('#recommend-explain-panel'),    '#recommend-explain-panel CSS');
assert(indexHtml.includes('.rec-explain-header'),         '.rec-explain-header CSS');
assert(indexHtml.includes('.rec-explain-title'),          '.rec-explain-title CSS');
assert(indexHtml.includes('.rec-explain-body'),           '.rec-explain-body CSS');
assert(indexHtml.includes('.rec-explain-row'),            '.rec-explain-row CSS');
assert(indexHtml.includes('.rec-explain-label'),          '.rec-explain-label CSS');
assert(indexHtml.includes('.rec-caution'),                '.rec-caution CSS');

// ── P54 init calls ────────────────────────────────────────────────────────────
console.log('\n▶ P54 DOMContentLoaded init');

assert(appJs.includes('initMethodComplexityLabels()'),   'initMethodComplexityLabels called');
assert(appJs.includes('initRecommendExplain()'),         'initRecommendExplain called');

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('');
console.log(`Results: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error('Failed:', errors.join(', '));
  process.exit(1);
}
console.log('✓ P54 A4-1/A4-2/A4-3 wizard integration / complexity labels / explain panel — all checks passed');
