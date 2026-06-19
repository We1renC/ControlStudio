#!/usr/bin/env node
/**
 * verify_ui_formula_contract.mjs
 *
 * Guards display/math contracts for UI equations:
 * - Continuous transfer functions use s-polynomial notation.
 * - Discrete transfer functions use z^-1 delay-polynomial notation.
 * - DTF system and loop labels render as G(z), L(z), and T(z).
 * - Smoke diagnostics must not require a closed-loop model when the effective
 *   runtime mode is open_loop.
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

function sectionBetween(src, startMarker, endMarker) {
  const start = src.indexOf(startMarker);
  if (start < 0) return '';
  const end = src.indexOf(endMarker, start + startMarker.length);
  return end < 0 ? src.slice(start) : src.slice(start, end);
}

const appJs = readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
const formatPolySection = sectionBetween(appJs, 'function formatPolyText', 'function renderStateSpaceEquationBlock');
const setupCopySection = sectionBetween(appJs, 'function updateSystemSetupCopy', 'function updateSystem');
const discreteStepSection = sectionBetween(appJs, 'function renderDiscreteStepChart', 'function updateDomainUI');
const smokeSection = sectionBetween(appJs, 'function runControlStudioSmoke', 'function writeSmokeDiagnostics');

console.log('\n▶ UI formula contract');

assert(
  formatPolySection.includes("function formatPolyText(coeffs, variable = 's')") &&
    formatPolySection.includes('function formatDelayPolyText(coeffs)') &&
    formatPolySection.includes("'z^-1'") &&
    formatPolySection.includes('function delayPolyToLatexText(coeffs)') &&
    formatPolySection.includes("'z^{-1}'") &&
    formatPolySection.includes("const isDelayForm = tf instanceof DiscreteTransferFunction || variable === 'z^-1';"),
  'equation formatter supports continuous and z^-1 delay-polynomial display',
);

assert(
  setupCopySection.includes("const isDiscretePlant = state.domain === 'z' || plantTf instanceof DiscreteTransferFunction;") &&
    setupCopySection.includes("const plantVariable = isDiscretePlant ? 'z^-1' : 's';") &&
    setupCopySection.includes('`G(${symbolVariable}) =`') &&
    setupCopySection.includes('Discrete plant transfer function in z^-1 form') &&
    setupCopySection.includes('isDiscretePlant ? formatDelayPolyText(plantTf.num) : formatPolyText(plantTf.num, symbolVariable)') &&
    setupCopySection.includes('renderTransferFunctionEquation(`L(${symbolVariable}) =`, state.openLoop') &&
    setupCopySection.includes('renderTransferFunctionEquation(`T(${symbolVariable}) =`, state.closedLoop'),
  'system setup copy renders DTF plant and loop equations as G(z), L(z), and T(z)',
);

assert(
  setupCopySection.includes("renderTransferFunctionEquation('C(s) =', controllerTf") &&
    setupCopySection.includes("renderTransferFunctionEquation('Cc(s) =', compTfForDisplay"),
  'continuous PID and lead/lag helpers are not mislabeled as discrete controllers',
);

assert(
  discreteStepSection.includes("layout.showlegend = targetId === 'chart-active';") &&
    discreteStepSection.includes('if (layout.showlegend) layout.legend = compactLegend();') &&
    discreteStepSection.includes("name: 'Discrete Step'"),
  'active discrete step plot exposes a visible legend entry',
);

assert(
  smokeSection.includes("diagnostics.effectiveLoopMode === 'closed_loop' && !diagnostics.closedLoopFormula") &&
    smokeSection.includes('/G\\((s|z)\\)/.test(diagnostics.equationText.system)') &&
    smokeSection.includes('/T\\((s|z)\\)/.test(diagnostics.equationText.loop)'),
  'smoke diagnostics distinguish effective open-loop state and accept s/z equation labels',
);

console.log('');
console.log(`Results: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error('Failed:', errors.join(', '));
  process.exit(1);
}

console.log('✓ UI formula contract — all checks passed');
