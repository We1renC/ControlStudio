/**
 * verify_ui_stability_snapshot_contract.mjs
 *
 * Guards the UI stability-state contract:
 * - updateStabilityPanel must publish a fresh canonical _lastStability snapshot.
 * - canonical gain-margin field is gainMarginDB; gainMarginDb is compatibility only.
 * - flow, warning, summary, and report paths must read GM through a normalization helper.
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
const flowJs = readFileSync(path.join(ROOT, 'js/ui/flow.js'), 'utf8');
const shareJs = readFileSync(path.join(ROOT, 'js/ui/share.js'), 'utf8');

console.log('\n▶ UI stability snapshot contract');

assertRegex(
  appJs,
  /_lastStability:\s*null/,
  'app state initializes _lastStability',
);

assertRegex(
  appJs,
  /function stabilityGainMarginDB\(stab\)[\s\S]*stab\.gainMarginDB[\s\S]*stab\.gainMarginDb[\s\S]*20 \* Math\.log10\(stab\.gainMargin\)/,
  'app normalizes canonical and legacy gain-margin fields',
);

assertRegex(
  appJs,
  /function buildLastStabilitySnapshot\(stability, margins\)[\s\S]*gainMarginDB[\s\S]*gainMarginDb:\s*gainMarginDB[\s\S]*stable:\s*stability\?\.status === 'stable'/,
  'app builds canonical stability snapshot with compatibility alias',
);

assertRegex(
  appJs,
  /const stability = analyzeStability\(sys,[\s\S]*state\._lastStability = buildLastStabilitySnapshot\(stability, margins\)/,
  'updateStabilityPanel publishes _lastStability snapshot',
);

assert(
  !appJs.includes('state._lastStability?.gainMarginDb') &&
    !appJs.includes('state._lastStability.gainMarginDb'),
  'app UI does not directly read legacy gainMarginDb from state',
);

assertRegex(
  flowJs,
  /function gainMarginDBFromStability\(stab\)[\s\S]*stab\.gainMarginDB[\s\S]*stab\.gainMarginDb[\s\S]*20 \* Math\.log10\(stab\.gainMargin\)[\s\S]*function allSpecsPassing\(\)[\s\S]*gainMarginDBFromStability\(stab\)/,
  'flow module gates specs through canonical GM helper',
);

assertRegex(
  shareJs,
  /function gainMarginDBFromStability\(stab\)[\s\S]*stab\.gainMarginDB[\s\S]*function formatGainMarginDB\(gm\)[\s\S]*gm === Infinity[\s\S]*function gainMarginPasses\(gm\)[\s\S]*gm === Infinity/,
  'share/report module formats and passes infinite GM correctly',
);

assertRegex(
  shareJs,
  /const gm\s*=\s*gainMarginDBFromStability\(stab\)[\s\S]*actual:\s*formatGainMarginDB\(gm\)[\s\S]*pass:\s*gainMarginPasses\(gm\)/,
  'report spec row uses normalized GM value',
);

console.log('');
console.log(`Results: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error('Failed:', errors.join(', '));
  process.exit(1);
}

console.log('✓ UI stability snapshot contract — all checks passed');
