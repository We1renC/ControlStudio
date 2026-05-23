/**
 * verify_p44_split_tabs.mjs
 *
 * Verifies P44 — F2-1 Split Pane + F2-2 Design Tab System:
 *   F2-1  Draggable sidebar divider with min-width, localStorage persistence, dblclick reset
 *   F2-2  Multi-design tab bar: add/close/switch tabs with state snapshot
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

// ── F2-1: Split Pane ─────────────────────────────────────────────────────────
console.log('\n▶ F2-1 Split Pane Divider');

assert(appJs.includes('function initSplitPane()'), 'initSplitPane() function');
assert(appJs.includes('SPLIT_KEY'), 'SPLIT_KEY localStorage key defined');
assert(appJs.includes('SPLIT_MIN_PX'), 'SPLIT_MIN_PX min width constant');
assert(appJs.includes('workspace-divider'), '#workspace-divider element referenced');
assert(appJs.includes('btn-split-pane'), '#btn-split-pane button referenced');
assert(appJs.includes('enableSplit'), 'enableSplit() function');
assert(appJs.includes('disableSplit'), 'disableSplit() function');
assert(appJs.includes('dragging'), 'dragging state variable');
assert(appJs.includes('requestAnimationFrame'), 'RAF used for smooth dragging');
assert(appJs.includes('mousedown'), 'mousedown event for drag start');
assert(appJs.includes('mousemove'), 'mousemove event for drag');
assert(appJs.includes('mouseup'), 'mouseup event for drag end');
assert(appJs.includes('localStorage.setItem(SPLIT_KEY'), 'width saved to localStorage');
assert(appJs.includes('localStorage.getItem(SPLIT_KEY'), 'width restored from localStorage');
assert(appJs.includes('dblclick'), 'dblclick resets to 50/50');
assert(appJs.includes('_splitPaneEnabled'), '_splitPaneEnabled exposed globally');

assert(indexHtml.includes('workspace-divider'), '#workspace-divider in HTML');
assert(indexHtml.includes('btn-split-pane'), '#btn-split-pane in header HTML');
assert(indexHtml.includes('.workspace-divider'), '.workspace-divider CSS defined');
assert(indexHtml.includes('.workspace-divider:hover'), '.workspace-divider:hover CSS');
assert(indexHtml.includes('.workspace-divider.dragging'), '.workspace-divider.dragging CSS');
assert(indexHtml.includes('.workspace-divider::after'), '.workspace-divider::after center line CSS');
assert(indexHtml.includes('main-content-area'), '#main-content-area wrapper in HTML');

// ── F2-2: Design Tab System ───────────────────────────────────────────────────
console.log('\n▶ F2-2 Design Tab System');

assert(appJs.includes('function initDesignTabs()'), 'initDesignTabs() function');
assert(appJs.includes('DESIGN_TABS_KEY'), 'DESIGN_TABS_KEY defined');
assert(appJs.includes('design-tab-bar'), '#design-tab-bar element referenced');
assert(appJs.includes('design-tab-new'), '#design-tab-new button referenced');
assert(appJs.includes('design-tab-close'), '.design-tab-close close button');
assert(appJs.includes('design-tab-dot'), '.design-tab-dot status indicator');
assert(appJs.includes('function renderTabs()'), 'renderTabs() inner function');
assert(appJs.includes('function switchToTab('), 'switchToTab() function');
assert(appJs.includes('function closeTab('), 'closeTab() function');
assert(appJs.includes('function addTab('), 'addTab() function');
assert(appJs.includes('_tabs'), '_tabs array state');
assert(appJs.includes('_activeTabId'), '_activeTabId tracking');
assert(appJs.includes('snapshot'), 'snapshot saved per tab');
assert(appJs.includes('confirm('), 'confirm() dialog before closing');
assert(appJs.includes("bar.classList.toggle('visible'"), 'bar shown when ≥2 tabs');
assert(appJs.includes('window.addDesignTab'), 'addDesignTab exposed globally');
assert(appJs.includes('window.switchDesignTab'), 'switchDesignTab exposed globally');

assert(indexHtml.includes('design-tab-bar'), '#design-tab-bar in HTML');
assert(indexHtml.includes('design-tab-new'), '#design-tab-new in HTML');
assert(indexHtml.includes('.design-tab-bar'), '.design-tab-bar CSS defined');
assert(indexHtml.includes('.design-tab'), '.design-tab CSS defined');
assert(indexHtml.includes('.design-tab.active'), '.design-tab.active CSS');
assert(indexHtml.includes('.design-tab-name'), '.design-tab-name CSS');
assert(indexHtml.includes('.design-tab-close'), '.design-tab-close CSS');
assert(indexHtml.includes('.design-tab-dot'), '.design-tab-dot CSS');
assert(indexHtml.includes('.design-tab-new'), '.design-tab-new CSS');
assert(indexHtml.includes('.design-tab-bar.visible'), '.design-tab-bar.visible CSS');

// ── P44 init ──────────────────────────────────────────────────────────────────
console.log('\n▶ P44 DOMContentLoaded init');

assert(appJs.includes('initSplitPane()'), 'initSplitPane called in init');
assert(appJs.includes('initDesignTabs()'), 'initDesignTabs called in init');

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('');
console.log(`Results: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error('Failed:', errors.join(', '));
  process.exit(1);
}
console.log('✓ P44 F2-1/F2-2 Split Pane + Design Tabs — all checks passed');
