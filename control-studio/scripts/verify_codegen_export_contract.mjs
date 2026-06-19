#!/usr/bin/env node
/**
 * verify_codegen_export_contract.mjs
 *
 * Guards generated MATLAB / Python scripts against runtime-mode drift:
 * - open-loop exports must not reference an undefined closed-loop T.
 * - Python exports must not emit JavaScript booleans in conditional code.
 * - z-domain plant exports must not mix a continuous PID controller with G(z).
 * - UI payload must only pass a controller when it is compatible with the plant domain.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { toMatlabScript, toPythonScript } from '../js/utils/codegen.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let pass = 0;
let fail = 0;
const errors = [];

function ok(label) {
  console.log(`  ✓ ${label}`);
  pass++;
}

function bad(label, msg = 'condition failed') {
  console.error(`  ✗ ${label}: ${msg}`);
  fail++;
  errors.push(label);
}

function assert(cond, label, msg = '') {
  cond ? ok(label) : bad(label, msg);
}

function sectionBetween(src, startMarker, endMarker) {
  const start = src.indexOf(startMarker);
  if (start < 0) return '';
  const end = src.indexOf(endMarker, start + startMarker.length);
  return end < 0 ? src.slice(start) : src.slice(start, end);
}

console.log('\n▶ Codegen export contract');

const controller = { Kp: 2, Ki: 0.5, Kd: 0.1, N: 100 };
const continuousPlant = { num: [1], den: [1, 1] };
const discretePlant = { num: [0.25, 0.1], den: [1, -1.2, 0.35] };

const continuousOpen = {
  plant: continuousPlant,
  controller,
  delay: null,
  domain: 's',
  Ts: null,
  responseType: 'step',
  closedLoop: false,
};

const matlabOpen = toMatlabScript(continuousOpen);
assert(
  matlabOpen.includes('L = series(C, G);') &&
    !matlabOpen.includes('T = feedback(L, 1);') &&
    matlabOpen.includes('step(G);') &&
    !matlabOpen.includes('step(T);') &&
    matlabOpen.includes('title("Plant response")'),
  'MATLAB open-loop export plots G and does not reference undefined T',
);

const pythonOpen = toPythonScript(continuousOpen);
assert(
  pythonOpen.includes('L = ct.series(C, G)') &&
    !pythonOpen.includes('T = ct.feedback(L, 1)') &&
    pythonOpen.includes('t, y = ct.step_response(G)') &&
    !pythonOpen.includes('T if') &&
    !/\b(true|false)\b/.test(pythonOpen),
  'Python open-loop export plots G without JavaScript boolean syntax',
);

const continuousClosed = { ...continuousOpen, closedLoop: true };
assert(
  toMatlabScript(continuousClosed).includes('T = feedback(L, 1);') &&
    toMatlabScript(continuousClosed).includes('step(T);') &&
    toPythonScript(continuousClosed).includes('T = ct.feedback(L, 1)') &&
    toPythonScript(continuousClosed).includes('t, y = ct.step_response(T)'),
  'closed-loop exports define and plot T explicitly',
);

const discreteWithAccidentalController = {
  plant: discretePlant,
  controller,
  delay: null,
  domain: 'z',
  Ts: 0.25,
  responseType: 'impulse',
  closedLoop: false,
};

const matlabDiscrete = toMatlabScript(discreteWithAccidentalController);
assert(
  matlabDiscrete.includes('Ts = 0.25;') &&
    matlabDiscrete.includes('G = tf(numG, denG, Ts);') &&
    matlabDiscrete.includes('Continuous PID export skipped for z-domain plant') &&
    !matlabDiscrete.includes('C = pid') &&
    !matlabDiscrete.includes('L = series(C, G);') &&
    matlabDiscrete.includes('impulse(G);'),
  'MATLAB z-domain export preserves Ts and skips incompatible continuous PID',
);

const pythonDiscrete = toPythonScript(discreteWithAccidentalController);
assert(
  pythonDiscrete.includes('Ts = 0.25') &&
    pythonDiscrete.includes('G = ct.tf([0.25, 0.1], [1, -1.2, 0.35], Ts)') &&
    pythonDiscrete.includes('Continuous PID export skipped for z-domain plant') &&
    !pythonDiscrete.includes('C = ct.tf([Kp + Kd*N') &&
    !pythonDiscrete.includes('L = ct.series(C, G)') &&
    pythonDiscrete.includes('t, y = ct.impulse_response(G)'),
  'Python z-domain export preserves Ts and skips incompatible continuous PID',
);

const appJs = readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
const codegenPayloadSection = sectionBetween(appJs, 'function buildCodegenPayload', 'function renderAllLatexFractions');
assert(
  codegenPayloadSection.includes("const compatibleController = state.domain === 's' && state.controller;") &&
    codegenPayloadSection.includes('controller: compatibleController ? {') &&
    codegenPayloadSection.includes('} : null,'),
  'UI codegen payload only includes controllers compatible with the current domain',
);

console.log('');
console.log(`Results: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error('Failed:', errors.join(', '));
  process.exit(1);
}

console.log('✓ Codegen export contract — all checks passed');
