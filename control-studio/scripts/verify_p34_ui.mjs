#!/usr/bin/env node
/**
 * verify_p34_ui.mjs — Phase 34: UI/UX Experience
 *
 * Tests:
 *  components.js (P34-02):
 *   1.  esc() escapes HTML special chars
 *   2.  badge() returns span with correct variant class
 *   3.  badge() includes role="status"
 *   4.  button() disabled sets aria-disabled
 *   5.  table() renders thead + tbody with correct row count
 *   6.  table() has role="table"
 *   7.  alert() contains icon and message
 *   8.  alert() dismissible has close button
 *   9.  panel() collapsible has aria-expanded
 *  10.  panel() non-collapsible has no toggle button
 *  11.  progressBar() aria-valuenow correct
 *  12.  spinner() aria-busy="true"
 *  13.  tabs() has role="tablist"
 *  14.  tabs() inactive panel is hidden
 *  15.  kvList() renders dt/dd pairs
 *  theme.js (P34-01/P34-03):
 *  16.  buildCSSVars('dark') contains --cs-bg
 *  17.  buildCSSVars('light') different from dark
 *  18.  buildAdaptiveCSS() contains prefers-color-scheme
 *  19.  mediaQuery('md','up') → min-width:768px
 *  20.  mediaQuery('sm','down') → max-width
 *  21.  mediaQuery('lg','only') → min and max or min-width
 *  22.  responsiveGrid() returns multiple @media blocks
 *  23.  detectTheme() returns 'dark' in Node
 *  a11y.js (P34-04):
 *  24.  ariaAttrs() prefixes keys correctly
 *  25.  ariaAttrs() omits undefined values
 *  26.  hiddenLabel() contains cs-sr-only class
 *  27.  liveRegion() has aria-live attribute
 *  28.  skipLink() contains href="#main"
 *  29.  iconButton() has aria-label
 *  30.  focusRingCSS() contains :focus-visible
 *  31.  srOnlyCSS() contains position:absolute
 *  32.  relativeLuminance('#ffffff') ≈ 1
 *  33.  relativeLuminance('#000000') ≈ 0
 *  34.  contrastRatio('#ffffff','#000000') ≈ 21
 *  35.  meetsWCAG AA: white on black passes
 *  36.  meetsWCAG AA: very light grey on white fails
 *  wizard-panel.js (P34-05):
 *  37.  renderWorkflowStep() has li with data-step
 *  38.  renderWizardPanel() returns html with section
 *  39.  renderWizardPanel() result contains controllerType
 *  40.  renderWizardPanel() alternatives rendered when present
 *  41.  buildWizardForm() contains <form>
 *  42.  buildWizardForm() has submit button
 *  43.  buildWizardForm() default values populated
 *  chart-helpers.js (P34-06):
 *  44.  createZoomState() initialises correct view
 *  45.  zoom() in × 2 halves the range
 *  46.  pan() shifts view
 *  47.  reset() restores initial view
 *  48.  windowData() filters to [0.3,0.7]
 *  49.  downsampleLTTB() reduces point count
 *  50.  downsampleLTTB() preserves first and last points
 *  51.  buildSVGChart() starts with <svg
 *  52.  buildSVGChart() contains polyline for each series
 *  53.  toCSV() first line is header
 *  54.  toCSV() row count matches data length
 *  55.  toJSON() parses back to object with series
 *  56.  formatAxisLabel() switches to exponential for large values
 */

import { esc, badge, button, table, alert, panel, progressBar, spinner, tabs, kvList }
  from '../js/ui/components.js';
import { buildCSSVars, buildAdaptiveCSS, mediaQuery, responsiveGrid, detectTheme, THEMES }
  from '../js/ui/theme.js';
import { ariaAttrs, hiddenLabel, liveRegion, skipLink, iconButton,
         focusRingCSS, srOnlyCSS, relativeLuminance, contrastRatio, meetsWCAG }
  from '../js/ui/a11y.js';
import { renderWorkflowStep, renderWizardPanel, buildWizardForm }
  from '../js/ui/wizard-panel.js';
import { createZoomState, windowData, downsampleLTTB, buildSVGChart, toCSV, toJSON, formatAxisLabel }
  from '../js/ui/chart-helpers.js';

let passed = 0, failed = 0;
function ok(msg, cond, detail = '') {
  if (cond) { console.log(`  [PASS] ${msg}${detail ? '  ' + detail : ''}`); passed++; }
  else       { console.error(`  [FAIL] ${msg}${detail ? '  ' + detail : ''}`); failed++; }
}
function has(str, sub) { return typeof str === 'string' && str.includes(sub); }
function close(a, b, tol = 0.01) { return Math.abs(a - b) <= tol; }

console.log('\n=== P34: UI/UX Experience ===\n');
console.log('── components.js (P34-02) ────────────────');

// Test 1
ok('Test 1: esc() escapes &<>"\'' ,
  esc('<script>&"\'') === '&lt;script&gt;&amp;&quot;&#39;');

// Test 2–3
{
  const b = badge('ok', 'Stable');
  ok('Test 2: badge variant class', has(b, 'cs-badge--ok') && has(b, 'Stable'));
  ok('Test 3: badge role=status', has(b, 'role="status"'));
}

// Test 4
{
  const btn = button('Click', { disabled: true });
  ok('Test 4: disabled button aria-disabled', has(btn, 'aria-disabled="true"') && has(btn, 'disabled'));
}

// Test 5–6
{
  const t = table(['A','B'], [[1,2],[3,4],[5,6]]);
  ok('Test 5: table has 3 data rows', (t.match(/<tr>/g) || []).length >= 3);
  ok('Test 6: table role=table', has(t, 'role="table"'));
}

// Test 7–8
{
  const a1 = alert('warn', 'Low margin', { title:'Warning' });
  ok('Test 7: alert contains message', has(a1, 'Low margin') && has(a1, '⚠'));
  const a2 = alert('error', 'Unstable', { dismissible: true });
  ok('Test 8: dismissible alert has close button', has(a2, 'cs-alert__dismiss'));
}

// Test 9–10
{
  const pc = panel('Title', '<p>body</p>', { collapsible: true });
  ok('Test 9: collapsible panel has aria-expanded', has(pc, 'aria-expanded='));
  const pn = panel('Title', '<p>body</p>');
  ok('Test 10: non-collapsible panel no toggle', !has(pn, 'cs-panel__toggle'));
}

// Test 11
{
  const pb = progressBar(42);
  ok('Test 11: progressBar aria-valuenow=42', has(pb, 'aria-valuenow="42"'));
}

// Test 12
{
  const sp = spinner('Computing…');
  ok('Test 12: spinner aria-busy=true', has(sp, 'aria-busy="true"'));
}

// Test 13–14
{
  const t = tabs([
    { id:'a', label:'Alpha', contentHtml:'<p>A</p>', active:true },
    { id:'b', label:'Beta',  contentHtml:'<p>B</p>' },
  ]);
  ok('Test 13: tabs has role=tablist', has(t, 'role="tablist"'));
  ok('Test 14: inactive tab panel is hidden', has(t, 'hidden'));
}

// Test 15
{
  const kv = kvList([{ label:'Kp', value:2 }, { label:'Ki', value:0.5 }]);
  ok('Test 15: kvList renders dt/dd pairs', has(kv, '<dt') && has(kv, '<dd') && has(kv, 'Kp'));
}

console.log('\n── theme.js (P34-01/P34-03) ──────────────');

// Test 16
{
  const css = buildCSSVars('dark');
  ok('Test 16: dark theme has --cs-bg', has(css, '--cs-bg:') || has(css, '--cs-bg '));
}

// Test 17
{
  const dark  = buildCSSVars('dark');
  const light = buildCSSVars('light');
  ok('Test 17: light ≠ dark CSS vars', dark !== light);
}

// Test 18
{
  const css = buildAdaptiveCSS();
  ok('Test 18: adaptive CSS contains prefers-color-scheme', has(css, 'prefers-color-scheme'));
}

// Test 19–21
{
  const mdUp  = mediaQuery('md', 'up');
  const smDn  = mediaQuery('sm', 'down');
  const lgOnly = mediaQuery('lg', 'only');
  ok('Test 19: md-up → min-width:768px', has(mdUp, '768px'));
  ok('Test 20: sm-down → max-width',     has(smDn, 'max-width'));
  ok('Test 21: lg-only → min-width or range', has(lgOnly, 'min-width') || has(lgOnly, '1024px'));
}

// Test 22
{
  const css = responsiveGrid('.layout', { sm:1, md:2, lg:3 });
  ok('Test 22: responsiveGrid has multiple @media', (css.match(/@media/g) || []).length >= 2);
}

// Test 23
{
  const t = detectTheme();
  ok('Test 23: detectTheme=dark in Node', t === 'dark');
}

console.log('\n── a11y.js (P34-04) ──────────────────────');

// Test 24–25
{
  const a1 = ariaAttrs({ label:'Close', expanded:false, controls:'menu' });
  ok('Test 24: ariaAttrs prefixes keys', has(a1, 'aria-label') && has(a1, 'aria-expanded'));
  const a2 = ariaAttrs({ label:'X', hidden: undefined });
  ok('Test 25: ariaAttrs omits undefined', !has(a2, 'hidden'));
}

// Test 26
{
  const hl = hiddenLabel('lbl-1', 'Phase Margin');
  ok('Test 26: hiddenLabel has cs-sr-only class', has(hl, 'cs-sr-only'));
}

// Test 27
{
  const lr = liveRegion('status-region', 'polite');
  ok('Test 27: liveRegion has aria-live', has(lr, 'aria-live="polite"'));
}

// Test 28
{
  const sl = skipLink('main', 'Skip to main content');
  ok('Test 28: skipLink href=#main', has(sl, 'href="#main"'));
}

// Test 29
{
  const ib = iconButton('✕', 'Close dialog');
  ok('Test 29: iconButton has aria-label', has(ib, 'aria-label="Close dialog"'));
}

// Test 30
{
  const css = focusRingCSS('#58a6ff');
  ok('Test 30: focusRingCSS has :focus-visible', has(css, ':focus-visible'));
}

// Test 31
{
  const css = srOnlyCSS();
  ok('Test 31: srOnlyCSS has position:absolute', has(css, 'position: absolute'));
}

// Test 32–36
{
  const lumW = relativeLuminance('#ffffff');
  const lumB = relativeLuminance('#000000');
  ok('Test 32: white luminance ≈ 1',  close(lumW, 1.0, 0.001));
  ok('Test 33: black luminance ≈ 0',  close(lumB, 0.0, 0.001));

  const cr = contrastRatio('#ffffff', '#000000');
  ok('Test 34: white/black contrast ≈ 21', close(cr, 21, 0.5), `cr=${cr.toFixed(2)}`);

  const res1 = meetsWCAG('#ffffff', '#000000', 'AA', 'normal');
  ok('Test 35: white on black passes AA', res1.passes);

  const res2 = meetsWCAG('#eeeeee', '#ffffff', 'AA', 'normal');
  ok('Test 36: near-white on white fails AA', !res2.passes);
}

console.log('\n── wizard-panel.js (P34-05) ──────────────');

// Test 37
{
  const step = renderWorkflowStep({ step:1, action:'Plant ID', api:'identifyARX(y, u, 2)', note:'Start here' });
  ok('Test 37: renderWorkflowStep has <li> with data-step', has(step, '<li') && has(step, 'data-step="1"'));
}

// Test 38–40
{
  const { html, result } = renderWizardPanel({ overshoot:10, settlingTime:2 });
  ok('Test 38: renderWizardPanel returns <section>', has(html, '<section'));
  ok('Test 39: result has controllerType', typeof result.controllerType === 'string');
  const { html:html2 } = renderWizardPanel({ robustness:true, topology:'mimo', nInputs:2, nOutputs:2 });
  ok('Test 40: alternatives rendered for H∞', has(html2, 'Alternative') || has(html2, 'alt'));
}

// Test 41–43
{
  const form = buildWizardForm({ overshoot:5, phaseMargin:50 });
  ok('Test 41: buildWizardForm contains <form>', has(form, '<form'));
  ok('Test 42: buildWizardForm has submit button', has(form, 'type="submit"'));
  ok('Test 43: default overshoot=5 pre-populated', has(form, 'value="5"'));
}

console.log('\n── chart-helpers.js (P34-06) ─────────────');

// Test 44–47
{
  const z = createZoomState({ xMin:0, xMax:10, yMin:-1, yMax:1 });
  ok('Test 44: createZoomState initial view', z.view.xMin === 0 && z.view.xMax === 10);

  z.zoom(2, 5, 0);
  const v1 = z.getView();
  ok('Test 45: zoom ×2 halves x range', close(v1.xMax - v1.xMin, 5, 0.01));

  z.pan(1, 0);
  const v2 = z.getView();
  ok('Test 46: pan shifts xMin by 1', close(v2.xMin - v1.xMin, 1, 0.01));

  z.reset();
  const v3 = z.getView();
  ok('Test 47: reset restores initial view', v3.xMin === 0 && v3.xMax === 10);
}

// Test 48
{
  const x = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
  const y = x.map((v) => Math.sin(v));
  const { x:wx, y:wy } = windowData(x, y, 0.3, 0.7);
  ok('Test 48: windowData filters to [0.3,0.7]', wx.length === 5 && wx[0] === 0.3 && wx[wx.length-1] === 0.7);
}

// Test 49–50
{
  const x = Array.from({ length: 200 }, (_, i) => i / 10);
  const y = x.map((v) => Math.sin(v));
  const { x:dx, y:dy } = downsampleLTTB(x, y, 30);
  ok('Test 49: LTTB reduces to target', dx.length <= 32, `n=${dx.length}`);
  ok('Test 50: LTTB preserves endpoints', dx[0] === x[0] && dx[dx.length-1] === x[x.length-1]);
}

// Test 51–52
{
  const svg = buildSVGChart({
    width:  400, height: 200,
    series: [
      { x:[0,1,2], y:[0,1,0], label:'S1' },
      { x:[0,1,2], y:[0,-1,0], label:'S2' },
    ],
    title: 'Test Chart', xLabel: 'time (s)', yLabel: 'output',
  });
  ok('Test 51: buildSVGChart starts with <svg', svg.trimStart().startsWith('<svg'));
  ok('Test 52: buildSVGChart has 2 polylines', (svg.match(/<polyline/g) || []).length === 2);
}

// Test 53–55
{
  const series = [
    { x:[0,1,2], y:[0,1,4], label:'y1' },
    { x:[0,1,2], y:[0,-1,-4], label:'y2' },
  ];
  const csv = toCSV(series);
  const csvRows = csv.split('\n');
  ok('Test 53: CSV first line is header', csvRows[0] === 'x,y1,y2');
  ok('Test 54: CSV row count = data length + 1 header', csvRows.length === 4);

  const json = toJSON(series, { title:'test' });
  const parsed = JSON.parse(json);
  ok('Test 55: toJSON parses back with series', Array.isArray(parsed.series) && parsed.series.length === 2);
}

// Test 56
{
  const big = formatAxisLabel(1e6);
  const small = formatAxisLabel(0.0001);
  const norm  = formatAxisLabel(3.14159);
  ok('Test 56: large values use exponential', has(big, 'e') || has(big, 'E') || has(big, '1e'));
  ok('Test 56: small values use exponential', has(small, 'e') || has(small, 'E'));
  ok('Test 56: normal values are fixed', !has(norm, 'e'));
}

console.log(`\n${'─'.repeat(55)}`);
console.log(`P34 UI/UX: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
else console.log('All tests passed.');
