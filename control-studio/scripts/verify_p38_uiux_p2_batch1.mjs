/**
 * verify_p38_uiux_p2_batch1.mjs
 *
 * Verifies P38 — P2 Batch 1 UI/UX items:
 *   F3-2  Dirty marker (unsaved change indicator)
 *   F3-3  Computation progress bar
 *   G4    Preferences modal (appearance/units/behavior)
 *   F2-3  Chart fullscreen mode
 *   B3-4  Chart export dropdown (SVG/PNG/CSV)
 *   C2-2  Field hint popovers for PID inputs
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

// ── F3-2: Dirty marker ───────────────────────────────────────────────────────
console.log('\n▶ F3-2 Dirty Marker');

assert(indexHtml.includes('dirty-dot'), '#dirty-dot element present');
assert(indexHtml.includes('class="dirty-dot"'), 'dirty-dot class on element');
assert(indexHtml.includes('.dirty-dot'), '.dirty-dot CSS defined');
assert(indexHtml.includes('dirty-pulse'), 'dirty-pulse animation defined');
assert(appJs.includes('function markDirty()'), 'markDirty() function');
assert(appJs.includes('function clearDirty()'), 'clearDirty() function');
assert(appJs.includes("classList.add('visible')"), 'markDirty shows dot');
assert(appJs.includes("classList.remove('visible')"), 'clearDirty hides dot');
assert(appJs.includes('beforeunload'), 'beforeunload guard for dirty state');
assert(appJs.includes("state._dirty = true"), 'dirty flag set in markDirty');
assert(appJs.includes("state._dirty = false"), 'dirty flag cleared');
assert(appJs.includes('_autoSaveTimer'), 'autosave timer for dirty-then-clear');

// ── F3-3: Progress bar ───────────────────────────────────────────────────────
console.log('\n▶ F3-3 Computation Progress Bar');

assert(indexHtml.includes('calc-progress-wrap'), '#calc-progress-wrap element');
assert(indexHtml.includes('calc-progress-bar'), '#calc-progress-bar element');
assert(indexHtml.includes('.calc-progress-wrap'), '.calc-progress-wrap CSS');
assert(indexHtml.includes('.calc-progress-bar'), '.calc-progress-bar CSS');
assert(indexHtml.includes('role="progressbar"'), 'progress has ARIA progressbar role');
assert(indexHtml.includes('aria-valuemin'), 'progress has aria-valuemin');
assert(indexHtml.includes('aria-valuemax'), 'progress has aria-valuemax');
assert(appJs.includes('function startCalcProgress('), 'startCalcProgress() function');
assert(appJs.includes('function completeCalcProgress()'), 'completeCalcProgress() function');
assert(appJs.includes('window.startCalcProgress'), 'startCalcProgress exposed globally');
assert(appJs.includes('300ms') || appJs.includes('300)'), 'progress shown only after 300ms delay');
assert(appJs.includes("classList.add('active')"), 'progress bar shown via active class');
assert(appJs.includes("classList.remove('active')"), 'progress bar hidden after complete');

// ── G4: Preferences modal ────────────────────────────────────────────────────
console.log('\n▶ G4 Preferences Modal');

assert(indexHtml.includes('prefs-modal'), '#prefs-modal present');
assert(indexHtml.includes('prefs-title'), 'prefs modal title element');
assert(indexHtml.includes('prefs-tabs'), 'prefs tabs container');
assert(indexHtml.includes('data-prefs-tab="appearance"'), 'Appearance tab');
assert(indexHtml.includes('data-prefs-tab="units"'), 'Units tab');
assert(indexHtml.includes('data-prefs-tab="behavior"'), 'Behavior tab');
assert(indexHtml.includes('pref-theme'), 'theme selector');
assert(indexHtml.includes('pref-freq-unit'), 'frequency unit selector');
assert(indexHtml.includes('pref-precision'), 'precision selector');
assert(indexHtml.includes('pref-autosave'), 'autosave toggle');
assert(indexHtml.includes('pref-clear-all'), 'danger clear all button');
assert(indexHtml.includes('pref-save'), 'save button');
assert(indexHtml.includes('prefs-toggle'), 'toggle switch component');
assert(indexHtml.includes('.prefs-row'), '.prefs-row CSS');
assert(indexHtml.includes('.prefs-tabs'), '.prefs-tabs CSS');

assert(appJs.includes("const PREFS_KEY = 'cs-prefs'"), 'PREFS_KEY defined');
assert(appJs.includes('function defaultPrefs()'), 'defaultPrefs() function');
assert(appJs.includes('function loadPrefs()'), 'loadPrefs() function');
assert(appJs.includes('function savePrefs('), 'savePrefs() function');
assert(appJs.includes('function applyPrefs('), 'applyPrefs() function');
assert(appJs.includes('function initPrefsModal()'), 'initPrefsModal() function');
assert(appJs.includes('pref-save'), 'save handler wired');
assert(appJs.includes('pref-clear-all'), 'danger clear-all wired');
assert(appJs.includes("notify('偏好設定已儲存'") || appJs.includes("notify('偏好設定已"), '設定儲存 toast');

// Prefs tabs switching logic
assert(appJs.includes('prefs-tab'), 'prefs tab switching logic');
assert(appJs.includes('data-prefs-tab') || appJs.includes('prefsTab'), 'prefs section switching');

// ── F2-3: Chart fullscreen ────────────────────────────────────────────────────
console.log('\n▶ F2-3 Chart Fullscreen');

assert(appJs.includes('function initChartFullscreen()'), 'initChartFullscreen() function');
assert(appJs.includes('requestFullscreen'), 'requestFullscreen API used');
assert(appJs.includes('exitFullscreen'), 'exitFullscreen API used');
assert(appJs.includes('fullscreenchange'), 'fullscreenchange event listener');
assert(appJs.includes('chart-fullscreen-btn'), 'fullscreen button class');
assert(indexHtml.includes('.chart-fullscreen-btn'), '.chart-fullscreen-btn CSS');
assert(indexHtml.includes(':fullscreen'), 'fullscreen CSS state defined');

// ── B3-4: Chart export ───────────────────────────────────────────────────────
console.log('\n▶ B3-4 Chart Export');

assert(appJs.includes('function initChartExport()'), 'initChartExport() function');
assert(appJs.includes('chart-export-btn'), 'export button class');
assert(appJs.includes('chart-export-menu'), 'export menu class');
assert(appJs.includes("data-fmt=\"svg\"") || appJs.includes("data-fmt='svg'") || appJs.includes("fmt === 'svg'"), 'SVG format option');
assert(appJs.includes("fmt === 'png-hi'"), 'PNG 300dpi format option');
assert(appJs.includes("fmt === 'png-lo'"), 'PNG 150dpi format option');
assert(appJs.includes("fmt === 'csv'"), 'CSV data export option');
assert(appJs.includes('Plotly?.downloadImage') || appJs.includes('Plotly.downloadImage'), 'Plotly downloadImage used');
assert(indexHtml.includes('.chart-export-wrap'), '.chart-export-wrap CSS');
assert(indexHtml.includes('.chart-export-menu'), '.chart-export-menu CSS');
assert(indexHtml.includes('.chart-export-item'), '.chart-export-item CSS');

// ── C2-2: Field hints ────────────────────────────────────────────────────────
console.log('\n▶ C2-2 Field Hints');

assert(appJs.includes('const FIELD_HINTS ='), 'FIELD_HINTS registry defined');
assert(appJs.includes("'pid-Kp'"), 'Kp hint defined');
assert(appJs.includes("'pid-Ki'"), 'Ki hint defined');
assert(appJs.includes("'pid-Kd'"), 'Kd hint defined');
assert(appJs.includes("'pid-N'"), 'N hint defined');
assert(appJs.includes("'tf-num'"), 'TF numerator hint');
assert(appJs.includes("'tf-den'"), 'TF denominator hint');
assert(appJs.includes('function initFieldHints()'), 'initFieldHints() function');
assert(appJs.includes('field-hint-popover'), 'field-hint-popover element created');
assert(appJs.includes("'focus'"), 'focus event triggers hint');
assert(appJs.includes("'blur'"), 'blur event hides hint');
assert(indexHtml.includes('.field-hint-popover'), '.field-hint-popover CSS');
assert(indexHtml.includes('.field-hint-title'), '.field-hint-title CSS');
assert(indexHtml.includes('.field-hint-range'), '.field-hint-range CSS');

// ── Header preference button ─────────────────────────────────────────────────
console.log('\n▶ G4 Preferences button in header');

assert(indexHtml.includes('btn-prefs'), '#btn-prefs button in header');
assert(appJs.includes("'btn-prefs'") || appJs.includes('"btn-prefs"'), 'btn-prefs event listener');

// ── Commands updated ─────────────────────────────────────────────────────────
console.log('\n▶ Command palette updated with prefs');
assert(appJs.includes("'偏好設定'") || appJs.includes('偏好設定'), '偏好設定 command in palette');

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('');
console.log(`Results: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error('Failed:', errors.join(', '));
  process.exit(1);
}
console.log('✓ P38 UI/UX P2 Batch 1 — all checks passed');
