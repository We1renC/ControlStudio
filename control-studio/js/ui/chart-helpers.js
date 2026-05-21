/**
 * chart-helpers.js — P34-06: Chart interaction & data export utilities
 *
 * Pure-JS helpers (no DOM required) for:
 *   - Zoom state management
 *   - Data windowing / downsampling for large datasets
 *   - SVG chart skeleton generation
 *   - CSV / JSON data export formatting
 *   - Axis label formatting
 */

// ── Zoom state ────────────────────────────────────────────────────────────────

/**
 * Create a zoom-state manager for a 2-D chart.
 *
 * @param {object}  [initialView]
 * @param {number}  [initialView.xMin]
 * @param {number}  [initialView.xMax]
 * @param {number}  [initialView.yMin]
 * @param {number}  [initialView.yMax]
 * @returns {{
 *   view: { xMin,xMax,yMin,yMax },
 *   zoom: (factor, cx, cy) => void,
 *   pan:  (dx, dy) => void,
 *   reset: () => void,
 *   setView: (v) => void,
 *   getView: () => { xMin,xMax,yMin,yMax },
 * }}
 */
export function createZoomState(initialView = {}) {
  let view = _defaultView(initialView);
  let home = { ...view };

  function zoom(factor, cx = null, cy = null) {
    const { xMin, xMax, yMin, yMax } = view;
    const xMid = cx ?? (xMin + xMax) / 2;
    const yMid = cy ?? (yMin + yMax) / 2;
    const xHalf = (xMax - xMin) / 2 / factor;
    const yHalf = (yMax - yMin) / 2 / factor;
    view = {
      xMin: xMid - xHalf,
      xMax: xMid + xHalf,
      yMin: yMid - yHalf,
      yMax: yMid + yHalf,
    };
  }

  function pan(dx, dy) {
    view = {
      xMin: view.xMin + dx,
      xMax: view.xMax + dx,
      yMin: view.yMin + dy,
      yMax: view.yMax + dy,
    };
  }

  function reset() {
    view = { ...home };
  }

  function setView(v) {
    view = { ...view, ...v };
    home = { ...view };
  }

  function getView() {
    return { ...view };
  }

  return { get view() { return { ...view }; }, zoom, pan, reset, setView, getView };
}

function _defaultView(v) {
  return {
    xMin: v.xMin ?? 0,
    xMax: v.xMax ?? 1,
    yMin: v.yMin ?? -1,
    yMax: v.yMax ?? 1,
  };
}

// ── Data windowing & downsampling ─────────────────────────────────────────────

/**
 * Extract data points within a [xMin, xMax] window.
 *
 * @param {number[]}  x
 * @param {number[]}  y
 * @param {number}    xMin
 * @param {number}    xMax
 * @returns {{ x:number[], y:number[] }}
 */
export function windowData(x, y, xMin, xMax) {
  const ox = [], oy = [];
  for (let i = 0; i < x.length; i++) {
    if (x[i] >= xMin && x[i] <= xMax) {
      ox.push(x[i]);
      oy.push(y[i]);
    }
  }
  return { x: ox, y: oy };
}

/**
 * Largest-triangle-three-buckets (LTTB) downsampling.
 * Preserves visual shape while reducing point count.
 *
 * @param {number[]}  x
 * @param {number[]}  y
 * @param {number}    threshold  Target number of points.
 * @returns {{ x:number[], y:number[] }}
 */
export function downsampleLTTB(x, y, threshold) {
  const n = x.length;
  if (threshold >= n || n <= 2) return { x: [...x], y: [...y] };

  const ox = [x[0]], oy = [y[0]];
  const every = (n - 2) / (threshold - 2);

  let a = 0;
  for (let i = 0; i < threshold - 2; i++) {
    // Next bucket: average
    const avgRangeStart = Math.floor((i + 1) * every) + 1;
    const avgRangeEnd   = Math.min(Math.floor((i + 2) * every) + 1, n);
    let ax = 0, ay = 0, count = 0;
    for (let j = avgRangeStart; j < avgRangeEnd; j++) {
      ax += x[j]; ay += y[j]; count++;
    }
    ax /= count; ay /= count;

    // Current bucket
    const rangeStart = Math.floor(i * every) + 1;
    const rangeEnd   = Math.floor((i + 1) * every) + 1;

    let maxArea = -1, maxIdx = rangeStart;
    for (let j = rangeStart; j < rangeEnd; j++) {
      const area = Math.abs((x[a] - ax) * (y[j] - y[a]) - (x[a] - x[j]) * (ay - y[a]));
      if (area > maxArea) { maxArea = area; maxIdx = j; }
    }

    ox.push(x[maxIdx]); oy.push(y[maxIdx]);
    a = maxIdx;
  }
  ox.push(x[n - 1]); oy.push(y[n - 1]);
  return { x: ox, y: oy };
}

// ── SVG chart skeleton ────────────────────────────────────────────────────────

/**
 * Generate a minimal SVG line chart skeleton.
 * Data series are rendered as <polyline> elements.
 *
 * @param {object}  opts
 * @param {number}  [opts.width=600]
 * @param {number}  [opts.height=300]
 * @param {{ x:number[], y:number[], color?:string, label?:string }[]} opts.series
 * @param {object}  [opts.view]  { xMin, xMax, yMin, yMax }
 * @param {string}  [opts.title]
 * @param {string}  [opts.xLabel]
 * @param {string}  [opts.yLabel]
 * @param {string}  [opts.id]
 * @returns {string}  SVG string.
 */
export function buildSVGChart(opts = {}) {
  const W     = opts.width  ?? 600;
  const H     = opts.height ?? 300;
  const PAD   = { top: 30, right: 20, bottom: 45, left: 55 };
  const CW    = W - PAD.left - PAD.right;
  const CH    = H - PAD.top  - PAD.bottom;
  const id    = opts.id ?? `svg-chart-${Math.random().toString(36).slice(2, 7)}`;
  const title = opts.title  ?? '';
  const xLbl  = opts.xLabel ?? '';
  const yLbl  = opts.yLabel ?? '';

  const series = opts.series ?? [];

  // Auto view from data
  let { xMin, xMax, yMin, yMax } = opts.view ?? {};
  if (series.length > 0) {
    const allX = series.flatMap((s) => s.x);
    const allY = series.flatMap((s) => s.y);
    xMin = xMin ?? Math.min(...allX);
    xMax = xMax ?? Math.max(...allX);
    yMin = yMin ?? Math.min(...allY);
    yMax = yMax ?? Math.max(...allY);
  }
  xMin = xMin ?? 0; xMax = xMax ?? 1;
  yMin = yMin ?? -1; yMax = yMax ?? 1;

  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;

  // Coordinate transforms
  const toSx = (x) => ((x - xMin) / xRange) * CW;
  const toSy = (y) => CH - ((y - yMin) / yRange) * CH;

  // Grid lines
  const N_GRID = 5;
  let gridLines = '';
  for (let i = 0; i <= N_GRID; i++) {
    const xv = xMin + (i / N_GRID) * xRange;
    const yv = yMin + (i / N_GRID) * yRange;
    const sx  = toSx(xv);
    const sy  = toSy(yv);
    gridLines += `<line x1="${_f(sx)}" y1="0" x2="${_f(sx)}" y2="${_f(CH)}" class="cs-chart-grid"/>\n`;
    gridLines += `<line x1="0" y1="${_f(sy)}" x2="${_f(CW)}" y2="${_f(sy)}" class="cs-chart-grid"/>\n`;
    gridLines += `<text x="${_f(sx)}" y="${_f(CH + 15)}" class="cs-chart-tick cs-chart-tick--x">${_fmtAxis(xv)}</text>\n`;
    gridLines += `<text x="-${_f(sy)}" y="-10" class="cs-chart-tick cs-chart-tick--y" transform="rotate(-90)">${_fmtAxis(yv)}</text>\n`;
  }

  // Series polylines
  const COLORS = ['#3fb950','#58a6ff','#e3b341','#f85149','#d2a8ff','#79c0ff'];
  let polylines = '';
  for (let si = 0; si < series.length; si++) {
    const s     = series[si];
    const color = s.color ?? COLORS[si % COLORS.length];
    const pts   = s.x.map((xi, i) => `${_f(toSx(xi))},${_f(toSy(s.y[i]))}`).join(' ');
    polylines += `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" `;
    if (s.label) polylines += `aria-label="${_esc(s.label)}" `;
    polylines += `class="cs-chart-line"/>\n`;
  }

  // Legend
  let legend = '';
  if (series.some((s) => s.label)) {
    legend += `<g class="cs-chart-legend" transform="translate(${CW - 120},10)">\n`;
    series.forEach((s, i) => {
      if (!s.label) return;
      const color = s.color ?? COLORS[i % COLORS.length];
      legend += `  <rect x="0" y="${i * 18}" width="12" height="3" fill="${color}"/>\n`;
      legend += `  <text x="16" y="${i * 18 + 4}" class="cs-chart-legend-label">${_esc(s.label)}</text>\n`;
    });
    legend += `</g>\n`;
  }

  const svg = (
    `<svg id="${id}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" ` +
    `role="img" aria-label="${_esc(title || 'Chart')}" ` +
    `xmlns="http://www.w3.org/2000/svg" class="cs-chart">\n` +
    (title ? `  <title>${_esc(title)}</title>\n` : '') +
    `  <style>\n` +
    `    .cs-chart-grid { stroke: #30363d; stroke-width: 0.5; }\n` +
    `    .cs-chart-tick { font-size: 10px; fill: #8b949e; }\n` +
    `    .cs-chart-tick--x { text-anchor: middle; }\n` +
    `    .cs-chart-tick--y { text-anchor: middle; }\n` +
    `    .cs-chart-legend-label { font-size: 11px; fill: #e6edf3; dominant-baseline: middle; }\n` +
    `  </style>\n` +
    // Main area
    `  <g transform="translate(${PAD.left},${PAD.top})">\n` +
    `    ${gridLines}` +
    `    ${polylines}` +
    `    <rect width="${CW}" height="${CH}" fill="none" stroke="#30363d"/>\n` +
    `    ${legend}` +
    `  </g>\n` +
    // Axis labels
    (xLbl ? `  <text x="${PAD.left + CW / 2}" y="${H - 5}" text-anchor="middle" class="cs-chart-tick">${_esc(xLbl)}</text>\n` : '') +
    (yLbl ? `  <text x="14" y="${PAD.top + CH / 2}" text-anchor="middle" transform="rotate(-90,14,${PAD.top + CH / 2})" class="cs-chart-tick">${_esc(yLbl)}</text>\n` : '') +
    `</svg>`
  );

  return svg;
}

// ── Export formatters ─────────────────────────────────────────────────────────

/**
 * Format chart series data as a CSV string.
 *
 * @param {{ x:number[], y:number[], label?:string }[]}  series
 * @param {object}  [opts]
 * @param {string}  [opts.xHeader='x']
 * @param {string}  [opts.delimiter=',']
 * @returns {string}  CSV text.
 */
export function toCSV(series, opts = {}) {
  const delim    = opts.delimiter ?? ',';
  const xHeader  = opts.xHeader ?? 'x';
  const yHeaders = series.map((s, i) => s.label ?? `y${i + 1}`);
  const headers  = [xHeader, ...yHeaders];

  // All series must share the same x-grid; use first series x as base
  const xs = series[0]?.x ?? [];
  const rows = [headers.join(delim)];
  for (let i = 0; i < xs.length; i++) {
    const vals = [_fmtCSV(xs[i]), ...series.map((s) => _fmtCSV(s.y[i] ?? ''))];
    rows.push(vals.join(delim));
  }
  return rows.join('\n');
}

/**
 * Format chart data as a JSON object suitable for external tools.
 *
 * @param {{ x:number[], y:number[], label?:string }[]}  series
 * @param {object}  [meta]  Extra metadata fields.
 * @returns {string}  JSON text.
 */
export function toJSON(series, meta = {}) {
  const data = {
    ...meta,
    generated: new Date().toISOString(),
    series:    series.map((s) => ({
      label: s.label ?? null,
      x:     s.x,
      y:     s.y,
    })),
  };
  return JSON.stringify(data, null, 2);
}

// ── Axis label formatter ──────────────────────────────────────────────────────

/**
 * Format a number for use as an axis tick label.
 * Chooses between fixed/exponential based on magnitude.
 *
 * @param {number}  v
 * @param {number}  [maxDigits=3]
 * @returns {string}
 */
export function formatAxisLabel(v, maxDigits = 3) {
  if (!Number.isFinite(v)) return String(v);
  if (v === 0) return '0';
  const abs = Math.abs(v);
  if (abs >= 1e4 || abs < 1e-3) return v.toExponential(1);
  if (Number.isInteger(v)) return String(v);
  return v.toPrecision(maxDigits).replace(/\.?0+$/, '');
}

// ── Internal ──────────────────────────────────────────────────────────────────

function _f(n)         { return n.toFixed(2); }
function _fmtAxis(v)   { return formatAxisLabel(v, 3); }
function _fmtCSV(v)    { return Number.isFinite(v) ? String(v) : ''; }
function _esc(s)       { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
