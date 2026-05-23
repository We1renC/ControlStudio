/**
 * verify_p51_a11y.mjs
 *
 * Verifies P51 — F4-2~4 Brand colors / 8-color cycle / reduced-motion
 *               F5-1~4  Keyboard nav / Screen reader / High contrast / Skip link
 *               G7      Color-blind palette + SVG filter simulation
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

// ── F4-3: 8-color cycle ───────────────────────────────────────────────────────
console.log('\n▶ F4-3 Chart 8-Color Cycle');

assert(appJs.includes('const DARK_COLORS'),          'DARK_COLORS defined');
assert(appJs.includes('const PRINT_PATTERNS'),       'PRINT_PATTERNS defined');
assert(appJs.includes('function getChartColors('),   'getChartColors() defined');
assert(appJs.includes('function getLinePattern('),   'getLinePattern() defined');
assert(appJs.includes("'#3fb950'"),                  'first dark color present');
assert(appJs.includes("'#58a6ff'"),                  'second dark color present');
assert(appJs.includes("theme === 'print'"),          'print theme branch in getChartColors');
assert(appJs.includes('window.getChartColors'),      'getChartColors exposed globally');
assert(appJs.includes('window.getLinePattern'),      'getLinePattern exposed globally');

// ── F4-4: Reduced motion ──────────────────────────────────────────────────────
console.log('\n▶ F4-4 Reduced Motion');

assert(appJs.includes('const prefersReduced'),       'prefersReduced const defined');
assert(appJs.includes('function initReducedMotion()'), 'initReducedMotion() defined');
assert(appJs.includes('prefers-reduced-motion'),     'media query string in JS');
assert(appJs.includes('window._prefersReduced'),     '_prefersReduced exposed on window');
assert(indexHtml.includes('@media (prefers-reduced-motion: reduce)'), 'CSS reduced-motion rule');

// ── F4-3: High-contrast theme ─────────────────────────────────────────────────
console.log('\n▶ F4-3/F5-3 High-Contrast Theme');

assert(appJs.includes("'high-contrast'"),            "high-contrast in THEME_CYCLE");
assert(appJs.includes('high-contrast'),              'high-contrast icon defined in updateThemeIcon');
assert(indexHtml.includes('[data-theme="high-contrast"]'), 'high-contrast CSS tokens');
assert(indexHtml.includes('@media (forced-colors: active)'), 'forced-colors media query');
assert(indexHtml.includes('ButtonText'),             'ButtonText system color used');

// ── F5-4: Skip link ───────────────────────────────────────────────────────────
console.log('\n▶ F5-4 Skip Link');

assert(indexHtml.includes('class="skip-link"'),      'skip-link elements in HTML');
assert(indexHtml.includes('href="#main-content"'),   'skip link to #main-content');
assert(indexHtml.includes('href="#nav"'),            'skip link to #nav');
assert(indexHtml.includes('id="main-content"'),      'id=main-content on <main>');
assert(indexHtml.includes('id="nav"'),               'id=nav on <aside>');
assert(indexHtml.includes('.skip-link'),             '.skip-link CSS defined');
assert(indexHtml.includes('.skip-link:focus'),       '.skip-link:focus slides in');

// ── F5-1: Keyboard navigation ─────────────────────────────────────────────────
console.log('\n▶ F5-1 Keyboard Navigation');

assert(appJs.includes('function initKeyboardNav()'),    'initKeyboardNav() defined');
assert(appJs.includes("e.key === 'Escape'"),            'Escape closes overlays');
assert(appJs.includes("e.key === 'F11'"),              'F11 fullscreen');
assert(appJs.includes("e.key === '?'"),                '? opens keyboard help');
assert(appJs.includes("e.key === 'z'"),                'Ctrl+Z undo');
assert(appJs.includes("e.key === 's'"),                'Ctrl+S save draft');
assert(appJs.includes("e.key === 'p'"),                'Ctrl+P report');
assert(appJs.includes('sectionMap'),                   'section hotkeys map (G/M/D/A/O)');
assert(appJs.includes('function initKeyboardHelpPanel()'), 'initKeyboardHelpPanel() defined');
assert(appJs.includes('btn-keyboard-help'),            'btn-keyboard-help referenced');
assert(appJs.includes('kbd-help-panel'),               'kbd-help-panel referenced');
assert(appJs.includes('kbd-help-close'),               'kbd-help-close referenced');

assert(indexHtml.includes('btn-keyboard-help'),        '#btn-keyboard-help in HTML');
assert(indexHtml.includes('kbd-help-panel'),           '#kbd-help-panel in HTML');
assert(indexHtml.includes('kbd-help-close'),           '#kbd-help-close in HTML');
assert(indexHtml.includes('.kbd-help-panel'),          '.kbd-help-panel CSS');
assert(indexHtml.includes('.kbd-help-panel.open'),     '.kbd-help-panel.open CSS');
assert(indexHtml.includes('.kbd-table'),               '.kbd-table CSS');
assert(indexHtml.includes('.kbd-help-box'),            '.kbd-help-box CSS');

// ── F5-1: Focus ring ─────────────────────────────────────────────────────────
console.log('\n▶ F5-1 Focus Ring');

assert(indexHtml.includes(':focus-visible'),           ':focus-visible CSS rule');
assert(indexHtml.includes('outline: 2px solid'),       'focus ring outline defined');

// ── F5-2: Screen reader support ───────────────────────────────────────────────
console.log('\n▶ F5-2 Screen Reader Support');

assert(appJs.includes('function chartAltText('),       'chartAltText() defined');
assert(appJs.includes('function updateChartARIA()'),   'updateChartARIA() defined');
assert(appJs.includes('function initScreenReaderSupport()'), 'initScreenReaderSupport() defined');
assert(appJs.includes('步階響應圖'),                   'step response ARIA text');
assert(appJs.includes('Bode 圖'),                      'bode ARIA text');
assert(appJs.includes('根軌跡圖'),                     'rlocus ARIA text');
assert(appJs.includes('Nyquist 圖'),                   'nyquist ARIA text');
assert(appJs.includes("setAttribute('role', 'img')"),  'role=img set on charts');
assert(appJs.includes('window.updateChartARIA'),       'updateChartARIA exposed globally');

// ── G7: Color-blind palette + SVG filters ─────────────────────────────────────
console.log('\n▶ G7 Color-blind Friendly');

assert(appJs.includes('const OKABE_ITO'),              'OKABE_ITO palette defined');
assert(appJs.includes('function getColorBlindSafeColors('), 'getColorBlindSafeColors() defined');
assert(appJs.includes('function initColorBlindFilter()'), 'initColorBlindFilter() defined');
assert(appJs.includes('cb-mode-select'),               'cb-mode-select referenced');
assert(appJs.includes('cb-filter-protanopia'),         'protanopia filter class');
assert(appJs.includes('cb-filter-deuteranopia'),       'deuteranopia filter class');
assert(appJs.includes('cb-filter-tritanopia'),         'tritanopia filter class');
assert(appJs.includes('window.getColorBlindSafeColors'), 'getColorBlindSafeColors exposed');

assert(indexHtml.includes('cb-svg-filters'),           '#cb-svg-filters SVG in HTML');
assert(indexHtml.includes('cb-protanopia'),            '#cb-protanopia filter defined');
assert(indexHtml.includes('cb-deuteranopia'),          '#cb-deuteranopia filter defined');
assert(indexHtml.includes('cb-tritanopia'),            '#cb-tritanopia filter defined');
assert(indexHtml.includes('feColorMatrix'),            'feColorMatrix used in SVG filters');
assert(indexHtml.includes('cb-mode-select'),           '#cb-mode-select in HTML');
assert(indexHtml.includes('.cb-filter-protanopia'),    '.cb-filter-protanopia CSS');
assert(indexHtml.includes('.cb-filter-deuteranopia'),  '.cb-filter-deuteranopia CSS');
assert(indexHtml.includes('.cb-filter-tritanopia'),    '.cb-filter-tritanopia CSS');
assert(indexHtml.includes('.cb-mode-row'),             '.cb-mode-row CSS');

// ── P51 init ──────────────────────────────────────────────────────────────────
console.log('\n▶ P51 DOMContentLoaded init');

assert(appJs.includes('function initA11y()'),          'initA11y() defined');
assert(appJs.includes('initA11y()'),                   'initA11y() called in DOMContentLoaded');
assert(appJs.includes('initReducedMotion()'),          'initReducedMotion called from initA11y');
assert(appJs.includes('initKeyboardNav()'),            'initKeyboardNav called from initA11y');
assert(appJs.includes('initKeyboardHelpPanel()'),      'initKeyboardHelpPanel called from initA11y');
assert(appJs.includes('initScreenReaderSupport()'),    'initScreenReaderSupport called from initA11y');
assert(appJs.includes('initColorBlindFilter()'),       'initColorBlindFilter called from initA11y');

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('');
console.log(`Results: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error('Failed:', errors.join(', '));
  process.exit(1);
}
console.log('✓ P51 F4/F5/G7 Accessibility & Color — all checks passed');
