/**
 * a11y.js — P34-04: Accessibility utilities (WCAG 2.1 AA helpers)
 *
 * Exports:
 *   ariaAttrs       — build ARIA attribute string from an options object
 *   labelledby      — create id-based labelling relationship HTML
 *   liveRegion      — create an aria-live region element
 *   skipLink        — generate "skip to main content" link HTML
 *   iconButton      — accessible icon-only button (requires aria-label)
 *   focusTrapCSS    — CSS helper for focus-visible ring
 *   contrastRatio   — WCAG luminance contrast ratio between two hex colours
 *   meetsWCAG       — check if contrast meets AA / AAA thresholds
 *   describeKey     — human-readable key description for keyboard shortcuts
 */

// ── ARIA attribute builder ────────────────────────────────────────────────────

/**
 * Build an ARIA attribute string from a plain object.
 * Keys are auto-prefixed with "aria-" if not already.
 *
 * @param {object}  attrs  e.g. { label:'Close', expanded:false, controls:'menu-id' }
 * @returns {string}  e.g. 'aria-label="Close" aria-expanded="false" aria-controls="menu-id"'
 */
export function ariaAttrs(attrs = {}) {
  return Object.entries(attrs)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => {
      const key = k.startsWith('aria-') ? k : `aria-${k}`;
      return `${key}="${String(v).replace(/"/g, '&quot;')}"`;
    })
    .join(' ');
}

// ── Labelling helpers ─────────────────────────────────────────────────────────

/**
 * Emit a hidden <span> label that can be associated via aria-labelledby / aria-describedby.
 *
 * @param {string}  id     Unique id for the label element.
 * @param {string}  text   Label text.
 * @param {boolean} [hidden=true]  Add sr-only styling class.
 * @returns {string}  HTML string.
 */
export function hiddenLabel(id, text, hidden = true) {
  const cls = hidden ? ' class="cs-sr-only"' : '';
  return `<span id="${_esc(id)}"${cls}>${_esc(text)}</span>`;
}

/**
 * Wrap content with an accessible label for a form field.
 *
 * @param {string}  forId    id of the associated input.
 * @param {string}  text     Label text.
 * @param {string}  inputHtml  Input element HTML.
 * @param {object}  [opts]
 * @param {boolean} [opts.required=false]
 * @param {string}  [opts.hint]   Hint text below label.
 * @returns {string}  HTML string.
 */
export function formField(forId, text, inputHtml, opts = {}) {
  const req   = opts.required ? '<span class="cs-required" aria-hidden="true">*</span>' : '';
  const hintId = opts.hint ? `${forId}-hint` : '';
  const hint   = opts.hint
    ? `<span id="${_esc(hintId)}" class="cs-field-hint">${_esc(opts.hint)}</span>\n`
    : '';
  const input = opts.hint
    ? inputHtml.replace('>', ` aria-describedby="${_esc(hintId)}">`)
    : inputHtml;

  return (
    `<div class="cs-field">\n` +
    `  <label class="cs-label" for="${_esc(forId)}">${_esc(text)}${req}</label>\n` +
    (hint ? `  ${hint}` : '') +
    `  ${input}\n` +
    `</div>`
  );
}

// ── Live region ───────────────────────────────────────────────────────────────

/**
 * Build an aria-live region for dynamic announcements.
 *
 * @param {string}  id
 * @param {'polite'|'assertive'|'off'} [politeness='polite']
 * @param {string}  [initialMessage='']
 * @returns {string}  Hidden live region HTML.
 */
export function liveRegion(id, politeness = 'polite', initialMessage = '') {
  return (
    `<div id="${_esc(id)}" aria-live="${_esc(politeness)}" aria-atomic="true" ` +
    `class="cs-sr-only" role="${politeness === 'assertive' ? 'alert' : 'status'}">\n` +
    (initialMessage ? `  ${_esc(initialMessage)}\n` : '') +
    `</div>`
  );
}

// ── Skip link ─────────────────────────────────────────────────────────────────

/**
 * "Skip to main content" accessibility link (visually hidden until focused).
 *
 * @param {string}  [targetId='main']
 * @param {string}  [label='Skip to main content']
 * @returns {string}  HTML string.
 */
export function skipLink(targetId = 'main', label = 'Skip to main content') {
  return (
    `<a href="#${_esc(targetId)}" class="cs-skip-link">${_esc(label)}</a>`
  );
}

// ── Icon button ───────────────────────────────────────────────────────────────

/**
 * Accessible icon-only button (requires ariaLabel).
 *
 * @param {string}  icon      Visible icon character / SVG.
 * @param {string}  ariaLabel Screen-reader label (required).
 * @param {object}  [opts]
 * @param {string}  [opts.id]
 * @param {string}  [opts.onClick]
 * @param {boolean} [opts.disabled=false]
 * @returns {string}
 */
export function iconButton(icon, ariaLabel, opts = {}) {
  const disabled = opts.disabled ? ' disabled aria-disabled="true"' : '';
  const id       = opts.id ? ` id="${_esc(opts.id)}"` : '';
  const onclick  = opts.onClick ? ` onclick="${_esc(opts.onClick)}"` : '';
  return (
    `<button type="button" class="cs-icon-btn" ` +
    `aria-label="${_esc(ariaLabel)}"${id}${disabled}${onclick}>\n` +
    `  <span aria-hidden="true">${icon}</span>\n` +
    `</button>`
  );
}

// ── Focus-visible ring CSS ────────────────────────────────────────────────────

/**
 * CSS rules for keyboard focus visibility (WCAG 2.4.7 + 2.4.11).
 *
 * @param {string}  [color='#58a6ff']  Focus ring color.
 * @param {string}  [width='3px']
 * @returns {string}  CSS text.
 */
export function focusRingCSS(color = '#58a6ff', width = '3px') {
  return (
    `:focus-visible {\n` +
    `  outline: ${width} solid ${color};\n` +
    `  outline-offset: 2px;\n` +
    `}\n` +
    `:focus:not(:focus-visible) {\n` +
    `  outline: none;\n` +
    `}\n`
  );
}

// ── Colour contrast ───────────────────────────────────────────────────────────

/**
 * Relative luminance of a CSS hex colour (WCAG 2.1 definition).
 * @param {string}  hex  e.g. '#ffffff' or 'fff'
 * @returns {number}  0 (black) – 1 (white)
 */
export function relativeLuminance(hex) {
  const clean = hex.replace(/^#/, '');
  const full  = clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean;

  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;

  const lin = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * WCAG contrast ratio between two hex colours.
 * @param {string}  fg  Foreground hex.
 * @param {string}  bg  Background hex.
 * @returns {number}  Contrast ratio ≥ 1.
 */
export function contrastRatio(fg, bg) {
  const L1 = relativeLuminance(fg);
  const L2 = relativeLuminance(bg);
  const lighter = Math.max(L1, L2);
  const darker  = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Check if a colour pair meets WCAG contrast thresholds.
 *
 * @param {string}  fg
 * @param {string}  bg
 * @param {'AA'|'AAA'}  [level='AA']
 * @param {'normal'|'large'} [textSize='normal']  large = ≥18pt / 14pt bold
 * @returns {{ ratio:number, passes:boolean, level:string, textSize:string }}
 */
export function meetsWCAG(fg, bg, level = 'AA', textSize = 'normal') {
  const ratio     = contrastRatio(fg, bg);
  const threshold = level === 'AAA'
    ? (textSize === 'large' ? 4.5 : 7.0)
    : (textSize === 'large' ? 3.0 : 4.5);
  return { ratio, passes: ratio >= threshold, level, textSize };
}

// ── Keyboard shortcut descriptor ──────────────────────────────────────────────

/**
 * Generate a human-readable keyboard shortcut label.
 *
 * @param {string[]}  keys  e.g. ['Ctrl', 'Shift', 'K'] or ['Meta', 'K']
 * @param {'mac'|'win'|'auto'} [platform='auto']
 * @returns {string}  e.g. 'Ctrl+Shift+K' or 'Cmd+Shift+K'
 */
export function describeKey(keys, platform = 'auto') {
  const isMac = platform === 'mac' ||
    (platform === 'auto' && typeof navigator !== 'undefined' &&
     /mac/i.test(navigator.platform ?? ''));

  const mapped = keys.map((k) => {
    if (isMac) {
      return { ctrl:'Ctrl', alt:'Option', shift:'Shift', meta:'Cmd', ctrl_:'Ctrl' }[k.toLowerCase()] ?? k;
    }
    return k;
  });

  return mapped.join('+');
}

// ── Screen-reader only CSS ───────────────────────────────────────────────────

/**
 * Standard .cs-sr-only CSS rule (visually hidden but accessible).
 * @returns {string}
 */
export function srOnlyCSS() {
  return (
    `.cs-sr-only {\n` +
    `  position: absolute;\n` +
    `  width: 1px;\n` +
    `  height: 1px;\n` +
    `  padding: 0;\n` +
    `  margin: -1px;\n` +
    `  overflow: hidden;\n` +
    `  clip: rect(0,0,0,0);\n` +
    `  white-space: nowrap;\n` +
    `  border: 0;\n` +
    `}\n`
  );
}

// ── Internal ──────────────────────────────────────────────────────────────────

function _esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
