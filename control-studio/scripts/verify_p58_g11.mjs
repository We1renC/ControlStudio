/**
 * verify_p58_g11.mjs
 *
 * Verifies P58 — G11: App Loading Skeleton Screen
 *   - Full-page skeleton overlay appears while app initialises
 *   - Uses cs-skeleton animation
 *   - showAppSkeleton() / hideAppSkeleton() / initLoadingSkeleton() defined
 *   - Skeleton overlay contains sidebar + chart + status bar placeholders
 *   - Fade-out via .skeleton-fade-out CSS transition
 *   - aria-label and role="status" for accessibility
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

// ── G11: App Loading Skeleton ─────────────────────────────────────────────────
console.log('\n▶ G11 App Loading Skeleton Screen');

// JS functions
assert(appJs.includes('function showAppSkeleton()'),    'showAppSkeleton() defined');
assert(appJs.includes('function hideAppSkeleton()'),    'hideAppSkeleton() defined');
assert(appJs.includes('function initLoadingSkeleton()'), 'initLoadingSkeleton() defined');
assert(appJs.includes('app-skeleton-overlay'),          'app-skeleton-overlay referenced');
assert(appJs.includes('skeleton-fade-out'),             'skeleton-fade-out class applied on hide');
assert(appJs.includes('transitionend'),                 'transitionend event used for cleanup');
assert(appJs.includes('aria-hidden'),                   'aria-hidden toggled on show/hide');
assert(appJs.includes('requestAnimationFrame'),         'requestAnimationFrame used for timing');
assert(appJs.includes('window.showAppSkeleton'),        'showAppSkeleton exposed globally');
assert(appJs.includes('window.hideAppSkeleton'),        'hideAppSkeleton exposed globally');

// HTML structure
assert(indexHtml.includes('app-skeleton-overlay'),      '#app-skeleton-overlay in HTML');
assert(indexHtml.includes('role="status"'),             'role="status" on overlay');
assert(indexHtml.includes('aria-label="載入中"'),       'aria-label on overlay');
assert(indexHtml.includes('app-skeleton-header'),       '.app-skeleton-header in HTML');
assert(indexHtml.includes('app-skeleton-sidebar'),      '.app-skeleton-sidebar in HTML');
assert(indexHtml.includes('app-skeleton-main'),         '.app-skeleton-main in HTML');
assert(indexHtml.includes('app-skeleton-chart'),        '.app-skeleton-chart in HTML');
assert(indexHtml.includes('app-skeleton-status'),       '.app-skeleton-status in HTML');
assert(indexHtml.includes('skel-logo'),                 '.skel-logo skeleton in HTML');
assert(indexHtml.includes('skel-tab'),                  '.skel-tab skeleton in HTML');
// G11 must use existing cs-skeleton class
const skeletonCount = (indexHtml.match(/cs-skeleton/g) ?? []).length;
assert(skeletonCount >= 5, `cs-skeleton used ≥5 times in skeleton overlay (found ${skeletonCount})`);

// CSS
assert(indexHtml.includes('#app-skeleton-overlay'),     '#app-skeleton-overlay CSS');
assert(indexHtml.includes('.skeleton-fade-out'),        '.skeleton-fade-out CSS transition');
assert(indexHtml.includes('.app-skeleton-header'),      '.app-skeleton-header CSS');
assert(indexHtml.includes('.app-skeleton-sidebar'),     '.app-skeleton-sidebar CSS');
assert(indexHtml.includes('.app-skeleton-main'),        '.app-skeleton-main CSS');
assert(indexHtml.includes('.app-skeleton-chart'),       '.app-skeleton-chart CSS');
assert(indexHtml.includes('.app-skeleton-status'),      '.app-skeleton-status CSS');
assert(indexHtml.includes('.skel-logo'),                '.skel-logo CSS');
assert(indexHtml.includes('.skel-tab'),                 '.skel-tab CSS');
// Should use existing cs-skeleton animation (defined in P36)
assert(indexHtml.includes('cs-skeleton-pulse') || indexHtml.includes('.cs-skeleton'),
       'cs-skeleton / cs-skeleton-pulse animation referenced in CSS');

// ── P58 init call ─────────────────────────────────────────────────────────────
console.log('\n▶ P58 DOMContentLoaded init');

assert(appJs.includes('initLoadingSkeleton()'), 'initLoadingSkeleton called');

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('');
console.log(`Results: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error('Failed:', errors.join(', '));
  process.exit(1);
}
console.log('✓ P58 G11 App Loading Skeleton Screen — all checks passed');
