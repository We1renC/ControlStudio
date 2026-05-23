/**
 * verify_p47_c1_c4.mjs
 *
 * Verifies P47 — C1-1~3 Topic Index Cards + C4-1~3 Draft/Notes/Completion
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

// ── C1-1: Topic Index Cards ───────────────────────────────────────────────────
console.log('\n▶ C1-1 Topic Index Cards');

assert(appJs.includes('LEARN_TOPICS'),               'LEARN_TOPICS array defined');
assert(appJs.includes("id: 'pid'"),                  "pid topic");
assert(appJs.includes("id: 'rlocus'"),               "rlocus topic");
assert(appJs.includes("id: 'freq'"),                 "freq topic");
assert(appJs.includes("id: 'ss'"),                   "ss topic");
assert(appJs.includes('LEARN_ADVANCED'),             'LEARN_ADVANCED defined');
assert(appJs.includes('function initLearnWelcome()'), 'initLearnWelcome() defined');
assert(appJs.includes('learn-card-grid'),            'learn-card-grid referenced');
assert(appJs.includes('learn-card'),                 'learn-card class');
assert(appJs.includes('_checkLearnWelcome'),         '_checkLearnWelcome exposed');
assert(appJs.includes('開始學習 →'),                  '開始學習 label');
assert(appJs.includes('探索 →'),                     '探索 advanced label');

assert(indexHtml.includes('learn-welcome'),          '#learn-welcome in HTML');
assert(indexHtml.includes('learn-card-grid'),        '#learn-card-grid in HTML');
assert(indexHtml.includes('.learn-card-grid'),       '.learn-card-grid CSS');
assert(indexHtml.includes('.learn-card'),            '.learn-card CSS');
assert(indexHtml.includes('.learn-card:hover'),      '.learn-card:hover CSS');
assert(indexHtml.includes('.learn-card-icon'),       '.learn-card-icon CSS');
assert(indexHtml.includes('.learn-card-title'),      '.learn-card-title CSS');
assert(indexHtml.includes('.learn-card-desc'),       '.learn-card-desc CSS');
assert(indexHtml.includes('.learn-card-adv'),        '.learn-card-adv CSS');

// ── C1-2: Explain Panel ───────────────────────────────────────────────────────
console.log('\n▶ C1-2 "What is this?" Explain Panel');

assert(appJs.includes('EXPLAIN_MAP'),               'EXPLAIN_MAP defined');
assert(appJs.includes("pid:"),                      'PID explain entry');
assert(appJs.includes("lqr:"),                      'LQR explain entry');
assert(appJs.includes("hinf:"),                     'H-inf explain entry');
assert(appJs.includes("mpc:"),                      'MPC explain entry');
assert(appJs.includes('function initExplainPanel()'), 'initExplainPanel() defined');
assert(appJs.includes('explain-drawer'),            'explain-drawer referenced');
assert(appJs.includes('btn-explain'),               'btn-explain referenced');
assert(appJs.includes('explain-close-btn'),         'explain-close-btn referenced');
assert(appJs.includes('explain-title'),             'explain-title element');
assert(appJs.includes('explain-body'),              'explain-body element');
assert(appJs.includes('window.openExplain'),        'openExplain exposed globally');
assert(appJs.includes('explain-section-title'),     'explain-section-title class used');
assert(appJs.includes('explain-item'),              'explain-item class used');

assert(indexHtml.includes('explain-drawer'),        '#explain-drawer in HTML');
assert(indexHtml.includes('btn-explain'),           '#btn-explain in HTML');
assert(indexHtml.includes('explain-close-btn'),     '#explain-close-btn in HTML');
assert(indexHtml.includes('explain-title'),         '#explain-title in HTML');
assert(indexHtml.includes('explain-body'),          '#explain-body in HTML');
assert(indexHtml.includes('.explain-drawer'),       '.explain-drawer CSS');
assert(indexHtml.includes('.explain-drawer.open'),  '.explain-drawer.open CSS');
assert(indexHtml.includes('.explain-section-title'), '.explain-section-title CSS');
assert(indexHtml.includes('.explain-item'),         '.explain-item CSS');

// ── C1-3: Load Example Button ─────────────────────────────────────────────────
console.log('\n▶ C1-3 "Load Example" Button');

assert(appJs.includes('EXAMPLE_PRESETS'),           'EXAMPLE_PRESETS array defined');
assert(appJs.includes("id: 'dc_motor'"),            "dc_motor preset");
assert(appJs.includes("id: 'mass_spring'"),         "mass_spring preset");
assert(appJs.includes("id: 'first_order'"),         "first_order preset");
assert(appJs.includes("id: 'unstable'"),            "unstable preset");
assert(appJs.includes('function loadExample('),     'loadExample() defined');
assert(appJs.includes('function initExampleLoader()'), 'initExampleLoader() defined');
assert(appJs.includes('btn-load-example'),          'btn-load-example referenced');
assert(appJs.includes('example-dropdown'),          'example-dropdown referenced');
assert(appJs.includes('example-dropdown-item'),     'example-dropdown-item class');
assert(appJs.includes('window.loadExample'),        'loadExample exposed globally');

assert(indexHtml.includes('btn-load-example'),      '#btn-load-example in HTML');
assert(indexHtml.includes('example-dropdown'),      '#example-dropdown in HTML');
assert(indexHtml.includes('.example-dropdown-item'), '.example-dropdown-item CSS');

// ── C4-1: Draft Autosave ──────────────────────────────────────────────────────
console.log('\n▶ C4-1 Draft Autosave');

assert(appJs.includes("DRAFT_KEY"),                 'DRAFT_KEY constant');
assert(appJs.includes("'cs-draft'"),                "cs-draft localStorage key");
assert(appJs.includes("DRAFT_VERSION"),             'DRAFT_VERSION constant');
assert(appJs.includes("'2.0'"),                     "version 2.0");
assert(appJs.includes('function saveDraft()'),      'saveDraft() defined');
assert(appJs.includes('function _scheduleDraft()'), '_scheduleDraft() defined');
assert(appJs.includes('function _restoreDraft('),   '_restoreDraft() defined');
assert(appJs.includes('function initDraftAutosave()'), 'initDraftAutosave() defined');
assert(appJs.includes('requestIdleCallback'),        'requestIdleCallback for non-blocking save');
assert(appJs.includes('draft-banner'),              'draft-banner referenced');
assert(appJs.includes('draft-saved-indicator'),     'draft-saved-indicator referenced');
assert(appJs.includes('draft-restore-btn'),         'draft-restore-btn referenced');
assert(appJs.includes('200 * 1024'),                '200KB cap on draft size');
assert(appJs.includes('草稿格式不符'),               'version mismatch warning');

assert(indexHtml.includes('draft-banner'),          '#draft-banner in HTML');
assert(indexHtml.includes('draft-saved-indicator'), '#draft-saved-indicator in HTML');
assert(indexHtml.includes('.draft-dirty'),          '.draft-dirty CSS class');

// ── C4-2: Notes System ────────────────────────────────────────────────────────
console.log('\n▶ C4-2 Notes & Bookmarks');

assert(appJs.includes("NOTES_KEY"),                 'NOTES_KEY constant');
assert(appJs.includes("'cs-notes'"),                "cs-notes localStorage key");
assert(appJs.includes("BOOKMARKS_KEY"),             'BOOKMARKS_KEY constant');
assert(appJs.includes("'cs-bookmarks'"),            "cs-bookmarks localStorage key");
assert(appJs.includes('function initNotesSystem()'), 'initNotesSystem() defined');
assert(appJs.includes('notes-drawer'),              'notes-drawer referenced');
assert(appJs.includes('notes-list'),                'notes-list referenced');
assert(appJs.includes('btn-add-note'),              'btn-add-note referenced');
assert(appJs.includes('btn-add-bookmark'),          'btn-add-bookmark referenced');
assert(appJs.includes('bookmarks-list'),            'bookmarks-list referenced');
assert(appJs.includes('notes-search'),              'notes-search referenced');
assert(appJs.includes('.slice(-100)'),              'notes capped at 100 items');
assert(appJs.includes('.slice(-50)'),               'bookmarks capped at 50 items');
assert(appJs.includes('contenteditable'),           'notes are inline-editable');

assert(indexHtml.includes('notes-drawer'),          '#notes-drawer in HTML');
assert(indexHtml.includes('btn-notes'),             '#btn-notes in HTML');
assert(indexHtml.includes('notes-list'),            '#notes-list in HTML');
assert(indexHtml.includes('btn-add-note'),          '#btn-add-note in HTML');
assert(indexHtml.includes('btn-add-bookmark'),      '#btn-add-bookmark in HTML');
assert(indexHtml.includes('bookmarks-list'),        '#bookmarks-list in HTML');
assert(indexHtml.includes('notes-search'),          '#notes-search in HTML');
assert(indexHtml.includes('.notes-drawer'),         '.notes-drawer CSS');
assert(indexHtml.includes('.notes-drawer.open'),    '.notes-drawer.open CSS');
assert(indexHtml.includes('.note-item'),            '.note-item CSS');
assert(indexHtml.includes('.note-meta'),            '.note-meta CSS');
assert(indexHtml.includes('.bookmark-item'),        '.bookmark-item CSS');

// ── C4-3: Completion Badge ────────────────────────────────────────────────────
console.log('\n▶ C4-3 Completion Badge');

assert(appJs.includes('function _confetti()'),          '_confetti() animation defined');
assert(appJs.includes('prefers-reduced-motion'),        'reduced-motion check for confetti');
assert(appJs.includes('function showCompletionBanner('), 'showCompletionBanner() defined');
assert(appJs.includes('function initCompletionBadge()'), 'initCompletionBadge() defined');
assert(appJs.includes('completion-banner'),             'completion-banner referenced');
assert(appJs.includes('window.showCompletionBanner'),   'showCompletionBanner exposed globally');
assert(appJs.includes('設計完成！'),                     '完成 message');
assert(appJs.includes('spec-compliance-bar'),           'spec-compliance-bar observed');
assert(appJs.includes('MutationObserver'),              'MutationObserver watches spec badges');

assert(indexHtml.includes('completion-banner'),         '#completion-banner in HTML');
assert(indexHtml.includes('.completion-banner'),        '.completion-banner CSS');

// ── P47 init ──────────────────────────────────────────────────────────────────
console.log('\n▶ P47 DOMContentLoaded init');

assert(appJs.includes('initLearnWelcome()'),    'initLearnWelcome called');
assert(appJs.includes('initExplainPanel()'),    'initExplainPanel called');
assert(appJs.includes('initExampleLoader()'),   'initExampleLoader called');
assert(appJs.includes('initDraftAutosave()'),   'initDraftAutosave called');
assert(appJs.includes('initNotesSystem()'),     'initNotesSystem called');
assert(appJs.includes('initCompletionBadge()'), 'initCompletionBadge called');

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('');
console.log(`Results: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error('Failed:', errors.join(', '));
  process.exit(1);
}
console.log('✓ P47 C1/C4 Topic Cards + Draft/Notes/Completion — all checks passed');
