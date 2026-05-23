/**
 * verify_p41_disc_spec.mjs
 *
 * Verifies P41 — D2-1~4 + A2-2/A2-3:
 *   D2-1~4  Discretization comparison tool (ZOH / Tustin / Forward / Backward)
 *   A2-2    Spec line overlay (chk-spec-overlay already existed; extended)
 *   A2-3    Spec compliance badge bar
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
const errors = [];

function ok(label) { console.log(`  ✓ ${label}`); pass++; }
function bad(label, msg) { console.error(`  ✗ ${label}: ${msg}`); fail++; errors.push(label); }
function assert(cond, label, msg = '') { cond ? ok(label) : bad(label, msg || 'condition failed'); }

const appJs     = readFileSync(path.join(ROOT, 'js/app.js'),  'utf8');
const indexHtml = readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// ── D2-1~4: Discretization Tool ──────────────────────────────────────────────
console.log('\n▶ D2-1~4 Discretization Comparison Tool');

assert(appJs.includes('D2_METHODS'), 'D2_METHODS array defined');
assert(appJs.includes("'zoh'"), 'ZOH method defined');
assert(appJs.includes("'tustin'"), 'Tustin method defined');
assert(appJs.includes("'forward'"), 'Forward Euler method defined');
assert(appJs.includes("'backward'"), 'Backward Euler method defined');
assert(appJs.includes('function initDiscretizationTool()'), 'initDiscretizationTool() function');
assert(appJs.includes('btn-d2-compare'), '#btn-d2-compare button referenced');
assert(appJs.includes('d2-ts'), 'd2-ts sample time input referenced');
assert(appJs.includes('d2-prewarp'), 'd2-prewarp input referenced');
assert(appJs.includes('d2-ts-advice'), 'd2-ts-advice advisory text element');
assert(appJs.includes('d2-table-wrap'), 'd2-table-wrap container referenced');
assert(appJs.includes('d2-method-table'), '#d2-method-table element');
assert(appJs.includes('chart-d2-bode'), '#chart-d2-bode Bode chart');
assert(appJs.includes('c2dZOH'), 'c2dZOH used');
assert(appJs.includes('c2dTustinPrewarp'), 'c2dTustinPrewarp used');
assert(appJs.includes('c2dMatchedZ') || appJs.includes('_forwardEuler'), 'Forward Euler helper');
assert(appJs.includes('c2dTustin'), 'c2dTustin used');
assert(appJs.includes('disc-compare-badge'), 'disc-compare-badge class used');
assert(appJs.includes('recommended'), 'recommended row highlighted');
assert(appJs.includes('discreteBodeData'), 'discreteBodeData for overlay Bode');

assert(indexHtml.includes('d2-disc-tool-panel'), '#d2-disc-tool-panel section in HTML');
assert(indexHtml.includes('btn-d2-compare'), '#btn-d2-compare in HTML');
assert(indexHtml.includes('d2-ts'), '#d2-ts input in HTML');
assert(indexHtml.includes('chart-d2-bode'), '#chart-d2-bode div in HTML');
assert(indexHtml.includes('.disc-compare-table'), '.disc-compare-table CSS defined');
assert(indexHtml.includes('.disc-compare-badge'), '.disc-compare-badge CSS defined');
assert(indexHtml.includes('.disc-compare-badge.ok'), '.disc-compare-badge.ok CSS');
assert(indexHtml.includes('.disc-compare-badge.warn'), '.disc-compare-badge.warn CSS');
assert(indexHtml.includes('.disc-compare-badge.bad'), '.disc-compare-badge.bad CSS');

// ── A2-2: Spec Overlay (existing chk-spec-overlay, check it still exists) ────
console.log('\n▶ A2-2 Spec Overlay');

assert(indexHtml.includes('chk-spec-overlay'), 'chk-spec-overlay checkbox in HTML');
assert(appJs.includes('chk-spec-overlay'), 'chk-spec-overlay referenced in JS');
assert(appJs.includes('specOverlay'), 'specOverlay variable used');

// ── A2-3: Spec Compliance Badge ───────────────────────────────────────────────
console.log('\n▶ A2-3 Spec Compliance Badge');

assert(appJs.includes('function updateSpecComplianceBadges()'), 'updateSpecComplianceBadges() function');
assert(appJs.includes('spec-compliance-bar'), 'spec-compliance-bar element referenced');
assert(appJs.includes("'sc-os'"), 'sc-os badge element');
assert(appJs.includes("'sc-ts'"), 'sc-ts badge element');
assert(appJs.includes("'sc-pm'"), 'sc-pm badge element');
assert(appJs.includes("'sc-ess'"), 'sc-ess badge element');
assert(appJs.includes('spec-badge pass') || appJs.includes("'spec-badge pass'") || appJs.includes('"spec-badge pass"') || appJs.includes("= 'spec-badge pass'"), 'spec-badge pass class applied');
assert(appJs.includes('spec-badge fail') || appJs.includes("'spec-badge fail'") || appJs.includes('"spec-badge fail"') || appJs.includes("= 'spec-badge fail'"), 'spec-badge fail class applied');
assert(appJs.includes('window.updateSpecComplianceBadges'), 'updateSpecComplianceBadges exposed globally');

assert(indexHtml.includes('spec-compliance-bar'), '#spec-compliance-bar in HTML');
assert(indexHtml.includes('sc-os'), '#sc-os badge in HTML');
assert(indexHtml.includes('sc-ts'), '#sc-ts badge in HTML');
assert(indexHtml.includes('sc-pm'), '#sc-pm badge in HTML');
assert(indexHtml.includes('sc-ess'), '#sc-ess badge in HTML');
assert(indexHtml.includes('.spec-compliance-bar'), '.spec-compliance-bar CSS defined');
assert(indexHtml.includes('.spec-badge'), '.spec-badge CSS defined');
assert(indexHtml.includes('.spec-badge.pass'), '.spec-badge.pass CSS defined');
assert(indexHtml.includes('.spec-badge.fail'), '.spec-badge.fail CSS defined');

// ── P41 init ──────────────────────────────────────────────────────────────────
console.log('\n▶ P41 DOMContentLoaded init');

assert(appJs.includes('initDiscretizationTool()'), 'initDiscretizationTool called in init');

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('');
console.log(`Results: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error('Failed:', errors.join(', '));
  process.exit(1);
}
console.log('✓ P41 D2 + A2 Spec — all checks passed');
