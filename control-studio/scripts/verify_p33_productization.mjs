#!/usr/bin/env node
/**
 * verify_p33_productization.mjs — Phase 33: Productization & Interop
 *
 * Tests:
 *  exportController (P33-01):
 *   1.  PID → C code contains Kp/Ki/Kd literals
 *   2.  PID → Python code contains class definition
 *   3.  PID → MATLAB code contains function call
 *   4.  TF  → C code contains Direct Form II scaffold
 *   5.  TF  → Python code contains numpy/scipy imports
 *   6.  TF  → MATLAB code contains tf() call
 *   7.  SS  → C code contains state update loop
 *   8.  SS  → Python code contains @-operator matrix multiply
 *   9.  SF  → C code contains gain vector
 *  10.  Unsupported type throws
 *  11.  Discrete PID (Ts) → C code mentions Ts
 *  generateDesignReport (P33-02):
 *  12.  Returns html string containing <html>
 *  13.  margins section present when margins provided
 *  14.  poles section present & stable badge rendered
 *  15.  stepResponse section rendered
 *  16.  warnings section rendered when warnings array non-empty
 *  17.  sections array lists correct keys
 *  toPythonControl / fromPythonControl (P33-03):
 *  18.  TF round-trips (to → from) without loss
 *  19.  SS round-trips
 *  20.  PID → python-control type='TransferFunction', recoverable
 *  21.  Continuous vs discrete dt field correct
 *  22.  fromPythonControl nested num/den unwrapped
 *  designWizard (P33-04):
 *  23.  Default spec → PID recommendation
 *  24.  nonlinear=true → Feedback Linearization
 *  25.  safety=true → CLF-CBF or MPC
 *  26.  MIMO+robustness → H∞
 *  27.  adaptive=true → MRAC
 *  28.  workflow array has ≥3 steps
 *  29.  complexity field is valid category
 *  30.  tight PM spec → non-PID (Lead/State-feedback)
 */

import {
  exportController,
  generateDesignReport,
  toPythonControl,
  fromPythonControl,
  designWizard,
} from '../js/control/productization.js';

let passed = 0, failed = 0;
function ok(msg, cond, detail = '') {
  if (cond) { console.log(`  [PASS] ${msg}${detail ? '  ' + detail : ''}`); passed++; }
  else       { console.error(`  [FAIL] ${msg}${detail ? '  ' + detail : ''}`); failed++; }
}
function has(str, sub) { return typeof str === 'string' && str.includes(sub); }

console.log('\n=== P33: Productization & Interop ===\n');
console.log('── exportController (P33-01) ─────────────');

// ── Test 1: PID → C ──────────────────────────────────────────────────────────
{
  const { code, language } = exportController({ type:'pid', Kp:2, Ki:0.5, Kd:0.1, N:50 }, 'c');
  ok('Test 1: PID→C contains Kp literal', has(code, '2.') || has(code, '2,'), `len=${code.length}`);
  ok('Test 1: PID→C language=c', language === 'c');
}

// ── Test 2: PID → Python ─────────────────────────────────────────────────────
{
  const { code, language } = exportController({ type:'pid', Kp:1, Ki:0.2, Kd:0.05 }, 'python');
  ok('Test 2: PID→Python has class', has(code, 'class '), `snippet="${code.slice(0,60)}"`);
  ok('Test 2: PID→Python language=python', language === 'python');
}

// ── Test 3: PID → MATLAB ─────────────────────────────────────────────────────
{
  const { code } = exportController({ type:'pid', Kp:3, Ki:1, Kd:0 }, 'matlab');
  ok('Test 3: PID→MATLAB has function keyword', has(code, 'function '));
}

// ── Test 4: TF → C ───────────────────────────────────────────────────────────
{
  const { code } = exportController({ type:'tf', num:[1], den:[1,2,1] }, 'c');
  ok('Test 4: TF→C has Direct Form II step function', has(code, '_step') && has(code, 'w['));
}

// ── Test 5: TF → Python ──────────────────────────────────────────────────────
{
  const { code } = exportController({ type:'tf', num:[1,2], den:[1,3,2] }, 'python');
  ok('Test 5: TF→Python imports numpy', has(code, 'import numpy'));
}

// ── Test 6: TF → MATLAB ──────────────────────────────────────────────────────
{
  const { code } = exportController({ type:'tf', num:[1], den:[1,1] }, 'matlab');
  ok('Test 6: TF→MATLAB has tf() call', has(code, 'tf('));
}

// ── Test 7: SS → C ───────────────────────────────────────────────────────────
{
  const ctrl = {
    type: 'ss',
    A: [[0,1],[-2,-3]], B: [[0],[1]], C: [[1,0]], D: [[0]],
  };
  const { code } = exportController(ctrl, 'c');
  ok('Test 7: SS→C contains state update loop', has(code, '_A[') && has(code, 'xn['));
}

// ── Test 8: SS → Python ──────────────────────────────────────────────────────
{
  const ctrl = { type:'ss', A:[[0.9]], B:[[0.1]], C:[[1]], D:[[0]] };
  const { code } = exportController(ctrl, 'python');
  ok('Test 8: SS→Python uses @ operator', has(code, '@ self.x'));
}

// ── Test 9: SF → C ───────────────────────────────────────────────────────────
{
  const { code } = exportController({ type:'sf', K:[2.5, 1.3] }, 'c');
  ok('Test 9: SF→C has K gain array', has(code, '_K[') && has(code, '2.'));
}

// ── Test 10: Unsupported type throws ─────────────────────────────────────────
{
  let threw = false;
  try { exportController({ type:'foobar' }, 'python'); } catch (e) { threw = true; }
  ok('Test 10: unknown type throws', threw);
}

// ── Test 11: Discrete PID C code references Ts ───────────────────────────────
{
  const { code } = exportController({ type:'pid', Kp:1, Ki:0.1, Kd:0.05 }, 'c', { Ts: 0.01 });
  ok('Test 11: Discrete PID→C mentions Ts', has(code, 'Ts=0.01') || has(code, '0.01s'));
}

console.log('\n── generateDesignReport (P33-02) ─────────');

// ── Test 12: Returns html ─────────────────────────────────────────────────────
{
  const { html } = generateDesignReport({ title:'Test Report' });
  ok('Test 12: html contains <!DOCTYPE html>', has(html, '<!DOCTYPE html>'));
}

// ── Test 13: margins section ──────────────────────────────────────────────────
{
  const { html, sections } = generateDesignReport({
    margins: { phaseMargin:45, gainMargin:10, gainCrossover:3, phaseFreq:10 },
  });
  ok('Test 13: margins section in html', has(html, 'Phase Margin'));
  ok('Test 13: sections includes margins', sections.includes('margins'));
}

// ── Test 14: poles section with stable badge ──────────────────────────────────
{
  const { html, sections } = generateDesignReport({
    poles: [[-1, 2], [-1, -2], [0.5, 0]],
  });
  ok('Test 14: poles section in html', has(html, 'Closed-Loop Poles'));
  ok('Test 14: unstable pole gets fail badge', has(html, 'badge-fail'));
  ok('Test 14: sections includes poles', sections.includes('poles'));
}

// ── Test 15: stepResponse section ────────────────────────────────────────────
{
  const time   = Array.from({ length: 100 }, (_, i) => i * 0.1);
  const output = time.map((t) => 1 - Math.exp(-t));
  const { html, sections } = generateDesignReport({
    stepResponse: { time, output, overshoot: 0, settlingTime: 3.9, riseTime: 2.2, steadyState: 1 },
  });
  ok('Test 15: stepResponse metrics in html', has(html, 'Settling Time'));
  ok('Test 15: sparkline rendered', has(html, '█') || has(html, 'Step Response'));
  ok('Test 15: sections includes stepResponse', sections.includes('stepResponse'));
}

// ── Test 16: warnings section ────────────────────────────────────────────────
{
  const { html, sections } = generateDesignReport({
    warnings: ['Phase margin below 30°', 'Unstable pole detected'],
  });
  ok('Test 16: warnings in html', has(html, 'Phase margin below'));
  ok('Test 16: sections includes warnings', sections.includes('warnings'));
}

// ── Test 17: sections array correct ──────────────────────────────────────────
{
  const { sections } = generateDesignReport({
    margins:      { phaseMargin:50, gainMargin:8, gainCrossover:1, phaseFreq:5 },
    params:       { Kp: 2, Ki: 0.5 },
    sections:     [{ title:'Custom', content:'<p>hello</p>' }],
  });
  ok('Test 17: sections contains margins', sections.includes('margins'));
  ok('Test 17: sections contains params',  sections.includes('params'));
  ok('Test 17: sections contains Custom',  sections.includes('Custom'));
}

console.log('\n── toPythonControl / fromPythonControl (P33-03) ──');

// ── Test 18: TF round-trip ───────────────────────────────────────────────────
{
  const orig = { type:'tf', num:[1,2], den:[1,3,2] };
  const py   = toPythonControl(orig);
  const back = fromPythonControl(py);
  ok('Test 18: TF round-trip type', back.type === 'tf');
  ok('Test 18: TF round-trip num', JSON.stringify(back.num) === JSON.stringify(orig.num));
  ok('Test 18: TF round-trip den', JSON.stringify(back.den) === JSON.stringify(orig.den));
}

// ── Test 19: SS round-trip ───────────────────────────────────────────────────
{
  const A = [[0,1],[-2,-3]], B = [[0],[1]], C = [[1,0]], D = [[0]];
  const orig = { type:'ss', A, B, C, D };
  const py   = toPythonControl(orig);
  const back = fromPythonControl(py);
  ok('Test 19: SS round-trip type', back.type === 'ss');
  ok('Test 19: SS A preserved', JSON.stringify(back.A) === JSON.stringify(A));
}

// ── Test 20: PID → python-control + recovery ──────────────────────────────────
{
  const pid = { type:'pid', Kp:2, Ki:0.5, Kd:0.1, N:100 };
  const py  = toPythonControl(pid);
  ok('Test 20: PID→python type=TransferFunction', py.type === 'TransferFunction');
  ok('Test 20: PID _source preserved', py._source?.type === 'PID');
  const back = fromPythonControl(py);
  ok('Test 20: PID recovers Kp', back.type === 'pid' && back.Kp === 2);
}

// ── Test 21: Continuous dt=0, discrete dt=Ts ─────────────────────────────────
{
  const contTF = toPythonControl({ type:'tf', num:[1], den:[1,1] });
  const discTF = toPythonControl({ type:'tf', num:[1], den:[1,1], Ts: 0.05 });
  ok('Test 21: continuous dt=0', contTF.dt === 0);
  ok('Test 21: discrete dt=0.05', discTF.dt === 0.05);
}

// ── Test 22: Nested num/den from python-control unwrapped ─────────────────────
{
  // python-control stores num as [[row]] for SISO
  const pyData = { type:'TransferFunction', num:[[1,2]], den:[[1,3,2]], dt:0 };
  const back   = fromPythonControl(pyData);
  ok('Test 22: nested num unwrapped', Array.isArray(back.num) && !Array.isArray(back.num[0]),
    `num=${JSON.stringify(back.num)}`);
}

console.log('\n── designWizard (P33-04) ─────────────────');

// ── Test 23: Default → PID ───────────────────────────────────────────────────
{
  const w = designWizard({});
  ok('Test 23: default spec → PID', w.controllerType === 'PID');
  ok('Test 23: complexity=low', w.complexity === 'low');
}

// ── Test 24: nonlinear → Feedback Linearization ───────────────────────────────
{
  const w = designWizard({ nonlinear: true });
  ok('Test 24: nonlinear → FBL', w.controllerType.includes('Feedback Linearization'));
}

// ── Test 25: safety → CLF-CBF or MPC ─────────────────────────────────────────
{
  const w1 = designWizard({ safety: true, nonlinear: true });
  const w2 = designWizard({ safety: true });
  ok('Test 25: safety+nonlinear → CLF-CBF', w1.controllerType.includes('CLF-CBF'));
  ok('Test 25: safety (linear) → MPC', w2.controllerType.includes('MPC'));
}

// ── Test 26: MIMO + robustness → H∞ ──────────────────────────────────────────
{
  const w = designWizard({ topology:'mimo', nInputs:2, nOutputs:2, robustness: true });
  ok('Test 26: MIMO+robust → H∞', w.controllerType.includes('H∞'));
}

// ── Test 27: adaptive → MRAC ─────────────────────────────────────────────────
{
  const w = designWizard({ adaptive: true });
  ok('Test 27: adaptive → MRAC', w.controllerType.includes('MRAC'));
  ok('Test 27: complexity=high', w.complexity === 'high');
}

// ── Test 28: workflow has ≥3 steps ────────────────────────────────────────────
{
  const w = designWizard({ overshoot:10, settlingTime:2 });
  ok('Test 28: workflow ≥3 steps', w.workflow.length >= 3, `steps=${w.workflow.length}`);
  ok('Test 28: steps numbered sequentially', w.workflow[0].step === 1 && w.workflow[1].step === 2);
}

// ── Test 29: complexity valid ─────────────────────────────────────────────────
{
  const valid = ['low','medium','high','very-high'];
  ['pid','lqr','hinf','mrac','clf'].forEach((label, i) => {
    const specs = [{}, {topology:'mimo'}, {robustness:true}, {adaptive:true}, {safety:true}];
    const w = designWizard(specs[i]);
    ok(`Test 29.${i+1}: complexity valid (${w.complexity})`, valid.includes(w.complexity));
  });
}

// ── Test 30: tight PM → non-PID ──────────────────────────────────────────────
{
  const w = designWizard({ phaseMargin: 65 });
  ok('Test 30: tight PM → Lead or H∞ (not PID)', !w.controllerType.startsWith('PID'));
}

console.log(`\n${'─'.repeat(55)}`);
console.log(`P33 productization: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
else console.log('All tests passed.');
