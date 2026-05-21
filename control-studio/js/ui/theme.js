/**
 * theme.js — P34-01/P34-03: Theme management & responsive breakpoints
 *
 * Exports:
 *  - THEMES          — token definitions for light/dark
 *  - buildCSSVars    — generates :root {...} CSS custom-property block
 *  - mediaQuery      — responsive breakpoint helpers
 *  - detectTheme     — infer preferred theme from environment
 *  - applyTheme      — (browser-only) apply theme class to <html>
 */

// ── Design tokens ─────────────────────────────────────────────────────────────

export const THEMES = {
  dark: {
    '--cs-bg':          '#0d1117',
    '--cs-bg-surface':  '#161b22',
    '--cs-bg-elevated': '#21262d',
    '--cs-fg':          '#e6edf3',
    '--cs-fg-muted':    '#8b949e',
    '--cs-border':      '#30363d',
    '--cs-accent':      '#3fb950',       // green
    '--cs-accent-alt':  '#58a6ff',       // blue
    '--cs-warn':        '#e3b341',
    '--cs-error':       '#f85149',
    '--cs-success':     '#3fb950',
    '--cs-shadow':      '0 4px 16px rgba(0,0,0,.6)',
    '--cs-radius':      '6px',
    '--cs-radius-lg':   '12px',
    '--cs-font-mono':   "ui-monospace,'Cascadia Code','Fira Code',monospace",
    '--cs-font-sans':   "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif",
    '--cs-font-size':   '14px',
    '--cs-line-height': '1.6',
    '--cs-transition':  '0.18s ease',
  },
  light: {
    '--cs-bg':          '#ffffff',
    '--cs-bg-surface':  '#f6f8fa',
    '--cs-bg-elevated': '#ffffff',
    '--cs-fg':          '#1f2328',
    '--cs-fg-muted':    '#636c76',
    '--cs-border':      '#d0d7de',
    '--cs-accent':      '#1a7f37',
    '--cs-accent-alt':  '#0550ae',
    '--cs-warn':        '#9a6700',
    '--cs-error':       '#d1242f',
    '--cs-success':     '#1a7f37',
    '--cs-shadow':      '0 2px 8px rgba(0,0,0,.12)',
    '--cs-radius':      '6px',
    '--cs-radius-lg':   '12px',
    '--cs-font-mono':   "ui-monospace,'Cascadia Code','Fira Code',monospace",
    '--cs-font-sans':   "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif",
    '--cs-font-size':   '14px',
    '--cs-line-height': '1.6',
    '--cs-transition':  '0.18s ease',
  },
};

// ── CSS variable generator ────────────────────────────────────────────────────

/**
 * Build a CSS string with :root custom properties for the given theme.
 *
 * @param {'dark'|'light'} themeName
 * @param {object} [overrides]  Additional token overrides.
 * @returns {string}  CSS text (can be injected into a <style> element).
 */
export function buildCSSVars(themeName = 'dark', overrides = {}) {
  const tokens = { ...(THEMES[themeName] ?? THEMES.dark), ...overrides };
  const vars   = Object.entries(tokens)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');
  return `:root {\n${vars}\n}`;
}

/**
 * Build a full CSS variable block that includes both themes via prefers-color-scheme.
 *
 * @param {object} [overrides] Extra tokens applied to both themes.
 * @returns {string}  CSS text.
 */
export function buildAdaptiveCSS(overrides = {}) {
  const darkVars  = buildCSSVars('dark', overrides);
  const lightVars = buildCSSVars('light', overrides);
  return (
    `/* === ControlStudio Theme === */\n` +
    `${darkVars}\n\n` +
    `@media (prefers-color-scheme: light) {\n` +
    `${lightVars.replace(/:root/, '  :root')}\n` +
    `}\n\n` +
    `[data-theme="dark"]  { ${_inlineVars('dark', overrides)} }\n` +
    `[data-theme="light"] { ${_inlineVars('light', overrides)} }\n`
  );
}

function _inlineVars(name, overrides) {
  const tokens = { ...(THEMES[name] ?? THEMES.dark), ...overrides };
  return Object.entries(tokens).map(([k, v]) => `${k}:${v}`).join(';');
}

// ── Responsive breakpoints ────────────────────────────────────────────────────

/**
 * Breakpoint definitions (mobile-first, pixel widths).
 */
export const BREAKPOINTS = {
  xs:  0,
  sm:  480,
  md:  768,
  lg:  1024,
  xl:  1280,
  xxl: 1536,
};

/**
 * Build a CSS `@media` query string for a given breakpoint.
 *
 * @param {'xs'|'sm'|'md'|'lg'|'xl'|'xxl'} bp  Minimum breakpoint.
 * @param {'up'|'down'|'only'}              dir  Direction.
 * @returns {string}  e.g. "@media (min-width: 768px)"
 */
export function mediaQuery(bp, dir = 'up') {
  const sizes = Object.entries(BREAKPOINTS).sort((a, b) => a[1] - b[1]);
  const idx   = sizes.findIndex(([k]) => k === bp);
  if (idx === -1) throw new Error(`Unknown breakpoint "${bp}"`);

  const min = sizes[idx][1];
  const max = idx < sizes.length - 1 ? sizes[idx + 1][1] - 1 : null;

  if (dir === 'up')   return min === 0 ? '@media all' : `@media (min-width: ${min}px)`;
  if (dir === 'down') return max ? `@media (max-width: ${max}px)` : '@media all';
  if (dir === 'only') {
    if (min === 0 && max !== null) return `@media (max-width: ${max}px)`;
    if (max === null)              return `@media (min-width: ${min}px)`;
    return `@media (min-width: ${min}px) and (max-width: ${max}px)`;
  }
  throw new Error(`Unknown direction "${dir}". Use 'up', 'down', or 'only'.`);
}

/**
 * Build a complete responsive layout CSS block for a grid container.
 *
 * @param {string}  selector   CSS selector (e.g. '.cs-layout')
 * @param {object}  colsByBp   Columns per breakpoint { sm:1, md:2, lg:3 }
 * @param {string}  [gap='1rem']
 * @returns {string}  CSS text.
 */
export function responsiveGrid(selector, colsByBp, gap = '1rem') {
  const lines = [`${selector} { display: grid; gap: ${gap}; }`];
  for (const [bp, cols] of Object.entries(colsByBp)) {
    const mq = mediaQuery(bp, 'up');
    lines.push(`${mq} { ${selector} { grid-template-columns: repeat(${cols}, 1fr); } }`);
  }
  return lines.join('\n');
}

// ── Theme detection & application ─────────────────────────────────────────────

/**
 * Detect preferred theme.
 * In Node.js, always returns 'dark'.
 * In browser, reads data-theme attribute or prefers-color-scheme.
 *
 * @returns {'dark'|'light'}
 */
export function detectTheme() {
  if (typeof document === 'undefined') return 'dark';
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr === 'light' || attr === 'dark') return attr;
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  return 'dark';
}

/**
 * Apply a theme by setting [data-theme] on the <html> element.
 * (Browser-only; no-op in Node.)
 *
 * @param {'dark'|'light'} name
 */
export function applyTheme(name) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', name === 'light' ? 'light' : 'dark');
}

/**
 * Toggle between light and dark themes.
 * @returns {'dark'|'light'}  The newly applied theme.
 */
export function toggleTheme() {
  const current = detectTheme();
  const next    = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  return next;
}
