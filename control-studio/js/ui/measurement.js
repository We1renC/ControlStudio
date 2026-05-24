/**
 * measurement.js — P63 Chart Measurement Tools
 *
 * L1-1  Delta Measurement Cursor (two-point Δx/Δy)
 * L1-2  Linked Crosshair (hover sync across charts)
 * L1-3  Chart Annotation Pins (double-click to add label)
 *
 * Inject via initMeasurementModule(ctx) before calling initMeasurementTools().
 * ctx: { state, updateGlobalStatusBar, bodeData }
 */

let _ctx = null;

export function initMeasurementModule(ctx) {
  _ctx = ctx;
}

// ── L1-1: Delta Measurement Cursor ───────────────────────────────────────────

const _deltaCursor = { mode: 'idle', pointA: null, pointB: null };

function _setDeltaMode(mode) {
  _deltaCursor.mode = mode;
  const btn = document.getElementById('btn-delta-cursor');
  const cell = document.querySelector('.chart-cell.plot-main');
  if (!btn || !cell) return;
  const active = mode !== 'idle';
  btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  btn.style.opacity = active ? '1' : '';
  btn.style.background = active ? 'rgba(99,102,241,0.25)' : '';
  cell.classList.toggle('delta-mode-active', active);
  const hint = active
    ? (mode === 'point_a' ? '點擊設定量測點 A' : '點擊設定量測點 B')
    : '';
  try { _ctx.updateGlobalStatusBar(hint); } catch {}
}

function _clearDeltaMeasurement() {
  _deltaCursor.mode = 'idle';
  _deltaCursor.pointA = null;
  _deltaCursor.pointB = null;
  _setDeltaMode('idle');
  document.getElementById('delta-panel').style.display = 'none';
  try {
    const el = document.getElementById('chart-active');
    if (el?._fullLayout) {
      const existing = el._fullLayout.shapes || [];
      const existAnnot = el._fullLayout.annotations || [];
      Plotly.relayout(el, {
        shapes: existing.filter(s => !s._delta),
        annotations: existAnnot.filter(a => !a._delta),
      });
    }
  } catch {}
}

export function computeDeltaMeasurement(A, B, plotType) {
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  if (plotType === 'bode') {
    const dLog = Math.log10(Math.abs(B.x)) - Math.log10(Math.abs(A.x));
    const slope = Math.abs(dLog) > 1e-10 ? dy / dLog : 0;
    const approxOrder = Math.round(slope / (-20));
    return {
      label: 'Bode 幅值量測',
      rows: [
        { key: 'Δ頻率', value: `${dLog.toFixed(3)} decade` },
        { key: 'Δ幅值', value: `${dy > 0 ? '+' : ''}${dy.toFixed(2)} dB` },
        { key: '斜率', value: `${slope.toFixed(1)} dB/dec ≈ ${approxOrder} 階` },
      ],
    };
  }
  if (plotType === 'step') {
    const slope = Math.abs(dx) > 1e-10 ? dy / dx : 0;
    return {
      label: 'Step Response 量測',
      rows: [
        { key: 'Δ時間', value: `${Math.abs(dx).toFixed(4)} s` },
        { key: 'Δ幅值', value: `${dy > 0 ? '+' : ''}${dy.toFixed(4)}` },
        { key: '平均斜率', value: `${slope.toFixed(4)} /s` },
      ],
    };
  }
  return {
    label: '量測結果',
    rows: [
      { key: 'Δx', value: `${dx > 0 ? '+' : ''}${dx.toFixed(4)}` },
      { key: 'Δy', value: `${dy > 0 ? '+' : ''}${dy.toFixed(4)}` },
    ],
  };
}

function _renderDeltaPanel(result) {
  const panel = document.getElementById('delta-panel');
  const rows = document.getElementById('delta-panel-rows');
  if (!panel || !rows) return;
  rows.innerHTML = result.rows.map(r =>
    `<div class="dp-row"><span class="dp-key">${r.key}</span><span class="dp-val">${r.value}</span></div>`
  ).join('');
  panel.querySelector('.dp-title span').textContent = `△ ${result.label}`;
  panel.style.display = 'block';
}

function _applyDeltaMarkersToChart(A, B) {
  const el = document.getElementById('chart-active');
  if (!el?._fullLayout) return;
  const existing = (el._fullLayout.shapes || []).filter(s => !s._delta);
  const existAnnot = (el._fullLayout.annotations || []).filter(a => !a._delta);
  const newShapes = [
    { _delta: true, type: 'line', x0: A.x, x1: A.x, y0: A.y * 0.5, y1: A.y * 1.5 + 0.01,
      line: { color: '#3b82f6', width: 1, dash: 'dot' }, xref: 'x', yref: 'y' },
    { _delta: true, type: 'line', x0: B.x, x1: B.x, y0: B.y * 0.5, y1: B.y * 1.5 + 0.01,
      line: { color: '#f97316', width: 1, dash: 'dot' }, xref: 'x', yref: 'y' },
  ];
  const newAnnot = [
    { _delta: true, x: A.x, y: A.y, xref: 'x', yref: 'y',
      text: 'A', showarrow: false, font: { size: 11, color: '#fff' },
      bgcolor: '#3b82f6', borderpad: 3, borderrad: 10 },
    { _delta: true, x: B.x, y: B.y, xref: 'x', yref: 'y',
      text: 'B', showarrow: false, font: { size: 11, color: '#fff' },
      bgcolor: '#f97316', borderpad: 3, borderrad: 10 },
  ];
  Plotly.relayout(el, {
    shapes: [...existing, ...newShapes],
    annotations: [...existAnnot, ...newAnnot],
  });
}

export function initDeltaCursor() {
  const btn = document.getElementById('btn-delta-cursor');
  const closeBtn = document.getElementById('delta-panel-close');
  const clearBtn = document.getElementById('delta-clear-btn');
  const copyBtn = document.getElementById('delta-copy-btn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    if (_deltaCursor.mode !== 'idle') { _clearDeltaMeasurement(); }
    else { _deltaCursor.mode = 'point_a'; _setDeltaMode('point_a'); }
  });
  closeBtn?.addEventListener('click', _clearDeltaMeasurement);
  clearBtn?.addEventListener('click', _clearDeltaMeasurement);
  copyBtn?.addEventListener('click', () => {
    const rows = document.querySelectorAll('#delta-panel-rows .dp-row');
    const text = [...rows].map(r => `${r.querySelector('.dp-key').textContent}: ${r.querySelector('.dp-val').textContent}`).join('\n');
    navigator.clipboard?.writeText(text).catch(() => {});
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'm' || e.key === 'M') {
      if (document.activeElement?.matches('input,textarea,select')) return;
      e.preventDefault();
      if (_deltaCursor.mode !== 'idle') { _clearDeltaMeasurement(); }
      else { _deltaCursor.mode = 'point_a'; _setDeltaMode('point_a'); }
    }
    if (e.key === 'Escape' && _deltaCursor.mode !== 'idle') { _clearDeltaMeasurement(); }
    if (e.key === 'Backspace' && _deltaCursor.mode === 'point_b') {
      _deltaCursor.mode = 'point_a'; _deltaCursor.pointB = null;
      _setDeltaMode('point_a');
    }
  });

  const el = document.getElementById('chart-active');
  if (!el) return;
  el.on('plotly_click', data => {
    if (_deltaCursor.mode === 'idle') return;
    const pt = data.points?.[0];
    if (!pt) return;
    const point = { x: pt.x, y: pt.y };
    if (_deltaCursor.mode === 'point_a') {
      _deltaCursor.pointA = point;
      _deltaCursor.mode = 'point_b';
      _setDeltaMode('point_b');
    } else if (_deltaCursor.mode === 'point_b') {
      _deltaCursor.pointB = point;
      _deltaCursor.mode = 'showing';
      _setDeltaMode('idle');
      _applyDeltaMarkersToChart(_deltaCursor.pointA, _deltaCursor.pointB);
      const result = computeDeltaMeasurement(_deltaCursor.pointA, _deltaCursor.pointB, _ctx.state.activePlot || 'step');
      _renderDeltaPanel(result);
    }
  });
}

// ── L1-2: Linked Crosshair ────────────────────────────────────────────────────
let _linkedCrosshairEnabled = false;
let _linkedCrosshairTimer = null;

export function initLinkedCrosshair() {
  const btn = document.getElementById('btn-linked-crosshair');
  if (!btn) return;
  btn.addEventListener('click', () => {
    _linkedCrosshairEnabled = !_linkedCrosshairEnabled;
    btn.setAttribute('aria-pressed', _linkedCrosshairEnabled ? 'true' : 'false');
    btn.style.opacity = _linkedCrosshairEnabled ? '1' : '';
    btn.style.background = _linkedCrosshairEnabled ? 'rgba(99,102,241,0.25)' : '';
    if (!_linkedCrosshairEnabled) _clearLinkedCrosshair();
  });

  const el = document.getElementById('chart-active');
  if (!el) return;
  el.on('plotly_hover', data => {
    if (!_linkedCrosshairEnabled || !_ctx.state.chartAnnotationsEnabled) return;
    clearTimeout(_linkedCrosshairTimer);
    _linkedCrosshairTimer = setTimeout(() => {
      try { _updateLinkedCrosshair(data); } catch {}
    }, 80);
  });
  el.on('plotly_unhover', () => {
    clearTimeout(_linkedCrosshairTimer);
    _clearLinkedCrosshair();
  });
}

function _updateLinkedCrosshair(hoverData) {
  const pts = hoverData.points;
  if (!pts?.length) return;
  const x = pts[0].x;
  if (!Number.isFinite(x) || x <= 0) return;
  if (_ctx.state.activePlot === 'nyquist') {
    const nyquistEl = document.getElementById('chart-active');
    if (nyquistEl?._fullLayout && _ctx.state.plant) {
      try {
        const sys = _ctx.state.showClosedLoop ? (_ctx.state.closedLoop || _ctx.state.plant) : _ctx.state.plant;
        const bd = _ctx.bodeData(sys, x * 0.999, x * 1.001);
        if (bd.re?.length && Number.isFinite(bd.re[0]) && Number.isFinite(bd.im?.[0])) {
          const re = bd.re[0], im = bd.im[0];
          Plotly.relayout(nyquistEl, {
            shapes: [...(nyquistEl._fullLayout.shapes || []).filter(s => !s._crosshair),
              { _crosshair: true, type: 'circle', x0: re - 0.05, x1: re + 0.05,
                y0: im - 0.05, y1: im + 0.05,
                line: { color: 'rgba(255,255,255,0.8)', width: 2 },
                fillcolor: 'rgba(99,102,241,0.5)' },
            ],
          });
        }
      } catch {}
    }
  }
}

function _clearLinkedCrosshair() {
  const el = document.getElementById('chart-active');
  if (el?._fullLayout) {
    try {
      Plotly.relayout(el, {
        shapes: (el._fullLayout.shapes || []).filter(s => !s._crosshair),
      });
    } catch {}
  }
}

// ── L1-3: Chart Annotation Pins ───────────────────────────────────────────────
const _CHART_PINS_KEY = 'cs-chart-pins';
const _PIN_MAX = 20;

function _getPinsForPlot(plotType) {
  try { return JSON.parse(localStorage.getItem(`${_CHART_PINS_KEY}-${plotType}`) || '[]'); }
  catch { return []; }
}
function _savePinsForPlot(plotType, pins) {
  try { localStorage.setItem(`${_CHART_PINS_KEY}-${plotType}`, JSON.stringify(pins)); }
  catch {}
}

export function _applyChartPins(plotType) {
  const pins = _getPinsForPlot(plotType);
  if (!pins.length) return;
  const el = document.getElementById('chart-active');
  if (!el?._fullLayout) return;
  try {
    const pinAnnotations = pins.map(p => ({
      _pin: true, _pinId: p.id,
      x: p.x, y: p.y, xref: 'x', yref: 'y',
      text: '📌', showarrow: false,
      font: { size: 14 }, bgcolor: 'transparent',
    }));
    const existing = (el._fullLayout.annotations || []).filter(a => !a._pin);
    Plotly.relayout(el, { annotations: [...existing, ...pinAnnotations] });
  } catch {}
}

export function initAnnotationPins() {
  const el = document.getElementById('chart-active');
  if (!el) return;
  el.on('plotly_doubleclick', data => {
    const event = data;
    if (!event?.offsetX) return;
    const layer = document.getElementById('chart-pin-layer');
    if (!layer) return;
    const plotType = _ctx.state.activePlot || 'step';
    const pins = _getPinsForPlot(plotType);
    if (pins.length >= _PIN_MAX) {
      try { _ctx.updateGlobalStatusBar(`備注已達上限 ${_PIN_MAX} 個，請先刪除舊備注`); } catch {}
      return;
    }
    const chartBody = document.getElementById('chart-active');
    const textarea = document.createElement('textarea');
    textarea.className = 'chart-pin-input';
    textarea.placeholder = '輸入備注…';
    const offsetX = event.offsetX ?? 50;
    const offsetY = event.offsetY ?? 50;
    textarea.style.left = `${offsetX + 8}px`;
    textarea.style.top = `${offsetY + 8}px`;
    layer.appendChild(textarea);
    layer.style.pointerEvents = 'auto';
    textarea.focus();

    const finish = (save) => {
      const text = textarea.value.trim();
      layer.removeChild(textarea);
      layer.style.pointerEvents = 'none';
      if (save && text) {
        const layout = el._fullLayout;
        let x = offsetX, y = offsetY;
        try {
          const xa = layout.xaxis, ya = layout.yaxis;
          const plotArea = layout._size;
          const fracX = (offsetX - plotArea.l) / plotArea.w;
          const fracY = 1 - (offsetY - plotArea.t) / plotArea.h;
          if (xa.type === 'log') {
            x = Math.pow(10, xa.range[0] + fracX * (xa.range[1] - xa.range[0]));
          } else {
            x = xa.range[0] + fracX * (xa.range[1] - xa.range[0]);
          }
          y = ya.range[0] + fracY * (ya.range[1] - ya.range[0]);
        } catch {}
        const pin = { id: `pin-${Date.now()}`, plotType, x, y, text, timestamp: Date.now(), color: '#f59e0b' };
        pins.push(pin);
        _savePinsForPlot(plotType, pins);
        _applyChartPins(plotType);
      }
    };
    textarea.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finish(true); }
      if (e.key === 'Escape') finish(false);
    });
    textarea.addEventListener('blur', () => finish(true));
  });
}

export function initMeasurementTools() {
  initDeltaCursor();
  initLinkedCrosshair();
  initAnnotationPins();
}
