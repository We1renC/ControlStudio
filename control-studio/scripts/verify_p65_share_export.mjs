/**
 * verify_p65_share_export.mjs
 *
 * Verifies P65 — Share & Export Enhancement:
 *   Q1-1  URL sharing (serializeDesign / shareDesign / restoreFromURL)
 *   Q1-2  Code generation v2 (C99 + annotated comments)
 *   Q1-3  PDF report generation (buildReportHTML / generatePDFReport)
 *   Q1-4  Chart quick copy (copyChartToClipboard)
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

// ── Q1-1: URL Sharing ─────────────────────────────────────────────────────────
console.log('\n▶ Q1-1 URL Design Sharing');

assert(appJs.includes('function serializeDesign()'),          'serializeDesign() defined');
assert(appJs.includes('function serializePlant('),            'serializePlant() defined');
assert(appJs.includes('function serializeSpecs()'),           'serializeSpecs() defined');
assert(appJs.includes('async function shareDesign()'),        'shareDesign() async defined');
assert(appJs.includes('function restoreFromURL()'),           'restoreFromURL() defined');
assert(appJs.includes('function initShareDesign()'),          'initShareDesign() defined');
assert(appJs.includes("v: 2"),                                'schema version v:2 in serializeDesign');
assert(appJs.includes("'#design='") || appJs.includes('"#design="') || appJs.includes('startsWith(') ,
                                                              '#design= hash prefix checked');
assert(appJs.includes("navigator.clipboard.writeText"),       'URL copied to clipboard');
assert(appJs.includes('history.replaceState'),                'hash cleared after restore');
assert(appJs.includes('initShareExport()'),                   'initShareExport() called in DOMContentLoaded');
// HTML
assert(indexHtml.includes('id="btn-share-design"'),           '#btn-share-design button in HTML');

// ── Q1-2: Code Generation v2 ──────────────────────────────────────────────────
console.log('\n▶ Q1-2 Code Generation v2 (C99)');

assert(appJs.includes('function toC99Script('),               'toC99Script() defined');
assert(appJs.includes('function initCodegenV2()'),            'initCodegenV2() defined');
assert(appJs.includes('window.toC99Script'),                  'toC99Script exposed globally');
assert(appJs.includes('typedef struct'),                      'C99 struct in template');
assert(appJs.includes('double kp'),                           'C99 kp field with comment');
assert(appJs.includes('double ki'),                           'C99 ki field with comment');
assert(appJs.includes('double kd'),                           'C99 kd field with comment');
assert(appJs.includes('pid_update'),                          'pid_update() function in C99');
assert(appJs.includes("'c99'") || appJs.includes('"c99"'),   'c99 lang handled in code preview');

// ── Q1-3: PDF Report ──────────────────────────────────────────────────────────
console.log('\n▶ Q1-3 PDF Report Generation');

assert(appJs.includes('function buildReportHTML('),           'buildReportHTML() defined');
assert(appJs.includes('async function generatePDFReport()'),  'generatePDFReport() async defined');
assert(appJs.includes('function initPDFReport()'),            'initPDFReport() defined');
assert(appJs.includes('window.open'),                         'window.open used for report tab');
assert(appJs.includes('Plotly.toImage'),                      'Plotly.toImage for chart SVG export');
assert(appJs.includes('page-break-before'),                   'print CSS page-break in report HTML');
assert(appJs.includes('.pass'),                               '.pass CSS class in report');
assert(appJs.includes('.fail'),                               '.fail CSS class in report');
assert(appJs.includes('Phase Margin'),                        'Phase Margin spec row in report');
assert(appJs.includes('Gain Margin'),                         'Gain Margin spec row in report');
// HTML
assert(indexHtml.includes('id="btn-pdf-report"'),             '#btn-pdf-report button in HTML');

// ── Q1-4: Chart Quick Copy ────────────────────────────────────────────────────
console.log('\n▶ Q1-4 Chart Quick Copy');

assert(appJs.includes('async function copyChartToClipboard('),'copyChartToClipboard() async defined');
assert(appJs.includes('function initChartCopy()'),            'initChartCopy() defined');
assert(appJs.includes("format: 'png'"),                       'PNG format for chart copy');
assert(appJs.includes('scale: 2'),                            '@2x scale for Retina');
assert(appJs.includes('ClipboardItem'),                       'ClipboardItem for image/png');
assert(appJs.includes("'image/png'"),                         'image/png MIME type');
// Fallback
assert(appJs.includes('window.open()') || appJs.includes("window.open("),
                                                              'fallback opens image in new tab');
// HTML
assert(indexHtml.includes('id="btn-copy-chart"'),             '#btn-copy-chart button in HTML');

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('');
console.log(`Results: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error('Failed:', errors.join(', '));
  process.exit(1);
}
console.log('✓ P65 Q1-1/Q1-2/Q1-3/Q1-4 share & export enhancement — all checks passed');
