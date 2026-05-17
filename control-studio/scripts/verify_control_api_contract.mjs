import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONTROL_VERIFICATION_CASES } from '../js/verification/verification-cases.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(SCRIPT_DIR, '..', '..');
const API_BASE_URL = process.env.CONTROL_STUDIO_API_URL ?? 'http://127.0.0.1:8770';
const HEALTH_URL = `${API_BASE_URL}/health`;
const API_PORT = new URL(API_BASE_URL).port || '8770';
const PYTHON_BIN = existsSync(resolve(ROOT_DIR, '.venv/bin/python'))
  ? resolve(ROOT_DIR, '.venv/bin/python')
  : 'python3';

const results = [];
let apiProcess = null;

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function assertNear(name, actual, expected, tolerance = 1e-6) {
  if (actual === null || expected === null) {
    if (actual !== expected) throw new Error(`${name}: expected ${expected}, got ${actual}`);
    return;
  }
  if (!Number.isFinite(actual) || !Number.isFinite(expected) || Math.abs(actual - expected) > tolerance) {
    throw new Error(`${name}: expected ${expected}, got ${actual}`);
  }
}

function assertEqual(name, actual, expected) {
  if (actual !== expected) {
    throw new Error(`${name}: expected ${expected}, got ${actual}`);
  }
}

function assertArrayLength(name, actual, expected) {
  if (!Array.isArray(actual) || !Array.isArray(expected) || actual.length !== expected.length) {
    throw new Error(`${name}: expected length ${expected?.length}, got ${actual?.length}`);
  }
}

async function isApiHealthy() {
  try {
    const response = await fetch(HEALTH_URL);
    if (!response.ok) return false;
    const body = await response.json();
    return body.status === 'ok';
  } catch {
    return false;
  }
}

async function ensureApiServer() {
  if (await isApiHealthy()) return false;

  apiProcess = spawn(PYTHON_BIN, ['control-studio/scripts/control_api.py'], {
    cwd: ROOT_DIR,
    env: { ...process.env, CONTROL_STUDIO_API_PORT: API_PORT },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  apiProcess.stdout.on('data', () => {});
  apiProcess.stderr.on('data', () => {});

  for (let i = 0; i < 60; i += 1) {
    if (await isApiHealthy()) return true;
    if (apiProcess.exitCode !== null) {
      throw new Error(`API server exited with code ${apiProcess.exitCode}`);
    }
    await sleep(250);
  }

  throw new Error(`API server did not become healthy on ${API_BASE_URL}`);
}

function stopSpawnedApi() {
  if (!apiProcess || apiProcess.exitCode !== null) return;
  apiProcess.kill('SIGTERM');
}

function runCli(payload) {
  const raw = execFileSync('node', ['control-studio/scripts/control_analysis_cli.mjs', JSON.stringify(payload)], {
    cwd: ROOT_DIR,
    encoding: 'utf8',
  });
  return JSON.parse(raw);
}

async function postJson(path, payload) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${path} returned ${response.status}: ${text}`);
  }
  return response.json();
}

function compareSystem(prefix, apiSystem, cliSystem) {
  assertEqual(`${prefix} plant formula`, apiSystem.plant.formula, cliSystem.plant.formula);
  assertEqual(`${prefix} open-loop formula`, apiSystem.openLoop.formula, cliSystem.openLoop.formula);
  assertEqual(`${prefix} closed-loop formula`, apiSystem.closedLoop.formula, cliSystem.closedLoop.formula);
  assertArrayLength(`${prefix} plant numerator`, apiSystem.plant.numerator, cliSystem.plant.numerator);
  assertArrayLength(`${prefix} plant denominator`, apiSystem.plant.denominator, cliSystem.plant.denominator);
}

function compareMetrics(prefix, apiMetrics, cliMetrics) {
  const keys = ['riseTime', 'settlingTime', 'overshoot', 'steadyStateError', 'gainMarginDB', 'phaseMargin'];
  keys.forEach((key) => assertNear(`${prefix} metrics.${key}`, apiMetrics[key], cliMetrics[key], 1e-9));
}

function compareResponse(apiResponse, cliResponse) {
  assertArrayLength('response.t', apiResponse.t, cliResponse.t);
  assertArrayLength('response.y', apiResponse.y, cliResponse.y);
  assertNear(
    'response final value',
    apiResponse.y[apiResponse.y.length - 1],
    cliResponse.y[cliResponse.y.length - 1],
    1e-9,
  );
}

function comparePlotShape(apiStability, cliStability) {
  assertArrayLength('bode.w', apiStability.bode.w, cliStability.bode.w);
  assertArrayLength('bode.magDB', apiStability.bode.magDB, cliStability.bode.magDB);
  assertArrayLength('nyquist.re', apiStability.nyquist.re, cliStability.nyquist.re);
  assertArrayLength('nyquist.im', apiStability.nyquist.im, cliStability.nyquist.im);
  assertArrayLength('rootLocus.gains', apiStability.rootLocus.gains, cliStability.rootLocus.gains);
  assertArrayLength('rootLocus.roots', apiStability.rootLocus.roots, cliStability.rootLocus.roots);
}

async function verifyCase(testCase) {
  const cli = runCli(testCase.payload);
  const response = await postJson('/api/control/system/response', testCase.payload);
  const stability = await postJson('/api/control/system/stability', testCase.payload);

  compareSystem(`${testCase.id} response`, response.system, cli.system);
  compareSystem(`${testCase.id} stability`, stability.system, cli.system);
  compareMetrics(`${testCase.id} response`, response.metrics, cli.metrics);
  compareMetrics(`${testCase.id} stability`, stability.metrics, cli.metrics);
  compareResponse(response.response, cli.response);
  comparePlotShape(stability, cli);

  return {
    id: testCase.id,
    checks: 10,
    plant: response.system.plant.formula,
    closedLoop: response.system.closedLoop.formula,
  };
}

process.on('exit', stopSpawnedApi);
process.on('SIGINT', () => {
  stopSpawnedApi();
  process.exit(130);
});

try {
  const spawned = await ensureApiServer();
  for (const testCase of CONTROL_VERIFICATION_CASES) {
    const result = await verifyCase(testCase);
    results.push(result);
    console.log(`[PASS] ${result.id}: API contract`);
  }
  console.log(`API contract fixtures passed: ${results.length}/${CONTROL_VERIFICATION_CASES.length}`);
  if (spawned) console.log('Started temporary API server for contract verification');
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ success: true, results }, null, 2));
  }
} catch (err) {
  console.error(`[FAIL] ${err.message}`);
  if (process.argv.includes('--json')) {
    console.error(JSON.stringify({ success: false, error: err.message, results }, null, 2));
  }
  process.exitCode = 1;
} finally {
  stopSpawnedApi();
}
