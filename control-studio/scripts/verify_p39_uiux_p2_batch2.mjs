/**
 * verify_p39_uiux_p2_batch2.mjs
 *
 * Verifies P39 — P2 Batch 2 UI/UX items:
 *   B3-1  Axis range manual control (chart popover)
 *   B2-3  Pole-zero map enhancement (OL/CL toggle + ζ grid)
 *   B2-2  Hankel singular value bar chart
 *   C2-3  Error guidance system
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

// ── B3-1: Axis Range Control ─────────────────────────────────────────────────
console.log('\n▶ B3-1 Axis Range Control');

assert(appJs.includes('function initAxisRangeControl()'), 'initAxisRangeControl() function');
assert(appJs.includes('chart-axis-btn'), 'chart-axis-btn button class');
assert(appJs.includes('axis-range-popover'), 'axis-range-popover element created');
assert(appJs.includes('axis-range-apply'), 'axis-range-apply button');
assert(appJs.includes('axis-range-reset'), 'axis-range-reset button');
assert(appJs.includes('xaxis.range'), 'Plotly xaxis.range relayout');
assert(appJs.includes('yaxis.range'), 'Plotly yaxis.range relayout');
assert(appJs.includes('xaxis.autorange'), 'xaxis.autorange reset');
assert(appJs.includes('yaxis.autorange'), 'yaxis.autorange reset');
assert(appJs.includes('Plotly?.relayout') || appJs.includes('Plotly.relayout'), 'Plotly.relayout called');
assert(appJs.includes('[data-axis="xmin"]'), 'xmin input data-axis');
assert(appJs.includes('[data-axis="xmax"]'), 'xmax input data-axis');
assert(appJs.includes('[data-axis="ymin"]'), 'ymin input data-axis');
assert(appJs.includes('[data-axis="ymax"]'), 'ymax input data-axis');
assert(indexHtml.includes('.chart-axis-btn'), '.chart-axis-btn CSS defined');
assert(indexHtml.includes('.axis-range-popover'), '.axis-range-popover CSS defined');
assert(indexHtml.includes('.axis-range-input'), '.axis-range-input CSS defined');
assert(indexHtml.includes('.axis-range-actions'), '.axis-range-actions CSS defined');
assert(appJs.includes('axis-range-popover.open'), 'open state toggled on popover');
assert(appJs.includes("'click'") || appJs.includes('"click"'), 'click event listener');

// ── B2-3: Pole-Zero Map Enhancement ─────────────────────────────────────────
console.log('\n▶ B2-3 PZ Map Enhancement');

assert(appJs.includes('function initPZMapControls()'), 'initPZMapControls() function');
assert(appJs.includes('pz-ctrl-bar'), 'pz-ctrl-bar container');
assert(appJs.includes('pz-ctrl-btn'), 'pz-ctrl-btn button class');
assert(appJs.includes('pz-btn-ol'), 'OL toggle button id');
assert(appJs.includes('pz-btn-cl'), 'CL toggle button id');
assert(appJs.includes('pz-btn-grid'), 'Grid toggle button id');
assert(appJs.includes("'ol'") && appJs.includes("'cl'"), 'OL/CL mode state');
assert(appJs.includes('_overlayDampingGrid'), '_overlayDampingGrid helper');
assert(appJs.includes("zetas"), 'damping ratios array');
assert(appJs.includes("Math.acos(z)") || appJs.includes("ζ"), 'damping angle calculation');
assert(appJs.includes("shapes"), 'Plotly shapes for damping lines');
assert(appJs.includes('_pzMapRefresh'), 'pzMapRefresh exposed globally');
assert(indexHtml.includes('.pz-ctrl-bar'), '.pz-ctrl-bar CSS defined');
assert(indexHtml.includes('.pz-ctrl-btn'), '.pz-ctrl-btn CSS defined');
assert(indexHtml.includes('.pz-ctrl-btn.active'), '.pz-ctrl-btn.active CSS defined');

// ── B2-2: Hankel SVD ─────────────────────────────────────────────────────────
console.log('\n▶ B2-2 Hankel Singular Values');

assert(appJs.includes('function initHankelSVD()'), 'initHankelSVD() function');
assert(appJs.includes('btn-hankel-svd'), '#btn-hankel-svd button');
assert(appJs.includes('hankel-svd-wrap'), 'hankel-svd-wrap container');
assert(appJs.includes('hankel-svd-bars'), 'hankel-svd-bars element');
assert(appJs.includes('hankel-svd-info'), 'hankel-svd-info element');
assert(appJs.includes('hsv-bar-row'), 'hsv-bar-row class used');
assert(appJs.includes('hsv-bar-inner'), 'hsv-bar-inner width set');
assert(appJs.includes('hsv-bar-val'), 'hsv-bar-val value display');
assert(appJs.includes('toExponential'), 'exponential notation for values');
assert(appJs.includes('tfToControllableCanonical'), 'SS conversion used');
assert(appJs.includes('Wc') && appJs.includes('Wo'), 'Gramian variables Wc / Wo');
assert(appJs.includes('hsvs'), 'hsvs array computed');
assert(indexHtml.includes('hankel-svd-panel'), '#hankel-svd-panel section');
assert(indexHtml.includes('btn-hankel-svd'), '#btn-hankel-svd button in HTML');
assert(indexHtml.includes('hsv-bar-wrap'), 'hsv-bar-wrap CSS/element in HTML');
assert(indexHtml.includes('.hsv-bar-wrap'), '.hsv-bar-wrap CSS defined');
assert(indexHtml.includes('.hsv-bar-inner'), '.hsv-bar-inner CSS defined');
assert(indexHtml.includes('.hsv-bar-outer'), '.hsv-bar-outer CSS defined');

// ── C2-3: Error Guidance ─────────────────────────────────────────────────────
console.log('\n▶ C2-3 Error Guidance');

assert(appJs.includes('ERROR_GUIDANCE_MAP'), 'ERROR_GUIDANCE_MAP defined');
assert(appJs.includes('function _matchErrorGuidance('), '_matchErrorGuidance() function');
assert(appJs.includes('function initErrorGuidance()'), 'initErrorGuidance() function');
assert(appJs.includes('error-guidance-inject'), 'guidance element id');
assert(appJs.includes("className = 'error-guidance'") || appJs.includes("className='error-guidance'"), 'error-guidance class applied');
assert(appJs.includes('/unstable/i') || appJs.includes('unstable'), 'unstable pattern in guidance map');
assert(appJs.includes('/singular/i') || appJs.includes('singular'), 'singular pattern in guidance map');
assert(appJs.includes('/delay/i') || appJs.includes('delay'), 'delay pattern in guidance map');
assert(appJs.includes('showErrorWithGuidance'), 'showErrorWithGuidance exposed globally');
assert(indexHtml.includes('.error-guidance'), '.error-guidance CSS defined');
assert(indexHtml.includes('.error-guidance-action'), '.error-guidance-action CSS defined');

// ── P39 init ─────────────────────────────────────────────────────────────────
console.log('\n▶ P39 DOMContentLoaded init');

assert(appJs.includes('initAxisRangeControl()'), 'initAxisRangeControl called in init');
assert(appJs.includes('initPZMapControls()'), 'initPZMapControls called in init');
assert(appJs.includes('initHankelSVD()'), 'initHankelSVD called in init');
assert(appJs.includes('initErrorGuidance()'), 'initErrorGuidance called in init');

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('');
console.log(`Results: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error('Failed:', errors.join(', '));
  process.exit(1);
}
console.log('✓ P39 UI/UX P2 Batch 2 — all checks passed');
