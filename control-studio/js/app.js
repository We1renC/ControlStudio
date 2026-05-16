import { TransferFunction } from './control/transfer-function.js';
import { DiscreteTransferFunction } from './control/discrete-transfer-function.js';
import { parseMatrixInput, stateSpaceToTransferFunction, controllabilityMatrix, observabilityMatrix } from './control/state-space.js?v=p5';
import { matRank } from './math/matrix.js?v=p5';
import { PIDController } from './control/pid.js';
import { compensatorDescription, designLagCompensator, designLeadCompensator, leadLagTransferFunction, normalizeCompensatorConfig } from './control/compensator.js?v=control-lag-1';
import { impulseResponse, rampResponse, stepResponse } from './analysis/time-response.js';
import { discreteStepResponse } from './analysis/discrete-response.js';
import { bodeData, nyquistData, autoFreqRange, nicholsData, nyquistEncirclements } from './analysis/frequency-response.js';
import { discreteBodeData } from './analysis/discrete-frequency-response.js?v=p5';
import { rootLocusData, rootLocusAsymptotes, rootLocusBreakPoints, rootLocusJwCrossings, sortRootLocusBranches } from './analysis/root-locus.js?v=p4';
import { stabilityMargins, stepInfo, routhTable } from './control/stability.js';
import { parsePolyString, fmtNum, fmtDeg, fmtDB, fmtTime, fmtPercent } from './utils/format.js';
import { zpkToTransferFunction, parseRootsString } from './control/zpk.js';
import { c2dTustin, c2dZOH } from './control/c2d.js?v=p5';
import { specsToTargetPoles, designLeadForPM, deadbeatGain } from './control/design.js?v=p5';
import { polyadd, polyscale, polyroots } from './math/polynomial.js?v=p4';
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
  compensator: { mode: 'none', gain: 1, tau: 1, alpha: 0.2 },
  controllerDesign: { source: 'manual', preset: null, leadTarget: null, lagTarget: null },
  showClosedLoop: true,
  domain: 's',
  sampleTime: 0.1,
  systemType: 'tf',
  responseType: 'step',
  activePlot: 'step',
  simulationConfig: {
    duration: null,
    sampleCount: 1000,
    amplitude: 1,
    frequency: 1,
    pulseWidth: 1,
    disturbanceAmplitude: 0,
    disturbanceStart: 0,
    disturbanceType: 'none',
    initialState: [],
  },
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

const SESSION_STORAGE_KEY = 'control-studio-session-v1';

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initEventListeners();
  state.editor = new BlockEditor();

  setComparisonVisibility();
  const restored = restoreSessionFromStorage();
  if (!restored) {
    document.getElementById('tf-num').value = '1';
    document.getElementById('tf-den').value = '1, 3, 2';
    syncSimulationConfigInputs();
    updateSystemSetupCopy();
    updateSystem();
  }
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
      state.domain = state.systemType === 'dtf' ? 'z' : 's';
      document.querySelectorAll('.sys-tab').forEach(t => t.classList.remove('active'));
      e.target.classList.add('active');
      document.querySelectorAll('.sys-input-section').forEach(s => s.style.display = 'none');
      document.getElementById(`sys-${e.target.dataset.type}`)?.style.setProperty('display', 'block');
      updateDomainUI();
      updateSystemSetupCopy();
    });
  });
  ['zpk-zeros', 'zpk-poles', 'zpk-gain'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', debounce(updateSystem, 300));
  });

  ['dtf-num', 'dtf-den', 'dtf-ts'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', debounce(updateSystem, 300));
  });

  document.getElementById('btn-c2d')?.addEventListener('click', () => {
    if (!state.plant || state.domain !== 's') return;
    const Ts = Number(document.getElementById('c2d-ts')?.value);
    const method = document.getElementById('c2d-method')?.value || 'tustin';
    try {
      const disc = method === 'zoh' ? c2dZOH(state.plant, Ts) : c2dTustin(state.plant, Ts);
      state.plant = disc;
      state.domain = 'z';
      state.sampleTime = Ts;
      state.systemType = 'dtf';
      document.getElementById('dtf-num').value = disc.num.map((c) => parseFloat(c.toFixed(6))).join(', ');
      document.getElementById('dtf-den').value = disc.den.map((c) => parseFloat(c.toFixed(6))).join(', ');
      document.getElementById('dtf-ts').value = Ts;
      document.querySelectorAll('.sys-tab').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.sys-tab').forEach((t) => { if (t.dataset.type === 'dtf') t.classList.add('active'); });
      document.querySelectorAll('.sys-input-section').forEach((s) => { s.style.display = 'none'; });
      document.getElementById('sys-dtf').style.display = 'block';
      updateDomainUI();
      refreshAllCharts();
      clearError();
    } catch (err) {
      showError(err.message);
    }
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
        state.controllerDesign = { ...state.controllerDesign, source: 'manual', preset: null };
        const valDisplay = document.getElementById(`pid-${param}-val`);
        if (valDisplay) valDisplay.textContent = val.toFixed(2);
        updateController();
      });
    }
  });

  ['comp-mode', 'comp-gain', 'comp-tau', 'comp-alpha'].forEach((id) => {
    const handler = debounce(() => {
      readCompensatorInputs();
      state.controllerDesign = { ...state.controllerDesign, source: 'manual', leadTarget: null, lagTarget: null };
      updateCompensatorVisibility();
      updateController();
    }, 150);
    document.getElementById(id)?.addEventListener('input', handler);
    document.getElementById(id)?.addEventListener('change', handler);
  });

  document.getElementById('cl-toggle')?.addEventListener('change', (e) => {
    state.showClosedLoop = e.target.checked;
    updateSystemSetupCopy();
    refreshAllCharts();
    updateStabilityPanel();
  });

  document.getElementById('response-type')?.addEventListener('change', (e) => {
    state.responseType = e.target.value;
    saveSessionToStorage();
    refreshAllCharts();
    updateStabilityPanel();
  });

  ['sim-duration', 'sim-samples', 'sim-amplitude', 'sim-frequency', 'sim-pulse-width', 'sim-disturbance', 'sim-disturbance-start', 'sim-initial-state', 'sim-disturbance-type'].forEach((id) => {
    const handler = debounce(() => {
      readSimulationConfigInputs();
      saveSessionToStorage();
      refreshAllCharts();
      updateStabilityPanel();
      renderComparisonSummary();
    }, 200);
    document.getElementById(id)?.addEventListener('input', handler);
    document.getElementById(id)?.addEventListener('change', handler);
  });

  document.getElementById('btn-ai-advisor')?.addEventListener('click', requestAIAdvice);
  document.getElementById('btn-apply')?.addEventListener('click', updateSystem);
  document.getElementById('rl-k-slider')?.addEventListener('input', (e) => updateRlocusGain(parseFloat(e.target.value)));
  document.getElementById('btn-design-poles')?.addEventListener('click', computeDesignTargetPoles);
  document.getElementById('btn-design-lead')?.addEventListener('click', computeDesignLeadFromPM);
  document.getElementById('btn-apply-design-lead')?.addEventListener('click', applyDesignLeadToController);
  document.getElementById('btn-design-deadbeat')?.addEventListener('click', computeDeadbeat);
  document.getElementById('btn-apply-rlocus-k')?.addEventListener('click', applyRlocusKToController);
  document.getElementById('btn-copy-deadbeat-k')?.addEventListener('click', copyDeadbeatGains);
  document.getElementById('btn-apply-pid-preset')?.addEventListener('click', applyPIDPreset);
  document.getElementById('btn-apply-lead-helper')?.addEventListener('click', applyLeadHelper);
  document.getElementById('btn-apply-lag-helper')?.addEventListener('click', applyLagHelper);
  document.getElementById('btn-save-project')?.addEventListener('click', saveProjectFile);
  document.getElementById('btn-load-project')?.addEventListener('click', () => document.getElementById('project-file-input')?.click());
  document.getElementById('btn-export-json')?.addEventListener('click', () => exportCurrentResult('json'));
  document.getElementById('btn-export-csv')?.addEventListener('click', () => exportCurrentResult('csv'));
  document.getElementById('btn-export-png')?.addEventListener('click', exportChartPNG);
  document.getElementById('project-file-input')?.addEventListener('change', loadProjectFile);
  document.getElementById('btn-save-snapshot')?.addEventListener('click', saveComparisonSnapshot);
  document.getElementById('btn-clear-snapshots')?.addEventListener('click', clearSnapshots);
  document.getElementById('btn-export-compare')?.addEventListener('click', exportComparisonSnapshots);
  document.getElementById('btn-restore-session')?.addEventListener('click', () => restoreSessionFromStorage(true));
  document.getElementById('btn-clear-session')?.addEventListener('click', clearSessionStorage);

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
  saveSessionToStorage();
}

function switchSidebarPanel(panelName) {
  document.querySelectorAll('.sidebar-tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.sidebar === panelName);
  });
  document.querySelectorAll('.sidebar-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === `panel-${panelName}`);
  });
  saveSessionToStorage();
}

function switchPlot(plotName) {
  state.activePlot = plotName;
  document.querySelectorAll('.plot-tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.plot === plotName);
  });
  if (!state.plant) return;
  const sys = state.showClosedLoop ? (state.closedLoop || state.plant) : state.plant;
  renderActivePlot(sys);
  saveSessionToStorage();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function waveformLabel(type) {
  const labels = {
    step: 'Step',
    impulse: 'Impulse',
    ramp: 'Ramp',
    sine: 'Sine',
    square: 'Square',
    pulse: 'Pulse',
    none: 'None',
  };
  return labels[type] || type;
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
  const fM = (m) => m.map((row) => row.map((v) => fmtNum(v, 2)).join('\t')).join('\n');
  const A = fM(matrices.A);
  const B = fM(matrices.B);
  const C = fM(matrices.C);
  const D = fM(matrices.D);

  let rankStr = '';
  try {
    const rC = matRank(controllabilityMatrix(matrices.A, matrices.B));
    const rO = matRank(observabilityMatrix(matrices.A, matrices.C));
    const n = matrices.A.length;
    const isControllable = rC === n ? '<span style="color:var(--color-stable)">Yes</span>' : '<span style="color:var(--color-unstable)">No</span>';
    const isObservable = rO === n ? '<span style="color:var(--color-stable)">Yes</span>' : '<span style="color:var(--color-unstable)">No</span>';
    rankStr = `<div class="equation-note" style="margin-top:6px; background:rgba(15,17,23,0.3); padding:4px 8px; border-radius:4px; display:flex; justify-content:space-between;">
      <span>Controllable: ${isControllable} (Rank: ${rC}/${n})</span>
      <span>Observable: ${isObservable} (Rank: ${rO}/${n})</span>
    </div>`;
  } catch (e) {
    rankStr = `<div class="equation-note" style="margin-top:6px;">Rank computation failed</div>`;
  }

  return `
    <div class="equation-stack">
      <div style="font-size:11px; font-weight:bold; color:var(--text-muted)">STATE SPACE MODEL</div>
      <div class="matrix-stack">
        <div class="matrix-row"><span class="matrix-name">A =</span><span class="matrix-value">${A}</span></div>
        <div class="matrix-row"><span class="matrix-name">B =</span><span class="matrix-value">${B}</span></div>
        <div class="matrix-row"><span class="matrix-name">C =</span><span class="matrix-value">${C}</span></div>
        <div class="matrix-row"><span class="matrix-name">D =</span><span class="matrix-value">${D}</span></div>
      </div>
      ${rankStr}
    </div>
  `;
}

function syncPIDSliders() {
  ['Kp', 'Ki', 'Kd'].forEach((param) => {
    const input = document.getElementById(`pid-${param}`);
    const value = document.getElementById(`pid-${param}-val`);
    if (input) {
      const currentMax = Number(input.max);
      if (Number.isFinite(currentMax) && state.pidParams[param] > currentMax) input.max = state.pidParams[param] * 1.25;
      input.value = state.pidParams[param];
    }
    if (value) value.textContent = state.pidParams[param].toFixed(2);
  });
}

function setPIDFromController(controller, source) {
  state.pidParams = {
    ...state.pidParams,
    Kp: controller.Kp,
    Ki: controller.Ki,
    Kd: controller.Kd,
  };
  state.controllerDesign = { ...state.controllerDesign, source, preset: source };
  syncPIDSliders();
  updateController();
}

function readRequiredPositiveNumber(id, label) {
  const value = Number(document.getElementById(id)?.value);
  if (!Number.isFinite(value) || value <= 0) {
    setFieldError(id, `${label} 必須大於 0`);
    throw new Error(`${label} 必須大於 0`);
  }
  return value;
}

function applyPIDPreset() {
  try {
    clearFieldErrors();
    const preset = document.getElementById('pid-preset')?.value || 'zn-pid';
    if (preset.startsWith('zn-')) {
      const Ku = readRequiredPositiveNumber('preset-ku', 'Ku');
      const Tu = readRequiredPositiveNumber('preset-tu', 'Tu');
      const type = preset === 'zn-p' ? 'P' : preset === 'zn-pi' ? 'PI' : 'PID';
      setPIDFromController(PIDController.zieglerNichols(Ku, Tu, type), `ziegler-nichols-${type.toLowerCase()}`);
      clearError();
      return;
    }

    const plantK = readRequiredPositiveNumber('preset-plant-k', 'FOPDT K');
    const [tau, td] = parsePolyString(document.getElementById('preset-fopdt')?.value || '') || [];
    if (!Number.isFinite(tau) || tau <= 0 || !Number.isFinite(td) || td <= 0) {
      setFieldError('preset-fopdt', '請輸入 tau, td，且都必須大於 0');
      throw new Error('FOPDT tau/td 必須大於 0');
    }
    setPIDFromController(PIDController.cohenCoon(plantK, tau, td), 'cohen-coon');
    clearError();
  } catch (err) {
    showError(err.message);
    scheduleSmokeDiagnostics();
  }
}

let _pendingLeadDesign = null;

function computeDesignTargetPoles() {
  const out = document.getElementById('design-pole-out');
  try {
    const overshoot = parseFloat(document.getElementById('design-os').value);
    const settlingTime = parseFloat(document.getElementById('design-ts').value);
    const result = specsToTargetPoles({ overshoot, settlingTime });
    const wd = result.omegaD.toFixed(4);
    out.style.display = 'block';
    out.innerHTML = [
      `<div style="color:var(--color-accent);font-weight:700;">ζ = ${result.zeta.toFixed(4)}</div>`,
      `<div>σ = ${result.sigma.toFixed(4)}  (real part)</div>`,
      `<div>ωn = ${result.omegaN.toFixed(4)}  rad/s</div>`,
      `<div>ωd = ${wd}  rad/s</div>`,
      `<div style="margin-top:6px;color:var(--color-stable);">Target poles:</div>`,
      `<div>s = ${(-result.sigma).toFixed(4)} ± j${wd}</div>`,
      `<div style="margin-top:8px;color:var(--text-muted);font-size:10px;">💡 前往 Root Locus 圖，拖曳 K 滑桿直到閉迴路極點接近上方目標位置，再按「套用 K」回寫控制器。</div>`,
    ].join('');
    clearError();
  } catch (err) {
    out.style.display = 'block';
    out.style.color = 'var(--color-unstable)';
    out.textContent = err.message;
  }
}

function computeDesignLeadFromPM() {
  const out = document.getElementById('design-lead-out');
  const applyBtn = document.getElementById('btn-apply-design-lead');
  if (!state.plant) {
    out.style.display = 'block';
    out.style.color = 'var(--color-unstable)';
    out.textContent = '請先在 System 分頁套用 plant。';
    applyBtn.style.display = 'none';
    return;
  }
  try {
    const targetPM = parseFloat(document.getElementById('design-pm').value);
    const safetyMargin = parseFloat(document.getElementById('design-safety').value) || 0;
    const r = designLeadForPM(state.plant, { targetPM, safetyMargin });
    out.style.display = 'block';
    out.style.color = '';
    if (r.skipped) {
      out.innerHTML = `<div style="color:var(--color-stable);">已達標 (${r.reason})</div><div>current PM ≈ ${Number.isFinite(r.currentPM) ? r.currentPM.toFixed(2) + '°' : '∞'}</div>`;
      applyBtn.style.display = 'none';
      _pendingLeadDesign = null;
      return;
    }
    out.innerHTML = [
      `<div>current PM = ${r.currentPM.toFixed(2)}° @ ωc = ${r.crossoverFreq.toFixed(3)}</div>`,
      `<div style="color:var(--color-accent);">phase boost = ${r.phaseBoostDeg.toFixed(2)}°</div>`,
      `<div>α = ${r.alpha.toFixed(4)}   τ = ${r.tau.toFixed(4)}   gain = ${r.gain.toFixed(4)}</div>`,
      `<div style="color:var(--color-stable);margin-top:4px;">achieved PM ≈ ${r.achievedPM.toFixed(2)}°</div>`,
    ].join('');
    _pendingLeadDesign = r;
    applyBtn.style.display = 'inline-flex';
    clearError();
  } catch (err) {
    out.style.display = 'block';
    out.style.color = 'var(--color-unstable)';
    out.textContent = err.message;
    applyBtn.style.display = 'none';
    _pendingLeadDesign = null;
  }
}

let _lastDeadbeatResult = null;

function computeDeadbeat() {
  const out = document.getElementById('design-deadbeat-out');
  const copyBtn = document.getElementById('btn-copy-deadbeat-k');
  if (!state.plant) {
    out.style.display = 'block';
    out.style.color = 'var(--color-unstable)';
    out.textContent = '請先在 System 分頁套用 plant。';
    if (copyBtn) copyBtn.style.display = 'none';
    return;
  }
  try {
    const ts = parseFloat(document.getElementById('design-deadbeat-ts').value);
    const result = deadbeatGain(state.plant, ts);
    _lastDeadbeatResult = result;
    out.style.display = 'block';
    out.style.color = '';
    const kStr = result.K.map((v, i) => `k${i} = ${v.toFixed(4)}`).join(',  ');
    out.innerHTML = [
      `<div style="color:var(--color-accent);font-weight:700;">State Feedback K (Ackermann)</div>`,
      `<div style="margin:4px 0;">${kStr}</div>`,
      `<div style="color:var(--color-stable);margin-top:4px;">→ 閉迴路特徵值全部在 z=0</div>`,
      `<div>最多 ${result.K.length} 個取樣步驟 = ${(result.K.length * result.Ts).toFixed(3)} s 後穩定</div>`,
      `<div style="margin-top:6px;color:var(--text-muted);font-size:10px;">⚠ 此為狀態回授增益（State Feedback），需搭配完整狀態估測器（觀測器）實作，無法直接套用為 PID 參數。</div>`,
    ].join('');
    if (copyBtn) copyBtn.style.display = 'block';
  } catch (err) {
    out.style.display = 'block';
    out.style.color = 'var(--color-unstable)';
    out.textContent = err.message;
    _lastDeadbeatResult = null;
    if (copyBtn) copyBtn.style.display = 'none';
  }
}

function copyDeadbeatGains() {
  if (!_lastDeadbeatResult) return;
  const text = `K = [${_lastDeadbeatResult.K.map(v => v.toFixed(6)).join(', ')}]  (Ts=${_lastDeadbeatResult.Ts}s)`;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('btn-copy-deadbeat-k');
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = '✓ Copied!';
      setTimeout(() => { btn.textContent = orig; }, 1500);
    }
  }).catch(() => {/* ignore clipboard errors */});
}

function applyDesignLeadToController() {
  if (!_pendingLeadDesign) return;
  const d = _pendingLeadDesign;
  state.compensator = { mode: 'lead', gain: d.gain, tau: d.tau, alpha: d.alpha };
  state.controllerDesign = {
    ...state.controllerDesign,
    source: 'design-pm',
    leadTarget: { targetPM: d.targetPM, phaseBoostDeg: d.phaseBoostDeg, crossoverFreq: d.crossoverFreq },
    lagTarget: null,
  };
  syncCompensatorInputs();
  updateController();
}

function applyLeadHelper() {
  try {
    clearFieldErrors();
    const phaseBoostDeg = readRequiredPositiveNumber('lead-target-phase', 'Target PM boost');
    const crossoverFreq = readRequiredPositiveNumber('lead-target-wc', 'Crossover wc');
    const config = designLeadCompensator({ phaseBoostDeg, crossoverFreq });
    state.compensator = config;
    state.controllerDesign = {
      ...state.controllerDesign,
      source: 'lead-helper',
      leadTarget: { phaseBoostDeg, crossoverFreq },
      lagTarget: null,
    };
    syncCompensatorInputs();
    updateController();
    clearError();
  } catch (err) {
    const message = err.message.includes('phase boost') ? 'Target PM boost 必須介於 0 到 90 度之間' : err.message;
    if (err.message.includes('phase boost')) setFieldError('lead-target-phase', message);
    if (err.message.includes('crossover')) setFieldError('lead-target-wc', message);
    showError(message);
    scheduleSmokeDiagnostics();
  }
}

function applyLagHelper() {
  try {
    clearFieldErrors();
    const improvementFactor = readRequiredPositiveNumber('lag-improvement', 'Lag improvement');
    const crossoverFreq = readRequiredPositiveNumber('lag-target-wc', 'Crossover wc');
    const config = designLagCompensator({ improvementFactor, crossoverFreq });
    state.compensator = config;
    state.controllerDesign = {
      ...state.controllerDesign,
      source: 'lag-helper',
      leadTarget: null,
      lagTarget: { improvementFactor, crossoverFreq },
    };
    syncCompensatorInputs();
    updateController();
    clearError();
  } catch (err) {
    const message = err.message.includes('improvement') ? 'Lag improvement 必須大於 1' : err.message;
    if (err.message.includes('improvement')) setFieldError('lag-improvement', message);
    if (err.message.includes('crossover')) setFieldError('lag-target-wc', message);
    showError(message);
    scheduleSmokeDiagnostics();
  }
}

function readCompensatorInputs() {
  state.compensator = normalizeCompensatorConfig({
    mode: document.getElementById('comp-mode')?.value || 'none',
    gain: Number(document.getElementById('comp-gain')?.value ?? state.compensator.gain),
    tau: Number(document.getElementById('comp-tau')?.value ?? state.compensator.tau),
    alpha: Number(document.getElementById('comp-alpha')?.value ?? state.compensator.alpha),
  });
}

function syncCompensatorInputs() {
  const config = normalizeCompensatorConfig(state.compensator);
  state.compensator = config;
  const mode = document.getElementById('comp-mode');
  const gain = document.getElementById('comp-gain');
  const tau = document.getElementById('comp-tau');
  const alpha = document.getElementById('comp-alpha');
  if (mode) mode.value = config.mode;
  if (gain) gain.value = config.gain;
  if (tau) tau.value = config.tau;
  if (alpha) alpha.value = config.alpha;
  updateCompensatorVisibility();
}

function parseStateMatrixField(id, expectedCols = null) {
  try {
    return parseMatrixInput(document.getElementById(id)?.value, expectedCols);
  } catch (err) {
    setFieldError(id, err.message);
    throw err;
  }
}

function isZeroPolynomial(poly) {
  return !poly || poly.every((value) => Math.abs(value) < 1e-15);
}

function readPositiveNumberField(id, label) {
  const value = Number(document.getElementById(id)?.value);
  if (!Number.isFinite(value) || value <= 0) {
    setFieldError(id, `${label} 必須大於 0`);
    throw new Error(`${label} 必須大於 0`);
  }
  return value;
}

function validateCompensatorInputs() {
  const mode = document.getElementById('comp-mode')?.value || 'none';
  if (mode === 'none') return;
  readPositiveNumberField('comp-gain', 'Compensator gain');
  readPositiveNumberField('comp-tau', 'Time constant tau');
  const alpha = readPositiveNumberField('comp-alpha', 'Alpha');
  if (mode === 'lead' && alpha >= 1) {
    setFieldError('comp-alpha', 'Lead compensator 需要 0 < alpha < 1');
    throw new Error('Lead compensator 需要 0 < alpha < 1');
  }
  if (mode === 'lag' && alpha <= 1) {
    setFieldError('comp-alpha', 'Lag compensator 需要 alpha > 1');
    throw new Error('Lag compensator 需要 alpha > 1');
  }
}

function updateCompensatorVisibility() {
  const fields = document.getElementById('comp-fields');
  const mode = document.getElementById('comp-mode')?.value || state.compensator.mode;
  if (fields) fields.style.display = mode === 'none' ? 'none' : 'block';
}

function parseInitialStateInput(value) {
  const text = String(value ?? '').trim();
  if (!text) return [];
  return text.split(/[,\s]+/).filter(Boolean).map((item) => {
    const parsed = Number(item);
    return Number.isFinite(parsed) ? parsed : 0;
  });
}

function readSimulationConfigInputs() {
  const durationValue = document.getElementById('sim-duration')?.value ?? '';
  const parsedDuration = Number(durationValue);
  const sampleCountValue = Number(document.getElementById('sim-samples')?.value ?? state.simulationConfig.sampleCount);
  const amplitudeValue = Number(document.getElementById('sim-amplitude')?.value ?? state.simulationConfig.amplitude);
  const frequencyValue = Number(document.getElementById('sim-frequency')?.value ?? state.simulationConfig.frequency);
  const pulseWidthValue = Number(document.getElementById('sim-pulse-width')?.value ?? state.simulationConfig.pulseWidth);
  const disturbanceValue = Number(document.getElementById('sim-disturbance')?.value ?? state.simulationConfig.disturbanceAmplitude);
  const disturbanceStartValue = Number(document.getElementById('sim-disturbance-start')?.value ?? state.simulationConfig.disturbanceStart);
  state.simulationConfig = {
    duration: durationValue === '' || !Number.isFinite(parsedDuration) ? null : Math.max(0.1, parsedDuration),
    sampleCount: Number.isFinite(sampleCountValue) ? Math.max(10, Math.floor(sampleCountValue)) : 1000,
    amplitude: Number.isFinite(amplitudeValue) ? amplitudeValue : 1,
    frequency: Number.isFinite(frequencyValue) ? Math.max(0.01, frequencyValue) : 1,
    pulseWidth: Number.isFinite(pulseWidthValue) ? Math.max(0.01, pulseWidthValue) : 1,
    disturbanceAmplitude: Number.isFinite(disturbanceValue) ? disturbanceValue : 0,
    disturbanceStart: Number.isFinite(disturbanceStartValue) ? Math.max(0, disturbanceStartValue) : 0,
    disturbanceType: document.getElementById('sim-disturbance-type')?.value || 'none',
    initialState: parseInitialStateInput(document.getElementById('sim-initial-state')?.value),
  };
}

function syncSimulationConfigInputs() {
  document.getElementById('sim-duration').value = state.simulationConfig.duration == null ? '' : state.simulationConfig.duration;
  document.getElementById('sim-samples').value = state.simulationConfig.sampleCount;
  document.getElementById('sim-amplitude').value = state.simulationConfig.amplitude;
  document.getElementById('sim-frequency').value = state.simulationConfig.frequency;
  document.getElementById('sim-pulse-width').value = state.simulationConfig.pulseWidth;
  document.getElementById('sim-disturbance').value = state.simulationConfig.disturbanceAmplitude;
  document.getElementById('sim-disturbance-start').value = state.simulationConfig.disturbanceStart;
  document.getElementById('sim-disturbance-type').value = state.simulationConfig.disturbanceType;
  document.getElementById('sim-initial-state').value = state.simulationConfig.initialState.join(', ');
}

function saveSessionToStorage() {
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(buildProjectPayload()));
  } catch (err) {
    console.warn('session autosave failed', err);
  }
}

function restoreSessionFromStorage(showMessage = false) {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    applyProjectPayload(data);
    if (showMessage) clearError();
    return true;
  } catch (err) {
    console.warn('session restore failed', err);
    if (showMessage) showError(`Session 還原失敗: ${err.message}`);
    return false;
  }
}

function clearSessionStorage() {
  localStorage.removeItem(SESSION_STORAGE_KEY);
  showError('已清除本地 session autosave');
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

  controllerEquation.innerHTML = [
    renderTransferFunctionEquation('C(s) =', controllerTf, `PID: Kp=${state.pidParams.Kp.toFixed(2)}, Ki=${state.pidParams.Ki.toFixed(2)}, Kd=${state.pidParams.Kd.toFixed(2)}`),
    renderTransferFunctionEquation('Cc(s) =', leadLagTransferFunction(state.compensator), compensatorDescription(state.compensator)),
  ].join('');

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
    readSimulationConfigInputs();
    clearFieldErrors();

    if (state.systemType === 'dtf') {
      const num = parsePolyString(document.getElementById('dtf-num')?.value);
      const den = parsePolyString(document.getElementById('dtf-den')?.value);
      const Ts = Number(document.getElementById('dtf-ts')?.value);
      if (!num) { setFieldError('dtf-num', '請輸入有效的分子係數'); throw new Error('無效的分子係數'); }
      if (!den) { setFieldError('dtf-den', '請輸入有效的分母係數'); throw new Error('無效的分母係數'); }
      if (!Number.isFinite(Ts) || Ts <= 0) { setFieldError('dtf-ts', 'Ts 必須為正數'); throw new Error('無效的 sample time'); }
      state.plant = new DiscreteTransferFunction(num, den, Ts);
      state.domain = 'z';
      state.sampleTime = Ts;
      clearError();
      updateDomainUI();
      updateSystemSetupCopy();
      saveSessionToStorage();
      refreshAllCharts();
      return;
    }

    state.domain = 's';
    updateDomainUI();

    if (state.systemType === 'ss') {
      const A = parseStateMatrixField('ss-a');
      const B = parseStateMatrixField('ss-b', 1);
      const C = parseStateMatrixField('ss-c');
      const D = parseStateMatrixField('ss-d', 1);
      captureStateSpaceInputs();
      try {
        state.plant = stateSpaceToTransferFunction(A, B, C, D);
      } catch (err) {
        if (err.message.startsWith('A ')) setFieldError('ss-a', err.message);
        else if (err.message.includes('B ')) setFieldError('ss-b', err.message);
        else if (err.message.includes('C ')) setFieldError('ss-c', err.message);
        else if (err.message.includes('D ')) setFieldError('ss-d', err.message);
        throw err;
      }
      syncTransferFunctionInputs();
    } else if (state.systemType === 'zpk') {
      const zerosStr = document.getElementById('zpk-zeros')?.value || '';
      const polesStr = document.getElementById('zpk-poles')?.value || '';
      const gainStr = document.getElementById('zpk-gain')?.value || '1';
      const zeros = parseRootsString(zerosStr);
      const poles = parseRootsString(polesStr);
      const gain = Number(gainStr);
      if (!Number.isFinite(gain) || gain === 0) {
        setFieldError('zpk-gain', 'Gain 必須為非零數值');
        throw new Error('ZPK Gain 必須為非零數值');
      }
      if (zerosStr.trim() && zeros.length === 0) {
        setFieldError('zpk-zeros', '零點格式錯誤，例: -1, -2+3j');
        throw new Error('ZPK 零點格式錯誤');
      }
      if (polesStr.trim() && poles.length === 0) {
        setFieldError('zpk-poles', '極點格式錯誤，例: -1, -2+3j');
        throw new Error('ZPK 極點格式錯誤');
      }
      state.plant = zpkToTransferFunction(zeros, poles, gain);
      syncTransferFunctionInputs();
    } else {
      const numInput = document.getElementById('tf-num');
      const denInput = document.getElementById('tf-den');
      if (!numInput || !denInput) return;
      const num = parsePolyString(numInput.value);
      const den = parsePolyString(denInput.value);
      if (!num) { setFieldError('tf-num', '請輸入有效的分子係數'); throw new Error('無效的分子係數'); }
      if (!den) { setFieldError('tf-den', '請輸入有效的分母係數'); throw new Error('無效的分母係數'); }
      if (isZeroPolynomial(den)) { setFieldError('tf-den', '分母係數不能全為 0'); throw new Error('分母係數不能全為 0'); }
      state.plant = new TransferFunction(num, den);
    }
    clearError();
    updateController();
  } catch (err) {
    showError(err.message);
    scheduleSmokeDiagnostics();
  }
}

function setFieldError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.borderColor = 'var(--color-unstable)';
  let hint = el.parentElement?.querySelector('.field-hint');
  if (!hint) {
    hint = document.createElement('div');
    hint.className = 'field-hint';
    hint.style.cssText = 'font-size:11px; color:var(--color-unstable); margin-top:2px;';
    el.parentElement?.appendChild(hint);
  }
  hint.textContent = msg;
}

function clearFieldErrors() {
  document.querySelectorAll('.field-hint').forEach(h => h.remove());
  ['tf-num', 'tf-den', 'zpk-zeros', 'zpk-poles', 'zpk-gain', 'ss-a', 'ss-b', 'ss-c', 'ss-d', 'comp-gain', 'comp-tau', 'comp-alpha', 'preset-ku', 'preset-tu', 'preset-plant-k', 'preset-fopdt', 'lead-target-phase', 'lead-target-wc', 'lag-improvement', 'lag-target-wc'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.borderColor = '';
  });
}

function updateController() {
  if (!state.plant) return;
  try {
    clearFieldErrors();
    validateCompensatorInputs();
    readCompensatorInputs();
    const { Kp, Ki, Kd, N } = state.pidParams;
    const pid = new PIDController(Kp, Ki, Kd, N);
    const compensatorTf = leadLagTransferFunction(state.compensator);
    const controllerTf = pid.toTransferFunction().series(compensatorTf);
    state.controller = {
      toTransferFunction: () => controllerTf,
      pid,
      compensator: { ...state.compensator },
    };

    // Series connection
    state.openLoop = controllerTf.series(state.plant);
    // Unity negative feedback
    state.closedLoop = state.openLoop.feedback();

    updateSystemSetupCopy();
    saveSessionToStorage();
    refreshAllCharts();
    updateStabilityPanel();
  } catch (err) {
    showError(err.message);
    scheduleSmokeDiagnostics();
  }
}

function refreshAllCharts() {
  if (!state.plant) return;

  if (state.domain === 'z') {
    if (state.activePlot === 'bode') {
      renderBodePlot(state.plant, 'chart-active');
      updateActivePlotHeader('Bode (DTFT)', `z-domain · Ts=${state.plant.sampleTime}s`);
    } else if (state.activePlot === 'pzmap') {
      renderPoleZeroMap(state.plant, 'chart-active');
      updateActivePlotHeader('Pole-Zero Map', 'Z-Plane');
    } else {
      renderDiscreteStepChart();
    }
    renderPoleZeroMap(state.plant, 'chart-pzmap');
    scheduleSmokeDiagnostics();
    return;
  }

  const sys = state.showClosedLoop ? (state.closedLoop || state.plant) : state.plant;
  renderActivePlot(sys);
  renderRootLocus(state.plant);
  renderPoleZeroMap(sys);
  renderComparisonChart();
  scheduleSmokeDiagnostics();
}

function renderDiscreteStepChart(targetId = 'chart-active') {
  const sys = state.plant;
  if (!(sys instanceof DiscreteTransferFunction)) return;
  const sampleCount = Math.min(state.simulationConfig.sampleCount || 200, 500);
  const amplitude = state.simulationConfig.amplitude || 1;
  const data = discreteStepResponse(sys, { sampleCount, amplitude });
  const stable = sys.isStable();
  const layout = PLOTLY_LAYOUT_BASE();
  layout.xaxis = { ...layout.xaxis, title: 'Time (s)' };
  layout.yaxis = { ...layout.yaxis, title: 'Amplitude' };
  const trace = {
    x: data.t,
    y: data.y,
    type: 'scatter',
    mode: 'lines+markers',
    name: 'Discrete Step',
    line: { color: stable ? getCSS('--color-stable') : getCSS('--color-unstable'), width: 2 },
    marker: { size: 3 },
  };
  Plotly.react(targetId, [trace], layout, { responsive: true, displayModeBar: false });
  updateActivePlotHeader(
    'Discrete Step Response',
    `z-domain · Ts = ${sys.sampleTime}s · ${stable ? 'Stable' : 'Unstable'}`
  );
}

function updateDomainUI() {
  const isZ = state.domain === 'z';
  document.querySelectorAll('.s-domain-only').forEach((el) => {
    el.style.display = isZ ? 'none' : '';
  });
  if (isZ && ['nyquist', 'nichols', 'rlocus'].includes(state.activePlot)) {
    state.activePlot = 'step';
    document.querySelectorAll('.plot-tab').forEach((t) => {
      t.classList.toggle('active', t.dataset.plot === 'step');
    });
  }
}

function setComparisonVisibility() {
  const compareSection = document.getElementById('compare-section');
  if (!compareSection) return;
  compareSection.classList.toggle('active', state.comparisonSnapshots.length > 0);
}

function currentResponseData(sys) {
  if (state.responseType === 'impulse') return impulseResponse(sys, state.simulationConfig);
  if (state.responseType === 'ramp') return rampResponse(sys, state.simulationConfig);
  return stepResponse(sys, state.simulationConfig);
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
    const timeMetricSupported = !['sine', 'square'].includes(state.responseType);

    if (riseEl) riseEl.textContent = timeMetricSupported ? fmtTime(info.riseTime) : '—';
    if (settleEl) settleEl.textContent = timeMetricSupported ? fmtTime(info.settlingTime) : '—';
    if (overEl) overEl.textContent = timeMetricSupported ? fmtPercent(info.overshoot) : '—';
    if (essEl) essEl.textContent = timeMetricSupported && info.steadyStateError !== undefined ? info.steadyStateError.toPrecision(3) : '—';

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

    // Routh-Hurwitz table
    const routhEl = document.getElementById('routh-table-body');
    if (routhEl) {
      try {
        const targetDen = sys.den;
        const routh = routhTable(targetDen);
        const labels = [];
        for (let i = 0; i < targetDen.length; i++) {
          labels.push(`s<sup>${targetDen.length - 1 - i}</sup>`);
        }
        routhEl.innerHTML = routh.table.map((row, idx) => {
          const cells = row.map(v => `<td>${fmtNum(v)}</td>`).join('');
          return `<tr><td>${labels[idx] || ''}</td>${cells}</tr>`;
        }).join('');
      } catch { routhEl.innerHTML = '<tr><td colspan="4">—</td></tr>'; }
    }
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
  const responseTitles = {
    step: 'Step Response',
    impulse: 'Impulse Response',
    ramp: 'Ramp Response',
    sine: 'Sine Response',
    square: 'Square Response',
    pulse: 'Pulse Response',
  };
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
  const isDiscrete = sys instanceof DiscreteTransferFunction;
  const data = isDiscrete
    ? discreteBodeData(sys, { samples: 500 })
    : (() => { const r = autoFreqRange(sys); return bodeData(sys, r.wMin, r.wMax); })();
  const mTrace = { x: data.w, y: data.magDB, type: 'scatter', mode: 'lines', name: 'Magnitude (dB)', line: { color: getCSS('--color-accent'), width: 2 } };
  const pTrace = { x: data.w, y: data.phaseDeg, type: 'scatter', mode: 'lines', name: 'Phase (deg)', line: { color: getCSS('--color-secondary'), width: 2 }, yaxis: 'y2' };
  const traces = [mTrace, pTrace];
  if (isDiscrete) {
    // Mark Nyquist frequency π/Ts as a vertical dashed line
    traces.push({
      x: [data.omegaNyquist, data.omegaNyquist], y: [Math.min(...data.magDB), Math.max(...data.magDB)],
      type: 'scatter', mode: 'lines', line: { color: getCSS('--color-unstable'), width: 1, dash: 'dash' },
      name: `Nyquist π/Ts=${fmtNum(data.omegaNyquist)}`,
      hoverinfo: 'skip',
    });
  }
  const layout = PLOTLY_LAYOUT_BASE();
  layout.xaxis.type = 'log';
  layout.yaxis2 = { overlaying: 'y', side: 'right', gridcolor: 'transparent' };
  layout.showlegend = true;
  layout.legend = compactLegend();
  Plotly.react(targetId, traces, layout, { responsive: true, displayModeBar: false });
}

function renderNyquistPlot(sys, targetId = 'chart-active') {
  const range = autoFreqRange(sys);
  const data = nyquistData(sys, range.wMin, range.wMax);
  const encirclements = nyquistEncirclements(sys, range.wMin, range.wMax);
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
  if (encirclements !== 0) {
    layout.annotations = [{ x: -1, y: 0.3, text: `N=${encirclements}`, showarrow: false, font: { size: 12, color: getCSS('--color-unstable') } }];
  }
  Plotly.react(targetId, traces, layout, { responsive: true, displayModeBar: false });
}

function renderNicholsChart(sys, targetId = 'chart-active') {
  const range = autoFreqRange(sys);
  const data = nicholsData(sys, range.wMin, range.wMax);
  const trace = {
    x: data.phaseDeg,
    y: data.magDB,
    type: 'scatter',
    mode: 'lines',
    name: 'Nichols',
    line: { color: getCSS('--color-accent'), width: 2 },
  };
  const criticalPoint = { x: [-180], y: [0], type: 'scatter', mode: 'markers', marker: { size: 9, color: getCSS('--color-unstable') }, name: '-180°, 0dB' };
  const layout = PLOTLY_LAYOUT_BASE();
  layout.xaxis.title = { text: 'Phase (deg)', font: { size: 11 } };
  layout.yaxis.title = { text: 'Magnitude (dB)', font: { size: 11 } };
  layout.showlegend = true;
  layout.legend = compactLegend();
  Plotly.react(targetId, [trace, criticalPoint], layout, { responsive: true, displayModeBar: false });
}

function renderActivePlot(sys) {
  const loopSys = state.openLoop || state.plant;
  const plotConfig = {
    step: () => {
      updateActivePlotHeader(
        {
          step: 'Step Response',
          impulse: 'Impulse Response',
          ramp: 'Ramp Response',
          sine: 'Sine Response',
          square: 'Square Response',
          pulse: 'Pulse Response',
        }[state.responseType],
        'Time-Domain'
      );
      renderTimeResponse(sys, 'chart-active');
    },
    bode: () => {
      const isZ = state.domain === 'z';
      updateActivePlotHeader('Bode Plot', isZ ? `z-domain (DTFT) · Ts=${state.plant.sampleTime}s` : 'Frequency-Domain');
      renderBodePlot(isZ ? state.plant : loopSys, 'chart-active');
    },
    nyquist: () => {
      updateActivePlotHeader('Nyquist Plot', 'Frequency-Domain');
      renderNyquistPlot(loopSys, 'chart-active');
    },
    nichols: () => {
      updateActivePlotHeader('Nichols Chart', 'Frequency-Domain');
      renderNicholsChart(loopSys, 'chart-active');
    },
    rlocus: () => {
      updateActivePlotHeader('Root Locus', 'Stability Analysis');
      renderRootLocus(state.plant, 'chart-active');
    },
    pzmap: () => {
      const isZ = state.domain === 'z';
      updateActivePlotHeader('Pole-Zero Map', isZ ? 'Z-Plane' : 'S-Plane');
      renderPoleZeroMap(isZ ? state.plant : sys, 'chart-active');
    },
  };
  (plotConfig[state.activePlot] || plotConfig.step)();
}

function renderRootLocus(sys, targetId = 'chart-rlocus') {
  const result = rootLocusData(sys);
  if (!result || !result.roots || result.roots.length === 0) return;
  const sortedSteps = sortRootLocusBranches(result.roots);
  const nPoles = sortedSteps[0].length;
  const branches = Array.from({ length: nPoles }, () => ({ re: [], im: [], k: [] }));
  for (let i = 0; i < sortedSteps.length; i++) {
    for (let j = 0; j < nPoles; j++) {
      if (sortedSteps[i][j]) {
        branches[j].re.push(sortedSteps[i][j].re);
        branches[j].im.push(sortedSteps[i][j].im);
        branches[j].k.push(result.gains[i]);
      }
    }
  }
  const traces = branches.map((b, idx) => ({
    x: b.re,
    y: b.im,
    customdata: b.k,
    type: 'scatter',
    mode: 'lines',
    name: `Branch ${idx + 1}`,
    hovertemplate: 'Re=%{x:.3f}<br>Im=%{y:.3f}<br>K=%{customdata:.3f}<extra></extra>',
    line: { width: 1.5, color: getCSS('--color-accent'), opacity: 0.6 },
  }));

  // Open-loop poles (X) and zeros (O) — starting/ending points of locus
  const olPoles = sys.poles();
  const olZeros = sys.zeros();
  traces.push({
    x: olPoles.map((p) => p.re), y: olPoles.map((p) => p.im),
    type: 'scatter', mode: 'markers', name: 'Open-loop poles',
    marker: { symbol: 'x', size: 10, color: getCSS('--color-unstable'), line: { width: 2 } },
    showlegend: targetId === 'chart-active',
  });
  if (olZeros.length > 0) {
    traces.push({
      x: olZeros.map((z) => z.re), y: olZeros.map((z) => z.im),
      type: 'scatter', mode: 'markers', name: 'Open-loop zeros',
      marker: { symbol: 'circle-open', size: 10, color: getCSS('--color-accent'), line: { width: 2 } },
      showlegend: targetId === 'chart-active',
    });
  }

  // Breakaway / break-in points
  try {
    const breaks = rootLocusBreakPoints(sys);
    if (breaks.length > 0) {
      traces.push({
        x: breaks.map((b) => b.s), y: breaks.map(() => 0),
        type: 'scatter', mode: 'markers+text',
        text: breaks.map((b) => `K=${fmtNum(b.K)}`),
        textposition: 'top center', textfont: { size: 10, color: getCSS('--text-muted') },
        name: 'Break points',
        marker: { symbol: 'square', size: 9, color: getCSS('--color-warning') || '#f59e0b' },
        hovertemplate: '%{text}<br>s=%{x:.4f}<extra>%{fullData.name}</extra>',
        showlegend: targetId === 'chart-active',
      });
    }
  } catch { /* ignore */ }

  // jω crossings (critical K)
  try {
    const cross = rootLocusJwCrossings(sys, 1e3, 400);
    if (cross.length > 0) {
      const xs = [], ys = [], labels = [];
      for (const c of cross) {
        xs.push(0, 0); ys.push(c.omega, -c.omega);
        labels.push(`K*=${fmtNum(c.K)}`, `K*=${fmtNum(c.K)}`);
      }
      traces.push({
        x: xs, y: ys,
        type: 'scatter', mode: 'markers+text',
        text: labels, textposition: 'middle right',
        textfont: { size: 10, color: getCSS('--color-unstable') },
        name: 'jω crossings',
        marker: { symbol: 'diamond', size: 10, color: getCSS('--color-unstable') },
        hovertemplate: '%{text}<br>ω=%{y:.4f}<extra>%{fullData.name}</extra>',
        showlegend: targetId === 'chart-active',
      });
    }
  } catch { /* ignore */ }

  // Add asymptotes
  try {
    const asym = rootLocusAsymptotes(sys);
    if (asym.angles.length > 0) {
      const len = 50;
      for (const angle of asym.angles) {
        const rad = (angle * Math.PI) / 180;
        traces.push({
          x: [asym.centroid, asym.centroid + len * Math.cos(rad)],
          y: [0, len * Math.sin(rad)],
          type: 'scatter', mode: 'lines',
          name: `Asymptote ${angle.toFixed(0)}°`,
          line: { width: 1, color: getCSS('--text-muted'), dash: 'dash' },
          showlegend: false,
        });
      }
      // Centroid marker
      traces.push({
        x: [asym.centroid], y: [0], type: 'scatter', mode: 'markers',
        name: `Centroid σ=${fmtNum(asym.centroid)}`,
        marker: { size: 7, symbol: 'diamond', color: getCSS('--text-muted') },
        showlegend: targetId === 'chart-active',
      });
    }
  } catch { /* ignore asymptote errors */ }

  const layout = PLOTLY_LAYOUT_BASE();
  layout.showlegend = targetId === 'chart-active';
  if (layout.showlegend) layout.legend = compactLegend();
  if (targetId === 'chart-active') {
    layout.annotations = [{
      xref: 'paper', yref: 'paper', x: 0.01, y: 0.99,
      xanchor: 'left', yanchor: 'top',
      text: '💡 Click a branch or drag the K-slider below to pick a gain',
      showarrow: false,
      font: { size: 10, color: getCSS('--text-muted') },
      bgcolor: 'rgba(15,17,23,.6)', borderpad: 4,
    }];
  }
  Plotly.react(targetId, traces, layout, { responsive: true, displayModeBar: false });

  if (targetId === 'chart-active') {
    _rlocusInteractiveSys = sys;
    _rlocusKMax = result.gains[result.gains.length - 1];
    const slider = document.getElementById('rl-k-slider');
    if (slider) {
      slider.max = _rlocusKMax;
      slider.step = _rlocusKMax / 1000;
      const kMaxLabel = document.getElementById('rl-k-max-label');
      if (kMaxLabel) kMaxLabel.textContent = `K=${fmtNum(_rlocusKMax)}`;
    }
    const chartEl = document.getElementById('chart-active');
    chartEl.removeAllListeners?.('plotly_click');
    chartEl.on('plotly_click', (data) => {
      const pt = data?.points?.[0];
      if (!pt || typeof pt.customdata !== 'number') return;
      updateRlocusGain(pt.customdata);
    });
  }
}

let _rlocusInteractiveSys = null;
let _rlocusKMax = 100;
let _currentRlocusK = null;

/** Apply the Root Locus selected gain K as a pure proportional controller (Ki=Kd=0). */
function applyRlocusKToController() {
  if (_currentRlocusK === null || !state.plant) return;
  const K = _currentRlocusK;
  setPIDFromController({ Kp: K, Ki: 0, Kd: 0 }, 'rlocus-gain');
  // Reset compensator to none so only Kp acts
  state.compensator = { mode: 'none', gain: 1, tau: 1, alpha: 0.2 };
  syncCompensatorInputs();
  updateController();
  // Navigate to Controller tab so user sees the result
  document.querySelector('[data-sidebar="controller"]')?.click();
  // Brief flash feedback on the button
  const btn = document.getElementById('btn-apply-rlocus-k');
  if (btn) {
    const orig = btn.textContent;
    btn.textContent = '✓ Applied!';
    btn.style.background = '#10b981';
    setTimeout(() => { btn.textContent = orig; btn.style.background = ''; }, 1500);
  }
}

function updateRlocusGain(K) {
  if (!_rlocusInteractiveSys) return;
  const sys = _rlocusInteractiveSys;
  _currentRlocusK = K;   // track for applyRlocusKToController

  const panel = document.getElementById('rl-gain-info');
  if (panel) panel.style.display = 'flex';

  const slider = document.getElementById('rl-k-slider');
  if (slider) slider.value = K;

  const kDisp = document.getElementById('rl-k-display');
  if (kDisp) kDisp.textContent = fmtNum(K);

  const clDen = polyadd(sys.den, polyscale(sys.num, K));
  const clPoles = polyroots(clDen);
  const stable = clPoles.every((p) => p.re < -1e-10);
  const marginal = !stable && clPoles.every((p) => p.re < 1e-8);

  const badge = document.getElementById('rl-stability-badge');
  if (badge) {
    badge.textContent = stable ? 'Stable' : marginal ? 'Marginal' : 'Unstable';
    badge.style.cssText = stable
      ? 'background:rgba(16,185,129,.15);color:#10b981;display:inline-flex;align-items:center;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;text-transform:uppercase;'
      : marginal
        ? 'background:rgba(245,158,11,.15);color:#f59e0b;display:inline-flex;align-items:center;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;text-transform:uppercase;'
        : 'background:rgba(239,68,68,.15);color:#ef4444;display:inline-flex;align-items:center;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;text-transform:uppercase;';
  }

  const polesList = document.getElementById('rl-poles-list');
  if (polesList) {
    polesList.innerHTML = clPoles.map((p) => {
      const imStr = Math.abs(p.im) < 1e-9 ? '' : p.im > 0 ? ` + ${fmtNum(p.im)}j` : ` − ${fmtNum(-p.im)}j`;
      const color = p.re < -1e-10 ? '#10b981' : p.re < 1e-8 ? '#f59e0b' : '#ef4444';
      return `<div style="color:${color}">${fmtNum(p.re)}${imStr}</div>`;
    }).join('');
  }

  const chartEl = document.getElementById('chart-active');
  if (chartEl?.data) {
    const idx = chartEl.data.findIndex((t) => t.name === 'CL Poles');
    const trace = {
      x: clPoles.map((p) => p.re), y: clPoles.map((p) => p.im),
      type: 'scatter', mode: 'markers', name: 'CL Poles',
      marker: { symbol: 'circle', size: 13, color: stable ? '#10b981' : '#ef4444', line: { width: 2.5, color: '#fff' } },
      hovertemplate: 'CL Pole<br>Re=%{x:.4f}<br>Im=%{y:.4f}<extra></extra>',
      showlegend: true,
    };
    if (idx >= 0) Plotly.restyle('chart-active', { x: [trace.x], y: [trace.y], 'marker.color': [trace.marker.color] }, [idx]);
    else Plotly.addTraces('chart-active', trace);
  }

  renderRlocusStepPreview(K, sys, clDen, stable);
}

function renderRlocusStepPreview(K, sys, clDen, stable) {
  const el = document.getElementById('rl-step-preview');
  if (!el) return;
  try {
    const clSys = new TransferFunction(polyscale(sys.num, K), clDen);
    const resp = stepResponse(clSys, { duration: 15, sampleCount: 250 });
    const yVals = resp.y.filter(Number.isFinite);
    const valid = yVals.length > 0 && Math.max(...yVals.map(Math.abs)) < 1e5;
    const layout = {
      margin: { l: 32, r: 6, t: 4, b: 24 },
      paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
      xaxis: { color: '#64748b', tickfont: { size: 9 }, gridcolor: 'rgba(148,163,184,.08)', title: { text: 't (s)', font: { size: 9, color: '#64748b' } } },
      yaxis: { color: '#64748b', tickfont: { size: 9 }, gridcolor: 'rgba(148,163,184,.08)' },
      showlegend: false,
    };
    Plotly.react(el, [{ x: resp.t, y: valid ? resp.y : resp.t.map(() => 0), type: 'scatter', mode: 'lines', line: { width: 1.5, color: stable ? '#10b981' : '#ef4444' } }], layout, { responsive: true, displayModeBar: false });
  } catch { /* ignore */ }
}

function renderPoleZeroMap(sys, targetId = 'chart-pzmap') {
  const isDiscrete = sys instanceof DiscreteTransferFunction;
  const pList = sys.poles();
  const zList = sys.zeros();
  const traces = [];

  if (isDiscrete) {
    const theta = Array.from({ length: 361 }, (_, i) => (i * Math.PI) / 180);
    traces.push({
      x: theta.map((t) => Math.cos(t)),
      y: theta.map((t) => Math.sin(t)),
      type: 'scatter',
      mode: 'lines',
      name: 'Unit Circle',
      line: { color: getCSS('--text-muted'), width: 1, dash: 'dot' },
      showlegend: false,
    });
  }

  traces.push({ x: pList.map((p) => p.re), y: pList.map((p) => p.im), type: 'scatter', mode: 'markers', name: 'Poles', marker: { symbol: 'x', size: 10, color: getCSS('--color-unstable') } });
  traces.push({ x: zList.map((z) => z.re), y: zList.map((z) => z.im), type: 'scatter', mode: 'markers', name: 'Zeros', marker: { symbol: 'circle-open', size: 10, color: getCSS('--color-accent') } });

  const layout = PLOTLY_LAYOUT_BASE();
  if (isDiscrete) {
    layout.yaxis = { ...layout.yaxis, scaleanchor: 'x', scaleratio: 1 };
    layout.xaxis = { ...layout.xaxis, title: 'Real (z-plane)' };
    if (targetId === 'chart-active') {
      layout.annotations = [{
        xref: 'paper', yref: 'paper', x: 0.01, y: 0.99,
        xanchor: 'left', yanchor: 'top',
        text: '💡 Click a pole (×) to see |z|, decay rate and equivalent s-plane metrics',
        showarrow: false,
        font: { size: 10, color: getCSS('--text-muted') },
        bgcolor: 'rgba(15,17,23,.6)', borderpad: 4,
      }];
    }
  }
  layout.showlegend = targetId === 'chart-active';
  if (layout.showlegend) layout.legend = compactLegend();
  Plotly.react(targetId, traces, layout, { responsive: true, displayModeBar: false });

  // Interactive z-pole inspection on main z-domain pz map
  if (isDiscrete && targetId === 'chart-active') {
    _zpoleSys = sys;
    const chartEl = document.getElementById(targetId);
    chartEl.removeAllListeners?.('plotly_click');
    chartEl.on('plotly_click', (evt) => {
      const pt = evt?.points?.[0];
      if (!pt || pt.fullData?.name !== 'Poles') return;
      showZPoleInfo({ re: pt.x, im: pt.y }, sys.sampleTime);
    });
  } else if (targetId === 'chart-active') {
    // hide info card when leaving z-domain
    const info = document.getElementById('zpole-info');
    if (info) info.style.display = 'none';
  }
}

let _zpoleSys = null;

function showZPoleInfo(z, Ts) {
  const info = document.getElementById('zpole-info');
  if (!info) return;
  info.style.display = 'flex';
  const r = Math.hypot(z.re, z.im);
  const theta = Math.atan2(z.im, z.re);
  const coordEl = document.getElementById('zpole-coord');
  const stabEl = document.getElementById('zpole-stability');
  const zMet = document.getElementById('zpole-z-metrics');
  const sMet = document.getElementById('zpole-s-metrics');

  const imStr = Math.abs(z.im) < 1e-9 ? '' : z.im > 0 ? ` + j${fmtNum(z.im)}` : ` − j${fmtNum(-z.im)}`;
  coordEl.textContent = `${fmtNum(z.re)}${imStr}`;

  const stable = r < 1 - 1e-9;
  const marginal = Math.abs(r - 1) <= 1e-9;
  stabEl.textContent = stable ? 'Stable' : marginal ? 'Marginal' : 'Unstable';
  stabEl.style.cssText = stable
    ? 'background:rgba(16,185,129,.15);color:#10b981;display:inline-flex;align-items:center;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;text-transform:uppercase;'
    : marginal
      ? 'background:rgba(245,158,11,.15);color:#f59e0b;display:inline-flex;align-items:center;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;text-transform:uppercase;'
      : 'background:rgba(239,68,68,.15);color:#ef4444;display:inline-flex;align-items:center;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;text-transform:uppercase;';

  // z-plane metrics
  const angleDeg = theta * 180 / Math.PI;
  let settleLine = '';
  if (stable && r > 1e-9) {
    const settleSamples = Math.log(0.02) / Math.log(r);
    settleLine = `<div>2% settle ≈ ${settleSamples.toFixed(1)} samples (${fmtNum(settleSamples * Ts)} s)</div>`;
  }
  zMet.innerHTML = [
    `<div>|z| = ${fmtNum(r)}</div>`,
    `<div>∠z = ${fmtNum(theta)} rad (${fmtNum(angleDeg)}°)</div>`,
    settleLine,
  ].join('');

  // s-plane equivalent via s = ln(z)/Ts
  if (r < 1e-12) {
    sMet.innerHTML = '<div>z ≈ 0 (deadbeat — pure delay)</div>';
    return;
  }
  const sigma = -Math.log(r) / Ts;
  const omega = theta / Ts;
  const wn = Math.hypot(sigma, omega);
  const zeta = wn > 1e-9 ? sigma / wn : 0;
  sMet.innerHTML = [
    `<div>σ = ${fmtNum(sigma)}  (decay rate)</div>`,
    `<div>ω = ${fmtNum(omega)}  rad/s</div>`,
    `<div>ωn = ${fmtNum(wn)}  rad/s</div>`,
    `<div>ζ = ${fmtNum(zeta)}</div>`,
  ].join('');
}

function renderComparisonChart() {
  const target = document.getElementById('chart-compare');
  if (!target) return;
  setComparisonVisibility();
  renderComparisonSummary();

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
    scheduleSmokeDiagnostics();
    return;
  }
  Plotly.react('chart-compare', traces, layout, { responsive: true, displayModeBar: false });
  scheduleSmokeDiagnostics();
}

function renderComparisonSummary() {
  const countEl = document.getElementById('compare-count');
  const signalEl = document.getElementById('compare-signal');
  const riseEl = document.getElementById('compare-best-rise');
  const overshootEl = document.getElementById('compare-best-overshoot');
  if (!countEl || !signalEl || !riseEl || !overshootEl) return;

  countEl.textContent = String(state.comparisonSnapshots.length);
  signalEl.textContent = `${waveformLabel(state.responseType)} / Dist ${waveformLabel(state.simulationConfig.disturbanceType)}`;

  if (state.comparisonSnapshots.length === 0) {
    riseEl.textContent = '—';
    overshootEl.textContent = '—';
    return;
  }

  const bestRise = state.comparisonSnapshots.reduce((best, snapshot) => (
    snapshot.metrics.riseTime < best.metrics.riseTime ? snapshot : best
  ));
  const bestOvershoot = state.comparisonSnapshots.reduce((best, snapshot) => (
    snapshot.metrics.overshoot < best.metrics.overshoot ? snapshot : best
  ));

  riseEl.textContent = `${fmtTime(bestRise.metrics.riseTime)} (${bestRise.name})`;
  overshootEl.textContent = `${fmtPercent(bestOvershoot.metrics.overshoot)} (${bestOvershoot.name})`;
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
    request: `請針對 ${waveformLabel(state.responseType)} 響應提供控制建議`,
    system: {
      type: state.systemType,
      formula: state.plant.toString(),
      numerator: state.plant.num,
      denominator: state.plant.den,
    },
    controller: {
      type: 'pid',
      Kp: state.pidParams.Kp,
      Ki: state.pidParams.Ki,
      Kd: state.pidParams.Kd,
      compensator: { ...state.compensator },
      design: { ...state.controllerDesign },
      formula: state.controller?.toTransferFunction?.().toString?.() ?? '',
    },
    simulation: {
      ...state.simulationConfig,
      inputWaveform: state.responseType,
      disturbanceWaveform: state.simulationConfig.disturbanceType,
      closedLoop: state.showClosedLoop,
    },
    metrics: {
      riseTime: fmtTime(info.riseTime),
      settlingTime: fmtTime(info.settlingTime),
      overshoot: fmtPercent(info.overshoot),
      steadyStateError: info.steadyStateError ? info.steadyStateError.toExponential(3) : '0',
      gainMargin: margins.gainMarginDB === Infinity ? '∞' : fmtNum(margins.gainMarginDB),
      phaseMargin: isNaN(margins.phaseMargin) ? '—' : fmtNum(margins.phaseMargin),
      stability: document.getElementById('stability-indicator')?.innerText.trim(),
    },
  };

  try {
    let result = null;
    let lastError = null;
    const endpoints = [
      'http://127.0.0.1:8770/api/control/advisor',
      'http://localhost:8770/api/control/advisor',
      'http://localhost:8766',
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const body = await response.json();
        if (!response.ok) {
          throw new Error(body.detail || body.error || `HTTP ${response.status}`);
        }
        result = body;
        break;
      } catch (err) {
        lastError = err;
      }
    }

    loading.style.display = 'none';
    if (result?.success) renderMarkdown(textDiv, result.analysis);
    else textDiv.innerHTML = `<p style="color:var(--color-unstable)">錯誤: ${result?.error || lastError?.message || '無法取得 AI 建議'}</p>`;
  } catch (err) {
    loading.style.display = 'none';
    textDiv.innerHTML = `<p style="color:var(--color-unstable)">連線失敗: 請先啟動 Unified API（127.0.0.1:8770）</p>`;
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
  const margins = stabilityMargins(state.openLoop || state.plant);
  const snapshot = {
    id: `snap-${Date.now()}`,
    name: `${waveformLabel(state.responseType)} | Kp ${state.pidParams.Kp.toFixed(2)} / Ki ${state.pidParams.Ki.toFixed(2)} / Kd ${state.pidParams.Kd.toFixed(2)} / ${state.compensator.mode}`,
    responseType: state.responseType,
    mode: state.showClosedLoop ? 'closed_loop' : 'open_loop',
    controller: { ...state.pidParams },
    controllerDesign: { ...state.controllerDesign },
    compensator: { ...state.compensator },
    formulas: {
      plant: state.plant?.toString?.() || '',
      controller: state.controller?.toTransferFunction?.().toString?.() || '',
      openLoop: state.openLoop?.toString?.() || '',
      closedLoop: state.closedLoop?.toString?.() || '',
    },
    simulationConfig: { ...state.simulationConfig },
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
  state.comparisonSnapshots = [...state.comparisonSnapshots, snapshot];
  renderSnapshotList();
  renderComparisonChart();
  switchSidebarPanel('compare');
  saveSessionToStorage();
}

function renderSnapshotList() {
  const list = document.getElementById('snapshot-list');
  const empty = document.getElementById('snapshot-empty');
  if (!list || !empty) return;

  list.querySelectorAll('.snapshot-card').forEach((node) => node.remove());
  empty.style.display = state.comparisonSnapshots.length === 0 ? 'block' : 'none';
  setComparisonVisibility();
  renderComparisonSummary();
  renderComparisonTable();

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

function renderComparisonTable() {
  const body = document.getElementById('comparison-table-body');
  if (!body) return;
  if (state.comparisonSnapshots.length === 0) {
    body.innerHTML = '<tr><td colspan="10">—</td></tr>';
    return;
  }
  body.innerHTML = state.comparisonSnapshots.map((snapshot) => `
    <tr>
      <td><strong>${escapeHtml(snapshot.name)}</strong></td>
      <td>${fmtNum(snapshot.controller?.Kp ?? 0, 3)}</td>
      <td>${fmtNum(snapshot.controller?.Ki ?? 0, 3)}</td>
      <td>${fmtNum(snapshot.controller?.Kd ?? 0, 3)}</td>
      <td>${fmtDeg(snapshot.metrics?.phaseMargin)}</td>
      <td>${fmtDB(snapshot.metrics?.gainMarginDB)}</td>
      <td>${fmtTime(snapshot.metrics?.riseTime)}</td>
      <td>${fmtTime(snapshot.metrics?.settlingTime)}</td>
      <td>${fmtPercent(snapshot.metrics?.overshoot)}</td>
      <td>${fmtNum(snapshot.metrics?.steadyStateError ?? NaN, 3)}</td>
    </tr>
  `).join('');
}

function applySnapshot(snapshotId) {
  const snapshot = state.comparisonSnapshots.find((item) => item.id === snapshotId);
  if (!snapshot) return;
  state.responseType = snapshot.responseType;
  if (snapshot.simulationConfig) {
    state.simulationConfig = {
      ...state.simulationConfig,
      ...snapshot.simulationConfig,
      initialState: Array.isArray(snapshot.simulationConfig.initialState) ? snapshot.simulationConfig.initialState : [],
    };
    syncSimulationConfigInputs();
  }
  const responseSelect = document.getElementById('response-type');
  if (responseSelect) responseSelect.value = snapshot.responseType;
  ['Kp', 'Ki', 'Kd'].forEach((param) => {
    state.pidParams[param] = snapshot.controller[param];
    document.getElementById(`pid-${param}`).value = snapshot.controller[param];
    document.getElementById(`pid-${param}-val`).textContent = snapshot.controller[param].toFixed(2);
  });
  if (snapshot.compensator) {
    state.compensator = normalizeCompensatorConfig(snapshot.compensator);
    syncCompensatorInputs();
  }
  updateController();
}

function deleteSnapshot(snapshotId) {
  state.comparisonSnapshots = state.comparisonSnapshots.filter((item) => item.id !== snapshotId);
  renderSnapshotList();
  renderComparisonChart();
  saveSessionToStorage();
}

function clearSnapshots() {
  state.comparisonSnapshots = [];
  renderSnapshotList();
  renderComparisonChart();
  saveSessionToStorage();
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
    activePlot: state.activePlot,
    view: state.view,
    transferFunction: {
      numerator: document.getElementById('tf-num')?.value ?? '',
      denominator: document.getElementById('tf-den')?.value ?? '',
    },
    stateSpace: { ...state.ssModel },
    controller: { ...state.pidParams },
    controllerDesign: { ...state.controllerDesign },
    compensator: { ...state.compensator },
    simulationConfig: { ...state.simulationConfig },
    comparisonSnapshots: state.comparisonSnapshots,
    theme: state.theme,
    editorDiagram: state.editor?.serialize?.() || null,
  };
}

function applyProjectPayload(data) {
  if (!data || typeof data !== 'object') throw new Error('專案格式無效');

  state.systemType = data.systemType === 'ss' ? 'ss' : 'tf';
  state.responseType = data.responseType || 'step';
  state.showClosedLoop = Boolean(data.showClosedLoop);
  state.comparisonSnapshots = Array.isArray(data.comparisonSnapshots) ? data.comparisonSnapshots : [];
  state.activePlot = data.activePlot || 'step';
  state.view = data.view || 'dashboard';

  const tf = data.transferFunction || {};
  const ss = data.stateSpace || {};
  const controller = data.controller || {};
  const controllerDesign = data.controllerDesign || {};
  const compensator = data.compensator || controller.compensator || {};
  const simulationConfig = data.simulationConfig || {};

  document.getElementById('tf-num').value = tf.numerator || '1';
  document.getElementById('tf-den').value = tf.denominator || '1, 3, 2';
  document.getElementById('ss-a').value = ss.A || state.ssModel.A;
  document.getElementById('ss-b').value = ss.B || state.ssModel.B;
  document.getElementById('ss-c').value = ss.C || state.ssModel.C;
  document.getElementById('ss-d').value = ss.D || state.ssModel.D;
  state.simulationConfig = {
    duration: simulationConfig.duration ?? null,
    sampleCount: simulationConfig.sampleCount ?? 1000,
    amplitude: simulationConfig.amplitude ?? 1,
    frequency: simulationConfig.frequency ?? 1,
    pulseWidth: simulationConfig.pulseWidth ?? 1,
    disturbanceAmplitude: simulationConfig.disturbanceAmplitude ?? 0,
    disturbanceStart: simulationConfig.disturbanceStart ?? 0,
    disturbanceType: simulationConfig.disturbanceType ?? 'none',
    initialState: Array.isArray(simulationConfig.initialState) ? simulationConfig.initialState : [],
  };
  syncSimulationConfigInputs();

  ['Kp', 'Ki', 'Kd'].forEach((param) => {
    if (typeof controller[param] === 'number') {
      state.pidParams[param] = controller[param];
      document.getElementById(`pid-${param}`).value = controller[param];
      document.getElementById(`pid-${param}-val`).textContent = controller[param].toFixed(2);
    }
  });
  state.compensator = normalizeCompensatorConfig(compensator);
  state.controllerDesign = {
    source: controllerDesign.source || 'manual',
    preset: controllerDesign.preset || null,
    leadTarget: controllerDesign.leadTarget || null,
    lagTarget: controllerDesign.lagTarget || null,
  };
  syncCompensatorInputs();

  const responseSelect = document.getElementById('response-type');
  if (responseSelect) responseSelect.value = state.responseType;
  const loopToggle = document.getElementById('cl-toggle');
  if (loopToggle) loopToggle.checked = state.showClosedLoop;
  document.querySelectorAll('.plot-tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.plot === state.activePlot);
  });

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

  // Restore editor diagram if present
  if (data.editorDiagram && state.editor) {
    state.editor.deserialize(data.editorDiagram);
  }

  captureStateSpaceInputs();
  renderSnapshotList();
  updateSystem();
  switchView(state.view);
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
    controller: { ...state.pidParams, compensator: { ...state.compensator } },
    controllerDesign: { ...state.controllerDesign },
    simulationConfig: { ...state.simulationConfig },
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

function exportChartPNG() {
  const chartEl = document.getElementById('chart-active');
  if (!chartEl) return;
  Plotly.downloadImage(chartEl, {
    format: 'png',
    width: 1200,
    height: 700,
    filename: `control-${state.activePlot}-${new Date().toISOString().replace(/[:.]/g, '-')}`,
  });
}

function plotDiagnostics(id) {
  const el = document.getElementById(id);
  if (!el) return { id, exists: false };
  const rect = el.getBoundingClientRect();
  const fullData = Array.isArray(el._fullData) ? el._fullData : [];
  const layout = el._fullLayout || {};
  return {
    id,
    exists: true,
    visible: rect.width > 0 && rect.height > 0,
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    traces: fullData.length,
    traceNames: fullData.map((trace) => trace.name).filter(Boolean),
    legend: Boolean(layout.showlegend),
  };
}

function controlStudioSmokeState() {
  const errorEl = document.getElementById('error-msg');
  const sys = state.showClosedLoop ? (state.closedLoop || state.plant) : state.plant;
  const response = sys ? currentResponseData(sys) : null;
  return {
    systemType: state.systemType,
    responseType: state.responseType,
    activePlot: state.activePlot,
    showClosedLoop: state.showClosedLoop,
    plantFormula: state.plant?.toString?.() || null,
    closedLoopFormula: state.closedLoop?.toString?.() || null,
    controllerFormula: state.controller?.toTransferFunction?.().toString?.() || null,
    controllerDesign: { ...state.controllerDesign },
    stabilityText: document.getElementById('stability-indicator')?.innerText.trim() || null,
    equationText: {
      system: document.getElementById('system-equation')?.innerText.trim() || '',
      controller: document.getElementById('controller-equation')?.innerText.trim() || '',
      loop: document.getElementById('loop-equation')?.innerText.trim() || '',
    },
    plots: {
      active: plotDiagnostics('chart-active'),
      rootLocus: plotDiagnostics('chart-rlocus'),
      poleZero: plotDiagnostics('chart-pzmap'),
      compare: plotDiagnostics('chart-compare'),
    },
    responseLength: response?.t?.length || 0,
    snapshotCount: state.comparisonSnapshots.length,
    comparisonTableRows: document.querySelectorAll('#comparison-table-body tr').length,
    compareVisible: document.getElementById('compare-section')?.classList.contains('active') || false,
    errorVisible: errorEl?.style.display !== 'none',
    errorText: errorEl?.textContent || '',
  };
}

function runControlStudioSmoke() {
  const requiredPlots = ['active', 'rootLocus', 'poleZero'];
  const diagnostics = controlStudioSmokeState();
  const failures = [];
  if (!diagnostics.plantFormula) failures.push('missing plant formula');
  if (!diagnostics.closedLoopFormula) failures.push('missing closed-loop formula');
  if (diagnostics.responseLength < 10) failures.push('response data has too few samples');
  requiredPlots.forEach((key) => {
    const plot = diagnostics.plots[key];
    if (!plot.exists || !plot.visible) failures.push(`${key} plot is not visible`);
    if (plot.traces < 1) failures.push(`${key} plot has no traces`);
  });
  if (!diagnostics.plots.active.legend) failures.push('active plot legend is disabled');
  if (!diagnostics.equationText.system.includes('G(s)')) failures.push('system equation is not rendered');
  if (!diagnostics.equationText.controller.includes('C(s)')) failures.push('controller equation is not rendered');
  if (!diagnostics.equationText.loop.includes('T(s)')) failures.push('closed-loop equation is not rendered');
  return { ok: failures.length === 0, failures, diagnostics };
}

function writeSmokeDiagnostics() {
  const result = runControlStudioSmoke();
  let marker = document.getElementById('control-studio-smoke-state');
  if (!marker) {
    marker = document.createElement('script');
    marker.id = 'control-studio-smoke-state';
    marker.type = 'application/json';
    document.body.appendChild(marker);
  }
  marker.textContent = JSON.stringify(result);
  document.documentElement.dataset.controlStudioSmokeOk = result.ok ? 'true' : 'false';
  document.documentElement.dataset.controlStudioSmokeFailures = result.failures.join('; ');
}

function scheduleSmokeDiagnostics() {
  window.setTimeout(writeSmokeDiagnostics, 0);
}

window.toggleTheme = toggleTheme;
window.ControlStudioSmoke = {
  getState: controlStudioSmokeState,
  run: runControlStudioSmoke,
};
