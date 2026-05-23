/**
 * components.js — P34-02: Reusable HTML component library
 *
 * All functions return HTML strings (no DOM required), suitable for:
 *  - Server-side rendering
 *  - Node.js test environments
 *  - innerHTML injection in browsers
 *
 * Naming convention: every function returns a string of valid HTML.
 */

// ── Escape ────────────────────────────────────────────────────────────────────

/**
 * HTML-escape a string to prevent XSS injection.
 * @param {*} s
 * @returns {string}
 */
export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Badge ─────────────────────────────────────────────────────────────────────

/**
 * Semantic status badge.
 *
 * @param {'ok'|'warn'|'error'|'info'|'neutral'} variant
 * @param {string}  label      Text inside badge.
 * @param {object}  [opts]
 * @param {string}  [opts.id]
 * @param {string}  [opts.title]  Tooltip text.
 * @returns {string}
 */
export function badge(variant, label, opts = {}) {
  const cls = {
    ok:      'cs-badge cs-badge--ok',
    warn:    'cs-badge cs-badge--warn',
    error:   'cs-badge cs-badge--error',
    info:    'cs-badge cs-badge--info',
    neutral: 'cs-badge cs-badge--neutral',
  }[variant] ?? 'cs-badge cs-badge--neutral';

  const attrs = [
    `class="${esc(cls)}"`,
    `role="status"`,
    opts.id    ? `id="${esc(opts.id)}"` : '',
    opts.title ? `title="${esc(opts.title)}"` : '',
  ].filter(Boolean).join(' ');

  return `<span ${attrs}>${esc(label)}</span>`;
}

// ── Button ────────────────────────────────────────────────────────────────────

/**
 * Accessible button element.
 *
 * @param {string}  label
 * @param {object}  [opts]
 * @param {string}  [opts.id]
 * @param {string}  [opts.onClick]   Inline onclick attribute (use sparingly).
 * @param {'primary'|'secondary'|'danger'|'ghost'} [opts.variant='primary']
 * @param {boolean} [opts.disabled=false]
 * @param {string}  [opts.ariaLabel]
 * @param {string}  [opts.type='button']
 * @param {string}  [opts.icon]  Optional leading icon character/emoji.
 * @returns {string}
 */
export function button(label, opts = {}) {
  const variant = opts.variant ?? 'primary';
  const cls = `cs-btn cs-btn--${esc(variant)}${opts.disabled ? ' cs-btn--disabled' : ''}`;
  const attrs = [
    `class="${cls}"`,
    `type="${esc(opts.type ?? 'button')}"`,
    opts.id       ? `id="${esc(opts.id)}"` : '',
    opts.disabled ? 'disabled aria-disabled="true"' : '',
    opts.onClick  ? `onclick="${esc(opts.onClick)}"` : '',
    opts.ariaLabel ? `aria-label="${esc(opts.ariaLabel)}"` : '',
  ].filter(Boolean).join(' ');

  const inner = opts.icon ? `<span aria-hidden="true">${esc(opts.icon)}</span> ${esc(label)}` : esc(label);
  return `<button ${attrs}>${inner}</button>`;
}

// ── Table ─────────────────────────────────────────────────────────────────────

/**
 * Accessible data table with optional caption.
 *
 * @param {string[]}           headers  Column header labels.
 * @param {(string|number)[][]} rows    2-D array of cell values.
 * @param {object}  [opts]
 * @param {string}  [opts.caption]      Optional <caption> text.
 * @param {string}  [opts.id]
 * @param {boolean} [opts.striped=true]
 * @param {boolean} [opts.compact=false]
 * @param {string[]} [opts.alignments]  'left'|'right'|'center' per column.
 * @returns {string}
 */
export function table(headers, rows, opts = {}) {
  const cls = [
    'cs-table',
    opts.striped !== false ? 'cs-table--striped' : '',
    opts.compact ? 'cs-table--compact' : '',
  ].filter(Boolean).join(' ');

  const aligns = opts.alignments ?? [];
  const thStyle = (i) => aligns[i] ? ` style="text-align:${esc(aligns[i])}"` : '';

  const caption = opts.caption ? `<caption>${esc(opts.caption)}</caption>\n` : '';
  const thead = `<thead><tr>${headers.map((h, i) =>
    `<th scope="col"${thStyle(i)}>${esc(String(h))}</th>`
  ).join('')}</tr></thead>`;

  const tbody = `<tbody>${rows.map((row) =>
    `<tr>${row.map((cell, i) =>
      `<td${thStyle(i)}>${esc(String(cell ?? ''))}</td>`
    ).join('')}</tr>`
  ).join('\n')}</tbody>`;

  const idAttr = opts.id ? ` id="${esc(opts.id)}"` : '';
  return `<table class="${cls}"${idAttr} role="table">\n${caption}${thead}\n${tbody}\n</table>`;
}

// ── Alert / Callout ───────────────────────────────────────────────────────────

/**
 * Alert / callout panel.
 *
 * @param {'info'|'success'|'warn'|'error'} variant
 * @param {string}  message
 * @param {object}  [opts]
 * @param {string}  [opts.title]
 * @param {boolean} [opts.dismissible=false]
 * @param {string}  [opts.id]
 * @returns {string}
 */
export function alert(variant, message, opts = {}) {
  const icons = { info:'ℹ', success:'✓', warn:'⚠', error:'✗' };
  const roles = { info:'status', success:'status', warn:'alert', error:'alert' };
  const icon  = icons[variant] ?? 'ℹ';
  const role  = roles[variant] ?? 'status';
  const title = opts.title ? `<strong>${esc(opts.title)}</strong> ` : '';
  const dismiss = opts.dismissible
    ? `<button class="cs-alert__dismiss" aria-label="Dismiss" onclick="this.parentElement.remove()">×</button>`
    : '';

  const idAttr = opts.id ? ` id="${esc(opts.id)}"` : '';
  return (
    `<div class="cs-alert cs-alert--${esc(variant)}" role="${role}"${idAttr} aria-live="polite">\n` +
    `  <span class="cs-alert__icon" aria-hidden="true">${icon}</span>\n` +
    `  <span class="cs-alert__body">${title}${esc(message)}</span>\n` +
    (dismiss ? `  ${dismiss}\n` : '') +
    `</div>`
  );
}

// ── Panel / Card ──────────────────────────────────────────────────────────────

/**
 * Collapsible panel / card.
 *
 * @param {string}  heading
 * @param {string}  contentHtml  Inner HTML (not escaped — caller's responsibility).
 * @param {object}  [opts]
 * @param {string}  [opts.id]
 * @param {boolean} [opts.collapsible=false]
 * @param {boolean} [opts.open=true]     Initial open state (if collapsible).
 * @param {string}  [opts.headerTag='h3']
 * @returns {string}
 */
export function panel(heading, contentHtml, opts = {}) {
  const id       = opts.id ?? `panel-${Math.random().toString(36).slice(2, 8)}`;
  const hTag     = opts.headerTag ?? 'h3';
  const bodyId   = `${id}-body`;
  const isOpen   = opts.open !== false;

  if (opts.collapsible) {
    const expanded = isOpen ? 'true' : 'false';
    const hidden   = isOpen ? '' : ' hidden';
    return (
      `<div class="cs-panel cs-panel--collapsible" id="${esc(id)}">\n` +
      `  <${hTag} class="cs-panel__header">\n` +
      `    <button class="cs-panel__toggle" aria-expanded="${expanded}" aria-controls="${esc(bodyId)}">\n` +
      `      ${esc(heading)}\n` +
      `      <span class="cs-panel__chevron" aria-hidden="true">▾</span>\n` +
      `    </button>\n` +
      `  </${hTag}>\n` +
      `  <div class="cs-panel__body" id="${esc(bodyId)}"${hidden}>\n` +
      `    ${contentHtml}\n` +
      `  </div>\n` +
      `</div>`
    );
  }

  return (
    `<div class="cs-panel" id="${esc(id)}">\n` +
    `  <${hTag} class="cs-panel__header">${esc(heading)}</${hTag}>\n` +
    `  <div class="cs-panel__body" id="${esc(bodyId)}">\n` +
    `    ${contentHtml}\n` +
    `  </div>\n` +
    `</div>`
  );
}

// ── Progress / Loader ─────────────────────────────────────────────────────────

/**
 * Progress bar (0–100).
 * @param {number}  value  0–100.
 * @param {object}  [opts]
 * @param {string}  [opts.label]
 * @param {string}  [opts.id]
 * @returns {string}
 */
export function progressBar(value, opts = {}) {
  const pct    = Math.max(0, Math.min(100, Number(value) || 0));
  const label  = opts.label ?? `${pct.toFixed(0)}%`;
  const idAttr = opts.id ? ` id="${esc(opts.id)}"` : '';
  return (
    `<div class="cs-progress"${idAttr} role="progressbar" ` +
    `aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="${esc(label)}">\n` +
    `  <div class="cs-progress__bar" style="width:${pct}%"></div>\n` +
    `  <span class="cs-progress__label">${esc(label)}</span>\n` +
    `</div>`
  );
}

/**
 * Spinning loader (aria-busy wrapper).
 * @param {string}  [label='Loading…']
 * @returns {string}
 */
export function spinner(label = 'Loading…') {
  return (
    `<div class="cs-spinner" role="status" aria-live="polite" aria-busy="true">\n` +
    `  <span class="cs-spinner__ring" aria-hidden="true"></span>\n` +
    `  <span class="cs-spinner__label">${esc(label)}</span>\n` +
    `</div>`
  );
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

/**
 * Accessible tab strip (ARIA tabs pattern).
 *
 * @param {{ id:string, label:string, contentHtml:string, active?:boolean }[]} tabs
 * @param {object}  [opts]
 * @param {string}  [opts.id]
 * @returns {string}
 */
export function tabs(tabList, opts = {}) {
  const baseId   = opts.id ?? `tabs-${Math.random().toString(36).slice(2, 7)}`;
  const activeIdx = tabList.findIndex((t) => t.active) === -1 ? 0
    : tabList.findIndex((t) => t.active);

  const tabButtons = tabList.map((t, i) =>
    `<button class="cs-tab${i === activeIdx ? ' cs-tab--active' : ''}" ` +
    `role="tab" id="${esc(baseId + '-tab-' + t.id)}" ` +
    `aria-controls="${esc(baseId + '-panel-' + t.id)}" ` +
    `aria-selected="${i === activeIdx ? 'true' : 'false'}" ` +
    `tabindex="${i === activeIdx ? '0' : '-1'}">${esc(t.label)}</button>`
  ).join('\n    ');

  const panels = tabList.map((t, i) =>
    `<div class="cs-tab-panel${i !== activeIdx ? ' cs-tab-panel--hidden' : ''}" ` +
    `role="tabpanel" id="${esc(baseId + '-panel-' + t.id)}" ` +
    `aria-labelledby="${esc(baseId + '-tab-' + t.id)}" ` +
    `${i !== activeIdx ? 'hidden' : ''}>\n` +
    `  ${t.contentHtml}\n` +
    `</div>`
  ).join('\n');

  return (
    `<div class="cs-tabs" id="${esc(baseId)}">\n` +
    `  <div class="cs-tab-list" role="tablist" aria-label="${esc(opts.ariaLabel ?? 'Tabs')}">\n` +
    `    ${tabButtons}\n` +
    `  </div>\n` +
    `${panels}\n` +
    `</div>`
  );
}

// ── Key-value list ────────────────────────────────────────────────────────────

/**
 * Definition-list style key-value display.
 * @param {{ label:string, value:string|number }[]} items
 * @param {object} [opts]
 * @param {string} [opts.id]
 * @returns {string}
 */
export function kvList(items, opts = {}) {
  const idAttr = opts.id ? ` id="${esc(opts.id)}"` : '';
  const entries = items.map(({ label, value }) =>
    `  <div class="cs-kv">\n` +
    `    <dt class="cs-kv__label">${esc(label)}</dt>\n` +
    `    <dd class="cs-kv__value">${esc(String(value ?? '—'))}</dd>\n` +
    `  </div>`
  ).join('\n');
  return `<dl class="cs-kv-list"${idAttr}>\n${entries}\n</dl>`;
}

// ── Slider (A3-1) ─────────────────────────────────────────────────────────────

/**
 * Accessible range slider with linear/logarithmic scale.
 *
 * The `<output>` element mirrors the current value; for log scale the raw
 * slider position is the exponent (e.g. value = log10(param)).
 *
 * @param {string} id          Unique element id for the <input>.
 * @param {object} [opts]
 * @param {string} [opts.label='']          Human-readable label.
 * @param {number} [opts.min=0]             Slider minimum (raw position for log).
 * @param {number} [opts.max=1]             Slider maximum.
 * @param {number} [opts.step=0.01]         Step size.
 * @param {number} [opts.value=0]           Initial raw value.
 * @param {string} [opts.unit='']           Unit string appended to display value.
 * @param {'linear'|'log'} [opts.scale='linear']
 * @param {string} [opts.ariaLabel]         Falls back to opts.label.
 * @param {string} [opts.onInput='']        Inline oninput handler string.
 * @returns {string}
 */
export function slider(id, opts = {}) {
  const {
    label = '',
    min = 0,
    max = 1,
    step = 0.01,
    value = 0,
    unit = '',
    scale = 'linear',
    ariaLabel = label,
    onInput = '',
  } = opts;

  const displayVal =
    scale === 'log'
      ? Math.pow(10, Number(value)).toFixed(3)
      : Number(value).toFixed(Number(step) < 0.01 ? 4 : 2);

  const inputAttrs = [
    `type="range"`,
    `class="cs-slider__input"`,
    `id="${esc(id)}"`,
    `min="${esc(String(min))}"`,
    `max="${esc(String(max))}"`,
    `step="${esc(String(step))}"`,
    `value="${esc(String(value))}"`,
    `aria-label="${esc(ariaLabel || label)}"`,
    `aria-valuemin="${esc(String(min))}"`,
    `aria-valuemax="${esc(String(max))}"`,
    `aria-valuenow="${esc(String(value))}"`,
    onInput ? `oninput="${esc(onInput)}"` : '',
  ].filter(Boolean).join(' ');

  return (
    `<div class="cs-slider" data-scale="${esc(scale)}" data-unit="${esc(unit)}">\n` +
    `  <div class="cs-slider__header">\n` +
    `    <label class="cs-slider__label" for="${esc(id)}">${esc(label)}</label>\n` +
    `    <output class="cs-slider__value" for="${esc(id)}" id="${esc(id)}-val">${esc(displayVal)}${esc(unit)}</output>\n` +
    `  </div>\n` +
    `  <input ${inputAttrs}>\n` +
    `</div>`
  );
}

// ── ConfirmDialog (G12) ───────────────────────────────────────────────────────

/**
 * Accessible confirmation modal overlay (returns static HTML).
 *
 * Wire up behaviour using the `csConfirm()` helper in app.js, which shows
 * this overlay and returns a `Promise<boolean>`.
 *
 * @param {string} [id='confirm-modal']
 * @param {object} [opts]
 * @param {string} [opts.title='確認動作']
 * @param {string} [opts.message='確定要執行這個動作嗎？']
 * @param {string} [opts.okText='確認']
 * @param {string} [opts.cancelText='取消']
 * @returns {string}
 */
export function confirmDialog(id = 'confirm-modal', opts = {}) {
  const {
    title      = '確認動作',
    message    = '確定要執行這個動作嗎？',
    okText     = '確認',
    cancelText = '取消',
  } = opts;

  return (
    `<div class="modal-overlay" id="${esc(id)}" role="dialog" aria-modal="true" ` +
    `aria-labelledby="${esc(id)}-title" aria-hidden="true">\n` +
    `  <div class="modal" style="max-width:420px;">\n` +
    `    <div class="modal-header">\n` +
    `      <div class="modal-title" id="${esc(id)}-title">${esc(title)}</div>\n` +
    `    </div>\n` +
    `    <div class="modal-body">\n` +
    `      <p id="${esc(id)}-message" style="margin-bottom:0;">${esc(message)}</p>\n` +
    `    </div>\n` +
    `    <div class="modal-footer">\n` +
    `      <button class="btn btn-sm" id="${esc(id)}-cancel" type="button">${esc(cancelText)}</button>\n` +
    `      <button class="btn btn-sm btn-primary" id="${esc(id)}-ok" type="button">${esc(okText)}</button>\n` +
    `    </div>\n` +
    `  </div>\n` +
    `</div>`
  );
}

// ── Skeleton (G11) ────────────────────────────────────────────────────────────

/**
 * Skeleton loading placeholder — animated pulse block.
 *
 * @param {'line'|'block'|'circle'} [type='line']
 * @param {object} [opts]
 * @param {string} [opts.width='100%']
 * @param {string} [opts.height='14px']
 * @param {string} [opts.radius]     Defaults to '4px' for line/block, '50%' for circle.
 * @param {string} [opts.id]
 * @returns {string}
 */
export function skeleton(type = 'line', opts = {}) {
  const {
    width  = '100%',
    height = type === 'circle' ? '40px' : '14px',
    radius = type === 'circle' ? '50%'  : '4px',
    id     = '',
  } = opts;

  const style = [
    `width:${esc(String(width))}`,
    `height:${esc(String(height))}`,
    `border-radius:${esc(radius)}`,
  ].join(';');

  const idAttr = id ? ` id="${esc(id)}"` : '';
  return `<div class="cs-skeleton"${idAttr} style="${style}" aria-hidden="true" role="presentation"></div>`;
}

/**
 * Multi-line skeleton block (convenience wrapper).
 *
 * @param {number} [lines=3]
 * @param {object} [opts]
 * @returns {string}
 */
export function skeletonBlock(lines = 3, opts = {}) {
  const rows = Array.from({ length: lines }, (_, i) =>
    skeleton('line', { ...opts, width: i === lines - 1 ? '70%' : '100%' })
  );
  return `<div class="cs-skeleton-block" style="display:grid;gap:8px;">${rows.join('\n')}</div>`;
}

// ── CodeBlock (D1) ────────────────────────────────────────────────────────────

/**
 * Syntax-highlighted code block with copy button.
 *
 * @param {string} code         Pre-formatted code string.
 * @param {object} [opts]
 * @param {'matlab'|'python'|'text'} [opts.lang='text']
 * @param {string} [opts.id]
 * @param {boolean} [opts.copyable=true]
 * @returns {string}
 */
export function codeBlock(code, opts = {}) {
  const { lang = 'text', id = '', copyable = true } = opts;
  const idAttr = id ? ` id="${esc(id)}"` : '';
  const langLabel = { matlab: 'MATLAB', python: 'Python', text: 'Code' }[lang] ?? 'Code';

  const copyBtn = copyable
    ? `<button class="cs-codeblock__copy" type="button" aria-label="Copy code to clipboard" ` +
      `onclick="navigator.clipboard.writeText(this.closest('.cs-codeblock').querySelector('code').textContent).then(()=>{this.textContent='✓ Copied';setTimeout(()=>this.textContent='Copy',1800)})">Copy</button>`
    : '';

  return (
    `<div class="cs-codeblock cs-codeblock--${esc(lang)}"${idAttr}>\n` +
    `  <div class="cs-codeblock__header">\n` +
    `    <span class="cs-codeblock__lang">${esc(langLabel)}</span>\n` +
    `    ${copyBtn}\n` +
    `  </div>\n` +
    `  <pre class="cs-codeblock__pre"><code class="cs-codeblock__code">${esc(code)}</code></pre>\n` +
    `</div>`
  );
}
