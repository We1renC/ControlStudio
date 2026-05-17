#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, '../..');
const outputDir = join(rootDir, 'outputs/controlstudio');
mkdirSync(outputDir, { recursive: true });

const checks = [
  {
    name: 'Core JS regression',
    command: ['node', 'test_control.js'],
    expect: ['Tests Passed!', 'Stability analysis summary tests passed'],
  },
  {
    name: 'Math core verification',
    command: ['node', 'control-studio/scripts/verify_math_core.mjs'],
    expect: ['Math core verification passed: 8/8'],
  },
  {
    name: 'Verification fixtures',
    command: ['node', 'control-studio/scripts/verify_control_cases.mjs'],
    expect: ['Verification fixtures passed: 5/5'],
  },
  {
    name: 'API contract fixtures',
    command: ['node', 'control-studio/scripts/verify_control_api_contract.mjs'],
    env: { CONTROL_STUDIO_API_URL: 'http://127.0.0.1:18770' },
    expect: ['API contract fixtures passed: 5/5'],
  },
  {
    name: 'Analysis CLI smoke',
    command: [
      'node',
      'control-studio/scripts/control_analysis_cli.mjs',
      JSON.stringify({
        system: { type: 'transfer_function', num: [1], den: [1, 1] },
        controller: { type: 'pid', Kp: 1, Ki: 0.5, Kd: 0.1 },
        simulation: { mode: 'closed_loop', inputWaveform: 'step', sampleCount: 20 },
      }),
    ],
    expect: ['"response"', '"metrics"', '"system"'],
  },
  {
    name: 'Servo stage scenario',
    command: ['node', 'control-studio/scripts/run_servo_stage_case.mjs'],
    expect: ['precision-servo-stage-position-control', 'pid-lead-selected'],
  },
];

const staticChecks = [
  {
    name: 'Report export button',
    file: 'control-studio/index.html',
    expect: ['btn-export-report', 'Export Report MD'],
  },
  {
    name: 'Analysis source toggle',
    file: 'control-studio/index.html',
    expect: ['analysis-source', 'FastAPI', 'Compare Local/API'],
  },
  {
    name: 'API status surface',
    file: 'control-studio/js/app.js',
    expect: ['scheduleApiAnalysis', 'api-analysis-status', 'FastAPI unavailable'],
  },
  {
    name: 'Regression dashboard validation hook',
    file: 'scripts/validate_nvidia_model_selector.sh',
    expect: ['control_regression_dashboard.mjs'],
  },
];

function runCommand(check) {
  const startedAt = Date.now();
  const result = spawnSync(check.command[0], check.command.slice(1), {
    cwd: rootDir,
    env: { ...process.env, ...(check.env || {}) },
    encoding: 'utf8',
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  const missing = check.expect.filter((needle) => !output.includes(needle));
  return {
    name: check.name,
    command: check.command.join(' '),
    ok: result.status === 0 && missing.length === 0,
    exitCode: result.status,
    durationMs: Date.now() - startedAt,
    missing,
    outputTail: output.split('\n').slice(-20).join('\n'),
  };
}

function runStaticCheck(check) {
  const text = readFileSync(join(rootDir, check.file), 'utf8');
  const missing = check.expect.filter((needle) => !text.includes(needle));
  return {
    name: check.name,
    file: check.file,
    ok: missing.length === 0,
    missing,
  };
}

const report = {
  generatedAt: new Date().toISOString(),
  checks: checks.map(runCommand),
  staticChecks: staticChecks.map(runStaticCheck),
};
report.ok = report.checks.every((check) => check.ok) && report.staticChecks.every((check) => check.ok);

const jsonPath = join(outputDir, 'regression-dashboard.json');
const mdPath = join(outputDir, 'regression-dashboard.md');
writeFileSync(jsonPath, JSON.stringify(report, null, 2));
writeFileSync(mdPath, renderMarkdown(report));

console.log(`ControlStudio regression dashboard: ${report.ok ? 'PASS' : 'FAIL'}`);
console.log(`JSON: ${jsonPath}`);
console.log(`Markdown: ${mdPath}`);
if (!report.ok) process.exitCode = 1;

function renderMarkdown(report) {
  const lines = [
    '# ControlStudio Regression Dashboard',
    '',
    `Generated: ${report.generatedAt}`,
    `Status: ${report.ok ? 'PASS' : 'FAIL'}`,
    '',
    '## Runtime Checks',
    '',
    '| Check | Status | Duration |',
    '| --- | --- | ---: |',
    ...report.checks.map((check) => `| ${check.name} | ${check.ok ? 'PASS' : 'FAIL'} | ${check.durationMs} ms |`),
    '',
    '## Static Checks',
    '',
    '| Check | Status |',
    '| --- | --- |',
    ...report.staticChecks.map((check) => `| ${check.name} | ${check.ok ? 'PASS' : 'FAIL'} |`),
    '',
  ];
  return lines.join('\n');
}
