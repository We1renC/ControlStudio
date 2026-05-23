/**
 * verify_p52_g5689.mjs
 *
 * Verifies P52 — G5 i18n / G6 Responsive / G8 Onboarding tour / G9 Multi-project
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

// ── G5: i18n ──────────────────────────────────────────────────────────────────
console.log('\n▶ G5 Internationalization (i18n)');

assert(appJs.includes('const STRINGS'),              'STRINGS object defined');
assert(appJs.includes("'zh-TW'"),                    'zh-TW locale in STRINGS');
assert(appJs.includes("'en'"),                       'en locale in STRINGS');
assert(appJs.includes("function t(key)"),            't() translation function defined');
assert(appJs.includes('function setLang('),          'setLang() defined');
assert(appJs.includes('function initI18n()'),        'initI18n() defined');
assert(appJs.includes('cs-lang'),                    'cs-lang localStorage key');
assert(appJs.includes('window.t '),                  't() exposed globally');
assert(appJs.includes('window.setLang'),             'setLang exposed globally');
assert(appJs.includes('[i18n]'),                     'i18n missing key warning');
assert(appJs.includes('lang-select'),                'lang-select referenced');

assert(indexHtml.includes('lang-select'),            '#lang-select in HTML');
assert(indexHtml.includes('value="zh-TW"'),          'zh-TW option in lang-select');
assert(indexHtml.includes('value="en"'),             'en option in lang-select');
assert(indexHtml.includes('#lang-select'),           '#lang-select CSS defined');

// ── G6: Responsive ────────────────────────────────────────────────────────────
console.log('\n▶ G6 Responsive / Mobile Layout');

assert(appJs.includes('function initResponsive()'),  'initResponsive() defined');
assert(appJs.includes('burger-btn'),                 'burger-btn referenced in JS');
assert(appJs.includes('sidebar-overlay'),            'sidebar-overlay referenced');
assert(appJs.includes('sidebar-open'),               'sidebar-open class toggled');
assert(appJs.includes('aria-expanded'),              'aria-expanded updated');
assert(appJs.includes("window.innerWidth"),          'innerWidth check for resize');

assert(indexHtml.includes('burger-btn'),             '#burger-btn in HTML');
assert(indexHtml.includes('sidebar-overlay'),        '#sidebar-overlay in HTML');
assert(indexHtml.includes('#burger-btn'),            '#burger-btn CSS');
assert(indexHtml.includes('#sidebar-overlay'),       '#sidebar-overlay CSS');
assert(indexHtml.includes('@media (max-width: 767px)'), 'mobile breakpoint CSS');
assert(indexHtml.includes('sidebar-open'),           '.sidebar-open CSS');
assert(indexHtml.includes('hamburger') || indexHtml.includes('aria-controls="nav"'), 'burger button aria-controls');

// ── G8: Onboarding ────────────────────────────────────────────────────────────
console.log('\n▶ G8 Onboarding Tour');

assert(appJs.includes('const ONBOARDING_STEPS'),     'ONBOARDING_STEPS defined');
assert(appJs.includes('function showTourStep('),     'showTourStep() defined');
assert(appJs.includes('function startTour()'),       'startTour() defined');
assert(appJs.includes('function finishTour()'),      'finishTour() defined');
assert(appJs.includes('function initOnboarding()'),  'initOnboarding() defined');
assert(appJs.includes('cs-visited'),                 'cs-visited localStorage flag');
assert(appJs.includes('btn-tour-next'),              'btn-tour-next referenced');
assert(appJs.includes('btn-tour-prev'),              'btn-tour-prev referenced');
assert(appJs.includes('btn-tour-skip'),              'btn-tour-skip referenced');
assert(appJs.includes('tour-overlay'),               'tour-overlay referenced');
assert(appJs.includes('tour-spotlight'),             'tour-spotlight class used');
assert(appJs.includes('window.startTour'),           'startTour exposed globally');
assert(appJs.includes('window.finishTour'),          'finishTour exposed globally');
assert(appJs.includes('ONBOARDING_STEPS.length'),    'step count used for dot render / finish check');

assert(indexHtml.includes('tour-overlay'),           '#tour-overlay in HTML');
assert(indexHtml.includes('tour-bubble'),            '#tour-bubble in HTML');
assert(indexHtml.includes('btn-tour-next'),          '#btn-tour-next in HTML');
assert(indexHtml.includes('btn-tour-prev'),          '#btn-tour-prev in HTML');
assert(indexHtml.includes('btn-tour-skip'),          '#btn-tour-skip in HTML');
assert(indexHtml.includes('tour-dots'),              '#tour-dots in HTML');
assert(indexHtml.includes('.tour-overlay'),          '.tour-overlay CSS');
assert(indexHtml.includes('.tour-bubble'),           '.tour-bubble CSS');
assert(indexHtml.includes('.tour-dot'),              '.tour-dot CSS');
assert(indexHtml.includes('.tour-dot.active'),       '.tour-dot.active CSS');
assert(indexHtml.includes('.tour-spotlight'),        '.tour-spotlight CSS');
assert(indexHtml.includes('.tour-mask'),             '.tour-mask CSS');

// ── G9: Multi-project management ─────────────────────────────────────────────
console.log('\n▶ G9 Multi-project Management');

assert(appJs.includes('const PROJECTS_KEY'),         'PROJECTS_KEY defined');
assert(appJs.includes('function _serializeProject()'), '_serializeProject() defined');
assert(appJs.includes('function saveProject('),      'saveProject() defined');
assert(appJs.includes('function loadProject('),      'loadProject() defined');
assert(appJs.includes('function deleteProject('),    'deleteProject() defined');
assert(appJs.includes('function exportProject('),    'exportProject() defined');
assert(appJs.includes('function importProject('),    'importProject() defined');
assert(appJs.includes('function _renderProjectList()'), '_renderProjectList() defined');
assert(appJs.includes('function initProjectManager()'), 'initProjectManager() defined');
assert(appJs.includes('csproj.json'),               '.csproj.json export filename');
assert(appJs.includes('window.confirm'),             'delete requires confirm()');
assert(appJs.includes('window.saveProject'),         'saveProject exposed globally');
assert(appJs.includes('window.loadProject'),         'loadProject exposed globally');
assert(appJs.includes('window.deleteProject'),       'deleteProject exposed globally');
assert(appJs.includes('window.exportProject'),       'exportProject exposed globally');
assert(appJs.includes('window.importProject'),       'importProject exposed globally');

assert(indexHtml.includes('project-manager-panel'), '#project-manager-panel in HTML');
assert(indexHtml.includes('btn-projects'),          '#btn-projects in HTML');
assert(indexHtml.includes('btn-new-project'),       '#btn-new-project in HTML');
assert(indexHtml.includes('btn-import-project'),    '#btn-import-project in HTML');
assert(indexHtml.includes('btn-save-project'),      '#btn-save-project in HTML');
assert(indexHtml.includes('project-list'),          '#project-list in HTML');
assert(indexHtml.includes('project-file-input'),    '#project-file-input in HTML');
assert(indexHtml.includes('.project-manager-panel'), '.project-manager-panel CSS');
assert(indexHtml.includes('.project-manager-panel.open'), '.project-manager-panel.open CSS');
assert(indexHtml.includes('.project-item'),         '.project-item CSS');
assert(indexHtml.includes('.project-list'),         '.project-list CSS');

// ── P52 init ──────────────────────────────────────────────────────────────────
console.log('\n▶ P52 DOMContentLoaded init');

assert(appJs.includes('initI18n()'),        'initI18n called');
assert(appJs.includes('initResponsive()'),  'initResponsive called');
assert(appJs.includes('initOnboarding()'),  'initOnboarding called');
assert(appJs.includes('initProjectManager()'), 'initProjectManager called');

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('');
console.log(`Results: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error('Failed:', errors.join(', '));
  process.exit(1);
}
console.log('✓ P52 G5/G6/G8/G9 i18n / Responsive / Onboarding / Multi-project — all checks passed');
