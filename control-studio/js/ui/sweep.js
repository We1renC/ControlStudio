/**
 * sweep.js — P64 Parameter Sweep Visualization
 *
 * P1-1  Single parameter sweep (gradient color, async, progress)
 * P1-2  2D Stability Map (Kp-Ki heatmap)
 * P1-3  Bode animation (play/pause/reset/scrub)
 *
 * Inject via initSweepModule(ctx) before calling initSweepVisualization().
 * ctx: { state, PIDController, stepResponse, stepInfo, fmtNum, fmtTime,
 *         getCSS, updateGlobalStatusBar, PLOTLY_LAYOUT_BASE, compactLegend,
 *         updateActivePlotHeader, refreshAllCharts, renderBodePlot, bodeData }
 */

let _ctx = null;

export function initSweepModule(ctx) {
  _ctx = ctx;
}

// ── P1-1: Single Parameter Sweep ─────────────────────────────────────────────

let _sweepParam   = 'Kp';
let _sweepRunning = false;
let _sweepAbort   = false;

function _sweepColor(t) {
  const r = Math.round(t * 255);
  const g = Math.round(60 * (1 - t) + 60 * t);
  const b = Math.round((1 - t) * 255);
  return `rgb(${r},${g},${b})`;
}

export async function runParameterSweep(param, minVal, maxVal, n, scale) {
  const { state, PIDController, stepResponse, stepInfo, fmtNum, fmtTime } = _ctx;
  if (!state.plant) return;

  const values = scale === 'log'
    ? Array.from({ length: n }, (_, i) =>
        Math.pow(10, Math.log10(minVal) + (i / (n - 1)) * Math.log10(maxVal / minVal)))
    : Array.from({ length: n }, (_, i) => minVal + (i / (n - 1)) * (maxVal - minVal));

  const fillEl     = document.getElementById('sweep-progress-fill');
  const currentKp  = state.pidParams?.[param] ?? 1;
  const traces     = [];

  for (let i = 0; i < n; i++) {
    if (_sweepAbort) break;
    if (fillEl) fillEl.style.width = `${Math.round((i / n) * 100)}%`;
    const k = values[i];
    try {
      const ctrl = { ...(state.pidParams || { Kp: 1, Ki: 0, Kd: 0, N: 100 }), [param]: k };
      const pid  = new PIDController(ctrl.Kp, ctrl.Ki, ctrl.Kd, ctrl.N ?? 100);
      const loop = pid.toTransferFunction().series(state.plant);
      const cl   = loop.feedback();
      const resp = stepResponse(cl, { duration: state.simulationConfig?.duration ?? 20, sampleCount: 200 });
      const met  = stepInfo(resp.t, resp.y);
      const t    = i / Math.max(n - 1, 1);
      traces.push({
        x: resp.t, y: resp.y,
        type: 'scatter', mode: 'lines',
        line: { color: _sweepColor(t), width: Math.abs(k - currentKp) < (maxVal - minVal) / n ? 3 : 1.5 },
        name: `${param}=${fmtNum(k, 2)}`,
        hovertemplate: `${param}=${fmtNum(k, 2)}<br>OS=${(met.overshoot ?? 0).toFixed(1)}%<br>Ts=${fmtTime(met.settlingTime ?? 0)}<extra></extra>`,
      });
    } catch {}
    await new Promise(r => setTimeout(r, 0));
  }
  if (fillEl) fillEl.style.width = '100%';
  return traces;
}

export function initParameterSweep() {
  document.querySelectorAll('[data-sweep-param]').forEach(btn => {
    btn.addEventListener('click', () => {
      _sweepParam = btn.dataset.sweepParam;
      document.getElementById('sweep-param-label').textContent = _sweepParam;
      const drawer = document.getElementById('sweep-drawer');
      drawer.style.display = drawer.style.display === 'block' ? 'none' : 'block';
    });
  });

  document.getElementById('sweep-cancel-btn')?.addEventListener('click', () => {
    _sweepAbort = true;
    document.getElementById('sweep-drawer').style.display = 'none';
  });

  document.getElementById('sweep-exit-btn')?.addEventListener('click', () => {
    document.getElementById('sweep-exit-btn').style.display = 'none';
    _ctx.state._sweepMode = false;
    _ctx.refreshAllCharts();
  });

  document.getElementById('sweep-run-btn')?.addEventListener('click', async () => {
    const { state, fmtNum, updateGlobalStatusBar, PLOTLY_LAYOUT_BASE, compactLegend, updateActivePlotHeader } = _ctx;
    if (!state.plant) { try { updateGlobalStatusBar('請先定義 Plant'); } catch {} return; }
    _sweepAbort   = false;
    _sweepRunning = true;
    const minVal = parseFloat(document.getElementById('sweep-min').value)   || 0.1;
    const maxVal = parseFloat(document.getElementById('sweep-max').value)   || 10;
    const n      = parseInt(document.getElementById('sweep-count').value)   || 8;
    const scale  = document.querySelector('input[name="sweep-scale"]:checked')?.value || 'log';
    document.getElementById('sweep-progress-fill').style.width = '0%';
    try {
      const traces = await runParameterSweep(_sweepParam, minVal, maxVal, n, scale);
      if (traces?.length && !_sweepAbort) {
        state._sweepMode   = true;
        state._sweepTraces = traces;
        document.querySelector('.plot-tab[data-plot="step"]')?.click();
        const layout = PLOTLY_LAYOUT_BASE();
        layout.showlegend = true;
        layout.legend     = compactLegend();
        layout.xaxis.title = { text: 'Time (s)' };
        layout.yaxis.title = { text: 'Amplitude' };
        Plotly.react('chart-active', traces, layout, { responsive: true, displayModeBar: false });
        document.getElementById('sweep-exit-btn').style.display = '';
        try { updateActivePlotHeader(`掃描 ${_sweepParam}`, `${n} 條曲線`); } catch {}
      }
    } catch (err) { console.warn('[CS P64] sweep error', err); }
    _sweepRunning = false;
    document.getElementById('sweep-drawer').style.display = 'none';
  });
}

// ── P1-2: 2D Stability Map ────────────────────────────────────────────────────

export async function computeStabilityMap(sys, kpRange, kiRange, N) {
  const { PIDController } = _ctx;
  const { kpMin, kpMax } = kpRange;
  const { kiMin, kiMax } = kiRange;
  const zData = [], kpVals = [], kiVals = [];
  for (let i = 0; i < N; i++) {
    kpVals.push(Math.pow(10, Math.log10(kpMin) + (i / (N - 1)) * Math.log10(kpMax / kpMin)));
  }
  for (let j = 0; j < N; j++) {
    kiVals.push(Math.pow(10, Math.log10(kiMin) + (j / (N - 1)) * Math.log10(kiMax / kiMin)));
  }
  for (let j = 0; j < N; j++) {
    const row = [];
    for (let i = 0; i < N; i++) {
      try {
        const kp   = kpVals[i], ki = kiVals[j];
        const pid  = new PIDController(kp, ki, 0, 0);
        const cl   = pid.toTransferFunction().series(sys).feedback();
        const poles = cl.poles ? cl.poles() : [];
        const maxRe = poles.length ? Math.max(...poles.map(p => p.re ?? p)) : 0;
        row.push(-maxRe);
      } catch { row.push(NaN); }
    }
    zData.push(row);
    await new Promise(r => setTimeout(r, 0));
  }
  return { zData, kpVals, kiVals };
}

export async function renderStabilityMap(targetId) {
  const { state, getCSS, fmtNum, PLOTLY_LAYOUT_BASE, compactLegend } = _ctx;
  const el = document.getElementById(targetId);
  if (!el || !state.plant) return;
  const N = 20;
  const kpCur = state.pidParams?.Kp ?? 1;
  const kiCur = state.pidParams?.Ki ?? 0.1;
  const kpMin = Math.max(kpCur / 100, 0.001), kpMax = kpCur * 50 + 1;
  const kiMin = Math.max(kiCur / 100, 0.001), kiMax = kiCur * 50 + 1;
  try {
    const { zData, kpVals, kiVals } = await computeStabilityMap(
      state.plant, { kpMin, kpMax }, { kiMin, kiMax }, N
    );
    const finiteMargins = zData.flat().filter(v => Number.isFinite(v));
    const displayScale  = Math.max(...finiteMargins.map(v => Math.abs(v)), 1e-6);
    const zDisplay = zData.map(row => row.map(v =>
      Number.isFinite(v) ? Math.max(-1, Math.min(1, v / displayScale)) : NaN
    ));
    const trace = {
      type: 'heatmap', x: kpVals, y: kiVals, z: zDisplay, customdata: zData,
      colorscale: [[0,'#ef4444'],[0.45,'#f97316'],[0.5,'#ffffff'],[0.55,'#22c55e'],[1,'#166534']],
      zmin: -1, zmax: 1, zmid: 0,
      colorbar: { title: { text: '穩定性' }, thickness: 12, len: 0.74, tickvals: [-1, 0, 1], ticktext: ['不穩定', '邊界', '穩定'] },
      hovertemplate: 'Kp=%{x:.3f}<br>Ki=%{y:.3f}<br>raw margin=%{customdata:.4f}<extra></extra>',
    };
    const boundaryTrace = {
      type: 'contour', x: kpVals, y: kiVals, z: zData,
      contours: { start: 0, end: 0, size: 1, coloring: 'none', showlabels: true, labelfont: { size: 10, color: getCSS('--text-secondary') } },
      line: { color: '#0f172a', width: 2 },
      name: '穩定邊界', hoverinfo: 'skip', showscale: false,
    };
    const currentPoint = {
      x: [kpCur], y: [kiCur], type: 'scatter', mode: 'markers+text',
      marker: { size: 12, color: '#fff', line: { color: '#6366f1', width: 2 } },
      text: [`目前 Kp=${fmtNum(kpCur, 3)}, Ki=${fmtNum(kiCur, 3)}`],
      textposition: 'top right', textfont: { size: 10, color: getCSS('--text-secondary') },
      name: '當前設計點',
      hovertemplate: '目前設計點<br>Kp=%{x:.3f}<br>Ki=%{y:.3f}<extra></extra>',
    };
    const layout = PLOTLY_LAYOUT_BASE();
    layout.xaxis  = { ...layout.xaxis, type: 'log', title: { text: 'Kp' } };
    layout.yaxis  = { ...layout.yaxis, type: 'log', title: { text: 'Ki' } };
    layout.showlegend = targetId === 'chart-active';
    layout.legend = compactLegend();
    layout.title  = { text: 'Kp-Ki 穩定地圖', font: { size: 12 } };
    layout.annotations = [{ x: 0.02, y: 0.98, xref: 'paper', yref: 'paper', xanchor: 'left', yanchor: 'top', showarrow: false, text: '綠色 = 穩定裕度較高，紅色 = 不穩定', font: { size: 10, color: getCSS('--text-muted') }, bgcolor: 'rgba(15,17,23,0.72)', bordercolor: getCSS('--border-primary'), borderwidth: 1, borderpad: 4 }];
    Plotly.react(targetId, [trace, boundaryTrace, currentPoint], layout, { responsive: true, displayModeBar: false });
  } catch (err) { console.warn('[CS P64] stability map error', err); }
}

// ── P1-3: Bode Animation ──────────────────────────────────────────────────────

let _bodeAnimFrame   = null;
let _bodeAnimRunning = false;

export function _stopBodeAnim() {
  _bodeAnimRunning = false;
  if (_bodeAnimFrame) { cancelAnimationFrame(_bodeAnimFrame); _bodeAnimFrame = null; }
}

export function initBodeAnimation() {
  const { state, PIDController, fmtNum, updateGlobalStatusBar, renderBodePlot } = _ctx;
  const animBtn = document.getElementById('btn-bode-animate');
  const panel   = document.getElementById('bode-anim-panel');
  const scrub   = document.getElementById('bode-anim-scrub');
  if (!animBtn || !panel) return;

  animBtn.addEventListener('click', () => {
    const active = animBtn.getAttribute('aria-pressed') === 'true';
    animBtn.setAttribute('aria-pressed', active ? 'false' : 'true');
    panel.style.display = active ? 'none' : 'flex';
    if (active) _stopBodeAnim();
  });
  document.getElementById('bode-anim-close')?.addEventListener('click', () => {
    panel.style.display = 'none';
    animBtn.setAttribute('aria-pressed', 'false');
    _stopBodeAnim();
  });

  const _getKp = (t) => {
    const fromV = parseFloat(document.getElementById('bode-anim-from').value) || 0.1;
    const toV   = parseFloat(document.getElementById('bode-anim-to').value)   || 10;
    return Math.pow(10, Math.log10(fromV) + t * Math.log10(toV / fromV));
  };

  const _applyFrame = (t) => {
    if (!state.plant) return;
    if (scrub) scrub.value = t;
    const kp = _getKp(t);
    try { updateGlobalStatusBar(`動畫 Kp = ${fmtNum(kp, 3)}`); } catch {}
    try {
      const ctrl = { ...(state.pidParams || { Kp: 1, Ki: 0, Kd: 0 }), Kp: kp };
      const pid  = new PIDController(ctrl.Kp, ctrl.Ki, ctrl.Kd, ctrl.N ?? 100);
      const loop = pid.toTransferFunction().series(state.plant);
      renderBodePlot(loop, 'chart-active');
    } catch {}
  };

  scrub?.addEventListener('input', () => { _stopBodeAnim(); _applyFrame(parseFloat(scrub.value)); });

  document.getElementById('bode-anim-play')?.addEventListener('click', () => {
    if (!state.plant || state.activePlot !== 'bode') return;
    _bodeAnimRunning = true;
    const speed    = parseFloat(document.getElementById('bode-anim-speed')?.value || '1');
    const totalMs  = 2000 / speed;
    const startT   = parseFloat(scrub?.value || '0');
    const startTime = performance.now() - startT * totalMs;
    const tick = (now) => {
      if (!_bodeAnimRunning) return;
      const t = Math.min((now - startTime) / totalMs, 1);
      _applyFrame(t);
      if (t < 1) { _bodeAnimFrame = requestAnimationFrame(tick); }
      else { _bodeAnimRunning = false; }
    };
    _bodeAnimFrame = requestAnimationFrame(tick);
  });

  document.getElementById('bode-anim-pause')?.addEventListener('click', _stopBodeAnim);
  document.getElementById('bode-anim-reset')?.addEventListener('click', () => {
    _stopBodeAnim();
    if (scrub) scrub.value = '0';
    _applyFrame(0);
  });

  document.addEventListener('cs:plot-changed', e => {
    if (!animBtn) return;
    animBtn.style.display = e.detail?.plot === 'bode' ? 'inline-flex' : 'none';
  });
}

export function initSweepVisualization() {
  initParameterSweep();
  initBodeAnimation();
  document.addEventListener('cs:plot-changed', async e => {
    if (e.detail?.plot === 'stability-map') {
      await renderStabilityMap('chart-active');
    }
  });
}
