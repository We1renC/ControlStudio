#!/usr/bin/env node
/**
 * verify_api_auto_fallback.mjs — frontend analysis-source migration guard.
 *
 * Locks the intended product behavior:
 *   - new sessions default to Auto API Fallback
 *   - API success applies FastAPI metrics in auto/api modes
 *   - API failures and unsupported z-domain cases fall back to Local JS in auto
 *   - non-finite margin comparison uses explicit status fields
 *   - manual Local JS / FastAPI / Compare Local/API modes remain available
 */

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const app = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

let passed = 0;
let failed = 0;

function ok(msg, cond) {
  if (cond) {
    console.log(`  [PASS] ${msg}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${msg}`);
    failed++;
  }
}

console.log('\n=== API Auto Fallback UI Contract ===\n');

ok('Test 1: state defaults analysisSource to auto',
  app.includes("analysisSource: 'auto'"));
ok('Test 2: change handler falls back to auto when value is absent',
  app.includes("state.analysisSource = e.target.value || 'auto'"));
ok('Test 3: session restore defaults missing analysisSource to auto',
  app.includes("state.analysisSource = data.analysisSource || 'auto'"));
ok('Test 4: selector exposes Auto API Fallback option',
  html.includes('<option value="auto">Auto API Fallback</option>'));
ok('Test 4: selector preserves Local JS option',
  html.includes('<option value="local">Local JS</option>'));
ok('Test 4: selector preserves FastAPI option',
  html.includes('<option value="api">FastAPI</option>'));
ok('Test 4: selector preserves Compare Local/API option',
  html.includes('<option value="compare">Compare Local/API</option>'));
ok('Test 5: auto mode applies FastAPI metrics on success',
  app.includes("state.analysisSource === 'api' || state.analysisSource === 'auto'"));
ok('Test 6: auto mode reports Local JS fallback when FastAPI is unavailable',
  app.includes('Using Local JS fallback: FastAPI unavailable'));
ok('Test 7: auto mode reports Local JS fallback for unsupported z-domain API',
  app.includes('Using Local JS fallback: FastAPI currently supports continuous-time TF/SS only.'));
ok('Test 8: fallback and not-applicable statuses use warning tone',
  app.includes("current.status === 'fallback' || current.status === 'not_applicable'"));
ok('Test 9: auto success message identifies Unified API active',
  app.includes('Unified API active; FastAPI matches local metrics.'));
ok('Test 10: compareApiMetrics checks non-finite margin status fields',
  app.includes('apiMetrics.phaseMarginStatus') &&
  app.includes('apiMetrics.gainMarginDBStatus') &&
  app.includes('return { maxAbs: Infinity, rows }'));
ok('Test 11: API metric display renders non-finite status labels',
  app.includes("formatExportNumber(metrics.gainMarginDB, metrics.gainMarginDBStatus") &&
  app.includes("formatExportNumber(metrics.phaseMargin, metrics.phaseMarginStatus"));

console.log(`\n${'─'.repeat(55)}`);
console.log(`API auto fallback: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
else console.log('All tests passed.');
