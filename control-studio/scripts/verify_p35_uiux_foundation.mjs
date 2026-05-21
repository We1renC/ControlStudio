#!/usr/bin/env node
/**
 * verify_p35_uiux_foundation.mjs — UI/UX plan P1 foundation checkpoint.
 *
 * This is a structural regression guard for the browser UI layer. It verifies
 * that the implemented P1 infrastructure remains wired in the production
 * HTML/JS entrypoints without requiring a browser runtime.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const app = readFileSync(join(root, 'js', 'app.js'), 'utf8');

let passed = 0;
let failed = 0;

function ok(label, condition) {
  if (condition) {
    console.log(`  [PASS] ${label}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${label}`);
    failed++;
  }
}

console.log('\n=== P35: UI/UX Plan P1 Foundation ===\n');

ok('Status bar container exists', html.includes('id="app-status-bar"'));
ok('Status bar exposes live region', html.includes('id="global-live-region"') && html.includes('aria-live="polite"'));
ok('Status bar has plant, loop, plot, stability fields',
  ['status-plant-type', 'status-loop-mode', 'status-active-plot', 'status-stability']
    .every((id) => html.includes(`id="${id}"`)));
ok('Toast stack exists', html.includes('id="toast-stack"') && html.includes('class="toast-stack"'));
ok('Toast variants are styled', ['.toast.success', '.toast.warning', '.toast.error'].every((token) => html.includes(token)));
ok('Empty state action styling exists', html.includes('.empty-state-actions'));

ok('notify() helper is implemented', /function\s+notify\s*\(/.test(app));
ok('updateGlobalStatusBar() helper is implemented', /function\s+updateGlobalStatusBar\s*\(/.test(app));
ok('showBanner routes through notification toast', /function\s+showBanner\s*\([^)]*\)\s*\{\s*notify\(/s.test(app));
ok('Share flow emits success notification', app.includes("notify('Share URL copied to clipboard.'"));
ok('Comparison snapshot flow emits notification', app.includes("notify('Comparison snapshot saved.'"));
ok('Project export flow emits notification', app.includes("notify('Project file export started.'"));
ok('csUI exports notify and status helpers',
  /return\s+\{[^}]*notify[^}]*updateGlobalStatusBar[^}]*\}/s.test(app));

console.log(`\nP35 UI/UX foundation: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
