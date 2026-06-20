#!/usr/bin/env node
/**
 * verify_p76_deployment_readiness.mjs — Phase 76 deployment readiness gate.
 */

import { generateC } from '../js/codegen/c_generator.js';
import { wrapWithSafety } from '../js/codegen/safety_wrapper.js';
import { makeHilFrame, parseHilFrame } from '../js/integration/hil_ws.js';
import { assessDeploymentReadiness } from '../js/control/productization.js';

let passed = 0;
let failed = 0;

function ok(message, condition, detail = '') {
  if (condition) {
    console.log(`  [PASS] ${message}${detail ? `  ${detail}` : ''}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${message}${detail ? `  ${detail}` : ''}`);
    failed++;
  }
}

function hasCheck(audit, id, status) {
  return audit.checks.some((check) => check.id === id && check.status === status);
}

function makeSafeCArtifact() {
  const generated = generateC({
    controller: { kp: 2, ki: 0.4, kd: 0.05 },
    plant: { order: 2 },
    dt: 0.01,
    options: { fixedPoint: true, qFormat: 'Q15', isr: true, cmsis: true },
  });
  const wrapped = wrapWithSafety(generated.files['controller.c'], {
    crc: true,
    watchdog: true,
    redundancy: 2,
  });
  return {
    generated,
    wrapped,
    files: {
      ...generated.files,
      'controller.c': wrapped.code,
    },
  };
}

function goodDeploymentConfig(overrides = {}) {
  const artifact = makeSafeCArtifact();
  return {
    target: 'c',
    sampleTime: 0.01,
    controller: { type: 'pid', Kp: 2, Ki: 0.4, Kd: 0.05, Ts: 0.01 },
    plant: { nStates: 2, nInputs: 1 },
    codegen: {
      files: artifact.files,
      metadata: artifact.generated.metadata,
      warnings: [],
      artifactId: 'motor-pid-v1',
      revision: 'fixture',
    },
    timing: { wcetMs: 1.2, deadlineMs: 5, jitterMs: 0.2 },
    numeric: { fixedPoint: true, wordLength: 16, fractionBits: 8, maxAbsSignal: 20 },
    safety: { critical: true, crc: artifact.wrapped.crc, watchdog: true, redundancy: 2 },
    hil: {
      required: true,
      protocol: 'websocket-json',
      stateChannels: 2,
      controlChannels: 1,
      sampleTime: 0.01,
      latencyMs: 1.5,
      frameSchema: ['type', 'time', 'state', 'input'],
      roundTrip: true,
    },
    ...overrides,
  };
}

console.log('\n=== P76: Deployment Readiness Gate ===\n');

{
  const audit = assessDeploymentReadiness(goodDeploymentConfig());
  ok('Test 1: good embedded package is ready', audit.status === 'pass' && audit.deploymentClass === 'ready', `score=${audit.score}`);
  ok('Test 1: scheduler budget passes', hasCheck(audit, 'timing.wcet', 'pass'));
  ok('Test 1: fixed-point range passes', hasCheck(audit, 'numeric.fixed-point-range', 'pass'));
  ok('Test 1: HIL latency passes', hasCheck(audit, 'hil.latency', 'pass'));
}

{
  const audit = assessDeploymentReadiness(goodDeploymentConfig({ sampleTime: undefined, controller: { type: 'pid' } }));
  ok('Test 2: missing sample time blocks deployment', audit.status === 'fail' && hasCheck(audit, 'sample-time.present', 'fail'));
}

{
  const audit = assessDeploymentReadiness(goodDeploymentConfig({ timing: { wcetMs: 12, deadlineMs: 5, jitterMs: 0.2 } }));
  const wcet = audit.checks.find((check) => check.id === 'timing.wcet');
  ok('Test 3: WCET over budget fails', audit.status === 'fail' && wcet?.status === 'fail', `util=${wcet?.evidence?.utilization}`);
}

{
  const audit = assessDeploymentReadiness(goodDeploymentConfig({
    numeric: { fixedPoint: true, wordLength: 16, fractionBits: 8, maxAbsSignal: 200 },
  }));
  const fp = audit.checks.find((check) => check.id === 'numeric.fixed-point-range');
  ok('Test 4: fixed-point overflow risk fails', audit.status === 'fail' && fp?.status === 'fail', `headroom=${fp?.evidence?.headroom}`);
}

{
  const audit = assessDeploymentReadiness(goodDeploymentConfig({
    codegen: { files: { 'controller.c': 'double cs_pid_step(void){return 0;}' }, warnings: [], artifactId: 'bad-c' },
  }));
  ok('Test 5: missing C header fails artifact gate', audit.status === 'fail' && hasCheck(audit, 'artifact.c-header', 'fail'));
}

{
  const artifact = makeSafeCArtifact();
  const audit = assessDeploymentReadiness(goodDeploymentConfig({
    codegen: { files: artifact.generated.files, metadata: artifact.generated.metadata, warnings: [], artifactId: 'unsafe' },
    safety: { critical: true, crc: null, watchdog: false, redundancy: 1 },
  }));
  ok('Test 6: missing safety wrapper blocks safety-critical deployment', audit.status === 'fail' && hasCheck(audit, 'safety.wrapper', 'fail'));
}

{
  const audit = assessDeploymentReadiness(goodDeploymentConfig({
    plant: { nStates: 3, nInputs: 2 },
    hil: {
      required: true,
      protocol: 'websocket-json',
      stateChannels: 2,
      controlChannels: 1,
      sampleTime: 0.02,
      latencyMs: 15,
      frameSchema: ['type', 'time'],
    },
  }));
  ok('Test 7: HIL channel mismatch fails', audit.status === 'fail' && hasCheck(audit, 'hil.channels', 'fail'));
  ok('Test 7: HIL sample-time mismatch fails', hasCheck(audit, 'hil.sample-time', 'fail'));
  ok('Test 7: incomplete HIL schema fails', hasCheck(audit, 'hil.schema', 'fail'));
}

{
  const artifact = makeSafeCArtifact();
  const audit = assessDeploymentReadiness(goodDeploymentConfig({
    codegen: { files: artifact.files, metadata: artifact.generated.metadata, warnings: ['Continuous controller was discretized by Euler approximation.'] },
    safety: { critical: false, crc: artifact.wrapped.crc, watchdog: true, redundancy: 1 },
    hil: undefined,
  }));
  ok('Test 8: codegen warning creates conditional deployment', audit.status === 'warn' && audit.deploymentClass === 'conditional');
  ok('Test 8: requiredActions includes warning text', audit.requiredActions.some((action) => action.includes('codegen.warnings')));
}

{
  const frame = makeHilFrame({ state: [1, 2], input: [0.4], time: 0.01, type: 'state' });
  const parsed = parseHilFrame(frame);
  ok('Test 9: HIL frame fixture round trips state/input/time', parsed.state.length === 2 && parsed.input[0] === 0.4 && parsed.time === 0.01);
}

{
  const audit = assessDeploymentReadiness({
    target: 'rust',
    sampleTime: 0.02,
    codegen: {
      files: {
        'src/controller.rs': '#![no_std]\npub fn step(e:f64)->f64{e}',
        'Cargo.toml': '[package]\nedition="2021"',
      },
      artifactId: 'rust-ctrl',
    },
    timing: { wcetMs: 2, deadlineMs: 10, jitterMs: 0.4 },
    numeric: { fixedPoint: false },
    safety: { critical: false },
  });
  ok('Test 10: Rust artifacts satisfy target-specific gate', hasCheck(audit, 'artifact.rust-source', 'pass') && hasCheck(audit, 'artifact.cargo', 'pass'));
  ok('Test 10: non-fixed embedded audit is conditional, not blocked', audit.status === 'warn' && audit.score < 90);
}

console.log(`\n${'─'.repeat(55)}`);
console.log(`P76 deployment readiness: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
else console.log('All tests passed.');
