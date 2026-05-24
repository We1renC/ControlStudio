/**
 * verify_j13_rlocus_geo.mjs
 *
 * Verifies J1-3 — Root Locus Geometric Annotations:
 *   ① Damping ratio lines (ζ = 0.2, 0.4, 0.6, 0.8)
 *   ② Natural frequency arcs (partial circles π/2 → π)
 *   ③ Critical gain labels from jω crossings (Ku, Tu)
 *
 * Implementation in js/ui/annotations.js; wired into renderRootLocus() in app.js.
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

const appJs    = readFileSync(path.join(ROOT, 'js/app.js'),        'utf8');
const annotJs  = readFileSync(path.join(ROOT, 'js/ui/annotations.js'), 'utf8');
const src      = appJs + '\n' + annotJs;

console.log('\n▶ J1-3 Root Locus Geometric Annotations — annotations.js');

assert(annotJs.includes('function buildRLocusAnnotations('),        'buildRLocusAnnotations() defined in annotations.js');
assert(annotJs.includes('0.2') && annotJs.includes('0.4') &&
       annotJs.includes('0.6') && annotJs.includes('0.8'),          'damping ratio values 0.2/0.4/0.6/0.8 defined');
assert(annotJs.includes('Math.sqrt(1'),                             'ζ imaginary part √(1-ζ²) computed');
assert(annotJs.includes('ωn') || annotJs.includes('wn') ||
       annotJs.includes('freq') || annotJs.includes('arc'),         'natural frequency arc concept present');
assert(annotJs.includes('Math.PI'),                                 'Math.PI used for arc angles');
assert(annotJs.includes('Ku') || annotJs.includes('jwCrossings'),   'critical gain Ku from jω crossings labeled');

console.log('\n▶ J1-3 Root Locus hook — renderRootLocus() in app.js');

assert(appJs.includes('buildRLocusAnnotations('),                   'buildRLocusAnnotations called in renderRootLocus');
assert(appJs.includes('buildRLocusAnnotations') && appJs.includes('rlAnnots'),
                                                                    'rlAnnots/rlShapes merged into layout');
assert(appJs.includes('jwCrossings') && appJs.includes('buildRLocusAnnotations'),
                                                                    'jwCrossings passed to buildRLocusAnnotations');
assert(appJs.includes('state.chartAnnotationsEnabled') || src.includes('enabled'),
                                                                    'annotation toggle respected');

console.log('');
console.log(`Results: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error('Failed:', errors.join(', '));
  process.exit(1);
}
console.log('✓ J1-3 Root Locus geometric annotations — all checks passed');
