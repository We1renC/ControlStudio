import { TransferFunction } from './control/transfer-function.js';
import { parseMatrixInput, stateSpaceToTransferFunction } from './control/state-space.js';
import { PIDController } from './control/pid.js';
import { impulseResponse, rampResponse, stepResponse } from './analysis/time-response.js';
import { bodeData, nyquistData } from './analysis/frequency-response.js';
import { rootLocusData } from './analysis/root-locus.js';
import { stabilityMargins, stepInfo } from './control/stability.js';
import { parsePolyString, fmtNum, fmtDeg, fmtDB, fmtTime, fmtPercent } from './utils/format.js';
import { BlockEditor } from './editor/editor.js';

// ============================================================
// STATE
// ============================================================
const state = {
  plant: null,
  controller: null,
  closedLoop: null,
  openLoop: null,
  pidParams: { Kp: 1, Ki: 0.5, Kd: 0.1, N: 100 },
  showClosedLoop: true,
  systemType: 'tf',
  responseType: 'step',
  activePlot: 'step',
  ssModel: {
    A: '0 1\n-2 -3',
    B: '0\n1',
    C: '1 0',
    D: '0',
  },
  comparisonSnapshots: [],
  theme: 'dark',
  view: 'dashboard',
  editor: null,
};

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initEventListeners();
  state.editor = new BlockEditor();

  // Set defaults
  document.getElementById('tf-num').value = '1';
  document.getElementById('tf-den').value = '1, 3, 2';
  setComparisonVisibility();
  updateSystemSetupCopy();
  updateSystem();
});

function initTheme() {
  const saved = localStorage.getItem('cs-theme') || 'dark';
  state.theme = saved;
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeIcon();
}

function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', state.theme);
  localStorage.setItem('cs-theme', state.theme);
  updateThemeIcon();
  if (state.plant) refreshAllCharts();
}

function updateThemeIcon() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  btn.innerHTML = state.theme === 'dark'
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
}

function initEventListeners() {
  document.getElementById('view-dashboard')?.addEventListener('click', () => switchView('dashboard'));
  document.getElementById('view-editor')?.addEventListener('click', () => switchView('editor'));
  document.getElementById('theme-toggle')?.addEventListener('click', toggleTheme);
  document.querySelectorAll('.sidebar-tab').forEach((tab) => {
    tab.addEventListener('click', () => switchSidebarPanel(tab.dataset.sidebar));
  });
  document.querySelectorAll('.plot-tab').forEach((tab) => {
    tab.addEventListener('click', () => switchPlot(tab.dataset.plot));
  });

  document.querySelectorAll('.sys-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      state.systemType = e.target.dataset.type;
      document.querySelectorAll('.sys-tab').forEach(t => t.classList.remove('active'));
      e.target.classList.add('active');
      document.querySelectorAll('.sys-input-section').forEach(s => s.style.display = 'none');
      document.getElementById(`sys-${e.target.dataset.type}`)?.style.setProperty('display', 'block');
      updateSystemSetupCopy();
    });
  });

  document.getElementById('tf-num')?.addEventListener('input', debounce(updateSystem, 300));
  document.getElementById('tf-den')?.addEventListener('input', debounce(updateSystem, 300));
  ['ss-a', 'ss-b', 'ss-c', 'ss-d'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', debounce(updateSystem, 300));
  });

  ['Kp', 'Ki', 'Kd'].forEach(param => {
    const slider = document.getElementById(`pid-${param}`);
    if (slider) {
      slider.addEventListener('input', () => {
        const val = parseFloat(slider.value);
        state.pidParams[param] = val;
        const valDisplay = document.getElementById(`pid-${param}-val`);
        if (valDisplay) valDisplay.textContent = val.toFixed(2);
        updateController();
      });
    }
  });

  document.getElementById('cl-toggle')?.addEventListener('change', (e) => {
    state.showClosedLoop = e.target.checked;
    updateSystemSetupCopy();
    refreshAllCharts();
    updateStabilityPanel();
  });

  document.getElementById('response-type')?.addEventListener('change', (e) => {
    state.responseType = e.target.value;
    refreshAllCharts();
    updateStabilityPanel();
  });

  document.getElementById('btn-ai-advisor')?.addEventListener('click', requestAIAdvice);
  document.getElementById('btn-apply')?.addEventListener('click', updateSystem);
  document.getElementById('btn-save-project')?.addEventListener('click', saveProjectFile);
  document.getElementById('btn-load-project')?.addEventListener('click', () => document.getElementById('project-file-input')?.click());
  document.getElementById('btn-export-json')?.addEventListener('click', () => exportCurrentResult('json'));
  document.getElementById('btn-export-csv')?.addEventListener('click', () => exportCurrentResult('csv'));
  document.getElementById('project-file-input')?.addEventListener('change', loadProjectFile);
  document.getElementById('btn-save-snapshot')?.addEventListener('click', saveComparisonSnapshot);
  document.getElementById('btn-clear-snapshots')?.addEventListener('click', clearSnapshots);
  document.getElementById('btn-export-compare')?.addEventListener('click', exportComparisonSnapshots);

  document.getElementById('btn-editor-sync')?.addEventListener('click', () => {
    const tfStr = state.editor?.getSystemModel();
    if (!tfStr) return;
    const parts = tfStr.split('/');
    if (parts.length === 2) {
      document.getElementById('tf-num').value = parts[0].trim();
      document.getElementById('tf-den').value = parts[1].trim();
      updateSystem();
      switchView('dashboard');
    }
  });
}

function switchView(viewName) {
  state.view = viewName;
  const dashboard = document.getElementById('dashboard-view');
  const editor = document.getElementById('editor-workspace');
  const btnDash = document.getElementById('view-dashboard');
  const btnEdit = document.getElementById('view-editor');

  if (viewName === 'editor') {
    if (dashboard) dashboard.style.display = 'none';
    if (editor) editor.style.display = 'flex';
    btnEdit?.classList.add('active');
    btnDash?.classList.remove('active');
    state.editor?.canvas?.drawGrid();
  } else {
    if (dashboard) dashboard.style.display = 'flex';
    if (editor) editor.style.display = 'none';
    btnDash?.classList.add('active');
    btnEdit?.classList.remove('active');
    refreshAllCharts();
    updateStabilityPanel();
  }
}

function switchSidebarPanel(panelName) {
  document.querySelectorAll('.sidebar-tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.sidebar === panelName);
  });
  document.querySelectorAll('.sidebar-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === `panel-${panelName}`);
  });
}

function switchPlot(plotName) {
  state.activePlot = plotName;
  document.querySelectorAll('.plot-tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.plot === plotName);
  });
  if (!state.plant) return;
  const sys = state.showClosedLoop ? (state.closedLoop || state.plant) : state.plant;
  renderActivePlot(sys);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatPolyText(coeffs) {
  if (!coeffs || coeffs.length === 0) return '0';
  const deg = coeffs.length - 1;
  const terms = [];
  for (let i = 0; i <= deg; i += 1) {
    const coeff = coeffs[i];
    const power = deg - i;
    if (Math.abs(coeff) < 1e-12) continue;
    const absCoeff = Math.abs(coeff);
    const coeffText = Number.isInteger(absCoeff) ? String(absCoeff) : String(parseFloat(absCoeff.toFixed(4)));
    let body = '';
    if (power === 0) body = coeffText;
    else if (power === 1) body = absCoeff === 1 ? 's' : `${coeffText}s`;
    else body = absCoeff === 1 ? `s^${power}` : `${coeffText}s^${power}`;

    if (terms.length === 0) {
      terms.push(coeff < 0 ? `-${body}` : body);
    } else {
      terms.push(`${coeff < 0 ? ' - ' : ' + '}${body}`);
    }
  }
  return terms.length > 0 ? terms.join('') : '0';
}

function renderTransferFunctionEquation(symbol, tf, note = '') {
  if (!tf) {
    return `
      <div class="equation-stack">
        <div class="equation-line">
          <div class="equation-symbol">${escapeHtml(symbol)}</div>
          <div class="equation-note">尚未建立模型</div>
        </div>
      </div>
    `;
  }
  return `
    <div class="equation-stack">
      <div class="equation-line">
        <div class="equation-symbol">${escapeHtml(symbol)}</div>
        <div class="tf-fraction">
          <div class="tf-num">${escapeHtml(formatPolyText(tf.num))}</div>
          <div class="tf-bar"></div>
          <div class="tf-den">${escapeHtml(formatPolyText(tf.den))}</div>
        </div>
      </div>
      ${note ? `<div class="equation-note">${escapeHtml(note)}</div>` : ''}
    </div>
  `;
}

function renderStateSpaceEquationBlock(matrices) {
  const rows = ['A', 'B', 'C', 'D'].map((name) => `
    <div class="matrix-row">
      <div class="matrix-name">${name}</div>
      <div class="matrix-value">[${escapeHtml(matrices[name].map((row) => row.join(', ')).join(' ; '))}]</div>
    </div>
  `).join('');
  return `
    <div class="equation-stack">
      <div>x_dot = Ax + Bu</div>
      <div>y = Cx + Du</div>
      <div class="matrix-stack">${rows}</div>
    </div>
  `;
}

function updateSystemSetupCopy() {
  const modelCopy = document.getElementById('model-section-copy');
  const systemEquation = document.getElementById('system-equation');
  const controllerEquation = document.getElementById('controller-equation');
  const loopEquation = document.getElementById('loop-equation');
  if (!modelCopy || !systemEquation || !controllerEquation || !loopEquation) return;

  const controllerTf = state.controller?.toTransferFunction?.();
  const plantTf = state.plant;

  if (state.systemType === 'ss') {
    let matrices = null;
    try {
      matrices = {
        A: parseMatrixInput(document.getElementById('ss-a')?.value),
        B: parseMatrixInput(document.getElementById('ss-b')?.value, 1),
        C: parseMatrixInput(document.getElementById('ss-c')?.value),
        D: parseMatrixInput(document.getElementById('ss-d')?.value, 1),
      };
    } catch {
      matrices = null;
    }
    systemEquation.innerHTML = matrices
      ? renderStateSpaceEquationBlock(matrices)
      : '<div class="equation-note">請完成 A / B / C / D 矩陣後顯示狀態方程。</div>';
    modelCopy.textContent = '直接輸入 A / B / C / D 矩陣；上方會同步顯示狀態方程與矩陣內容。';
  } else {
    systemEquation.innerHTML = renderTransferFunctionEquation('G(s) =', plantTf, 'Plant transfer function');
    modelCopy.textContent = '直接輸入 plant 的分子與分母係數；上方會同步更新成具體傳遞函數。';
  }

  controllerEquation.innerHTML = renderTransferFunctionEquation('C(s) =', controllerTf, `Kp=${state.pidParams.Kp.toFixed(2)}, Ki=${state.pidParams.Ki.toFixed(2)}, Kd=${state.pidParams.Kd.toFixed(2)}`);

  const loopParts = [
    renderTransferFunctionEquation('L(s) =', state.openLoop, 'Open-loop transfer function'),
    renderTransferFunctionEquation('T(s) =', state.closedLoop, state.showClosedLoop ? 'Active view: closed-loop response' : 'Active view: plant / open-loop analysis'),
  ];
  loopEquation.innerHTML = loopParts.join('');
}

// ============================================================
// CORE LOGIC
// ============================================================
function updateSystem() {
  try {
    if (state.systemType === 'ss') {
      const A = parseMatrixInput(document.getElementById('ss-a')?.value);
      const B = parseMatrixInput(document.getElementById('ss-b')?.value, 1);
      const C = parseMatrixInput(document.getElementById('ss-c')?.value);
      const D = parseMatrixInput(document.getElementById('ss-d')?.value, 1);
      captureStateSpaceInputs();
      state.plant = stateSpaceToTransferFunction(A, B, C, D);
      syncTransferFunctionInputs();
    } else {
      const numInput = document.getElementById('tf-num');
      const denInput = document.getElementById('tf-den');
      if (!numInput || !denInput) return;
      const num = parsePolyString(numInput.value);
      const den = parsePolyString(denInput.value);
      if (!num || !den) throw new Error("無效的係數輸入");
      state.plant = new TransferFunction(num, den);
    }
    clearError();
    updateController();
  } catch (err) {
    showError(err.message);
  }
}

function updateController() {
  if (!state.plant) return;
  try {
    const { Kp, Ki, Kd, N } = state.pidParams;
    state.controller = new PIDController(Kp, Ki, Kd, N);

    // Series connection
    state.openLoop = state.controller.toTransferFunction().series(state.plant);
    // Unity negative feedback
    state.closedLoop = state.openLoop.feedback();

    updateSystemSetupCopy();
    refreshAllCharts();
    updateStabilityPanel();
  } catch (err) {
    console.error("控制器更新失敗:", err);
  }
}

function refreshAllCharts() {
  if (!state.plant) return;
  const sys = state.showClosedLoop ? (state.closedLoop || state.plant) : state.plant;

  renderActivePlot(sys);
  renderRootLocus(state.plant);
  renderPoleZeroMap(sys);
  renderComparisonChart();
}

function setComparisonVisibility() {
  const compareSection = document.getElementById('compare-section');
  if (!compareSection) return;
  compareSection.classList.toggle('active', state.comparisonSnapshots.length > 0);
}

function currentResponseData(sys) {
  if (state.responseType === 'impulse') return impulseResponse(sys);
  if (state.responseType === 'ramp') return rampResponse(sys);
  return stepResponse(sys);
}

function updateActivePlotHeader(title, subtitle) {
  const titleEl = document.getElementById('active-plot-title');
  const subtitleEl = document.getElementById('active-plot-subtitle');
  if (titleEl) titleEl.textContent = title;
  if (subtitleEl) subtitleEl.textContent = subtitle;
}

// ============================================================
// STABILITY ADVISOR (CRITICAL FIX)
// ============================================================
function updateStabilityPanel() {
  const sys = state.showClosedLoop ? (state.closedLoop || state.plant) : state.plant;
  const ol = state.openLoop || state.plant;

  const gmEl = document.getElementById('gm-value');
  const pmEl = document.getElementById('pm-value');
  const riseEl = document.getElementById('rise-time');
  const settleEl = document.getElementById('settling-time');
  const overEl = document.getElementById('overshoot');
  const essEl = document.getElementById('ess-value');
  const ind = document.getElementById('stability-indicator');

  if (!ind || !riseEl) return;

  try {
    // 1. Calculate Metrics
    const margins = stabilityMargins(ol);
    if (gmEl) gmEl.textContent = margins.gainMarginDB === Infinity ? '∞' : fmtDB(margins.gainMarginDB);
    if (pmEl) pmEl.textContent = isNaN(margins.phaseMargin) ? '—' : fmtDeg(margins.phaseMargin);

    const resp = currentResponseData(sys);
    const info = stepInfo(resp.t, resp.y);

    if (riseEl) riseEl.textContent = fmtTime(info.riseTime);
    if (settleEl) settleEl.textContent = fmtTime(info.settlingTime);
    if (overEl) overEl.textContent = fmtPercent(info.overshoot);
    if (essEl) essEl.textContent = info.steadyStateError !== undefined ? info.steadyStateError.toPrecision(3) : '—';

    // 2. Determine Stability (Strict Pole Check)
    const poles = sys.poles();
    let status = 'stable';
    let label = 'STABLE';

    const hasUnstablePole = poles.some(p => p.re > 1e-6);
    const hasMarginalPole = poles.some(p => Math.abs(p.re) < 1e-6);

    if (hasUnstablePole || resp.y.some(v => Math.abs(v) > 1e8)) {
      status = 'unstable';
      label = 'UNSTABLE';
    } else if (hasMarginalPole) {
      status = 'marginal';
      label = 'MARGINAL';
    }

    ind.className = `status-pill ${status}`;
    ind.innerHTML = `<span class="status-dot"></span> ${label}`;
  } catch (err) {
    console.error("穩定性分析面板刷新出錯:", err);
  }
}

// ============================================================
// CHART RENDERING
// ============================================================
const PLOTLY_LAYOUT_BASE = () => ({
  paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
  font: { family: 'Inter, sans-serif', size: 11, color: getCSS('--text-secondary') },
  margin: { l: 55, r: 20, t: 10, b: 40 },
  xaxis: { gridcolor: getCSS('--chart-grid'), zerolinecolor: getCSS('--chart-axis'), linecolor: getCSS('--chart-axis') },
  yaxis: { gridcolor: getCSS('--chart-grid'), zerolinecolor: getCSS('--chart-axis'), linecolor: getCSS('--chart-axis') },
  showlegend: false, autosize: true,
});

function getCSS(varName) {
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || '#ffffff';
}

function compactLegend() {
  return {
    orientation: 'h',
    x: 0,
    xanchor: 'left',
    y: 1.12,
    yanchor: 'bottom',
    font: { size: 10, color: getCSS('--text-secondary') },
    bgcolor: 'rgba(0,0,0,0)',
  };
}

function renderTimeResponse(sys, targetId = 'chart-active') {
  const resp = currentResponseData(sys);
  const responseTitles = { step: 'Step Response', impulse: 'Impulse Response', ramp: 'Ramp Response' };
  const trace = {
    x: resp.t,
    y: resp.y,
    type: 'scatter',
    mode: 'lines',
    name: state.showClosedLoop ? 'Closed-loop response' : 'Plant response',
    line: { color: getCSS('--color-accent'), width: 2 },
    fill: 'tozeroy',
    fillcolor: 'rgba(99, 102, 241, 0.05)',
  };
  const layout = PLOTLY_LAYOUT_BASE();
  layout.title = { text: responseTitles[state.responseType], font: { size: 13, color: getCSS('--text-secondary') } };
  layout.showlegend = true;
  layout.legend = compactLegend();
  Plotly.react(targetId, [trace], layout, { responsive: true, displayModeBar: false });
}

function renderBodePlot(sys, targetId = 'chart-active') {
  const data = bodeData(sys);
  const mTrace = { x: data.w, y: data.magDB, type: 'scatter', mode: 'lines', name: 'Magnitude (dB)', line: { color: getCSS('--color-accent'), width: 2 } };
  const pTrace = { x: data.w, y: data.phaseDeg, type: 'scatter', mode: 'lines', name: 'Phase (deg)', line: { color: getCSS('--color-secondary'), width: 2 }, yaxis: 'y2' };
  const layout = PLOTLY_LAYOUT_BASE();
  layout.xaxis.type = 'log';
  layout.yaxis2 = { overlaying: 'y', side: 'right', gridcolor: 'transparent' };
  layout.showlegend = true;
  layout.legend = compactLegend();
  Plotly.react(targetId, [mTrace, pTrace], layout, { responsive: true, displayModeBar: false });
}

function renderNyquistPlot(sys, targetId = 'chart-active') {
  const data = nyquistData(sys);
  const traces = [
    { x: data.re, y: data.im, type: 'scatter', mode: 'lines', line: { color: getCSS('--color-accent'), width: 2 }, name: 'Positive ω' },
    { x: data.reNeg, y: data.imNeg, type: 'scatter', mode: 'lines', line: { color: getCSS('--color-secondary'), width: 1.5, dash: 'dot' }, name: 'Negative ω' },
    { x: [-1], y: [0], type: 'scatter', mode: 'markers', marker: { size: 9, color: getCSS('--color-unstable') }, name: '-1 + j0' },
  ];
  const layout = PLOTLY_LAYOUT_BASE();
  layout.showlegend = true;
  layout.legend = compactLegend();
  layout.xaxis.zeroline = true;
  layout.yaxis.scaleanchor = 'x';
  Plotly.react(targetId, traces, layout, { responsive: true, displayModeBar: false });
}

function renderActivePlot(sys) {
  const loopSys = state.openLoop || state.plant;
  const plotConfig = {
    step: () => {
      updateActivePlotHeader(
        { step: 'Step Response', impulse: 'Impulse Response', ramp: 'Ramp Response' }[state.responseType],
        'Time-Domain'
      );
      renderTimeResponse(sys, 'chart-active');
    },
    bode: () => {
      updateActivePlotHeader('Bode Plot', 'Frequency-Domain');
      renderBodePlot(loopSys, 'chart-active');
    },
    nyquist: () => {
      updateActivePlotHeader('Nyquist Plot', 'Frequency-Domain');
      renderNyquistPlot(loopSys, 'chart-active');
    },
    rlocus: () => {
      updateActivePlotHeader('Root Locus', 'Stability Analysis');
      renderRootLocus(state.plant, 'chart-active');
    },
    pzmap: () => {
      updateActivePlotHeader('Pole-Zero Map', 'S-Plane');
      renderPoleZeroMap(sys, 'chart-active');
    },
  };
  (plotConfig[state.activePlot] || plotConfig.step)();
}

function renderRootLocus(sys, targetId = 'chart-rlocus') {
  const result = rootLocusData(sys);
  if (!result || !result.roots || result.roots.length === 0) return;
  const nPoles = result.roots[0].length;
  const branches = Array.from({ length: nPoles }, () => ({ re: [], im: [] }));
  for (let i = 0; i < result.roots.length; i++) {
    for (let j = 0; j < nPoles; j++) {
      if (result.roots[i][j]) {
        branches[j].re.push(result.roots[i][j].re);
        branches[j].im.push(result.roots[i][j].im);
      }
    }
  }
  const traces = branches.map((b, idx) => ({
    x: b.re,
    y: b.im,
    type: 'scatter',
    mode: 'lines',
    name: `Branch ${idx + 1}`,
    line: { width: 1.5, color: getCSS('--color-accent'), opacity: 0.6 },
  }));
  const layout = PLOTLY_LAYOUT_BASE();
  layout.showlegend = targetId === 'chart-active';
  if (layout.showlegend) layout.legend = compactLegend();
  Plotly.react(targetId, traces, layout, { responsive: true, displayModeBar: false });
}

function renderPoleZeroMap(sys, targetId = 'chart-pzmap') {
  const pList = sys.poles();
  const zList = sys.zeros();
  const pTrace = { x: pList.map(p => p.re), y: pList.map(p => p.im), type: 'scatter', mode: 'markers', name: 'Poles', marker: { symbol: 'x', size: 10, color: getCSS('--color-unstable') } };
  const zTrace = { x: zList.map(z => z.re), y: zList.map(z => z.im), type: 'scatter', mode: 'markers', name: 'Zeros', marker: { symbol: 'circle-open', size: 10, color: getCSS('--color-accent') } };
  const layout = PLOTLY_LAYOUT_BASE();
  layout.showlegend = targetId === 'chart-active';
  if (layout.showlegend) layout.legend = compactLegend();
  Plotly.react(targetId, [pTrace, zTrace], layout, { responsive: true, displayModeBar: false });
}

function renderComparisonChart() {
  const target = document.getElementById('chart-compare');
  if (!target) return;
  setComparisonVisibility();

  const traces = [];
  const palette = ['#6366f1', '#ec4899', '#10b981', '#f59e0b', '#22c55e', '#38bdf8'];
  state.comparisonSnapshots.forEach((snapshot, idx) => {
    traces.push({
      x: snapshot.response.t,
      y: snapshot.response.y,
      type: 'scatter',
      mode: 'lines',
      name: snapshot.name,
      line: { width: 2, color: palette[idx % palette.length] },
    });
  });

  if (state.plant && state.comparisonSnapshots.length > 0) {
    const sys = state.showClosedLoop ? (state.closedLoop || state.plant) : state.plant;
    const response = currentResponseData(sys);
    traces.push({
      x: response.t,
      y: response.y,
      type: 'scatter',
      mode: 'lines',
      name: 'Current',
      line: { width: 3, color: getCSS('--text-primary'), dash: 'dash' },
    });
  }

  const layout = PLOTLY_LAYOUT_BASE();
  layout.showlegend = true;
  layout.legend = compactLegend();
  if (traces.length === 0) {
    Plotly.purge('chart-compare');
    return;
  }
  Plotly.react('chart-compare', traces, layout, { responsive: true, displayModeBar: false });
}

// ============================================================
// AI ADVISOR
// ============================================================
async function requestAIAdvice() {
  const container = document.getElementById('ai-response-container');
  const textDiv = document.getElementById('ai-text');
  const loading = document.getElementById('ai-loading');
  const btn = document.getElementById('btn-ai-advisor');
  if (!state.plant || !btn) return;

  container.style.display = 'block';
  loading.style.display = 'block';
  textDiv.innerHTML = '';
  btn.disabled = true;

  const sys = state.showClosedLoop && state.closedLoop ? state.closedLoop : state.plant;
  const margins = stabilityMargins(state.openLoop || state.plant);
  const resp = currentResponseData(sys);
  const info = stepInfo(resp.t, resp.y);

  const payload = {
    formula: state.plant.toString(),
    riseTime: fmtTime(info.riseTime), settlingTime: fmtTime(info.settlingTime), overshoot: fmtPercent(info.overshoot),
    steadyStateError: info.steadyStateError ? info.steadyStateError.toExponential(3) : '0',
    gainMargin: margins.gainMarginDB === Infinity ? '∞' : fmtNum(margins.gainMarginDB),
    phaseMargin: isNaN(margins.phaseMargin) ? '—' : fmtNum(margins.phaseMargin),
    stability: document.getElementById('stability-indicator')?.innerText.trim(),
    Kp: state.pidParams.Kp, Ki: state.pidParams.Ki, Kd: state.pidParams.Kd
  };

  try {
    const response = await fetch('http://localhost:8766', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const result = await response.json();
    loading.style.display = 'none';
    if (result.success) renderMarkdown(textDiv, result.analysis);
    else textDiv.innerHTML = `<p style="color:var(--color-unstable)">錯誤: ${result.error}</p>`;
  } catch (err) {
    loading.style.display = 'none';
    textDiv.innerHTML = `<p style="color:var(--color-unstable)">連線失敗: 確保 Bridge Server 已啟動</p>`;
  } finally { btn.disabled = false; }
}

function renderMarkdown(el, text) {
  el.innerHTML = text.replace(/^### (.*$)/gim, '<h4 style="color:var(--text-accent); margin-top:10px;">$1</h4>').replace(/^## (.*$)/gim, '<h3 style="color:var(--text-accent); margin-top:15px;">$1</h3>').replace(/^\* (.*$)/gim, '<li>$1</li>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
}

function syncTransferFunctionInputs() {
  if (!state.plant) return;
  const numInput = document.getElementById('tf-num');
  const denInput = document.getElementById('tf-den');
  if (numInput) numInput.value = state.plant.num.join(', ');
  if (denInput) denInput.value = state.plant.den.join(', ');
}

function captureStateSpaceInputs() {
  state.ssModel = {
    A: document.getElementById('ss-a')?.value ?? '',
    B: document.getElementById('ss-b')?.value ?? '',
    C: document.getElementById('ss-c')?.value ?? '',
    D: document.getElementById('ss-d')?.value ?? '',
  };
}

function saveComparisonSnapshot() {
  if (!state.plant) return;
  const sys = state.showClosedLoop ? (state.closedLoop || state.plant) : state.plant;
  const response = currentResponseData(sys);
  const info = stepInfo(response.t, response.y);
  const snapshot = {
    id: `snap-${Date.now()}`,
    name: `Kp ${state.pidParams.Kp.toFixed(2)} / Ki ${state.pidParams.Ki.toFixed(2)} / Kd ${state.pidParams.Kd.toFixed(2)}`,
    responseType: state.responseType,
    mode: state.showClosedLoop ? 'closed_loop' : 'open_loop',
    controller: { ...state.pidParams },
    metrics: {
      riseTime: info.riseTime,
      settlingTime: info.settlingTime,
      overshoot: info.overshoot,
    },
    response,
  };
  state.comparisonSnapshots = [...state.comparisonSnapshots, snapshot];
  renderSnapshotList();
  renderComparisonChart();
  switchSidebarPanel('compare');
}

function renderSnapshotList() {
  const list = document.getElementById('snapshot-list');
  const empty = document.getElementById('snapshot-empty');
  if (!list || !empty) return;

  list.querySelectorAll('.snapshot-card').forEach((node) => node.remove());
  empty.style.display = state.comparisonSnapshots.length === 0 ? 'block' : 'none';
  setComparisonVisibility();

  state.comparisonSnapshots.forEach((snapshot) => {
    const card = document.createElement('div');
    card.className = 'snapshot-card';
    card.innerHTML = `
      <div class="snapshot-top">
        <div class="snapshot-name">${snapshot.name}</div>
        <div style="font-size:11px; color:var(--text-muted);">${snapshot.responseType}</div>
      </div>
      <div class="snapshot-meta">
        <div>Rise<br><strong>${fmtTime(snapshot.metrics.riseTime)}</strong></div>
        <div>Settling<br><strong>${fmtTime(snapshot.metrics.settlingTime)}</strong></div>
        <div>Overshoot<br><strong>${fmtPercent(snapshot.metrics.overshoot)}</strong></div>
      </div>
      <div class="snapshot-actions">
        <button class="btn btn-sm" data-action="apply">Apply</button>
        <button class="btn btn-sm" data-action="delete">Delete</button>
      </div>
    `;
    card.querySelector('[data-action="apply"]').addEventListener('click', () => applySnapshot(snapshot.id));
    card.querySelector('[data-action="delete"]').addEventListener('click', () => deleteSnapshot(snapshot.id));
    list.appendChild(card);
  });
}

function applySnapshot(snapshotId) {
  const snapshot = state.comparisonSnapshots.find((item) => item.id === snapshotId);
  if (!snapshot) return;
  state.responseType = snapshot.responseType;
  const responseSelect = document.getElementById('response-type');
  if (responseSelect) responseSelect.value = snapshot.responseType;
  ['Kp', 'Ki', 'Kd'].forEach((param) => {
    state.pidParams[param] = snapshot.controller[param];
    document.getElementById(`pid-${param}`).value = snapshot.controller[param];
    document.getElementById(`pid-${param}-val`).textContent = snapshot.controller[param].toFixed(2);
  });
  updateController();
}

function deleteSnapshot(snapshotId) {
  state.comparisonSnapshots = state.comparisonSnapshots.filter((item) => item.id !== snapshotId);
  renderSnapshotList();
  renderComparisonChart();
}

function clearSnapshots() {
  state.comparisonSnapshots = [];
  renderSnapshotList();
  renderComparisonChart();
}

function exportComparisonSnapshots() {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    snapshots: state.comparisonSnapshots,
  };
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  downloadFile(`control-compare-${timestamp}.json`, 'application/json;charset=utf-8', JSON.stringify(payload, null, 2));
}

function saveProjectFile() {
  captureStateSpaceInputs();
  const payload = buildProjectPayload();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  downloadFile(`control-project-${timestamp}.json`, 'application/json;charset=utf-8', JSON.stringify(payload, null, 2));
}

async function loadProjectFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    applyProjectPayload(data);
    clearError();
  } catch (err) {
    showError(`專案載入失敗: ${err.message}`);
  } finally {
    event.target.value = '';
  }
}

function buildProjectPayload() {
  captureStateSpaceInputs();
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    systemType: state.systemType,
    responseType: state.responseType,
    showClosedLoop: state.showClosedLoop,
    transferFunction: {
      numerator: document.getElementById('tf-num')?.value ?? '',
      denominator: document.getElementById('tf-den')?.value ?? '',
    },
    stateSpace: { ...state.ssModel },
    controller: { ...state.pidParams },
    comparisonSnapshots: state.comparisonSnapshots,
    theme: state.theme,
  };
}

function applyProjectPayload(data) {
  if (!data || typeof data !== 'object') throw new Error('專案格式無效');

  state.systemType = data.systemType === 'ss' ? 'ss' : 'tf';
  state.responseType = data.responseType || 'step';
  state.showClosedLoop = Boolean(data.showClosedLoop);
  state.comparisonSnapshots = Array.isArray(data.comparisonSnapshots) ? data.comparisonSnapshots : [];

  const tf = data.transferFunction || {};
  const ss = data.stateSpace || {};
  const controller = data.controller || {};

  document.getElementById('tf-num').value = tf.numerator || '1';
  document.getElementById('tf-den').value = tf.denominator || '1, 3, 2';
  document.getElementById('ss-a').value = ss.A || state.ssModel.A;
  document.getElementById('ss-b').value = ss.B || state.ssModel.B;
  document.getElementById('ss-c').value = ss.C || state.ssModel.C;
  document.getElementById('ss-d').value = ss.D || state.ssModel.D;

  ['Kp', 'Ki', 'Kd'].forEach((param) => {
    if (typeof controller[param] === 'number') {
      state.pidParams[param] = controller[param];
      document.getElementById(`pid-${param}`).value = controller[param];
      document.getElementById(`pid-${param}-val`).textContent = controller[param].toFixed(2);
    }
  });

  const responseSelect = document.getElementById('response-type');
  if (responseSelect) responseSelect.value = state.responseType;
  const loopToggle = document.getElementById('cl-toggle');
  if (loopToggle) loopToggle.checked = state.showClosedLoop;

  document.querySelectorAll('.sys-tab').forEach((tab) => {
    const active = tab.dataset.type === state.systemType;
    tab.classList.toggle('active', active);
  });
  document.querySelectorAll('.sys-input-section').forEach((section) => {
    section.style.display = 'none';
  });
  document.getElementById(`sys-${state.systemType}`)?.style.setProperty('display', 'block');

  if (data.theme && data.theme !== state.theme) {
    toggleTheme();
  }

  captureStateSpaceInputs();
  renderSnapshotList();
  updateSystem();
}

function exportCurrentResult(format) {
  if (!state.plant) return;
  const sys = state.showClosedLoop ? (state.closedLoop || state.plant) : state.plant;
  const response = currentResponseData(sys);
  const margins = stabilityMargins(state.openLoop || state.plant);
  const info = stepInfo(response.t, response.y);
  const payload = {
    systemType: state.systemType,
    responseType: state.responseType,
    mode: state.showClosedLoop ? 'closed_loop' : 'open_loop',
    transferFunction: {
      numerator: state.plant.num,
      denominator: state.plant.den,
      formula: state.plant.toString(),
    },
    controller: { ...state.pidParams },
    metrics: {
      gainMarginDB: margins.gainMarginDB,
      phaseMargin: margins.phaseMargin,
      riseTime: info.riseTime,
      settlingTime: info.settlingTime,
      overshoot: info.overshoot,
      steadyStateError: info.steadyStateError ?? null,
    },
    response,
  };

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  if (format === 'csv') {
    const rows = ['time,response'];
    response.t.forEach((t, idx) => rows.push(`${t},${response.y[idx]}`));
    downloadFile(`control-response-${timestamp}.csv`, 'text/csv;charset=utf-8', rows.join('\n'));
    return;
  }
  downloadFile(`control-analysis-${timestamp}.json`, 'application/json;charset=utf-8', JSON.stringify(payload, null, 2));
}

function downloadFile(name, type, content) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// ============================================================
// HELPERS
// ============================================================
function debounce(fn, ms) { let timeout; return (...args) => { clearTimeout(timeout); timeout = setTimeout(() => fn.apply(this, args), ms); }; }
function showError(msg) { const el = document.getElementById('error-msg'); if (el) { el.textContent = msg; el.style.display = 'block'; } }
function clearError() { const el = document.getElementById('error-msg'); if (el) { el.textContent = ''; el.style.display = 'none'; } }

window.toggleTheme = toggleTheme;
