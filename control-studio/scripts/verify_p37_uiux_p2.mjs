/**
 * verify_p37_uiux_p2.mjs
 *
 * Verifies P37 — P2 UI/UX items:
 *   G3   Command Palette (Ctrl+K overlay + command registry)
 *   G13  Keyboard Shortcuts modal
 *   G11  Skeleton CSS + component (cross-check with P36)
 *   G1   Unit Switcher (rad/s ↔ Hz)
 *   D1   Live code preview (MATLAB/Python)
 *   F4-1 Print-theme CSS
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

const appJs     = readFileSync(path.join(ROOT, 'js/app.js'),  'utf8');
const indexHtml = readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// ── G3: Command Palette ───────────────────────────────────────────────────────
console.log('\n▶ G3 Command Palette');

assert(indexHtml.includes('cmd-overlay'), 'cmd-overlay present in HTML');
assert(indexHtml.includes('cmd-palette'), 'cmd-palette element present');
assert(indexHtml.includes('cmd-search'), 'cmd-search input present');
assert(indexHtml.includes('cmd-list'), 'cmd-list container present');
assert(indexHtml.includes('命令面板'), 'cmd-palette aria-label in Chinese');
assert(appJs.includes('const COMMANDS ='), 'COMMANDS registry defined');
assert(appJs.includes('function openCommandPalette()'), 'openCommandPalette() function');
assert(appJs.includes('function closeCommandPalette()'), 'closeCommandPalette() function');
assert(appJs.includes('function renderCommandList('), 'renderCommandList() function');
assert(appJs.includes("key === 'k'") || appJs.includes("key === 'K'") || appJs.includes("key.toLowerCase() === 'k'"),
  'Ctrl+K shortcut wired');
assert(appJs.includes('ArrowDown'), 'keyboard navigation: ArrowDown');
assert(appJs.includes('ArrowUp'), 'keyboard navigation: ArrowUp');

// COMMANDS array should have entries for different groups
const cmdGroups = ['Plant', 'Theme', 'Export', 'Help', 'Navigate'];
cmdGroups.forEach(g => {
  assert(appJs.includes(`group: '${g}'`), `COMMANDS has '${g}' group`);
});

// Palette CSS
assert(indexHtml.includes('.cmd-overlay'), '.cmd-overlay CSS');
assert(indexHtml.includes('.cmd-search-input'), '.cmd-search-input CSS');
assert(indexHtml.includes('.cmd-item'), '.cmd-item CSS');
assert(indexHtml.includes('.cmd-group-label'), '.cmd-group-label CSS');
assert(indexHtml.includes('.cmd-empty'), '.cmd-empty CSS for no results');

// ── G13: Keyboard Shortcuts Modal ────────────────────────────────────────────
console.log('\n▶ G13 Keyboard Shortcuts Modal');

assert(indexHtml.includes('shortcuts-modal'), 'shortcuts-modal element present');
assert(indexHtml.includes('shortcuts-title'), 'shortcuts modal has title id');
assert(indexHtml.includes('shortcut-table'), 'shortcuts table present');
assert(indexHtml.includes('快捷鍵'), 'shortcuts modal in Chinese');
assert(indexHtml.includes('Ctrl+K'), 'Ctrl+K shortcut listed in modal');
// Note: HTML may use raw text or kbd elements — check for the letter key
assert(indexHtml.includes('>S<') || indexHtml.includes('Ctrl+S') || indexHtml.includes('Ctrl</kbd><kbd>S'), 'Ctrl+S shortcut listed');
assert(indexHtml.includes('>E<') || indexHtml.includes('Ctrl+E') || indexHtml.includes('Ctrl</kbd><kbd>E'), 'Ctrl+E shortcut listed');
assert(appJs.includes("key === '?'"), 'Ctrl+? opens shortcuts modal');
assert(indexHtml.includes('.shortcut-table'), '.shortcut-table CSS defined');
assert(indexHtml.includes('.shortcut-keys'), '.shortcut-keys CSS defined');

// ── G11: Skeleton CSS ─────────────────────────────────────────────────────────
console.log('\n▶ G11 Skeleton CSS');

assert(indexHtml.includes('.cs-skeleton'), '.cs-skeleton CSS');
assert(indexHtml.includes('cs-skeleton-pulse'), 'skeleton pulse keyframe');
assert(indexHtml.includes('animation: cs-skeleton-pulse'), 'skeleton animation applied');

// ── G1: Unit Switcher ─────────────────────────────────────────────────────────
console.log('\n▶ G1 Unit Switcher');

assert(indexHtml.includes('freq-unit-switcher'), 'freq-unit-switcher container');
assert(indexHtml.includes('data-unit="rads"'), 'rad/s option');
assert(indexHtml.includes('data-unit="hz"'), 'Hz option');
assert(indexHtml.includes('aria-pressed'), 'unit buttons have aria-pressed');
assert(appJs.includes('state._freqUnit'), 'freqUnit tracked in state');
assert(appJs.includes("unit-switcher .unit-btn") || appJs.includes('freq-unit-switcher'), 'unit switcher event listener');
assert(appJs.includes("'rads'") || appJs.includes('"rads"'), 'rad/s unit value in JS');
assert(appJs.includes("'hz'") || appJs.includes('"hz"'), 'hz unit value in JS');
assert(indexHtml.includes('.unit-switcher'), '.unit-switcher CSS');
assert(indexHtml.includes('.unit-btn'), '.unit-btn CSS');

// ── D1: Code Preview ─────────────────────────────────────────────────────────
console.log('\n▶ D1 Code Preview Panel');

assert(indexHtml.includes('code-preview-panel'), 'code-preview-panel section');
assert(indexHtml.includes('code-preview-code'), 'code element');
assert(indexHtml.includes('data-codelang="matlab"'), 'MATLAB lang tab');
assert(indexHtml.includes('data-codelang="python"'), 'Python lang tab');
assert(appJs.includes('function refreshCodePreview()'), 'refreshCodePreview() function');
assert(appJs.includes('toMatlabScript'), 'MATLAB code gen in refreshCodePreview');
assert(appJs.includes('toPythonScript'), 'Python code gen in refreshCodePreview');
assert(appJs.includes("state._codeLang ?? 'matlab'") || appJs.includes("state._codeLang"), 'codeLang state');

// buildCodegenPayload is already present in the existing app.js as a helper
assert(appJs.includes('function buildCodegenPayload()'), 'buildCodegenPayload() helper defined');

// ── F4-1: Print Theme ────────────────────────────────────────────────────────
console.log('\n▶ F4-1 Print Theme CSS');

assert(indexHtml.includes('[data-theme="print"]'), 'print theme CSS block');
assert(indexHtml.includes('@media print'), '@media print rules');
assert(appJs.includes("'dark', 'light', 'print'"), 'THEME_CYCLE contains print');

// ── Component CSS consistency ────────────────────────────────────────────────
console.log('\n▶ CSS class consistency');

['cs-slider', 'cs-skeleton', 'cs-codeblock', 'cmd-overlay', 'shortcut-table', 'unit-switcher'].forEach(cls => {
  const hasCss = indexHtml.includes(`.${cls}`);
  const hasHtml = indexHtml.includes(cls);
  assert(hasCss && hasHtml, `${cls}: CSS and HTML both present`);
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('');
console.log(`Results: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error('Failed:', errors.join(', '));
  process.exit(1);
}
console.log('✓ P37 UI/UX P2 — all checks passed');
