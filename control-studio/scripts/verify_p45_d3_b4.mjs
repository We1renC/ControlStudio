/**
 * verify_p45_d3_b4.mjs
 *
 * Verifies P45 — D3-1~3 FLOP/Memory/Platform + B4-1~2 CSV import/export
 *   D3-1  FLOP count estimator per control cycle
 *   D3-2  Memory (RAM / Flash) estimator
 *   D3-3  Platform suitability badges with tooltips
 *   B4-1  CSV import modal (drop zone, auto-delimiter, column picker)
 *   B4-2  CSV/JSON chart data export
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
const errors = [];

function ok(label)          { console.log(`  ✓ ${label}`); pass++; }
function bad(label, msg)    { console.error(`  ✗ ${label}: ${msg}`); fail++; errors.push(label); }
function assert(cond, label, msg = '') { cond ? ok(label) : bad(label, msg || 'condition failed'); }

const appJs     = readFileSync(path.join(ROOT, 'js/app.js'),  'utf8');
const indexHtml = readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// ── D3-1: FLOP Count ─────────────────────────────────────────────────────────
console.log('\n▶ D3-1 FLOP Count Estimator');

assert(appJs.includes('function estimateFLOPS('),   'estimateFLOPS() defined');
assert(appJs.includes("case 'pid':"),               "PID case in estimateFLOPS");
assert(appJs.includes('return 6;'),                 'PID returns 6 FLOP/cycle');
assert(appJs.includes("case 'sf':"),                'state-feedback case');
assert(appJs.includes("case 'kalman_pred':"),       'kalman_pred case');
assert(appJs.includes("case 'kalman_upd':"),        'kalman_upd case');
assert(appJs.includes("case 'mpc':"),               'MPC case');
assert(appJs.includes("case 'hinf':"),              'H-inf case');
assert(appJs.includes('n * n + n'),                 'sf: n²+n formula');
assert(appJs.includes('2 * n * n + n'),             'kalman_pred: 2n²+n formula');
assert(appJs.includes('3 * n * n + 2 * n * m'),    'kalman_upd: 3n²+2nm formula');
assert(appJs.includes('function initFLOPPanel()'), 'initFLOPPanel() defined');
assert(appJs.includes('btn-d3-estimate'),           'btn-d3-estimate referenced');
assert(appJs.includes('d3-flop-count'),             'd3-flop-count element');
assert(appJs.includes('d3-flop-freq'),              'd3-flop-freq element');
assert(appJs.includes('d3-ctrl-freq'),              'd3-ctrl-freq frequency input');
assert(appJs.includes('mflopsRequired'),            'mflopsRequired computed');
assert(appJs.includes('_guessControllerType()'),    '_guessControllerType() called');
assert(appJs.includes('_getSystemDims()'),          '_getSystemDims() called');

assert(indexHtml.includes('d3-flop-panel'),         '#d3-flop-panel section in HTML');
assert(indexHtml.includes('btn-d3-estimate'),        '#btn-d3-estimate in HTML');
assert(indexHtml.includes('d3-flop-count'),          '#d3-flop-count in HTML');
assert(indexHtml.includes('d3-flop-freq'),           '#d3-flop-freq in HTML');
assert(indexHtml.includes('d3-ctrl-freq'),           '#d3-ctrl-freq in HTML');
assert(indexHtml.includes('.flop-count-big'),        '.flop-count-big CSS');
assert(indexHtml.includes('.flop-freq-line'),        '.flop-freq-line CSS');

// ── D3-2: Memory Estimator ────────────────────────────────────────────────────
console.log('\n▶ D3-2 Memory Estimator');

assert(appJs.includes('function estimateMemory('),  'estimateMemory() defined');
assert(appJs.includes('const FLOAT = 4'),           'FLOAT = 4 bytes constant');
assert(appJs.includes('ram, flash, rows'),          'ram/flash/rows returned');
assert(appJs.includes('addRam'),                    'addRam() helper');
assert(appJs.includes('addFlash'),                  'addFlash() helper');
assert(appJs.includes('d3-mem-rows'),               'd3-mem-rows container');
assert(appJs.includes('d3-mem-total'),              'd3-mem-total element');
assert(appJs.includes('RAM：'),                     'RAM label rendered');
assert(appJs.includes('Flash（唯讀）'),              'Flash label rendered');

assert(indexHtml.includes('d3-mem-rows'),           '#d3-mem-rows in HTML');
assert(indexHtml.includes('d3-mem-total'),          '#d3-mem-total in HTML');
assert(indexHtml.includes('.mem-row'),              '.mem-row CSS');
assert(indexHtml.includes('.mem-val'),              '.mem-val CSS');

// ── D3-3: Platform Badges ─────────────────────────────────────────────────────
console.log('\n▶ D3-3 Platform Suitability Badges');

assert(appJs.includes('PLATFORM_DEFS'),             'PLATFORM_DEFS array defined');
assert(appJs.includes('STM32F4'),                   'STM32F4 platform entry');
assert(appJs.includes('STM32H7'),                   'STM32H7 platform entry');
assert(appJs.includes('Cortex-M0'),                 'Cortex-M0 platform entry');
assert(appJs.includes('hasFPU'),                    'hasFPU flag in platform spec');
assert(appJs.includes('function renderPlatformBadges('), 'renderPlatformBadges() defined');
assert(appJs.includes('platform-badge'),            'platform-badge class used');
assert(appJs.includes('platform-badge-tooltip'),    'platform-badge-tooltip for hover');
assert(appJs.includes('充裕 ✓'),                    'tooltip shows "充裕 ✓"');
assert(appJs.includes('不足 ✗'),                    'tooltip shows "不足 ✗"');
assert(appJs.includes('d3-platform-badges'),        'd3-platform-badges container');

assert(indexHtml.includes('d3-platform-badges'),   '#d3-platform-badges in HTML');
assert(indexHtml.includes('.platform-badge'),       '.platform-badge CSS');
assert(indexHtml.includes('.platform-badge.ok'),    '.platform-badge.ok CSS');
assert(indexHtml.includes('.platform-badge.no'),    '.platform-badge.no CSS');
assert(indexHtml.includes('.platform-badge-tooltip'), '.platform-badge-tooltip CSS');
assert(indexHtml.includes('.platform-badge-row'),   '.platform-badge-row CSS');

// ── B4-1: CSV Import ──────────────────────────────────────────────────────────
console.log('\n▶ B4-1 CSV Import');

assert(appJs.includes('function parseCSVText('),    'parseCSVText() defined');
assert(appJs.includes('_detectDelimiter('),         '_detectDelimiter() defined');
assert(appJs.includes("','"),                       'comma delimiter supported');
assert(appJs.includes("'\\t'"),                     'tab delimiter supported');
assert(appJs.includes("';'"),                       'semicolon delimiter supported');
assert(appJs.includes('function initCSVImport()'), 'initCSVImport() defined');
assert(appJs.includes('csv-import-modal'),          'csv-import-modal referenced');
assert(appJs.includes('csv-drop-zone'),             'csv-drop-zone referenced');
assert(appJs.includes('csv-file-input'),            'csv-file-input referenced');
assert(appJs.includes('csv-preview-table'),         'csv-preview-table referenced');
assert(appJs.includes('csv-col-x'),                 'csv-col-x column selector');
assert(appJs.includes('csv-col-y'),                 'csv-col-y column selector');
assert(appJs.includes('dragover'),                  'dragover event handled');
assert(appJs.includes('dragleave'),                 'dragleave event handled');
assert(appJs.includes('btn-csv-import'),            'btn-csv-import injected');
assert(appJs.includes('Plotly.addTraces'),          'Plotly.addTraces for overlay');
assert(appJs.includes("mode: 'lines+markers'"),     'marker+line for measurement data');

assert(indexHtml.includes('csv-import-modal'),      '#csv-import-modal in HTML');
assert(indexHtml.includes('csv-drop-zone'),         '#csv-drop-zone in HTML');
assert(indexHtml.includes('csv-file-input'),        '#csv-file-input in HTML');
assert(indexHtml.includes('csv-preview-section'),   '#csv-preview-section in HTML');
assert(indexHtml.includes('csv-preview-table'),     '#csv-preview-table in HTML');
assert(indexHtml.includes('csv-col-x'),             '#csv-col-x in HTML');
assert(indexHtml.includes('csv-col-y'),             '#csv-col-y in HTML');
assert(indexHtml.includes('csv-confirm-btn'),       '#csv-confirm-btn in HTML');
assert(indexHtml.includes('csv-cancel-btn'),        '#csv-cancel-btn in HTML');
assert(indexHtml.includes('.csv-drop-zone'),        '.csv-drop-zone CSS');
assert(indexHtml.includes('.csv-import-modal'),     '.csv-import-modal CSS');
assert(indexHtml.includes('.csv-preview-table'),    '.csv-preview-table CSS');
assert(indexHtml.includes('.csv-preview-wrap'),     '.csv-preview-wrap CSS');

// ── B4-2: CSV/JSON Data Export ────────────────────────────────────────────────
console.log('\n▶ B4-2 CSV/JSON Data Export');

assert(appJs.includes('function exportChartCSV()'),  'exportChartCSV() defined');
assert(appJs.includes('function exportChartJSON()'), 'exportChartJSON() defined');
assert(appJs.includes('function _downloadBlob('),    '_downloadBlob() helper');
assert(appJs.includes('function initDataExport()'),  'initDataExport() defined');
assert(appJs.includes('# ControlStudio Export'),     'CSV header comment included');
assert(appJs.includes('meta:'),                      'JSON meta field');
assert(appJs.includes('series:'),                    'JSON series field');
assert(appJs.includes('cs-data-'),                   'export filename prefix cs-data-');
assert(appJs.includes('text/csv'),                   'CSV MIME type');
assert(appJs.includes('application/json'),           'JSON MIME type');
assert(appJs.includes('URL.createObjectURL'),        'blob URL used for download');
assert(appJs.includes('URL.revokeObjectURL'),        'blob URL revoked after download');
assert(appJs.includes("btn-export-json')?.addEventListener"), 'btn-export-json wired');
assert(appJs.includes("btn-export-csv')?.addEventListener"),  'btn-export-csv wired');

// ── P45 init ──────────────────────────────────────────────────────────────────
console.log('\n▶ P45 DOMContentLoaded init');

assert(appJs.includes('initFLOPPanel()'),    'initFLOPPanel called in init');
assert(appJs.includes('initCSVImport()'),    'initCSVImport called in init');
assert(appJs.includes('initDataExport()'),   'initDataExport called in init');

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('');
console.log(`Results: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error('Failed:', errors.join(', '));
  process.exit(1);
}
console.log('✓ P45 D3/B4 FLOP+Memory+Platform+CSV — all checks passed');
