import { TransferFunction } from './control/transfer-function.js';
import { PIDController } from './control/pid.js';
import { stepResponse } from './analysis/time-response.js';
import { bodeData } from './analysis/frequency-response.js';
import { rootLocusData } from './analysis/root-locus.js';
import { stabilityMargins, stepInfo } from './control/stability.js';
import { parsePolyString, fmtNum, fmtDeg, fmtDB, fmtTime, fmtPercent } from './utils/format.js';
import { Complex } from './math/complex.js';
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

  document.querySelectorAll('.sys-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      document.querySelectorAll('.sys-tab').forEach(t => t.classList.remove('active'));
      e.target.classList.add('active');
      document.querySelectorAll('.sys-input-section').forEach(s => s.style.display = 'none');
      document.getElementById(`sys-${e.target.dataset.type}`)?.style.setProperty('display', 'block');
    });
  });

  document.getElementById('tf-num')?.addEventListener('input', debounce(updateSystem, 300));
  document.getElementById('tf-den')?.addEventListener('input', debounce(updateSystem, 300));

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
    refreshAllCharts();
    updateStabilityPanel();
  });

  document.getElementById('btn-ai-advisor')?.addEventListener('click', requestAIAdvice);
  document.getElementById('btn-apply')?.addEventListener('click', updateSystem);

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
    if (dashboard) dashboard.style.display = 'grid';
    if (editor) editor.style.display = 'none';
    btnDash?.classList.add('active');
    btnEdit?.classList.remove('active');
    refreshAllCharts();
    updateStabilityPanel();
  }
}

// ============================================================
// CORE LOGIC
// ============================================================
function updateSystem() {
  const numInput = document.getElementById('tf-num');
  const denInput = document.getElementById('tf-den');
  if (!numInput || !denInput) return;

  try {
    const num = parsePolyString(numInput.value);
    const den = parsePolyString(denInput.value);
    if (!num || !den) throw new Error("無效的係數輸入");

    state.plant = new TransferFunction(num, den);
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

    refreshAllCharts();
    updateStabilityPanel();
  } catch (err) {
    console.error("控制器更新失敗:", err);
  }
}

function refreshAllCharts() {
  if (!state.plant) return;
  const sys = state.showClosedLoop ? (state.closedLoop || state.plant) : state.plant;

  renderStepResponse(sys);
  renderBodePlot(state.openLoop || state.plant);
  renderRootLocus(state.plant);
  renderPoleZeroMap(sys);
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

    const resp = stepResponse(sys);
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

function renderStepResponse(sys) {
  const resp = stepResponse(sys);
  const trace = { x: resp.t, y: resp.y, type: 'scatter', mode: 'lines', line: { color: getCSS('--color-accent'), width: 2 }, fill: 'tozeroy', fillcolor: 'rgba(99, 102, 241, 0.05)' };
  Plotly.react('chart-step', [trace], PLOTLY_LAYOUT_BASE(), { responsive: true, displayModeBar: false });
}

function renderBodePlot(sys) {
  const data = bodeData(sys);
  const mTrace = { x: data.omega, y: data.magDB, type: 'scatter', mode: 'lines', line: { color: getCSS('--color-accent'), width: 2 } };
  const pTrace = { x: data.omega, y: data.phaseDeg, type: 'scatter', mode: 'lines', line: { color: getCSS('--color-secondary'), width: 2 }, yaxis: 'y2' };
  const layout = PLOTLY_LAYOUT_BASE();
  layout.xaxis.type = 'log';
  layout.yaxis2 = { overlaying: 'y', side: 'right', gridcolor: 'transparent' };
  Plotly.react('chart-bode', [mTrace, pTrace], layout, { responsive: true, displayModeBar: false });
}

function renderRootLocus(sys) {
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
  const traces = branches.map(b => ({ x: b.re, y: b.im, type: 'scatter', mode: 'lines', line: { width: 1.5, color: getCSS('--color-accent'), opacity: 0.6 } }));
  Plotly.react('chart-rlocus', traces, PLOTLY_LAYOUT_BASE(), { responsive: true, displayModeBar: false });
}

function renderPoleZeroMap(sys) {
  const pList = sys.poles();
  const zList = sys.zeros();
  const pTrace = { x: pList.map(p => p.re), y: pList.map(p => p.im), type: 'scatter', mode: 'markers', marker: { symbol: 'x', size: 10, color: getCSS('--color-unstable') } };
  const zTrace = { x: zList.map(z => z.re), y: zList.map(z => z.im), type: 'scatter', mode: 'markers', marker: { symbol: 'circle-open', size: 10, color: getCSS('--color-accent') } };
  Plotly.react('chart-pzmap', [pTrace, zTrace], PLOTLY_LAYOUT_BASE(), { responsive: true, displayModeBar: false });
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
  const resp = stepResponse(sys);
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

// ============================================================
// HELPERS
// ============================================================
function debounce(fn, ms) { let timeout; return (...args) => { clearTimeout(timeout); timeout = setTimeout(() => fn.apply(this, args), ms); }; }
function showError(msg) { const el = document.getElementById('error-msg'); if (el) { el.textContent = msg; el.style.display = 'block'; } }
function clearError() { const el = document.getElementById('error-msg'); if (el) { el.textContent = ''; el.style.display = 'none'; } }

window.toggleTheme = toggleTheme;
