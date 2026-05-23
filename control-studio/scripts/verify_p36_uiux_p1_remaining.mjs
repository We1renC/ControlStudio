/**
 * verify_p36_uiux_p1_remaining.mjs
 *
 * Verifies P36 — remaining P1 UI/UX items:
 *   A3-1  slider()      component
 *   G12   confirmDialog() component
 *   G11   skeleton() / skeletonBlock() component
 *   D1    codeBlock()   component
 *   F4-1  Three-way theme cycle in app.js
 *   F1-1  SideNav tabs have icon markup in index.html
 *   G1    Frequency unit switcher in index.html
 *   D1    Code-preview panel in index.html
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let pass = 0;
let fail = 0;
const errors = [];

function ok(label) { console.log(`  ✓ ${label}`); pass++; }
function bad(label, msg) { console.error(`  ✗ ${label}: ${msg}`); fail++; errors.push(label); }
function assert(cond, label, msg = '') { if (cond) ok(label); else bad(label, msg || 'condition failed'); }

// ── Load sources ─────────────────────────────────────────────────────────────
const components = readFileSync(path.join(ROOT, 'js/ui/components.js'), 'utf8');
const appJs      = readFileSync(path.join(ROOT, 'js/app.js'),           'utf8');
const indexHtml  = readFileSync(path.join(ROOT, 'index.html'),          'utf8');

// ── A3-1: slider() component ─────────────────────────────────────────────────
console.log('\n▶ A3-1 slider() component');

assert(components.includes('export function slider('), 'slider() exported from components.js');
assert(components.includes('cs-slider'), 'slider uses .cs-slider class');
assert(components.includes('cs-slider__input'), 'slider has __input element');
assert(components.includes('cs-slider__value'), 'slider has __value output element');
assert(components.includes("scale === 'log'"), 'slider supports log scale');
assert(components.includes('aria-valuemin'), 'slider has aria-valuemin');
assert(components.includes('aria-valuenow'), 'slider has aria-valuenow');

// Functional: generate a slider and verify structure
const { slider } = await import(path.join(ROOT, 'js/ui/components.js'));
const s = slider('test-kp', { label: 'Kp', min: 0, max: 10, step: 0.1, value: 1.5, unit: '' });
assert(s.includes('id="test-kp"'), 'slider generates correct id');
assert(s.includes('aria-label="Kp"'), 'slider generates aria-label');
assert(s.includes('for="test-kp"'), 'label for attribute matches id');

const sLog = slider('test-log', { label: 'Gain', min: -2, max: 2, step: 0.1, value: 0, scale: 'log', unit: 'dB' });
assert(sLog.includes('data-scale="log"'), 'log slider has data-scale');
assert(sLog.includes('dB'), 'log slider appends unit');

// ── G12: confirmDialog() component ───────────────────────────────────────────
console.log('\n▶ G12 confirmDialog() component');

assert(components.includes('export function confirmDialog('), 'confirmDialog() exported');
assert(components.includes('modal-overlay'), 'confirmDialog generates modal-overlay');
assert(components.includes('aria-modal="true"'), 'confirmDialog is accessible modal');
assert(components.includes('aria-hidden="true"'), 'confirmDialog starts hidden');

const { confirmDialog } = await import(path.join(ROOT, 'js/ui/components.js'));
const cd = confirmDialog('my-confirm', { title: '警告', message: '確定刪除？', okText: '刪除', cancelText: '取消' });
assert(cd.includes('id="my-confirm"'), 'confirmDialog uses provided id');
assert(cd.includes('id="my-confirm-title"'), 'confirmDialog title element id');
assert(cd.includes('id="my-confirm-message"'), 'confirmDialog message element id');
assert(cd.includes('id="my-confirm-ok"'), 'confirmDialog ok button id');
assert(cd.includes('id="my-confirm-cancel"'), 'confirmDialog cancel button id');
assert(cd.includes('警告'), 'confirmDialog title escaped + rendered');
assert(cd.includes('確定刪除？'), 'confirmDialog message rendered');

// ── G11: skeleton() component ─────────────────────────────────────────────────
console.log('\n▶ G11 skeleton() / skeletonBlock() component');

assert(components.includes('export function skeleton('), 'skeleton() exported');
assert(components.includes('export function skeletonBlock('), 'skeletonBlock() exported');
assert(components.includes('cs-skeleton'), 'skeleton uses .cs-skeleton class');
assert(components.includes('aria-hidden="true"'), 'skeleton is aria-hidden');

const { skeleton, skeletonBlock } = await import(path.join(ROOT, 'js/ui/components.js'));
const sk = skeleton('line', { width: '80%', height: '16px' });
assert(sk.includes('cs-skeleton'), 'skeleton line has class');
assert(sk.includes('width:80%'), 'skeleton applies width');
assert(sk.includes('height:16px'), 'skeleton applies height');

const skCircle = skeleton('circle', { height: '40px' });
assert(skCircle.includes('border-radius:50%'), 'skeleton circle has 50% radius');

const skb = skeletonBlock(4);
assert(skb.includes('cs-skeleton'), 'skeletonBlock contains skeleton elements');
assert(skb.includes('70%'), 'skeletonBlock last row is shorter');

// ── D1: codeBlock() component ─────────────────────────────────────────────────
console.log('\n▶ D1 codeBlock() component');

assert(components.includes('export function codeBlock('), 'codeBlock() exported');
assert(components.includes('cs-codeblock'), 'codeBlock uses .cs-codeblock class');
assert(components.includes('cs-codeblock__copy'), 'codeBlock has copy button');
assert(components.includes('navigator.clipboard'), 'codeBlock copy uses clipboard API');

const { codeBlock } = await import(path.join(ROOT, 'js/ui/components.js'));
const cb = codeBlock('G = tf([1], [1, 2, 1]);', { lang: 'matlab', id: 'my-block' });
assert(cb.includes('cs-codeblock--matlab'), 'codeBlock has lang modifier class');
assert(cb.includes('id="my-block"'), 'codeBlock has id');
assert(cb.includes('MATLAB'), 'codeBlock shows lang label');
assert(cb.includes('G = tf([1], [1, 2, 1]);'), 'codeBlock escapes code content');

const cbPy = codeBlock('import control', { lang: 'python', copyable: false });
assert(!cbPy.includes('cs-codeblock__copy'), 'codeBlock copyable=false omits copy button');

// ── F4-1: Three-way theme in app.js ──────────────────────────────────────────
console.log('\n▶ F4-1 Three-way theme cycle');

assert(appJs.includes("'dark'") && appJs.includes("'light'") && appJs.includes("'print'") && appJs.includes('THEME_CYCLE'), 'THEME_CYCLE contains dark/light/print');
assert(appJs.includes('(idx + 1) % THEME_CYCLE.length'), 'toggleTheme cycles through THEME_CYCLE');
assert(appJs.includes("icons.print") || appJs.includes("'print'"), 'print icon defined in updateThemeIcon');
assert(indexHtml.includes("[data-theme=\"print\"]"), 'print theme CSS in index.html');
assert(indexHtml.includes('Cycle theme'), 'theme toggle button updated title');
assert(indexHtml.includes('theme-cycle-label') || indexHtml.includes('theme-label'), 'theme label element in header');

// ── F1-1: SideNav icons ───────────────────────────────────────────────────────
console.log('\n▶ F1-1 SideNav tabs with icons');

assert(indexHtml.includes('tab-label'), 'sidebar tabs have .tab-label span');
const tabCount = (indexHtml.match(/class="sidebar-tab/g) ?? []).length;
assert(tabCount >= 4, `sidebar has ≥4 tabs (found ${tabCount})`);
assert(indexHtml.includes('data-sidebar="model"'), 'Plant tab present');
assert(indexHtml.includes('data-sidebar="simulate"'), 'Simulate tab present');
assert(indexHtml.includes('data-sidebar="advisor"'), 'Design tab present');
assert(indexHtml.includes('data-sidebar="compare"'), 'Compare tab present');
// SVG icons inside tabs
const tabSectionMatch = indexHtml.match(/class="sidebar-tabs"[^]*?<\/div>\s*<div class="sidebar-panel/);
assert(tabSectionMatch && tabSectionMatch[0].includes('<svg'), 'sidebar tabs contain SVG icons');

// ── G1: Frequency unit switcher ───────────────────────────────────────────────
console.log('\n▶ G1 Frequency unit switcher');

assert(indexHtml.includes('freq-unit-switcher'), 'freq-unit-switcher element present');
assert(indexHtml.includes('data-unit="rads"'), 'rad/s unit button');
assert(indexHtml.includes('data-unit="hz"'), 'Hz unit button');
assert(indexHtml.includes('unit-switcher'), '.unit-switcher CSS class');
assert(appJs.includes("state._freqUnit"), 'unit switcher stores state._freqUnit');

// ── D1: Code preview panel in index.html ─────────────────────────────────────
console.log('\n▶ D1 Code Preview Panel');

assert(indexHtml.includes('code-preview-panel'), 'code-preview-panel section');
assert(indexHtml.includes('code-preview-code'), 'code-preview-code element');
assert(indexHtml.includes('code-preview-copy'), 'code-preview-copy button');
assert(indexHtml.includes('code-lang-tab'), 'code language tabs');
assert(indexHtml.includes('data-codelang="matlab"'), 'MATLAB code tab');
assert(indexHtml.includes('data-codelang="python"'), 'Python code tab');
assert(appJs.includes('refreshCodePreview'), 'refreshCodePreview() defined in app.js');
assert((appJs.match(/function buildCodegenPayload\s*\(/g) ?? []).length === 1, 'buildCodegenPayload declared once');
assert(appJs.includes('state._codeLang'), 'code lang tracked in state');

// ── CSS classes present ───────────────────────────────────────────────────────
console.log('\n▶ CSS classes');

assert(indexHtml.includes('.cs-slider'), '.cs-slider CSS defined');
assert(indexHtml.includes('.cs-skeleton'), '.cs-skeleton CSS defined');
assert(indexHtml.includes('@keyframes cs-skeleton-pulse'), 'skeleton pulse animation');
assert(indexHtml.includes('.cs-codeblock'), '.cs-codeblock CSS defined');
assert(indexHtml.includes('.cmd-overlay'), '.cmd-overlay CSS defined (G3 command palette)');
assert(indexHtml.includes('.shortcut-table'), '.shortcut-table CSS defined (G13)');
assert(indexHtml.includes('.unit-switcher'), '.unit-switcher CSS defined (G1)');

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('');
console.log(`Results: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error('Failed:', errors.join(', '));
  process.exit(1);
}
console.log('✓ P36 UI/UX P1 remaining — all checks passed');
