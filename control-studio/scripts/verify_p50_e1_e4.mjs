/**
 * verify_p50_e1_e4.mjs
 *
 * Verifies P50 — E1~E4 Design Assessment Dashboard, Scoring Matrix,
 *               Report Output System, and Decision Log
 *   E1-1~3  Dashboard overview (compliance pills, metrics, trend bar)
 *   E2-1~3  Scoring matrix + radar chart + recommendation badges
 *   E3-1~3  Report output (full HTML blob, watermark, print CSS)
 *   E4-1~3  Decision log (log entries, star, CSV export, sign-off)
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

// ── E1-1~3: Dashboard Overview ────────────────────────────────────────────────
console.log('\n▶ E1 Dashboard Overview');

assert(appJs.includes('function updateDashboard()'),   'updateDashboard() defined');
assert(appJs.includes('function initDashboard()'),     'initDashboard() defined');
assert(appJs.includes('btn-e1-refresh'),               'btn-e1-refresh referenced');
assert(appJs.includes('btn-e1-export-report'),         'btn-e1-export-report referenced');
assert(appJs.includes('e1-trend-bar'),                 'e1-trend-bar referenced');
assert(appJs.includes('e1-trend-label'),               'e1-trend-label referenced');
assert(appJs.includes('e1-pass-pill'),                 'e1-pass-pill class used');
assert(appJs.includes('e1-metric'),                    'e1-metric class used');
assert(appJs.includes('e1-trend-seg'),                 'e1-trend-seg class used');
assert(appJs.includes('window.updateDashboard'),       'updateDashboard exposed globally');
assert(appJs.includes('report-meta-modal'),            'report-meta-modal opened on export');

assert(indexHtml.includes('e1-dashboard-section'),     '#e1-dashboard-section in HTML');
assert(indexHtml.includes('btn-e1-refresh'),           '#btn-e1-refresh in HTML');
assert(indexHtml.includes('btn-e1-export-report'),     '#btn-e1-export-report in HTML');
assert(indexHtml.includes('e1-dashboard-grid'),        '#e1-dashboard-grid in HTML');
assert(indexHtml.includes('e1-trend-bar'),             '#e1-trend-bar in HTML');
assert(indexHtml.includes('e1-trend-label'),           '#e1-trend-label in HTML');
assert(indexHtml.includes('.e1-dashboard'),            '.e1-dashboard CSS');
assert(indexHtml.includes('.e1-card'),                 '.e1-card CSS');
assert(indexHtml.includes('.e1-card-title'),           '.e1-card-title CSS');
assert(indexHtml.includes('.e1-metric'),               '.e1-metric CSS');
assert(indexHtml.includes('.e1-pass-pill'),            '.e1-pass-pill CSS');
assert(indexHtml.includes('.e1-trend-bar'),            '.e1-trend-bar CSS');
assert(indexHtml.includes('.e1-trend-seg'),            '.e1-trend-seg CSS');

// ── E2-1~3: Scoring Matrix + Radar + Recommendations ─────────────────────────
console.log('\n▶ E2 Scoring Matrix + Radar');

assert(appJs.includes('CTRL_COMPLEXITY'),              'CTRL_COMPLEXITY defined');
assert(appJs.includes('function computeDesignScore('), 'computeDesignScore() defined');
assert(appJs.includes('function renderScoringMatrix('), 'renderScoringMatrix() defined');
assert(appJs.includes('function drawRadarChart('),     'drawRadarChart() defined');
assert(appJs.includes('function initScoringMatrix()'), 'initScoringMatrix() defined');
assert(appJs.includes('btn-e2-score'),                 'btn-e2-score referenced');
assert(appJs.includes('e2-score-table-wrap'),          'e2-score-table-wrap referenced');
assert(appJs.includes('e2-radar-chart'),               'e2-radar-chart referenced');
assert(appJs.includes('e2-recommend-badge'),           'e2-recommend-badge class used');
assert(appJs.includes('best-all'),                     'best-all badge class');
assert(appJs.includes('best-rob'),                     'best-rob badge class');
assert(appJs.includes('best-fast'),                    'best-fast badge class');
assert(appJs.includes('best-simp'),                    'best-simp badge class');
assert(appJs.includes('0.4') && appJs.includes('0.2'), 'scoring weights (0.4 perf/rob, 0.2 comp)');

assert(indexHtml.includes('e2-scoring-section'),       '#e2-scoring-section in HTML');
assert(indexHtml.includes('btn-e2-score'),             '#btn-e2-score in HTML');
assert(indexHtml.includes('e2-score-table-wrap'),      '#e2-score-table-wrap in HTML');
assert(indexHtml.includes('e2-radar-chart'),           '#e2-radar-chart in HTML');
assert(indexHtml.includes('.e2-score-table'),          '.e2-score-table CSS');
assert(indexHtml.includes('.e2-score-bar'),            '.e2-score-bar CSS');
assert(indexHtml.includes('.e2-recommend-badge'),      '.e2-recommend-badge CSS');
assert(indexHtml.includes('.e2-recommend-badge.best-all'), '.e2-recommend-badge.best-all CSS');
assert(indexHtml.includes('.e2-recommend-badge.best-rob'), '.e2-recommend-badge.best-rob CSS');
assert(indexHtml.includes('.e2-recommend-badge.best-fast'), '.e2-recommend-badge.best-fast CSS');
assert(indexHtml.includes('.e2-recommend-badge.best-simp'), '.e2-recommend-badge.best-simp CSS');

// ── E3-1~3: Report Output System ─────────────────────────────────────────────
console.log('\n▶ E3 Report Output System');

assert(appJs.includes('function generateFullReport()'), 'generateFullReport() defined');
assert(appJs.includes('function initReportOutput()'),   'initReportOutput() defined');
assert(appJs.includes('e3-title'),                      'e3-title referenced');
assert(appJs.includes('e3-subtitle'),                   'e3-subtitle referenced');
assert(appJs.includes('e3-author'),                     'e3-author referenced');
assert(appJs.includes('e3-reviewer'),                   'e3-reviewer referenced');
assert(appJs.includes('e3-confidential'),               'e3-confidential referenced');
assert(appJs.includes('report-watermark'),              'report-watermark referenced');
assert(appJs.includes('report-meta-modal'),             'report-meta-modal toggle in E3');
assert(appJs.includes('_downloadBlob'),                 '_downloadBlob used for report download');

assert(indexHtml.includes('report-meta-modal'),        '#report-meta-modal in HTML');
assert(indexHtml.includes('e3-title'),                 '#e3-title in HTML');
assert(indexHtml.includes('e3-subtitle'),              '#e3-subtitle in HTML');
assert(indexHtml.includes('e3-author'),                '#e3-author in HTML');
assert(indexHtml.includes('e3-reviewer'),              '#e3-reviewer in HTML');
assert(indexHtml.includes('e3-confidential'),          '#e3-confidential in HTML');
assert(indexHtml.includes('report-watermark'),         '#report-watermark in HTML');
assert(indexHtml.includes('.report-meta-modal'),       '.report-meta-modal CSS');
assert(indexHtml.includes('.report-meta-modal.open'),  '.report-meta-modal.open CSS');
assert(indexHtml.includes('.report-meta-box'),         '.report-meta-box CSS');
assert(indexHtml.includes('.report-meta-grid'),        '.report-meta-grid CSS');
assert(indexHtml.includes('.report-watermark'),        '.report-watermark CSS');
assert(indexHtml.includes('.report-watermark.internal'),     '.report-watermark.internal CSS');
assert(indexHtml.includes('.report-watermark.confidential'), '.report-watermark.confidential CSS');
assert(indexHtml.includes('@media print'),             '@media print CSS rules');

// ── E4-1~3: Decision Log ──────────────────────────────────────────────────────
console.log('\n▶ E4 Decision Log');

assert(appJs.includes('const DECISION_LOG'),            'DECISION_LOG array defined');
assert(appJs.includes('function logDecision('),         'logDecision() defined');
assert(appJs.includes('function _renderDecisionLog()'), '_renderDecisionLog() defined');
assert(appJs.includes('function initDecisionLog()'),    'initDecisionLog() defined');
assert(appJs.includes('decision-log-list'),             'decision-log-list referenced');
assert(appJs.includes('btn-e4-export-csv'),             'btn-e4-export-csv referenced');
assert(appJs.includes('window.logDecision'),            'logDecision exposed globally');
assert(appJs.includes('e4-designer'),                   'e4-designer referenced');
assert(appJs.includes('e4-approver'),                   'e4-approver referenced');
assert(appJs.includes('starred'),                       'starred flag in decision items');
assert(appJs.includes('DECISION_LOG.unshift'),          'new entries prepended (newest first)');

assert(indexHtml.includes('e4-decision-section'),      '#e4-decision-section in HTML');
assert(indexHtml.includes('decision-log-list'),        '#decision-log-list in HTML');
assert(indexHtml.includes('btn-e4-export-csv'),        '#btn-e4-export-csv in HTML');
assert(indexHtml.includes('e4-designer'),              '#e4-designer in HTML');
assert(indexHtml.includes('e4-reviewer'),              '#e4-reviewer in HTML');
assert(indexHtml.includes('e4-approver'),              '#e4-approver in HTML');
assert(indexHtml.includes('.decision-log-panel'),      '.decision-log-panel CSS');
assert(indexHtml.includes('.decision-log-item'),       '.decision-log-item CSS');
assert(indexHtml.includes('.decision-chip'),           '.decision-chip CSS');
assert(indexHtml.includes('.decision-time'),           '.decision-time CSS');
assert(indexHtml.includes('.decision-change'),         '.decision-change CSS');
assert(indexHtml.includes('.decision-effect'),         '.decision-effect CSS');
assert(indexHtml.includes('.signoff-row'),             '.signoff-row CSS');

// ── P50 DOMContentLoaded init ─────────────────────────────────────────────────
console.log('\n▶ P50 DOMContentLoaded init');

assert(appJs.includes('initDashboard()'),              'initDashboard called');
assert(appJs.includes('initScoringMatrix()'),          'initScoringMatrix called');
assert(appJs.includes('initReportOutput()'),           'initReportOutput called');
assert(appJs.includes('initDecisionLog()'),            'initDecisionLog called');

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('');
console.log(`Results: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error('Failed:', errors.join(', '));
  process.exit(1);
}
console.log('✓ P50 E1~E4 Dashboard / Scoring / Report / Decision Log — all checks passed');
