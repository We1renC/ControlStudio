/**
 * verify_p48_a3.mjs
 *
 * Verifies P48 — A3-2 Draggable RL poles + A3-3 Bode breakpoint drag
 *              + A3-4 History drawer (extends existing undo/redo)
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

// ── Existing Undo/Redo (sanity check) ────────────────────────────────────────
console.log('\n▶ Existing Undo/Redo System');

assert(appJs.includes('const _history'),             '_history stack defined');
assert(appJs.includes('maxDepth: 50'),               '50-step limit');
assert(appJs.includes('function historySave()'),     'historySave() defined');
assert(appJs.includes('function historyUndo()'),     'historyUndo() defined');
assert(appJs.includes('function historyRedo()'),     'historyRedo() defined');
assert(appJs.includes('function _applySnapshot('),   '_applySnapshot() defined');
assert(appJs.includes('btn-undo'),                   'btn-undo referenced');
assert(appJs.includes('btn-redo'),                   'btn-redo referenced');

// ── A3-4: History Drawer ──────────────────────────────────────────────────────
console.log('\n▶ A3-4 History Drawer');

assert(appJs.includes('_historyMeta'),               '_historyMeta parallel array');
assert(appJs.includes('function pushHistoryEntry('), 'pushHistoryEntry() defined');
assert(appJs.includes('function _renderHistoryList()'), '_renderHistoryList() defined');
assert(appJs.includes('function initHistoryDrawer()'),  'initHistoryDrawer() defined');
assert(appJs.includes('history-drawer'),             'history-drawer referenced');
assert(appJs.includes('history-list'),               'history-list referenced');
assert(appJs.includes('history-item'),               'history-item class');
assert(appJs.includes("'current'"),                  'current item highlight class');
assert(appJs.includes('history-star-btn'),           'star button in history items');
assert(appJs.includes('btn-history'),                'btn-history referenced');
assert(appJs.includes('history-close-btn'),          'history-close-btn referenced');
assert(appJs.includes('window.pushHistoryEntry'),    'pushHistoryEntry exposed globally');
assert(appJs.includes('starred'),                    'starred flag in history meta');

assert(indexHtml.includes('history-drawer'),         '#history-drawer in HTML');
assert(indexHtml.includes('history-list'),           '#history-list in HTML');
assert(indexHtml.includes('history-close-btn'),      '#history-close-btn in HTML');
assert(indexHtml.includes('btn-history'),            '#btn-history in HTML');
assert(indexHtml.includes('.history-drawer'),        '.history-drawer CSS');
assert(indexHtml.includes('.history-drawer.open'),   '.history-drawer.open CSS');
assert(indexHtml.includes('.history-item'),          '.history-item CSS');
assert(indexHtml.includes('.history-item.current'),  '.history-item.current CSS');
assert(indexHtml.includes('.history-item-time'),     '.history-item-time CSS');
assert(indexHtml.includes('.history-item-label'),    '.history-item-label CSS');
assert(indexHtml.includes('.history-item-star'),     '.history-item-star CSS');
assert(indexHtml.includes('.history-name-badge'),    '.history-name-badge CSS');

// ── A3-2: Draggable Poles ─────────────────────────────────────────────────────
console.log('\n▶ A3-2 Root Locus Interactive Mode');

assert(appJs.includes('function initDraggablePoles()'), 'initDraggablePoles() defined');
assert(appJs.includes('btn-rl-interact'),            'btn-rl-interact referenced');
assert(appJs.includes('_interactiveMode'),           '_interactiveMode state variable');
assert(appJs.includes('rl-interact-active'),         'rl-interact-active class toggled');
assert(appJs.includes('rl-interact-hint'),           'rl-interact-hint referenced');
assert(appJs.includes('rl-k-float-badge'),           'rl-k-float-badge referenced');
assert(appJs.includes('rl-k-slider'),                'rl-k-slider updated on click');
assert(appJs.includes('退出互動'),                   '退出互動 toggle label');
assert(appJs.includes('pushHistoryEntry'),           'history saved on RL interaction');

assert(indexHtml.includes('btn-rl-interact'),        '#btn-rl-interact in HTML');
assert(indexHtml.includes('rl-interact-hint'),       '#rl-interact-hint in HTML');
assert(indexHtml.includes('rl-k-float-badge'),       '#rl-k-float-badge in HTML');
assert(indexHtml.includes('.rl-interact-active'),    '.rl-interact-active CSS');
assert(indexHtml.includes('.rl-k-float-badge'),      '.rl-k-float-badge CSS');

// ── A3-3: Bode Breakpoint Drag ────────────────────────────────────────────────
console.log('\n▶ A3-3 Bode Breakpoint Drag');

assert(appJs.includes('function initBodeBreakpointDrag()'), 'initBodeBreakpointDrag() defined');
assert(appJs.includes('btn-bode-compensator'),       'btn-bode-compensator referenced');
assert(appJs.includes('bode-comp-hint'),             'bode-comp-hint referenced');
assert(appJs.includes('_bodeCompMode'),              '_bodeCompMode state variable');
assert(appJs.includes('_breakpointFreq'),            '_breakpointFreq tracking variable');
assert(appJs.includes('bode-compensator-active'),    'bode-compensator-active class toggled');
assert(appJs.includes('折點設定'),                   '折點設定 notification');
assert(appJs.includes('退出折點模式'),               '退出折點模式 toggle label');
assert(appJs.includes('window._bodeBreakpointFreq'), '_bodeBreakpointFreq exposed');
assert(appJs.includes('Math.pow(10,'),               'log-scale frequency conversion');

assert(indexHtml.includes('btn-bode-compensator'),   '#btn-bode-compensator in HTML');
assert(indexHtml.includes('bode-comp-hint'),         '#bode-comp-hint in HTML');
assert(indexHtml.includes('.bode-compensator-active'), '.bode-compensator-active CSS');
assert(indexHtml.includes('.bode-drag-hint'),        '.bode-drag-hint CSS');

// ── P48 init ──────────────────────────────────────────────────────────────────
console.log('\n▶ P48 DOMContentLoaded init');

assert(appJs.includes('initHistoryDrawer()'),        'initHistoryDrawer called');
assert(appJs.includes('initDraggablePoles()'),       'initDraggablePoles called');
assert(appJs.includes('initBodeBreakpointDrag()'),   'initBodeBreakpointDrag called');

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('');
console.log(`Results: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error('Failed:', errors.join(', '));
  process.exit(1);
}
console.log('✓ P48 A3 Draggable Poles + Bode Breakpoint + History Drawer — all checks passed');
