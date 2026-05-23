/**
 * verify_p49_c3.mjs
 *
 * Verifies P49 — C3-1~4 Interactive Animations
 *   C3-1 Pole drag animation (SVG plane + step preview)
 *   C3-2 Parameter sensitivity scan
 *   C3-3 Phase plane click trajectories
 *   C3-4 Nyquist animation player
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

// ── C3-1: Pole Drag Animation ─────────────────────────────────────────────────
console.log('\n▶ C3-1 Pole Drag Animation');

assert(appJs.includes('function _buildPolePlane('),      '_buildPolePlane() SVG builder');
assert(appJs.includes('function initPoleDragAnimation()'), 'initPoleDragAnimation() defined');
assert(appJs.includes('pole-drag-plane'),                'pole-drag-plane referenced');
assert(appJs.includes('c3-pole-drag-area'),              'c3-pole-drag-area referenced');
assert(appJs.includes('btn-c3-pole-init'),               'btn-c3-pole-init referenced');
assert(appJs.includes('c3-step-preview'),                'c3-step-preview chart referenced');
assert(appJs.includes('c3-unstable-alert'),              'c3-unstable-alert referenced');
assert(appJs.includes('pole-marker'),                    'pole-marker class used');
assert(appJs.includes('sigma > 0'),                      'RHP unstable detection');
assert(appJs.includes('e.shiftKey'),                     'Shift key snap-to-real-axis');
assert(appJs.includes('ζ=0.707'),                        'ζ guideline label');
assert(appJs.includes('Plotly.react'),                   'Plotly.react for step update');
assert(appJs.includes('omega:  1') || appJs.includes('omega: -1') || appJs.includes('conjugate'), 'conjugate poles (± omega)');

assert(indexHtml.includes('c3-pole-drag-panel'),         '#c3-pole-drag-panel in HTML');
assert(indexHtml.includes('btn-c3-pole-init'),           '#btn-c3-pole-init in HTML');
assert(indexHtml.includes('pole-drag-plane'),            '#pole-drag-plane in HTML');
assert(indexHtml.includes('c3-step-preview'),            '#c3-step-preview in HTML');
assert(indexHtml.includes('c3-unstable-alert'),          '#c3-unstable-alert in HTML');
assert(indexHtml.includes('.pole-drag-panel'),           '.pole-drag-panel CSS');
assert(indexHtml.includes('.pole-drag-plane'),           '.pole-drag-plane CSS');
assert(indexHtml.includes('.pole-marker'),               '.pole-marker CSS');
assert(indexHtml.includes('.c3-unstable-alert'),         '.c3-unstable-alert CSS');

// ── C3-2: Parameter Sensitivity Scan ─────────────────────────────────────────
console.log('\n▶ C3-2 Parameter Sensitivity Scan');

assert(appJs.includes('function initSensitivityScan()'), 'initSensitivityScan() defined');
assert(appJs.includes('btn-c3-scan'),                   'btn-c3-scan referenced');
assert(appJs.includes('c3-scan-param'),                 'c3-scan-param selector');
assert(appJs.includes('c3-scan-min'),                   'c3-scan-min input');
assert(appJs.includes('c3-scan-max'),                   'c3-scan-max input');
assert(appJs.includes('c3-scan-steps'),                 'c3-scan-steps input');
assert(appJs.includes('c3-sensitivity-chart'),          'c3-sensitivity-chart referenced');
assert(appJs.includes('c3-scan-status'),                'c3-scan-status element');
assert(appJs.includes('osArr'),                         'OS% scan array');
assert(appJs.includes('tsArr'),                         'Ts scan array');
assert(appJs.includes('pmArr'),                         'PM scan array');
assert(appJs.includes('yaxis2'),                        'dual y-axis for PM');

assert(indexHtml.includes('c3-sensitivity-panel'),      '#c3-sensitivity-panel in HTML');
assert(indexHtml.includes('btn-c3-scan'),               '#btn-c3-scan in HTML');
assert(indexHtml.includes('c3-scan-param'),             '#c3-scan-param in HTML');
assert(indexHtml.includes('c3-sensitivity-chart'),      '#c3-sensitivity-chart in HTML');
assert(indexHtml.includes('.sensitivity-scan-ctrl'),    '.sensitivity-scan-ctrl CSS');

// ── C3-3: Phase Plane Click Trajectories ──────────────────────────────────────
console.log('\n▶ C3-3 Phase Plane Click Trajectories');

assert(appJs.includes('function initPhasePlaneClickTrajectory()'), 'initPhasePlaneClickTrajectory() defined');
assert(appJs.includes('btn-pp-click-mode'),             'btn-pp-click-mode referenced');
assert(appJs.includes('btn-pp-clear'),                  'btn-pp-clear referenced');
assert(appJs.includes('pp-click-hint'),                 'pp-click-hint referenced');
assert(appJs.includes('pp-traj-count'),                 'pp-traj-count referenced');
assert(appJs.includes('MAX_TRAJ'),                      'MAX_TRAJ = 8 defined');
assert(appJs.includes('TRAJ_COLORS'),                   'TRAJ_COLORS color array');
assert(appJs.includes('Plotly.addTraces'),              'Plotly.addTraces for trajectory overlay');
assert(appJs.includes('_currentSS?.A'),                 'SS A-matrix used for integration');

assert(indexHtml.includes('btn-pp-click-mode'),         '#btn-pp-click-mode in HTML');
assert(indexHtml.includes('btn-pp-clear'),              '#btn-pp-clear in HTML');
assert(indexHtml.includes('pp-click-hint'),             '#pp-click-hint in HTML');
assert(indexHtml.includes('pp-traj-count'),             '#pp-traj-count in HTML');
assert(indexHtml.includes('.pp-click-hint'),            '.pp-click-hint CSS');

// ── C3-4: Nyquist Animation ───────────────────────────────────────────────────
console.log('\n▶ C3-4 Nyquist Animation Player');

assert(appJs.includes('function initNyquistAnimation()'), 'initNyquistAnimation() defined');
assert(appJs.includes('nyquist-play-btn'),              'nyquist-play-btn referenced');
assert(appJs.includes('nyquist-reset-btn'),             'nyquist-reset-btn referenced');
assert(appJs.includes('nyquist-progress-bar'),          'nyquist-progress-bar referenced');
assert(appJs.includes('nyquist-speed'),                 'nyquist-speed selector');
assert(appJs.includes('nyquist-freq-label'),            'nyquist-freq-label referenced');
assert(appJs.includes('chart-nyquist-anim'),            'chart-nyquist-anim referenced');
assert(appJs.includes('nyquist-encircle-count'),        'nyquist-encircle-count referenced');
assert(appJs.includes('_buildNyqPoints()'),             '_buildNyqPoints() defined');
assert(appJs.includes('requestAnimationFrame'),          'RAF used for animation');
assert(appJs.includes('cancelAnimationFrame'),           'RAF cancelled on pause');
assert(appJs.includes('-1 點'),                         '-1 point marker on chart');
assert(appJs.includes('繞行 -1 點'),                    'encirclement count label');
assert(appJs.includes('window._nyquistAnimStart'),       '_nyquistAnimStart exposed');

assert(indexHtml.includes('nyquist-animation-panel'),   '#nyquist-animation-panel in HTML');
assert(indexHtml.includes('nyquist-play-btn'),          '#nyquist-play-btn in HTML');
assert(indexHtml.includes('nyquist-reset-btn'),         '#nyquist-reset-btn in HTML');
assert(indexHtml.includes('nyquist-progress-bar'),      '#nyquist-progress-bar in HTML');
assert(indexHtml.includes('nyquist-speed'),             '#nyquist-speed in HTML');
assert(indexHtml.includes('nyquist-freq-label'),        '#nyquist-freq-label in HTML');
assert(indexHtml.includes('chart-nyquist-anim'),        '#chart-nyquist-anim in HTML');
assert(indexHtml.includes('.nyquist-player'),           '.nyquist-player CSS');
assert(indexHtml.includes('.nyquist-progress-bar'),     '.nyquist-progress-bar CSS');
assert(indexHtml.includes('.nyquist-freq-label'),       '.nyquist-freq-label CSS');

// ── P49 init ──────────────────────────────────────────────────────────────────
console.log('\n▶ P49 DOMContentLoaded init');

assert(appJs.includes('initPoleDragAnimation()'),       'initPoleDragAnimation called');
assert(appJs.includes('initSensitivityScan()'),         'initSensitivityScan called');
assert(appJs.includes('initPhasePlaneClickTrajectory()'), 'initPhasePlaneClickTrajectory called');
assert(appJs.includes('initNyquistAnimation()'),        'initNyquistAnimation called');

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('');
console.log(`Results: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error('Failed:', errors.join(', '));
  process.exit(1);
}
console.log('✓ P49 C3 Interactive Animations — all checks passed');
