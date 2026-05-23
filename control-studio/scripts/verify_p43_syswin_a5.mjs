/**
 * verify_p43_syswin_a5.mjs
 *
 * Verifies P43 — A1-1 + A5-2/A5-3:
 *   A1-1  System Input Wizard modal (TF/SS/ZPK tabs, health check, LaTeX preview)
 *   A5-2  Sensitivity function plot (S, T, KS Bode)
 *   A5-3  Robustness badge bar (PM/GM/Ms/Dm)
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

// ── A1-1: System Input Wizard ─────────────────────────────────────────────────
console.log('\n▶ A1-1 System Input Wizard Modal');

assert(appJs.includes('function initSystemInputWizard()'), 'initSystemInputWizard() function');
assert(appJs.includes('syswin-modal'), 'syswin-modal element referenced');
assert(appJs.includes('syswin-close'), 'syswin-close button referenced');
assert(appJs.includes('syswin-confirm'), 'syswin-confirm button referenced');
assert(appJs.includes('syswin-cancel'), 'syswin-cancel button referenced');
assert(appJs.includes("'tf'") && appJs.includes("'ss'") && appJs.includes("'zpk'"), 'TF/SS/ZPK types');
assert(appJs.includes('data-systype'), 'data-systype attribute used');
assert(appJs.includes('showSection'), 'showSection() tab switcher');
assert(appJs.includes('validateAndPreview'), 'validateAndPreview() debounced check');
assert(appJs.includes('syswin-tf-num') && appJs.includes('syswin-tf-den'), 'TF inputs wired');
assert(appJs.includes('syswin-ss-A'), 'SS A matrix input wired');
assert(appJs.includes('syswin-zpk-z'), 'ZPK zeros input wired');
assert(appJs.includes('tfToLatex'), 'LaTeX preview via tfToLatex');
assert(appJs.includes('renderLatex'), 'renderLatex called for preview');
assert(appJs.includes('sh-stable'), 'stability health badge sh-stable');
assert(appJs.includes('sh-ctrl'), 'controllability badge sh-ctrl');
assert(appJs.includes('sh-obs'), 'observability badge sh-obs');
assert(appJs.includes('sh-mp'), 'min-phase badge sh-mp');
assert(appJs.includes('controllabilityMatrix'), 'controllabilityMatrix called for health');
assert(appJs.includes('observabilityMatrix'), 'observabilityMatrix called for health');
assert(appJs.includes("modal.classList.add('open')"), 'modal open via class');
assert(appJs.includes("modal.classList.remove('open')"), 'modal close via class');
assert(appJs.includes("key === 'Escape'"), 'Escape key closes modal');
assert(appJs.includes("e.ctrlKey && e.key === '1'"), 'Ctrl+1 switches to TF');
assert(appJs.includes("e.ctrlKey && e.key === '2'"), 'Ctrl+2 switches to SS');
assert(appJs.includes("e.ctrlKey && e.key === '3'"), 'Ctrl+3 switches to ZPK');
assert(appJs.includes('window.openSystemWizard'), 'openSystemWizard exposed globally');
assert(appJs.includes('btn-new-system'), 'btn-new-system trigger');

assert(indexHtml.includes('syswin-modal'), '#syswin-modal in HTML');
assert(indexHtml.includes('syswin-box'), '.syswin-box in HTML');
assert(indexHtml.includes('syswin-type-tabs'), '#syswin-type-tabs in HTML');
assert(indexHtml.includes('data-systype="tf"'), 'TF tab in HTML');
assert(indexHtml.includes('data-systype="ss"'), 'SS tab in HTML');
assert(indexHtml.includes('data-systype="zpk"'), 'ZPK tab in HTML');
assert(indexHtml.includes('syswin-preview'), '#syswin-preview LaTeX area in HTML');
assert(indexHtml.includes('syswin-health'), '#syswin-health badges container');
assert(indexHtml.includes('sh-stable'), '#sh-stable badge in HTML');
assert(indexHtml.includes('syswin-name'), '#syswin-name input');
assert(indexHtml.includes('btn-new-system'), '#btn-new-system in header');
assert(indexHtml.includes('.syswin-modal'), '.syswin-modal CSS defined');
assert(indexHtml.includes('.syswin-box'), '.syswin-box CSS defined');
assert(indexHtml.includes('.syswin-type-tab'), '.syswin-type-tab CSS defined');
assert(indexHtml.includes('.syswin-type-tab.active'), '.syswin-type-tab.active CSS');
assert(indexHtml.includes('.syswin-badge'), '.syswin-badge CSS defined');
assert(indexHtml.includes('.syswin-footer'), '.syswin-footer CSS defined');

// ── A5-2: Sensitivity plot ────────────────────────────────────────────────────
console.log('\n▶ A5-2 Sensitivity Function Plot');

assert(appJs.includes('function renderSensitivityPlot()'), 'renderSensitivityPlot() function');
assert(appJs.includes("'sensitivity'"), "sensitivity activePlot key");
assert(appJs.includes('sensitivityBode'), 'sensitivityBode called');
assert(appJs.includes('robustPeaks'), 'robustPeaks called for Ms marker');
assert(appJs.includes("name: 'S (Sensitivity)'"), 'S trace labeled');
assert(appJs.includes("name: 'T (Complementary)'"), 'T trace labeled');
assert(appJs.includes("name: 'KS (Input Sensitivity)'"), 'KS trace labeled');
assert(appJs.includes('plot-tab-sensitivity'), 'sensitivity tab id referenced');
assert(indexHtml.includes('plot-tab-sensitivity'), '#plot-tab-sensitivity tab in HTML');
assert(indexHtml.includes('Sensitivity'), 'Sensitivity tab label in HTML');

// ── A5-3: Robustness badges ───────────────────────────────────────────────────
console.log('\n▶ A5-3 Robustness Badge Bar');

assert(appJs.includes('function updateRobustnessBadges()'), 'updateRobustnessBadges() function');
assert(appJs.includes('robust-badge-bar'), '#robust-badge-bar referenced');
assert(appJs.includes("'rb-pm'"), 'PM badge id rb-pm');
assert(appJs.includes("'rb-gm'"), 'GM badge id rb-gm');
assert(appJs.includes("'rb-ms'"), 'Ms badge id rb-ms');
assert(appJs.includes("'rb-dm'"), 'Dm badge id rb-dm');
assert(appJs.includes('diskMargin'), 'diskMargin used');
assert(appJs.includes('window.updateRobustnessBadges'), 'updateRobustnessBadges exposed');

assert(indexHtml.includes('robust-badge-bar'), '#robust-badge-bar in HTML');
assert(indexHtml.includes('rb-pm'), '#rb-pm element in HTML');
assert(indexHtml.includes('rb-gm'), '#rb-gm element in HTML');
assert(indexHtml.includes('rb-ms'), '#rb-ms element in HTML');
assert(indexHtml.includes('rb-dm'), '#rb-dm element in HTML');
assert(indexHtml.includes('.robust-badge-bar'), '.robust-badge-bar CSS defined');
assert(indexHtml.includes('.rb-status.ok'), '.rb-status.ok CSS');
assert(indexHtml.includes('.rb-status.fail'), '.rb-status.fail CSS');

// ── P43 init ──────────────────────────────────────────────────────────────────
console.log('\n▶ P43 DOMContentLoaded init');

assert(appJs.includes('initSystemInputWizard()'), 'initSystemInputWizard called in init');
assert(appJs.includes('plot-tab-sensitivity'), 'sensitivity tab wired in init');

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('');
console.log(`Results: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error('Failed:', errors.join(', '));
  process.exit(1);
}
console.log('✓ P43 A1-1 + A5-2/A5-3 — all checks passed');
