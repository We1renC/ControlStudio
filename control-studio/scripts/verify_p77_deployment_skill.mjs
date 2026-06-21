#!/usr/bin/env node
/**
 * verify_p77_deployment_skill.mjs — Phase 77 deployment reviewer skill package.
 */

import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PROJECT_ROOT = path.resolve(ROOT, '..');
const SKILL_DIR = path.join(PROJECT_ROOT, 'skills/control-studio-deployment-reviewer');

let passed = 0;
let failed = 0;

function ok(message, condition, detail = '') {
  if (condition) {
    console.log(`  [PASS] ${message}${detail ? `  ${detail}` : ''}`);
    passed += 1;
  } else {
    console.error(`  [FAIL] ${message}${detail ? `  ${detail}` : ''}`);
    failed += 1;
  }
}

function readRequired(relativePath) {
  const file = path.join(SKILL_DIR, relativePath);
  ok(`${relativePath} exists`, existsSync(file));
  return existsSync(file) ? readFileSync(file, 'utf8') : '';
}

function includesAll(content, terms) {
  return terms.every((term) => content.includes(term));
}

console.log('\n=== P77: Deployment Reviewer Skill ===\n');

const skill = readRequired('SKILL.md');
const workflow = readRequired('references/workflow.md');
const checklist = readRequired('references/validation-checklist.md');
const sampleInput = readRequired('examples/sample-input.json');
const sampleOutput = readRequired('examples/sample-output.md');
const agentYaml = readRequired('agents/openai.yaml');

ok('SKILL.md frontmatter names the skill', skill.includes('name: control-studio-deployment-reviewer'));
ok('SKILL.md links to assessDeploymentReadiness()', skill.includes('assessDeploymentReadiness()'));
ok('SKILL.md lists ready/conditional/blocked decisions', includesAll(skill, ['ready', 'conditional', 'blocked']));
ok('SKILL.md preserves paused scope boundary', includesAll(skill, ['Teaching Mode', 'Electron packaging', 'Report Template', 'Block Diagram expansion']));
ok('SKILL.md defines required evidence categories', includesAll(skill, [
  'sample time',
  'artifact',
  'Traceability',
  'WCET',
  'fixed-point',
  'CRC',
  'HIL',
]));

ok('workflow maps to productization and HIL modules', includesAll(workflow, [
  'control-studio/js/control/productization.js',
  'control-studio/scripts/verify_p76_deployment_readiness.mjs',
  'control-studio/js/integration/hil_ws.js',
]));
ok('workflow defines output contract fields', includesAll(workflow, [
  'status',
  'deploymentClass',
  'score',
  'checks',
  'requiredActions',
  'summary',
]));

ok('checklist covers artifact, timing, numeric, safety, and HIL gates', includesAll(checklist, [
  'Artifact Checks',
  'Timing Checks',
  'Numeric Checks',
  'Safety Checks',
  'HIL Checks',
  'Rejection Rules',
]));
ok('checklist includes blocking failure modes', includesAll(checklist, [
  'Missing sample time blocks deployment',
  'WCET above deadline blocks deployment',
  'Fixed-point overflow risk blocks deployment',
  'Missing safety wrapper blocks safety-critical deployment',
]));

let parsed = null;
try {
  parsed = JSON.parse(sampleInput);
  ok('sample-input.json parses', true);
} catch (error) {
  ok('sample-input.json parses', false, error.message);
}

if (parsed) {
  ok('sample input includes C deployment evidence', parsed.target === 'c' && parsed.codegen?.files?.['controller.c'] && parsed.codegen?.files?.['controller.h']);
  ok('sample input includes timing evidence', parsed.timing?.wcetMs > 0 && parsed.timing?.deadlineMs > parsed.timing?.wcetMs);
  ok('sample input includes fixed-point and safety evidence', parsed.numeric?.fixedPoint === true && parsed.safety?.critical === true && parsed.safety?.watchdog === true);
  ok('sample input includes HIL schema evidence', Array.isArray(parsed.hil?.frameSchema) && parsed.hil.frameSchema.includes('state') && parsed.hil.frameSchema.includes('input'));
}

ok('sample output includes readiness decision and commands', includesAll(sampleOutput, [
  'Status: pass',
  'Deployment class: ready',
  'Required actions:',
  'verify_p76_deployment_readiness.mjs',
  'verify_p77_deployment_skill.mjs',
]));
ok('agent metadata names deployment reviewer', includesAll(agentYaml, [
  'display_name: ControlStudio Deployment Reviewer',
  'default_prompt:',
]));

console.log(`\n${'─'.repeat(55)}`);
console.log(`P77 deployment reviewer skill: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
else console.log('All tests passed.');
