/**
 * verify_ui_waveform_contract.mjs
 *
 * Guards Local JS UI response routing and metrics semantics:
 * - sine / square / pulse must use simulateTimeResponse, not stepResponse fallback.
 * - step metrics are valid only for actual step input.
 * - step metrics use the configured step amplitude as reference.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

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

function assertRegex(src, regex, label) {
  assert(regex.test(src), label, `missing ${regex}`);
}

const appJs = readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
const sweepJs = readFileSync(path.join(ROOT, 'js/ui/sweep.js'), 'utf8');
const shareJs = readFileSync(path.join(ROOT, 'js/ui/share.js'), 'utf8');

console.log('\n▶ UI waveform routing');

assert(
  appJs.includes('simulateTimeResponse') && appJs.includes("from './analysis/time-response.js'"),
  'app.js imports simulateTimeResponse',
);

assertRegex(
  appJs,
  /function currentResponseData\(sys\)[\s\S]*state\.responseType === 'sine'[\s\S]*state\.responseType === 'square'[\s\S]*state\.responseType === 'pulse'[\s\S]*simulateTimeResponse\(sys, state\.responseType, state\.simulationConfig\)/,
  'currentResponseData routes sine/square/pulse through simulateTimeResponse',
);

assertRegex(
  appJs,
  /function currentResponseSupportsStepMetrics\(\)[\s\S]*return state\.responseType === 'step';[\s\S]*}/,
  'step metrics support is restricted to step input',
);

assertRegex(
  appJs,
  /function currentStepInfo\(response\)[\s\S]*step metrics require step input[\s\S]*return stepInfo\(response\.t, response\.y, null, stepMetricReference\(\)\);[\s\S]*}/,
  'currentStepInfo gates non-step metrics and uses amplitude reference',
);

assert(
  !appJs.includes("!['sine', 'square'].includes(state.responseType)"),
  'legacy partial non-step metrics gate removed',
);

console.log('\n▶ Export / sweep metric reference');

assertRegex(
  sweepJs,
  /const amplitude = Number\.isFinite\(Number\(state\.simulationConfig\?\.amplitude\)\)[\s\S]*stepResponse\(cl,[\s\S]*amplitude[\s\S]*stepInfo\(resp\.t, resp\.y, null, amplitude\)/,
  'parameter sweep uses configured amplitude as step reference',
);

assertRegex(
  shareJs,
  /const amplitude = Number\.isFinite\(Number\(state\.simulationConfig\?\.amplitude\)\)[\s\S]*_ctx\.stepInfo\(resp\.t, resp\.y, null, amplitude\)/,
  'share/report metrics use configured amplitude as step reference',
);

console.log('');
console.log(`Results: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error('Failed:', errors.join(', '));
  process.exit(1);
}

console.log('✓ UI waveform response and metrics contract — all checks passed');
