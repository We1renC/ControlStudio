/**
 * verify_p40_uiux_p2_batch3.mjs
 *
 * Verifies P40 — P2 Batch 3 UI/UX items:
 *   C2-1  Design Wizard progress bar (4-step)
 *   B3-2  Chart cursor crosshair readout
 *   B3-3  Chart theme toggle button (auto/vibrant/mono)
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

// ── C2-1: Design Wizard ──────────────────────────────────────────────────────
console.log('\n▶ C2-1 Design Wizard Progress Bar');

assert(appJs.includes('WIZARD_STEPS'), 'WIZARD_STEPS array defined');
assert(appJs.includes("'w-model'") || appJs.includes('"w-model"'), 'model step defined');
assert(appJs.includes("'w-spec'") || appJs.includes('"w-spec"'), 'spec step defined');
assert(appJs.includes("'w-design'") || appJs.includes('"w-design"'), 'design step defined');
assert(appJs.includes("'w-verify'") || appJs.includes('"w-verify"'), 'verify step defined');
assert(appJs.includes('WIZARD_STORAGE_KEY'), 'WIZARD_STORAGE_KEY defined');
assert(appJs.includes('function initDesignWizard()'), 'initDesignWizard() function');
assert(appJs.includes('wizard-bar'), 'wizard-bar element referenced');
assert(appJs.includes('wizard-skip'), 'wizard-skip button referenced');
assert(appJs.includes('wizard-prev'), 'wizard-prev button referenced');
assert(appJs.includes('wizard-next'), 'wizard-next button referenced');
assert(appJs.includes('btn-wizard'), 'btn-wizard toggle referenced');
assert(appJs.includes('wizard-step-dot'), 'wizard-step-dot element built');
assert(appJs.includes('wizard-connector'), 'wizard-connector element built');
assert(appJs.includes('wizard-step-label'), 'wizard-step-label element built');
assert(appJs.includes('function goToStep('), 'goToStep() navigation function');
assert(appJs.includes('function openWizard()'), 'openWizard() function');
assert(appJs.includes('function closeWizard()'), 'closeWizard() function');
assert(appJs.includes("classList.add('visible')"), 'wizard visible class toggled');
assert(appJs.includes("classList.remove('visible')"), 'wizard hidden via remove visible');
assert(appJs.includes('sessionStorage'), 'wizard step persisted in sessionStorage');

assert(indexHtml.includes('wizard-bar'), '#wizard-bar element in HTML');
assert(indexHtml.includes('wizard-track'), '#wizard-track element in HTML');
assert(indexHtml.includes('wizard-prev'), '#wizard-prev button in HTML');
assert(indexHtml.includes('wizard-next'), '#wizard-next button in HTML');
assert(indexHtml.includes('wizard-skip'), '#wizard-skip button in HTML');
assert(indexHtml.includes('btn-wizard'), '#btn-wizard in header HTML');
assert(indexHtml.includes('.wizard-bar'), '.wizard-bar CSS defined');
assert(indexHtml.includes('.wizard-step'), '.wizard-step CSS defined');
assert(indexHtml.includes('.wizard-step-dot'), '.wizard-step-dot CSS defined');
assert(indexHtml.includes('.wizard-connector'), '.wizard-connector CSS defined');
assert(indexHtml.includes('.wizard-step.active'), '.wizard-step.active CSS defined');
assert(indexHtml.includes('.wizard-step.done'), '.wizard-step.done CSS defined');
assert(indexHtml.includes('.wizard-actions'), '.wizard-actions CSS defined');
assert(indexHtml.includes('.wizard-skip'), '.wizard-skip CSS defined');

// ── B3-2: Cursor Readout ─────────────────────────────────────────────────────
console.log('\n▶ B3-2 Chart Cursor Readout');

assert(appJs.includes('function initChartCursorReadout()'), 'initChartCursorReadout() function');
assert(appJs.includes('chart-readout'), 'chart-readout element class');
assert(appJs.includes('chart-crosshair'), 'chart-crosshair element class');
assert(appJs.includes('chart-readout-x'), 'chart-readout-x x-value label');
assert(appJs.includes('chart-readout-row'), 'chart-readout-row per-series row');
assert(appJs.includes('chart-readout-swatch'), 'color swatch in readout');
assert(appJs.includes("'plotly_hover'"), 'plotly_hover event listener');
assert(appJs.includes("'plotly_unhover'"), 'plotly_unhover event listener');
assert(appJs.includes('readout.classList.add'), 'readout shown on hover');
assert(appJs.includes('readout.classList.remove'), 'readout hidden on unhover');
assert(appJs.includes('crosshair'), 'crosshair position updated');
assert(indexHtml.includes('.chart-readout'), '.chart-readout CSS defined');
assert(indexHtml.includes('.chart-readout.visible'), '.chart-readout.visible CSS defined');
assert(indexHtml.includes('.chart-crosshair'), '.chart-crosshair CSS defined');
assert(indexHtml.includes('.chart-readout-x'), '.chart-readout-x CSS defined');
assert(indexHtml.includes('.chart-readout-row'), '.chart-readout-row CSS defined');

// ── B3-3: Chart Theme Toggle ─────────────────────────────────────────────────
console.log('\n▶ B3-3 Chart Theme Toggle');

assert(appJs.includes('CHART_THEMES'), 'CHART_THEMES array defined');
assert(appJs.includes("'vibrant'"), 'vibrant theme defined');
assert(appJs.includes("'mono'"), 'mono theme defined');
assert(appJs.includes("'auto'"), 'auto theme defined');
assert(appJs.includes('CHART_THEME_LABELS'), 'CHART_THEME_LABELS mapping');
assert(appJs.includes('CHART_THEME_TITLES'), 'CHART_THEME_TITLES mapping');
assert(appJs.includes('function getChartColorscale('), 'getChartColorscale() function');
assert(appJs.includes('function initChartThemeToggle()'), 'initChartThemeToggle() function');
assert(appJs.includes('chart-theme-btn'), 'chart-theme-btn button class');
assert(appJs.includes('_chartThemes'), '_chartThemes per-chart state');
assert(appJs.includes('Plotly?.restyle') || appJs.includes('Plotly.restyle'), 'Plotly.restyle for color update');
assert(indexHtml.includes('.chart-theme-btn'), '.chart-theme-btn CSS defined');

// ── P40 init ──────────────────────────────────────────────────────────────────
console.log('\n▶ P40 DOMContentLoaded init');

assert(appJs.includes('initDesignWizard()'), 'initDesignWizard called in init');
assert(appJs.includes('initChartCursorReadout()'), 'initChartCursorReadout called in init');
assert(appJs.includes('initChartThemeToggle()'), 'initChartThemeToggle called in init');

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('');
console.log(`Results: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error('Failed:', errors.join(', '));
  process.exit(1);
}
console.log('✓ P40 UI/UX P2 Batch 3 — all checks passed');
