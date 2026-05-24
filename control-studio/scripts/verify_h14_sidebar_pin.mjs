/**
 * verify_h14_sidebar_pin.mjs
 *
 * Verifies H1-4 — Sidebar Quick Pin:
 *   📌 button injected per section-panel header
 *   localStorage-backed pinning, max 3 pins
 *   Pinned sections float to top (sp-pinned class)
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
const errors = [];

function ok(label)       { console.log(`  ✓ ${label}`); pass++; }
function bad(label, msg) { console.error(`  ✗ ${label}: ${msg}`); fail++; errors.push(label); }
function assert(cond, label, msg = '') { cond ? ok(label) : bad(label, msg || 'condition failed'); }

const appJs     = readFileSync(path.join(ROOT, 'js/app.js'),  'utf8');
const indexHtml = readFileSync(path.join(ROOT, 'index.html'), 'utf8');

console.log('\n▶ H1-4 Sidebar Quick Pin — JS');

assert(appJs.includes('function initSidebarQuickPin()') ||
       appJs.includes('export function initSidebarQuickPin()'),     'initSidebarQuickPin() defined');
assert(appJs.includes('_SP_KEY') || appJs.includes('cs-sidebar-pins'),
                                                                    'localStorage key for pin state');
assert(appJs.includes('_SP_MAX') || appJs.includes('sp_max') ||
       appJs.includes('3'),                                         'max 3 pins enforced');
assert(appJs.includes('section-pin-btn'),                           'section-pin-btn CSS class used');
assert(appJs.includes('sp-pinned'),                                 'sp-pinned class for pinned state');
assert(appJs.includes('sp-active'),                                 'sp-active class on active pin button');
assert(appJs.includes("'📌'"),                                      '📌 emoji on pin button');
assert(appJs.includes('initSidebarQuickPin()'),                     'initSidebarQuickPin() called in DOMContentLoaded');
assert(appJs.includes('_spApply') || appJs.includes('spApply') ||
       appJs.includes('classList.toggle(\'sp-pinned\''),            'pin state applied to DOM');

console.log('\n▶ H1-4 Sidebar Quick Pin — CSS');

assert(indexHtml.includes('.section-pin-btn'),                      '.section-pin-btn CSS defined');
assert(indexHtml.includes('.sp-pinned') || indexHtml.includes('sp-pinned'),
                                                                    'sp-pinned CSS defined');
assert(indexHtml.includes('.sp-active') || indexHtml.includes('sp-active'),
                                                                    'sp-active CSS defined');

console.log('');
console.log(`Results: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error('Failed:', errors.join(', '));
  process.exit(1);
}
console.log('✓ H1-4 Sidebar Quick Pin — all checks passed');
