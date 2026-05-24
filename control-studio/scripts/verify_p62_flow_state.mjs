/**
 * verify_p62_flow_state.mjs
 *
 * Verifies P62 — Design Flow State Machine:
 *   K1-1  Five-step progress bar (flow bar)
 *   K1-2  Step completion condition logic
 *   K1-4  Kp quick recommendation
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

// ── K1-1: Flow Bar ────────────────────────────────────────────────────────────
console.log('\n▶ K1-1 Five-Step Design Flow Bar');

assert(appJs.includes('function computeFlowSteps()'),     'computeFlowSteps() defined');
assert(appJs.includes('function renderFlowBar('),         'renderFlowBar() defined');
assert(appJs.includes('function updateFlowBar()'),        'updateFlowBar() defined');
assert(appJs.includes('function initFlowBar()'),          'initFlowBar() defined');
assert(appJs.includes('initFlowBar()'),                   'initFlowBar() called in DOMContentLoaded');
// 5 steps
assert(appJs.includes("id: 'plant'"),                     "flow step 'plant' defined");
assert(appJs.includes("id: 'specs'"),                     "flow step 'specs' defined");
assert(appJs.includes("id: 'controller'"),                "flow step 'controller' defined");
assert(appJs.includes("id: 'verify'"),                    "flow step 'verify' defined");
assert(appJs.includes("id: 'export'"),                    "flow step 'export' defined");
// Statuses
assert(appJs.includes("'done'") && appJs.includes("'active'") && appJs.includes("'pending'") && appJs.includes("'warning'"),
                                                          'all 4 step statuses present');
// Collapse
assert(appJs.includes('fb-collapsed'),                    'fb-collapsed class for collapse');
assert(appJs.includes("'cs-flow-bar-collapsed'"),         'localStorage persist for collapse state');
// Hook into refreshAllCharts
assert(appJs.includes('updateFlowBar()'),                 'updateFlowBar() called in refreshAllCharts');

// HTML
assert(indexHtml.includes('id="flow-bar"'),               '#flow-bar in HTML');
assert(indexHtml.includes('id="flow-bar-steps"'),         '#flow-bar-steps in HTML');
assert(indexHtml.includes('id="flow-bar-toggle"'),        '#flow-bar-toggle button in HTML');
assert(indexHtml.includes('id="flow-bar-header"'),        '#flow-bar-header in HTML');
// CSS
assert(indexHtml.includes('#flow-bar'),                   '#flow-bar CSS defined');
assert(indexHtml.includes('.fb-step'),                    '.fb-step CSS defined');
assert(indexHtml.includes('.fb-icon'),                    '.fb-icon CSS defined');
assert(indexHtml.includes('@keyframes fb-pulse'),         'fb-pulse animation defined');

// ── K1-2: Step Completion Logic ───────────────────────────────────────────────
console.log('\n▶ K1-2 Step Completion Conditions');

assert(appJs.includes('function hasAnySpec()'),           'hasAnySpec() defined');
assert(appJs.includes('function allSpecsReasonable()'),   'allSpecsReasonable() defined');
assert(appJs.includes('function allSpecsPassing()'),      'allSpecsPassing() defined');
assert(appJs.includes('hasPlant'),                        'hasPlant condition checked');
assert(appJs.includes('hasController'),                   'hasController condition checked');
assert(appJs.includes('phaseMargin') && appJs.includes('gainMarginDb'),
                                                          'PM/GM checked in allSpecsPassing');

// ── K1-4: Kp Recommendation ───────────────────────────────────────────────────
console.log('\n▶ K1-4 Kp Quick Recommendation');

assert(appJs.includes('function recommendInitialKp('),    'recommendInitialKp() defined');
assert(appJs.includes('function updateKpRecommend()'),    'updateKpRecommend() defined');
assert(appJs.includes('function initKpRecommend()'),      'initKpRecommend() defined');
assert(appJs.includes('initKpRecommend()'),               'initKpRecommend() called in DOMContentLoaded');
assert(appJs.includes('_kpRecDismissed'),                 'dismiss flag tracked');
assert(appJs.includes("kp-rec-apply"),                    'apply button bound');
assert(appJs.includes("kp-rec-dismiss"),                  'dismiss button bound');
assert(appJs.includes('dcGain'),                          'DC gain used in recommendation');
assert(appJs.includes('updateKpRecommend()'),             'updateKpRecommend() called in refreshAllCharts');

// HTML
assert(indexHtml.includes('id="kp-recommend-card"'),      '#kp-recommend-card in HTML');
assert(indexHtml.includes('id="kp-rec-value"'),           '#kp-rec-value in HTML');
assert(indexHtml.includes('id="kp-rec-apply"'),           '#kp-rec-apply button in HTML');
assert(indexHtml.includes('id="kp-rec-dismiss"'),         '#kp-rec-dismiss button in HTML');
// CSS
assert(indexHtml.includes('#kp-recommend-card'),          '#kp-recommend-card CSS defined');

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('');
console.log(`Results: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error('Failed:', errors.join(', '));
  process.exit(1);
}
console.log('✓ P62 K1-1/K1-2/K1-4 design flow state machine — all checks passed');
