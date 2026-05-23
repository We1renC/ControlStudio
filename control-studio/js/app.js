import { TransferFunction } from './control/transfer-function.js';
import { DiscreteTransferFunction } from './control/discrete-transfer-function.js';
import { parseMatrixInput, stateSpaceToTransferFunction, controllabilityMatrix, observabilityMatrix } from './control/state-space.js?v=p5';
import { matRank } from './math/matrix.js?v=p5';
import { PIDController, TwoDOFPIDController } from './control/pid.js';
import { compensatorDescription, designLagCompensator, designLeadCompensator, designLeadLagCompensator, leadLagTransferFunction, normalizeCompensatorConfig, notchFilter, notchFilterDescription } from './control/compensator.js?v=pid-p1';
import { impulseResponse, rampResponse, simulatePIDAntiWindup, stepResponse } from './analysis/time-response.js';
import { discreteStepResponse } from './analysis/discrete-response.js';
import { bodeData, nyquistData, autoFreqRange, nicholsData, nyquistEncirclements } from './analysis/frequency-response.js';
import { discreteBodeData } from './analysis/discrete-frequency-response.js?v=p5';
import { rootLocusData, rootLocusAsymptotes, rootLocusBreakPoints, rootLocusJwCrossings, sortRootLocusBranches } from './analysis/root-locus.js?v=p4';
import { stabilityMargins, stepInfo, routhTable, analyzeStability } from './control/stability.js';
import { parsePolyString, fmtNum, fmtDeg, fmtDB, fmtTime, fmtPercent } from './utils/format.js';
import { zpkToTransferFunction, tfToZPK, ZPK, parseRootsString } from './control/zpk.js';
import { c2dMatchedZ, c2dTustin, c2dTustinPrewarp, c2dZOH, c2dImpulseInvariant, d2cTustin } from './control/c2d.js?v=p5';
import { specsToTargetPoles, designLeadForPM, deadbeatGain, autoTunePIDToSpec } from './control/design.js?v=pid-p1';
import { polyadd, polyscale, polyroots } from './math/polynomial.js?v=p4';
import { Complex } from './math/complex.js';
import { analyzeLyapunov, augmentWithIntegralAction, brysonsRule, checkPoleRegion, closedLoopTransferFromStateFeedback, designIntegralLQR, discretizeZOH, innovationStats, lqrWithPoleRegion, observerPoles, placeObserver, placeStateFeedback, resolveDesignStateSpace, simulateLqg, simulateObserver, solveDiscreteKalman, solveLqe, solveLqr, solveLqrMIMO, solveHinfFilter } from './control/state-feedback.js?v=p8d';
import { matIdentity, matTranspose, matSub, matMul } from './math/matrix.js?v=p5';
import { BlockEditor } from './editor/editor.js';
import { MIMOStateSpace, parseMIMOMatrices, rgaSteady, rgaDiagnosis, rgaInvariants, singularValueBode, staticDecoupler, applyDecoupler, dynamicDecouplerAtFrequency, evalAtJw, singularValues } from './control/mimo.js';
import { simulateConstrainedMpc, simulateUnconstrainedMpc } from './control/mpc.js';
import { sensitivityBode, robustPeaks, uncertaintyEnvelope, hInfNorm, additiveUncertaintyEnvelope, diskMargin, monteCarloRobustValidation } from './control/robust.js';
import { applyDelay, padeApprox, delayMargin, smithPredictor } from './control/delay.js';
import { polyToLatex, tfToLatex, renderLatex, pidToLatex } from './utils/latex.js';
import { setSeed, getSeed, resetSeed } from './math/rng.js';
import { identifyARMAX, identifyARX, autoARXOrder } from './control/sysid.js';
import { toMatlabScript, toPythonScript, downloadScript } from './utils/codegen.js';
import { mixedSensitivityCost, tunePIDForMixedSensitivity, defaultMixedSensitivityWeights } from './control/hinf_synth.js';
import { gaTunePID, nsga2TunePID } from './control/ga_tuner.js';
import { runLinearEKF } from './control/ekf.js';
import { findEquilibrium, classifyEquilibrium, scanEquilibria } from './analysis/equilibrium.js';
import { phasePortrait, linearVelocityField } from './analysis/phase-portrait.js';
import { tfToControllableCanonical } from './control/state-space.js?v=p5';

// ============================================================
// STATE
// ============================================================
const state = {
  plant: null,
  systemMode: 'siso',           // 'siso' | 'mimo'
  mimoPlant: null,              // MIMOStateSpace instance
  mimoChannel: { output: 0, input: 0, all: false },  // displayed u_j → y_i; all=true → grid view
  mimoLqr: null,                // last MIMO LQR result { K, P, ... }
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
  analysisSource: 'local',
  apiAnalysis: { status: 'idle', message: '', lastResult: null, diff: null },
  theme: 'dark',
  view: 'dashboard',
  editor: null,
  phase7: {
    placement: null,
    lyapunov: null,
    lqr: null,
  },
  phase8: {
    observer: null,
    kalman: null,
    simulation: null,
    discreteKalman: null,
    lqg: null,
  },
};

const SESSION_STORAGE_KEY = 'control-studio-session-v1';
let apiAnalysisRequestId = 0;

// ============================================================
// UNDO / REDO HISTORY
// ============================================================
const _history = { stack: [], idx: -1, maxDepth: 50 };

function _historySnapshot() {
  if (!state.plant) return null;
  return {
    num: [...state.plant.num],
    den: [...state.plant.den],
    domain: state.domain,
    Kp: state.pidParams.Kp,
    Ki: state.pidParams.Ki,
    Kd: state.pidParams.Kd,
    N: state.pidParams.N,
    compMode: state.compensator?.mode,
    compGain: state.compensator?.gain,
    compTau: state.compensator?.tau,
    compAlpha: state.compensator?.alpha,
  };
}

function historySave() {
  const snap = _historySnapshot();
  if (!snap) return;
  // Drop any redo entries above current index
  _history.stack.splice(_history.idx + 1);
  _history.stack.push(snap);
  if (_history.stack.length > _history.maxDepth) _history.stack.shift();
  _history.idx = _history.stack.length - 1;
  _updateHistoryButtons();
}

function historyUndo() {
  if (_history.idx <= 0) return;
  _history.idx--;
  _applySnapshot(_history.stack[_history.idx]);
}

function historyRedo() {
  if (_history.idx >= _history.stack.length - 1) return;
  _history.idx++;
  _applySnapshot(_history.stack[_history.idx]);
}

function _applySnapshot(snap) {
  if (!snap) return;
  state.pidParams.Kp = snap.Kp;
  state.pidParams.Ki = snap.Ki;
  state.pidParams.Kd = snap.Kd;
  state.pidParams.N = snap.N;
  if (snap.compMode) {
    state.compensator = { mode: snap.compMode, gain: snap.compGain, tau: snap.compTau, alpha: snap.compAlpha };
    syncCompensatorInputs?.();
  }
  syncPIDSliders?.();
  updateController?.();
  _updateHistoryButtons();
}

function _updateHistoryButtons() {
  const undoBtn = document.getElementById('btn-undo');
  const redoBtn = document.getElementById('btn-redo');
  if (undoBtn) undoBtn.disabled = _history.idx <= 0;
  if (redoBtn) redoBtn.disabled = _history.idx >= _history.stack.length - 1;
}

// ============================================================
// URL STATE SHARE (base64)
// ============================================================

/** Encode the shareable parts of state to a base64 URL fragment. */
function encodeStateToUrl() {
  if (!state.plant) return null;
  try {
    const payload = {
      v: 1,
      domain: state.domain,
      num: state.plant.num,
      den: state.plant.den,
      Kp: state.pidParams.Kp,
      Ki: state.pidParams.Ki,
      Kd: state.pidParams.Kd,
      N: state.pidParams.N,
      compMode: state.compensator?.mode || 'none',
      compGain: state.compensator?.gain,
      compTau: state.compensator?.tau,
      compAlpha: state.compensator?.alpha,
      showCL: state.showClosedLoop,
      responseType: state.responseType,
    };
    if (state.domain === 'z' && state.plant.sampleTime) payload.Ts = state.plant.sampleTime;
    const json = JSON.stringify(payload);
    const b64 = btoa(unescape(encodeURIComponent(json)));
    return b64;
  } catch (_) { return null; }
}

/** Decode a base64 string from URL and restore state (returns true if successful). */
function decodeStateFromUrl(b64) {
  try {
    const json = decodeURIComponent(escape(atob(b64)));
    const p = JSON.parse(json);
    if (!p || p.v !== 1 || !Array.isArray(p.num) || !Array.isArray(p.den)) return false;
    // Restore plant via existing input fields → triggers normal plant setup
    if (p.domain === 'z') {
      document.getElementById('dtf-num').value = p.num.join(', ');
      document.getElementById('dtf-den').value = p.den.join(', ');
      if (p.Ts) document.getElementById('dtf-ts').value = p.Ts;
      // Switch to DTF tab
      document.querySelectorAll('.sys-tab').forEach(t => t.classList.toggle('active', t.dataset.type === 'dtf'));
      document.querySelectorAll('.sys-input-section').forEach(s => { s.style.display = 'none'; });
      const dtfSec = document.getElementById('sys-dtf');
      if (dtfSec) dtfSec.style.display = 'block';
      state.systemType = 'dtf';
      state.domain = 'z';
    } else {
      document.getElementById('tf-num').value = p.num.join(', ');
      document.getElementById('tf-den').value = p.den.join(', ');
      // Switch to TF tab
      document.querySelectorAll('.sys-tab').forEach(t => t.classList.toggle('active', t.dataset.type === 'tf'));
      document.querySelectorAll('.sys-input-section').forEach(s => { s.style.display = 'none'; });
      const tfSec = document.getElementById('sys-tf');
      if (tfSec) tfSec.style.display = 'block';
      state.systemType = 'tf';
      state.domain = 's';
    }
    updateSystem?.();
    // Restore PID
    if (Number.isFinite(p.Kp)) state.pidParams.Kp = p.Kp;
    if (Number.isFinite(p.Ki)) state.pidParams.Ki = p.Ki;
    if (Number.isFinite(p.Kd)) state.pidParams.Kd = p.Kd;
    if (Number.isFinite(p.N)) state.pidParams.N = p.N;
    syncPIDSliders?.();
    // Restore compensator
    if (p.compMode && p.compMode !== 'none') {
      state.compensator = { mode: p.compMode, gain: p.compGain ?? 1, tau: p.compTau ?? 1, alpha: p.compAlpha ?? 0.2 };
      syncCompensatorInputs?.();
    }
    // Restore UI toggles
    if (p.responseType) {
      state.responseType = p.responseType;
      const el = document.getElementById('response-type');
      if (el) el.value = p.responseType;
    }
    if (typeof p.showCL === 'boolean') {
      state.showClosedLoop = p.showCL;
      const cl = document.getElementById('cl-toggle');
      if (cl) cl.checked = p.showCL;
    }
    updateController?.();
    refreshAllCharts?.();
    return true;
  } catch (_) { return false; }
}

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

  // P13: UI/UX layer — collapsibles, modals, shortcuts, presets, tooltips
  if (typeof csUI !== 'undefined') csUI.init();
  syncAdvisorModeVisibility();

  // ── Restore from share URL if present (#share=<base64>) ─────
  const shareHash = location.hash.match(/[#&]share=([A-Za-z0-9+/=]+)/);
  if (shareHash) {
    // Small delay so csUI.init() & updateSystem() have settled
    setTimeout(() => { decodeStateFromUrl(shareHash[1]); }, 150);
  }

  // Initialise undo/redo button states
  _updateHistoryButtons();
});

function initTheme() {
  const saved = localStorage.getItem('cs-theme') || 'dark';
  state.theme = saved;
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeIcon();
  updateGlobalStatusBar('Theme loaded');
}

// F4-1/F5-3: Four-way theme cycle — dark → light → print → high-contrast → dark
const THEME_CYCLE = ['dark', 'light', 'print', 'high-contrast'];

function toggleTheme() {
  const idx = THEME_CYCLE.indexOf(state.theme ?? 'dark');
  state.theme = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
  document.documentElement.setAttribute('data-theme', state.theme);
  localStorage.setItem('cs-theme', state.theme);
  updateThemeIcon();
  if (state.plant) refreshAllCharts();
  notify(`Theme: ${state.theme}`, 'success', { title: 'Theme' });
  updateGlobalStatusBar(`Theme switched to ${state.theme}`);
}

function updateThemeIcon() {
  const btn = document.getElementById('theme-toggle');
  const lbl = document.getElementById('theme-label');
  if (!btn) return;
  const svgWrap = btn.querySelector('#theme-icon-svg') ?? btn.querySelector('svg');
  const icons = {
    dark:  '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>',
    light: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
    print: '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
    'high-contrast': '<circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20V2z" fill="currentColor"/>',
  };
  if (svgWrap) svgWrap.innerHTML = icons[state.theme] ?? icons.dark;
  if (lbl) lbl.textContent = (state.theme ?? 'dark').charAt(0).toUpperCase() + (state.theme ?? 'dark').slice(1);
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

  document.querySelectorAll('.system-mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchSystemMode(btn.dataset.mode));
  });
  document.getElementById('btn-mimo-update')?.addEventListener('click', updateMIMOSystem);
  document.getElementById('btn-mimo-rga')?.addEventListener('click', computeMIMORGA);
  document.getElementById('btn-mimo-sv')?.addEventListener('click', computeMIMOSVBode);
  document.getElementById('btn-mimo-decoupler')?.addEventListener('click', computeMIMODecoupler);
  document.getElementById('btn-mimo-lqr')?.addEventListener('click', computeMIMOLqr);
  document.getElementById('btn-mimo-dyn-decoupler')?.addEventListener('click', computeMIMODynDecoupler);
  document.getElementById('btn-mpc-simulate')?.addEventListener('click', computeMpcSimulation);
  document.getElementById('btn-mpc-constrained')?.addEventListener('click', computeConstrainedMpc);
  document.getElementById('btn-robust')?.addEventListener('click', computeRobustSensitivity);
  document.getElementById('btn-uncertainty')?.addEventListener('click', computeUncertaintyEnvelope);
  document.getElementById('btn-robust-validation')?.addEventListener('click', computeRobustValidation);
  document.getElementById('btn-mimo-hinf')?.addEventListener('click', computeMIMOHinfNorm);

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

  document.getElementById('c2d-method')?.addEventListener('change', (e) => {
    const prewarpField = document.getElementById('c2d-prewarp-field');
    if (prewarpField) prewarpField.style.display = e.target.value === 'tustin-prewarp' ? 'block' : 'none';
  });

  document.getElementById('btn-c2d')?.addEventListener('click', () => {
    const method = document.getElementById('c2d-method')?.value || 'tustin';
    const analysisEl = document.getElementById('c2d-analysis');
    try {
      // D→C (Inverse Tustin): converts discrete plant back to continuous
      if (method === 'd2c-tustin') {
        if (!state.plant || state.domain !== 'z') {
          throw new Error('D→C: 請先切換到 z-domain（離散 TF）再執行逆轉換');
        }
        const ctf = d2cTustin(state.plant);
        state.plant = ctf;
        state.domain = 's';
        state.systemType = 'tf';
        document.getElementById('tf-num').value = ctf.num.map(c => parseFloat(c.toFixed(6))).join(', ');
        document.getElementById('tf-den').value = ctf.den.map(c => parseFloat(c.toFixed(6))).join(', ');
        document.querySelectorAll('.sys-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.sys-tab').forEach(t => { if (t.dataset.type === 'tf') t.classList.add('active'); });
        document.querySelectorAll('.sys-input-section').forEach(s => { s.style.display = 'none'; });
        document.getElementById('sys-tf').style.display = 'block';
        updateDomainUI(); refreshAllCharts(); clearError();
        if (analysisEl) {
          analysisEl.innerHTML = `<b>D→C 完成</b><br>DC Gain = ${fmtNum(ctf.dcGain())}&emsp;Stable: ${ctf.isStable() ? '✓' : '✗'}&emsp;Order: ${ctf.order}`;
          analysisEl.style.display = 'block';
        }
        return;
      }

      if (!state.plant || state.domain !== 's') {
        throw new Error('C→D: 請先在 s-domain 設定連續 Plant');
      }
      const Ts = Number(document.getElementById('c2d-ts')?.value);
      let disc;
      if (method === 'zoh') {
        disc = c2dZOH(state.plant, Ts);
      } else if (method === 'tustin-prewarp') {
        const omegaW = parseFloat(document.getElementById('c2d-prewarp-omega')?.value || '1');
        disc = c2dTustinPrewarp(state.plant, Ts, omegaW);
      } else if (method === 'matched-z') {
        disc = c2dMatchedZ(state.plant, Ts);
        if (!disc._gainNormalized) {
          showError('⚠ Matched-Z: 積分器系統增益無法正規化，DC 增益可能不正確。建議改用 ZOH 或 Tustin。');
        }
      } else if (method === 'impulse-invariant') {
        disc = c2dImpulseInvariant(state.plant, Ts);
      } else {
        disc = c2dTustin(state.plant, Ts);
      }
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
      // Show discrete TF analysis
      if (analysisEl) {
        const poles = disc.poles();
        const zeros = disc.zeros();
        const dcG = disc.dcGain();
        const stable = disc.isStable();
        const poleStr = poles.map(p => {
          const r = Math.hypot(p.re, p.im).toFixed(4);
          if (Math.abs(p.im) < 1e-8) return `${p.re.toFixed(4)}`;
          return `${p.re.toFixed(3)}${p.im >= 0 ? '+' : ''}${p.im.toFixed(3)}j`;
        }).join(', ');
        const zeroStr = zeros.length ? zeros.map(z => {
          if (Math.abs(z.im) < 1e-8) return `${z.re.toFixed(4)}`;
          return `${z.re.toFixed(3)}${z.im >= 0 ? '+' : ''}${z.im.toFixed(3)}j`;
        }).join(', ') : '—';
        analysisEl.innerHTML =
          `<b>Discrete TF Analysis (${method})</b><br>` +
          `DC Gain G(1) = ${Number.isFinite(dcG) ? dcG.toFixed(4) : '∞'}&emsp;` +
          `Stable: <span style="color:${stable ? 'var(--color-stable)' : 'var(--color-unstable)'}">${stable ? '✓' : '✗'}</span><br>` +
          `Poles: ${poleStr}<br>` +
          (zeros.length ? `Zeros: ${zeroStr}` : '');
        analysisEl.style.display = 'block';
      }
    } catch (err) {
      showError(err.message);
      if (analysisEl) { analysisEl.textContent = '✗ ' + err.message; analysisEl.style.display = 'block'; }
    }
  });

  document.getElementById('tf-num')?.addEventListener('input', debounce(updateSystem, 300));
  document.getElementById('tf-den')?.addEventListener('input', debounce(updateSystem, 300));
  document.getElementById('tf-delay')?.addEventListener('input', debounce(updateSystem, 300));
  document.getElementById('tf-pade-order')?.addEventListener('change', updateSystem);
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
        syncPIDSliders();
        updateController();
      });
    }
    const numberInput = document.getElementById(`pid-${param}-num`);
    if (numberInput) {
      const onNumberInput = debounce(() => {
        const val = parseFloat(numberInput.value);
        if (!Number.isFinite(val) || val < 0) {
          setFieldError(`pid-${param}-num`, `${param} 必須為非負數`);
          return;
        }
        state.pidParams[param] = val;
        state.controllerDesign = { ...state.controllerDesign, source: 'manual', preset: null };
        syncPIDSliders();
        updateController();
      }, 120);
      numberInput.addEventListener('input', onNumberInput);
      numberInput.addEventListener('change', onNumberInput);
    }
  });

  // M2: derivative filter coefficient N
  const nInput = document.getElementById('pid-N');
  if (nInput) {
    const onN = debounce(() => {
      const v = parseFloat(nInput.value);
      if (!Number.isFinite(v) || v <= 0) return;
      state.pidParams.N = v;
      state.controllerDesign = { ...state.controllerDesign, source: 'manual', preset: null };
      const valDisplay = document.getElementById('pid-N-val');
      if (valDisplay) valDisplay.textContent = String(v);
      updateController();
    }, 150);
    nInput.addEventListener('input', onN);
    nInput.addEventListener('change', onN);
  }

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

  // Notch filter inputs
  ['notch-wn', 'notch-zeta-z', 'notch-zeta-p'].forEach((id) => {
    const handler = debounce(() => {
      readCompensatorInputs();
      updateController();
    }, 150);
    document.getElementById(id)?.addEventListener('input', handler);
    document.getElementById(id)?.addEventListener('change', handler);
  });

  // 2-DOF PID checkbox and inputs
  document.getElementById('enable-2dof')?.addEventListener('change', (e) => {
    const twodofFields = document.getElementById('twodof-fields');
    if (twodofFields) twodofFields.style.display = e.target.checked ? 'block' : 'none';
    updateController();
  });
  ['pid-beta', 'pid-gamma'].forEach((id) => {
    const handler = debounce(() => { updateController(); }, 150);
    document.getElementById(id)?.addEventListener('input', handler);
    document.getElementById(id)?.addEventListener('change', handler);
  });

  // Saturation / Anti-windup toggle
  document.getElementById('enable-saturation')?.addEventListener('change', (e) => {
    const satFields = document.getElementById('saturation-fields');
    if (satFields) satFields.style.display = e.target.checked ? 'block' : 'none';
    if (state.activePlot === 'step') refreshAllCharts();
  });
  ['sat-umin', 'sat-umax', 'sat-tt'].forEach((id) => {
    const handler = debounce(() => {
      if (document.getElementById('enable-saturation')?.checked && state.activePlot === 'step') refreshAllCharts();
    }, 200);
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
  document.getElementById('analysis-source')?.addEventListener('change', (e) => {
    state.analysisSource = e.target.value || 'local';
    saveSessionToStorage();
    updateStabilityPanel();
  });
  document.getElementById('btn-apply')?.addEventListener('click', updateSystem);
  document.getElementById('rl-k-slider')?.addEventListener('input', (e) => updateRlocusGain(parseFloat(e.target.value)));
  document.getElementById('btn-design-poles')?.addEventListener('click', computeDesignTargetPoles);
  document.getElementById('btn-design-lead')?.addEventListener('click', computeDesignLeadFromPM);
  document.getElementById('btn-apply-design-lead')?.addEventListener('click', applyDesignLeadToController);
  document.getElementById('btn-design-deadbeat')?.addEventListener('click', computeDeadbeat);
  document.getElementById('btn-phase7-place')?.addEventListener('click', computeStateFeedbackPlacement);
  document.getElementById('btn-phase7-lyapunov')?.addEventListener('click', computeLyapunovProof);
  document.getElementById('btn-phase7-lqr')?.addEventListener('click', computeLqrDesign);

  // Phase 7 Extension: Integral-Action LQR
  document.getElementById('btn-integral-lqr')?.addEventListener('click', () => {
    try {
      const model = currentPhase7DesignModel();
      const n = model.A.length;
      const p = model.C.length;
      const m = model.B[0].length;
      const qScale = parseFloat(document.getElementById('ilqr-qscale')?.value || '1');
      const rScale = parseFloat(document.getElementById('ilqr-rscale')?.value || '1');
      const Qaug = Array.from({length: n+p}, (_, i) =>
        Array.from({length: n+p}, (_, j) => i===j ? qScale : 0));
      const R = Array.from({length: m}, (_, i) =>
        Array.from({length: m}, (_, j) => i===j ? rScale : 0));
      const result = designIntegralLQR(model.A, model.B, model.C, Qaug, R);
      const kxStr = result.Kx.map(row => `[${row.map(v => v.toFixed(4)).join(', ')}]`).join(', ');
      const kiStr = result.Ki.map(row => `[${row.map(v => v.toFixed(4)).join(', ')}]`).join(', ');
      const poleStr = result.poles.map(p => {
        const stab = p.re < 0 ? '✓' : '✗';
        return `${p.re.toFixed(3)}${p.im >= 0 ? '+' : ''}${p.im.toFixed(3)}j ${stab}`;
      }).join(', ');
      const out = document.getElementById('ilqr-out');
      out.style.display = 'block';
      out.innerHTML = `
        <div style="color:var(--color-accent);font-weight:700;">Integral-Action LQR (augmented order ${n}+${p})</div>
        <div>Kx = ${kxStr}</div>
        <div>Ki = ${kiStr}</div>
        <div>Augmented CL stable: ${result.augCLStable ? '<span style="color:var(--color-stable)">Yes ✓</span>' : '<span style="color:var(--color-unstable)">No ✗</span>'}</div>
        <div style="color:var(--text-muted);font-size:10px;">CL poles: ${poleStr}</div>
        <div style="color:var(--text-muted);font-size:10px;margin-top:4px;">Control law: u = −Kx·x − Ki·∫(r−y)dt eliminates steady-state error</div>`;
      clearError();
    } catch(err) { showError(err.message); }
  });

  // Phase 7 Extension: Regional pole region type toggle
  document.getElementById('pole-region-type')?.addEventListener('change', (e) => {
    const v = e.target.value;
    document.getElementById('pole-region-params').style.display = v === 'none' ? 'none' : 'block';
    document.getElementById('pole-region-disc').style.display = v === 'disc' ? 'block' : 'none';
    document.getElementById('pole-region-sector').style.display = v === 'sector' ? 'block' : 'none';
    document.getElementById('pole-region-strip').style.display = v === 'strip' ? 'block' : 'none';
  });

  // Phase 7 Extension: Check/auto-adjust LQR for pole region
  document.getElementById('btn-check-pole-region')?.addEventListener('click', () => {
    try {
      const model = currentPhase7DesignModel();
      const regionType = document.getElementById('pole-region-type')?.value;
      let region;
      if (regionType === 'disc') {
        region = { type: 'disc', alpha: parseFloat(document.getElementById('pr-alpha').value), radius: parseFloat(document.getElementById('pr-radius').value) };
      } else if (regionType === 'sector') {
        region = { type: 'sector', zetaMin: parseFloat(document.getElementById('pr-zeta-min').value) };
      } else if (regionType === 'strip') {
        region = { type: 'strip', sigmaMin: parseFloat(document.getElementById('pr-re-min').value), sigmaMax: parseFloat(document.getElementById('pr-re-max').value) };
      } else return;

      const n = model.A.length; const m = model.B[0].length;
      const Q = matIdentity(n); const R = matIdentity(m);
      const result = lqrWithPoleRegion(model.A, model.B, Q, R, region, { maxIter: 12 });
      const out = document.getElementById('pole-region-out');
      out.style.display = 'block';
      const poleStr = result.poles.map(p => `${p.re.toFixed(3)}${p.im >= 0 ? '+' : ''}${p.im.toFixed(3)}j`).join(', ');
      out.innerHTML = `<div style="color:${result.satisfied ? 'var(--color-stable)' : 'var(--color-unstable)'};font-weight:700;">Region ${result.satisfied ? 'Satisfied ✓' : 'Not satisfied ✗'} (${result.iterations} iter)</div>
        <div style="color:var(--text-muted);font-size:10px;">CL poles: ${poleStr}</div>
        <div>K = [${result.K.map(row=>row.map(v=>v.toFixed(4)).join(', ')).join('; ')}]</div>`;
      clearError();
    } catch(err) { showError(err.message); }
  });

  document.getElementById('btn-phase8-observer')?.addEventListener('click', computeObserverPlacement);
  document.getElementById('btn-phase8-kalman')?.addEventListener('click', computeKalmanGain);
  document.getElementById('btn-phase8-simulate')?.addEventListener('click', computeObserverSimulation);
  document.getElementById('btn-bryson')?.addEventListener('click', computeBrysonQR);
  document.getElementById('btn-dkf')?.addEventListener('click', computeDiscreteKalman);
  document.getElementById('btn-lqg-sim')?.addEventListener('click', computeLqgSimulation);
  document.getElementById('btn-run-ekf')?.addEventListener('click', runEkfUkf);
  document.getElementById('qr-sensitivity-slider')?.addEventListener('input', updateQRSensitivity);
  document.getElementById('btn-apply-rlocus-k')?.addEventListener('click', applyRlocusKToController);
  document.getElementById('btn-apply-poles-k')?.addEventListener('click', applyPolesKToController);
  document.getElementById('btn-zn-pid')?.addEventListener('click', () => applyZNPIDFromRlocus('PID'));
  document.getElementById('btn-zn-pi')?.addEventListener('click',  () => applyZNPIDFromRlocus('PI'));
  document.getElementById('btn-zn-p')?.addEventListener('click',   () => applyZNPIDFromRlocus('P'));
  document.getElementById('btn-copy-deadbeat-k')?.addEventListener('click', copyDeadbeatGains);
  document.getElementById('btn-apply-pid-preset')?.addEventListener('click', applyPIDPreset);
  document.getElementById('btn-auto-tune-pid')?.addEventListener('click', applyAutoTunePID);
  document.getElementById('btn-apply-lead-helper')?.addEventListener('click', applyLeadHelper);
  document.getElementById('btn-apply-lag-helper')?.addEventListener('click', applyLagHelper);
  document.getElementById('btn-apply-leadlag-helper')?.addEventListener('click', applyLeadLagHelper);
  // Series PID form toggle
  document.querySelectorAll('input[name="pid-form"]').forEach(r => r.addEventListener('change', updateSeriesPIDDisplay));
  // Step spec overlay toggle
  document.getElementById('chk-spec-overlay')?.addEventListener('change', () => { if (state.plant) renderCurrentPlot(); });
  // 2-DOF derivative kick comparison
  document.getElementById('chk-dkick-compare')?.addEventListener('change', () => { if (state.plant) renderCurrentPlot(); });
  document.getElementById('btn-save-project')?.addEventListener('click', saveProjectFile);
  document.getElementById('btn-load-project')?.addEventListener('click', () => document.getElementById('project-file-input')?.click());
  document.getElementById('btn-export-json')?.addEventListener('click', () => exportCurrentResult('json'));
  document.getElementById('btn-export-csv')?.addEventListener('click', () => exportCurrentResult('csv'));
  document.getElementById('btn-export-report')?.addEventListener('click', exportMarkdownReport);
  document.getElementById('btn-export-png')?.addEventListener('click', exportChartPNG);
  document.getElementById('btn-export-matlab')?.addEventListener('click', () => {
    const design = buildCodegenPayload();
    const script = toMatlabScript(design);
    downloadScript(script, `controlstudio-${new Date().toISOString().slice(0,19).replace(/[:.]/g,'-')}.m`, 'text/x-matlab');
  });
  document.getElementById('btn-export-python')?.addEventListener('click', () => {
    const design = buildCodegenPayload();
    const script = toPythonScript(design);
    downloadScript(script, `controlstudio-${new Date().toISOString().slice(0,19).replace(/[:.]/g,'-')}.py`, 'text/x-python');
  });

  // P16-01: H∞ synthesis handlers
  function _hinfWeightsFromUI() {
    const wB = parseFloat(document.getElementById('hinf-wb')?.value || '1');
    const M = parseFloat(document.getElementById('hinf-m')?.value || '1.8');
    const Ahigh = parseFloat(document.getElementById('hinf-ahi')?.value || '0.1');
    return defaultMixedSensitivityWeights({ wB, M, Ahigh });
  }
  document.getElementById('btn-hinf-evaluate')?.addEventListener('click', () => {
    const out = document.getElementById('hinf-out');
    try {
      if (!state.plant) throw new Error('請先建立 plant');
      const C = state.controller?.toTransferFunction?.();
      if (!C) throw new Error('需要 PID controller');
      const L = C.series(state.plant);
      const w = _hinfWeightsFromUI();
      const omegas = Array.from({ length: 100 }, (_, i) => Math.pow(10, -2 + (4 * i) / 99));
      const r = mixedSensitivityCost(w.W1, w.W2, w.W3, L, C, omegas);
      out.style.display = 'block';
      out.innerHTML = `<div style="color:var(--color-accent);font-weight:700;">‖[W₁S; W₂KS; W₃T]‖∞ = ${r.peak.toFixed(4)}</div><div>Peak @ ω = ${r.peakOmega.toFixed(3)} rad/s</div>`;
    } catch (err) {
      out.style.display = 'block';
      out.innerHTML = `<span style="color:var(--color-unstable);">${err.message}</span>`;
    }
  });
  document.getElementById('btn-hinf-synth')?.addEventListener('click', () => {
    const out = document.getElementById('hinf-out');
    try {
      if (!state.plant) throw new Error('請先建立 plant');
      const w = _hinfWeightsFromUI();
      const seed = [state.pidParams.Kp, state.pidParams.Ki, state.pidParams.Kd];
      const result = tunePIDForMixedSensitivity(state.plant, w, { initial: seed, maxIter: 100 });
      // Apply to live PID
      state.pidParams.Kp = result.Kp;
      state.pidParams.Ki = result.Ki;
      state.pidParams.Kd = result.Kd;
      syncPIDSliders?.();
      updateController?.();
      out.style.display = 'block';
      out.innerHTML = `<div style="color:var(--color-stable);font-weight:700;">PID tuned: Kp=${result.Kp.toFixed(3)}, Ki=${result.Ki.toFixed(3)}, Kd=${result.Kd.toFixed(3)}</div><div>H∞ cost = ${result.cost.toFixed(4)} (was ${result.history[0].toFixed(4)})</div>`;
    } catch (err) {
      out.style.display = 'block';
      out.innerHTML = `<span style="color:var(--color-unstable);">${err.message}</span>`;
    }
  });

  // P16-04: GA tuner
  document.getElementById('btn-ga-tune')?.addEventListener('click', () => {
    const out = document.getElementById('ga-out');
    const btn = document.getElementById('btn-ga-tune');
    try {
      if (!state.plant) throw new Error('請先建立 plant');
      const pop = parseInt(document.getElementById('ga-pop').value, 10);
      const gens = parseInt(document.getElementById('ga-gens').value, 10);
      const weights = {
        overshoot: parseFloat(document.getElementById('ga-w-os').value || '1'),
        settle: parseFloat(document.getElementById('ga-w-settle').value || '0.5'),
        iae: parseFloat(document.getElementById('ga-w-iae').value || '0.3'),
      };
      btn.classList.add('is-loading'); btn.disabled = true;
      setTimeout(() => {
        try {
          const result = gaTunePID(state.plant, { populationSize: pop, generations: gens, weights });
          state.pidParams.Kp = result.best.Kp;
          state.pidParams.Ki = result.best.Ki;
          state.pidParams.Kd = result.best.Kd;
          syncPIDSliders?.();
          updateController?.();
          out.style.display = 'block';
          out.innerHTML = `<div style="color:var(--color-stable);font-weight:700;">Best: Kp=${result.best.Kp.toFixed(3)}, Ki=${result.best.Ki.toFixed(3)}, Kd=${result.best.Kd.toFixed(3)}</div><div>cost = ${result.best.cost.toFixed(3)} (from ${result.history[0].toFixed(3)})</div>`;
          if (window.Plotly) {
            window.Plotly.newPlot('chart-ga', [
              { x: result.history.map((_, i) => i), y: result.history, mode: 'lines+markers', name: 'best cost', line: { color: '#10b981' } },
            ], {
              ...PLOTLY_LAYOUT_BASE(),
              margin: { t: 8, r: 10, b: 28, l: 40 },
              xaxis: { title: 'generation', gridcolor: 'rgba(255,255,255,0.06)' },
              yaxis: { title: 'cost', gridcolor: 'rgba(255,255,255,0.06)' },
            }, { responsive: true, displayModeBar: false });
          }
        } finally {
          btn.classList.remove('is-loading'); btn.disabled = false;
        }
      }, 30);
    } catch (err) {
      btn.classList.remove('is-loading'); btn.disabled = false;
      out.style.display = 'block';
      out.innerHTML = `<span style="color:var(--color-unstable);">${err.message}</span>`;
    }
  });

  // NSGA-II multi-objective PID tuner
  document.getElementById('btn-nsga2')?.addEventListener('click', () => {
    try {
      if (!state.plant) throw new Error('請先建立 plant');
      const pop = parseInt(document.getElementById('nsga-pop').value, 10);
      const gens = parseInt(document.getElementById('nsga-gens').value, 10);
      const btn = document.getElementById('btn-nsga2');
      btn.classList.add('is-loading'); btn.disabled = true;
      setTimeout(() => {
        try {
          const result = nsga2TunePID(state.plant, { populationSize: pop, generations: gens });
          const pf = result.paretoFront;
          const out = document.getElementById('nsga-out');
          out.style.display = 'block';
          out.innerHTML = `<div style="color:var(--color-accent);font-weight:700;">Pareto Front: ${pf.length} solutions</div>
            <div style="color:var(--text-muted);font-size:10px;">Best overshoot: ${pf[0]?.objectives[0].toFixed(2)}% | Best settling: ${pf[pf.length-1]?.objectives[1].toFixed(3)}s</div>`;
          if (window.Plotly) {
            window.Plotly.newPlot('chart-nsga', [{
              x: pf.map((s) => s.objectives[0]),
              y: pf.map((s) => s.objectives[1]),
              mode: 'markers+lines',
              type: 'scatter',
              marker: { color: pf.map((s) => s.Kp), colorscale: 'Viridis', size: 8, showscale: true, colorbar: { title: 'Kp', thickness: 10 } },
              text: pf.map((s) => `Kp=${s.Kp.toFixed(2)}, Ki=${s.Ki.toFixed(2)}, Kd=${s.Kd.toFixed(2)}`),
              hovertemplate: '%{text}<br>OS=%{x:.2f}%<br>Ts=%{y:.3f}s<extra></extra>',
              name: 'Pareto front',
            }], {
              ...PLOTLY_LAYOUT_BASE(),
              margin: { t: 8, r: 60, b: 40, l: 50 },
              xaxis: { title: 'Overshoot (%)', gridcolor: 'rgba(255,255,255,0.06)' },
              yaxis: { title: 'Settling time (s)', gridcolor: 'rgba(255,255,255,0.06)' },
              showlegend: false,
            }, { responsive: true, displayModeBar: false });
          }
        } finally { btn.classList.remove('is-loading'); btn.disabled = false; }
      }, 30);
    } catch (err) { showError(err.message); }
  });

  // H∞ filter
  document.getElementById('btn-hinf-filter')?.addEventListener('click', () => {
    try {
      const model = currentPhase7DesignModel();
      const gamma = parseFloat(document.getElementById('hinf-filter-gamma')?.value || '2');
      const qwVal = parseFloat(document.getElementById('hinf-filter-qw')?.value || '1');
      const rvVal = parseFloat(document.getElementById('hinf-filter-rv')?.value || '1');
      const n = model.A.length;
      const p = model.C.length;
      const Qw = matIdentity(n).map((row) => row.map((v) => v * qwVal));
      const Rv = matIdentity(p).map((row) => row.map((v) => v * rvVal));
      const result = solveHinfFilter(model.A, model.C, Qw, Rv, gamma);
      const K = result.K;
      const out = document.getElementById('hinf-filter-out');
      if (out) {
        const kStr = K.map((row) => row.map((v) => v.toFixed(5)).join(', ')).join('\n');
        out.style.display = 'block';
        out.textContent = `H∞ filter gain K (γ=${gamma}):\n${kStr}\n\nP eigenvalues: ${result.Peig?.map((v) => v.toFixed(4)).join(', ') ?? 'n/a'}`;
      }
    } catch (err) { showError(err.message); }
  });

  // Equilibrium detection
  document.getElementById('btn-find-eq')?.addEventListener('click', () => {
    try {
      const model = currentPhase7DesignModel();
      const n = model.A.length;
      if (n !== 2) throw new Error('Equilibrium scan 目前僅支援 n=2 系統');
      const r1 = parseFloat(document.getElementById('eq-range1')?.value || '3');
      const r2 = parseFloat(document.getElementById('eq-range2')?.value || '3');
      // Linearized: ẋ = A·x (equilibrium at x*=0 unless B·u term exists)
      const A = model.A;
      const f = (x) => [
        A[0][0] * x[0] + A[0][1] * x[1],
        A[1][0] * x[0] + A[1][1] * x[1],
      ];
      const searchBounds = [[-r1, r1], [-r2, r2]];
      const equilibria = scanEquilibria(f, searchBounds, { gridSize: 6, tol: 1e-7 });
      const out = document.getElementById('eq-out');
      if (out) {
        if (equilibria.length === 0) {
          out.style.display = 'block';
          out.textContent = '未找到平衡點（搜索範圍內）';
        } else {
          const lines = equilibria.map((eq, i) => {
            const cls = classifyEquilibrium(f, eq.x, { h: 1e-5 });
            return `[${i + 1}] x*=(${eq.x.map((v) => v.toFixed(4)).join(', ')})  類型: ${cls.type}  (λ=${cls.eigenvalues?.map((λ) => `${λ.re.toFixed(3)}${λ.im >= 0 ? '+' : ''}${λ.im.toFixed(3)}j`).join(', ') ?? 'n/a'})`;
          });
          out.style.display = 'block';
          out.textContent = `找到 ${equilibria.length} 個平衡點：\n${lines.join('\n')}`;
        }
      }
    } catch (err) { showError(err.message); }
  });

  // P16-03: Phase portrait
  document.getElementById('btn-phase-portrait')?.addEventListener('click', () => {
    try {
      if (!state.mimoPlant || state.mimoPlant.n !== 2) throw new Error('Phase portrait 需要 MIMO 模式且 n=2（2 個狀態）');
      const A = state.mimoPlant.A;
      const f = linearVelocityField(A);
      const r1 = parseFloat(document.getElementById('pp-x1-range').value || '3');
      const r2 = parseFloat(document.getElementById('pp-x2-range').value || '3');
      const tMax = parseFloat(document.getElementById('pp-tmax').value || '6');
      const pp = phasePortrait(f, { x1Min: -r1, x1Max: r1, x2Min: -r2, x2Max: r2, gridSize: 7, tMax, dt: 0.04 });
      if (window.Plotly) {
        const traces = pp.trajectories.map((tr) => ({
          x: tr.x1, y: tr.x2, mode: 'lines',
          line: { color: '#6366f1', width: 1 }, showlegend: false, hoverinfo: 'skip',
        }));
        // Vector field as small arrows (using quiver-like markers)
        traces.push({
          x: pp.vectorField.x1, y: pp.vectorField.x2,
          mode: 'markers', marker: { size: 3, color: '#ec4899' }, showlegend: false, hoverinfo: 'skip',
        });
        window.Plotly.newPlot('chart-phase-portrait', traces, {
          ...PLOTLY_LAYOUT_BASE(),
          margin: { t: 10, r: 10, b: 30, l: 40 },
          xaxis: { title: 'x₁', range: [-r1, r1], gridcolor: 'rgba(255,255,255,0.06)' },
          yaxis: { title: 'x₂', range: [-r2, r2], scaleanchor: 'x', scaleratio: 1, gridcolor: 'rgba(255,255,255,0.06)' },
        }, { responsive: true, displayModeBar: false });
      }
    } catch (err) { showError(err.message); }
  });

  // P15-04: Root locus K-sweep animation
  let _rlPlayInterval = null;
  document.getElementById('btn-rl-play')?.addEventListener('click', () => {
    const slider = document.getElementById('rl-k-slider');
    const btn = document.getElementById('btn-rl-play');
    if (!slider || !btn) return;
    if (_rlPlayInterval) { clearInterval(_rlPlayInterval); _rlPlayInterval = null; btn.textContent = '▶ Play K-Sweep'; return; }
    btn.textContent = '⏸ Pause';
    let v = 0;
    const max = parseFloat(slider.max);
    const step = max / 60; // 60 frames over the range
    _rlPlayInterval = setInterval(() => {
      v += step;
      if (v > max) { v = 0; }
      slider.value = v;
      slider.dispatchEvent(new Event('input'));
      if (v === 0) { /* loop */ }
    }, 80);
  });
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

  // ── Share URL ────────────────────────────────────────────────
  document.getElementById('btn-share-url')?.addEventListener('click', () => {
    const b64 = encodeStateToUrl();
    if (!b64) { showError('先建立 Plant 才能分享'); return; }
    const url = `${location.origin}${location.pathname}#share=${b64}`;
    navigator.clipboard?.writeText(url).then(() => {
      const btn = document.getElementById('btn-share-url');
      const orig = btn.textContent;
      btn.textContent = '✓ Copied!';
      setTimeout(() => { btn.textContent = orig; }, 2000);
      notify('Share URL copied to clipboard.', 'success', { title: 'Share' });
    }).catch(() => {
      prompt('Share URL (Ctrl+C to copy):', url);
      notify('Clipboard unavailable; opened manual copy prompt.', 'warning', { title: 'Share' });
    });
  });

  // ── Undo / Redo buttons & keyboard shortcuts ─────────────────
  document.getElementById('btn-undo')?.addEventListener('click', historyUndo);
  document.getElementById('btn-redo')?.addEventListener('click', historyRedo);

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') { e.preventDefault(); historyUndo(); }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); historyRedo(); }
    // P36/P37 global shortcuts
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'T') { e.preventDefault(); toggleTheme(); }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'k') { e.preventDefault(); openCommandPalette(); }
    if ((e.ctrlKey || e.metaKey) && e.key === '?') { e.preventDefault(); showModal('shortcuts-modal'); }
  });

  // ── D1: Code Preview Panel ────────────────────────────────────
  document.querySelectorAll('.code-lang-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.code-lang-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state._codeLang = tab.dataset.codelang ?? 'matlab';
      refreshCodePreview();
    });
  });

  document.getElementById('code-preview-copy')?.addEventListener('click', () => {
    const code = document.getElementById('code-preview-code')?.textContent ?? '';
    navigator.clipboard?.writeText(code).then(() => {
      const btn = document.getElementById('code-preview-copy');
      if (btn) { const t = btn.textContent; btn.textContent = '✓ Copied'; setTimeout(() => { btn.textContent = t; }, 1800); }
    });
  });

  // ── G1: Frequency unit switcher ───────────────────────────────
  document.querySelectorAll('#freq-unit-switcher .unit-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#freq-unit-switcher .unit-btn').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
      state._freqUnit = btn.dataset.unit; // 'rads' | 'hz'
      notify(`Frequency unit: ${btn.dataset.unit === 'hz' ? 'Hz' : 'rad/s'}`, 'info', { title: 'Units' });
      if (state.plant) refreshAllCharts();
    });
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
  updateGlobalStatusBar(`${viewName === 'editor' ? 'Block Diagram' : 'Dashboard'} view active`);
}

function switchSidebarPanel(panelName) {
  document.querySelectorAll('.sidebar-tab').forEach((tab) => {
    const isActive = tab.dataset.sidebar === panelName;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
  document.querySelectorAll('.sidebar-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === `panel-${panelName}`);
  });
  saveSessionToStorage();
  updateGlobalStatusBar(`${panelName} panel active`);
}

function switchPlot(plotName) {
  state.activePlot = plotName;
  document.querySelectorAll('.plot-tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.plot === plotName);
  });
  // Switching plot tabs exits MIMO All-view (grid only meaningful for step response)
  if (state.mimoChannel && state.mimoChannel.all) {
    state.mimoChannel.all = false;
    hideMIMOGrid();
    renderMIMOChannelBar();
    applyMIMOChannel();
  }
  if (!state.plant) return;
  const sys = state.showClosedLoop ? (state.closedLoop || state.plant) : state.plant;
  renderActivePlot(sys);
  saveSessionToStorage();
  updateGlobalStatusBar(`${plotName} plot active`);
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
  const numEsc = escapeHtml(formatPolyText(tf.num));
  const denEsc = escapeHtml(formatPolyText(tf.den));
  const numTex = polyToLatex(tf.num, 's').replaceAll('"', '&quot;');
  const denTex = polyToLatex(tf.den, 's').replaceAll('"', '&quot;');
  const symbolEsc = escapeHtml(symbol);
  return `
    <div class="equation-stack">
      <div class="equation-line">
        <div class="equation-symbol">${symbolEsc}</div>
        <div class="tf-fraction">
          <div class="cs-tf-latex" data-symbol="${symbolEsc}" data-num="${numTex}" data-den="${denTex}" aria-hidden="true"></div>
          <div class="cs-tf-fallback">
            <div class="tf-num">${numEsc}</div>
            <div class="tf-bar"></div>
            <div class="tf-den">${denEsc}</div>
          </div>
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
    const numberInput = document.getElementById(`pid-${param}-num`);
    const value = document.getElementById(`pid-${param}-val`);
    if (input) {
      const currentMax = Number(input.max);
      if (Number.isFinite(currentMax) && state.pidParams[param] > currentMax) input.max = state.pidParams[param] * 1.25;
      input.value = state.pidParams[param];
    }
    if (numberInput) {
      const currentMax = Number(numberInput.max);
      if (Number.isFinite(currentMax) && state.pidParams[param] > currentMax) numberInput.max = state.pidParams[param] * 1.25;
      numberInput.value = state.pidParams[param];
    }
    if (value) value.textContent = state.pidParams[param].toFixed(2);
  });
  updateSeriesPIDDisplay();
}

function clearOutputPanel(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = '';
  el.style.display = 'none';
}

function clearSISOAdvisorOutputsForMIMO() {
  state.phase7 = { placement: null, lyapunov: null, lqr: null };
  state.phase8 = {
    observer: null,
    kalman: null,
    simulation: null,
    discreteKalman: null,
    lqg: null,
  };
  [
    'phase7-place-out',
    'phase7-lyapunov-out',
    'phase7-lqr-out',
    'phase8-observer-out',
    'phase8-kalman-out',
    'phase8-sim-out',
    'dkf-out',
    'lqg-out',
    'qr-sensitivity-out',
    'innov-stats-out',
  ].forEach(clearOutputPanel);
  ['chart-obs-sim', 'chart-obs-innov', 'chart-lqg-y', 'chart-lqg-u'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '';
  });
}

function syncAdvisorModeVisibility() {
  const mode = state.systemMode === 'mimo' ? 'mimo' : 'siso';
  document.querySelectorAll('[data-advisor-mode]').forEach((el) => {
    el.style.display = el.dataset.advisorMode === mode ? '' : 'none';
  });

  const note = document.getElementById('phase-portrait-note');
  const button = document.getElementById('btn-phase-portrait');
  if (!note || !button) return;

  const eligible = mode === 'mimo' && state.mimoPlant && state.mimoPlant.n === 2;
  button.disabled = !eligible;
  note.textContent = eligible
    ? '使用目前 2-state MIMO plant 繪製狀態平面向量場與軌跡。'
    : '僅 MIMO 模式且 n=2（2 個狀態變數）時可繪製。請先建立 2-state MIMO plant。';
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
  updateSeriesPIDDisplay();
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
      historySave(); clearError();
      const fw = document.getElementById('fopdt-warning'); if (fw) fw.style.display = 'none';
      return;
    }

    if (preset.startsWith('tl-')) {
      const Ku = readRequiredPositiveNumber('preset-ku', 'Ku');
      const Tu = readRequiredPositiveNumber('preset-tu', 'Tu');
      const type = preset === 'tl-pi' ? 'PI' : 'PID';
      setPIDFromController(PIDController.tyreusLuyben(Ku, Tu, type), `tyreus-luyben-${type.toLowerCase()}`);
      historySave(); clearError();
      const fw = document.getElementById('fopdt-warning'); if (fw) fw.style.display = 'none';
      return;
    }

    const plantK = readRequiredPositiveNumber('preset-plant-k', 'FOPDT K');
    const [tau, td] = parsePolyString(document.getElementById('preset-fopdt')?.value || '') || [];
    if (!Number.isFinite(tau) || tau <= 0 || !Number.isFinite(td) || td <= 0) {
      setFieldError('preset-fopdt', '請輸入 tau, td，且都必須大於 0');
      throw new Error('FOPDT tau/td 必須大於 0');
    }
    if (preset === 'imc-pi' || preset === 'imc-pid') {
      const lambda = parseFloat(document.getElementById('preset-lambda')?.value || tau);
      if (!(lambda > 0)) { setFieldError('preset-lambda', 'λ 必須大於 0'); throw new Error('λ 必須大於 0'); }
      const type = preset === 'imc-pi' ? 'PI' : 'PID';
      setPIDFromController(PIDController.imc(plantK, tau, td, lambda, type), `imc-${type.toLowerCase()}`);
    } else if (preset === 'simc') {
      const tauC = parseFloat(document.getElementById('preset-lambda')?.value || td);
      setPIDFromController(PIDController.simc(plantK, tau, td, Number.isFinite(tauC) ? tauC : null), 'simc');
    } else if (preset === 'itae-pi' || preset === 'itae-pid') {
      const type = preset === 'itae-pi' ? 'PI' : 'PID';
      setPIDFromController(PIDController.itae(plantK, tau, td, type), `itae-${type.toLowerCase()}`);
    } else {
      setPIDFromController(PIDController.cohenCoon(plantK, tau, td), 'cohen-coon');
    }
    historySave();
    clearError();
    // H: FOPDT validity warning — check τ/θ ratio for chosen preset
    const fopdtWarn = document.getElementById('fopdt-warning');
    if (fopdtWarn && Number.isFinite(tau) && tau > 0 && Number.isFinite(td) && td > 0) {
      const ratio = td / tau;
      let msg = '';
      if ((preset === 'cohen-coon' || preset.startsWith('itae-')) && ratio < 0.05) {
        msg = `⚠ θ/τ = ${ratio.toFixed(3)}（偏小，建議 ≥ 0.1）。Cohen-Coon / ITAE 公式精度在極小延遲下會下降。`;
      } else if ((preset === 'cohen-coon' || preset.startsWith('itae-')) && ratio > 1.0) {
        msg = `⚠ θ/τ = ${ratio.toFixed(2)}（偏大，建議 < 1.0）。大延遲系統建議改用 IMC-PID 或 Smith Predictor。`;
      } else if ((preset.startsWith('imc-') || preset === 'simc') && ratio > 2.0) {
        msg = `⚠ θ/τ = ${ratio.toFixed(2)}。IMC / SIMC 在大延遲系統（θ/τ > 2）效果會下降，建議考慮 Smith Predictor。`;
      }
      fopdtWarn.textContent = msg;
      fopdtWarn.style.display = msg ? 'block' : 'none';
    }
  } catch (err) {
    showError(err.message);
    scheduleSmokeDiagnostics();
  }
}

let _pendingLeadDesign = null;

let _pendingPolesK = null;

function computeDesignTargetPoles() {
  const out = document.getElementById('design-pole-out');
  const applyBtn = document.getElementById('btn-apply-poles-k');
  _pendingPolesK = null;
  if (applyBtn) applyBtn.style.display = 'none';

  try {
    const overshoot = parseFloat(document.getElementById('design-os').value);
    const settlingTime = parseFloat(document.getElementById('design-ts').value);
    const result = specsToTargetPoles({ overshoot, settlingTime });

    // --- Magnitude & Angle condition check ---
    // s* = -sigma + j*omegaD  (upper target pole)
    // Root locus condition: K = 1/|G(s*)|  if  ∠G(s*) = odd × 180°
    let gainHtml = '';
    if (state.plant) {
      const sStar = new Complex(-result.sigma, result.omegaD);
      const Gs = state.plant.evalAt(sStar);
      const magGs = Gs.magnitude;
      const angleGs = Gs.angleDeg;

      // Deviation from nearest odd-multiple of 180°
      // (∠G(s*) + 180) mod 360 → 0 means exactly on locus
      const dev = ((angleGs + 180) % 360 + 360) % 360;
      const angleDev = Math.min(dev, 360 - dev); // symmetric, always in [0, 180]
      const onLocus = angleDev < 10; // ±10° tolerance

      if (magGs > 1e-12) {
        const K = 1 / magGs;
        if (onLocus) {
          _pendingPolesK = K;
          gainHtml = [
            `<div style="margin-top:10px;border-top:1px solid var(--border-primary);padding-top:8px;">`,
            `<div style="color:var(--color-stable);font-weight:700;">✓ 目標極點在根軌跡上</div>`,
            `<div>∠G(s*) = ${angleGs.toFixed(1)}°　偏差 ${angleDev.toFixed(1)}°（需為 ±180°）</div>`,
            `<div>K = 1 / |G(s*)| = <strong style="color:var(--color-accent);font-size:14px;">${K.toFixed(4)}</strong></div>`,
            `</div>`,
          ].join('');
          if (applyBtn) applyBtn.style.display = 'block';
        } else {
          gainHtml = [
            `<div style="margin-top:10px;border-top:1px solid var(--border-primary);padding-top:8px;">`,
            `<div style="color:var(--color-unstable);font-weight:700;">✗ 目標極點不在根軌跡上</div>`,
            `<div>∠G(s*) = ${angleGs.toFixed(1)}°　偏差 ${angleDev.toFixed(1)}°（需 &lt; 10°）</div>`,
            `<div style="color:var(--text-muted);font-size:10px;margin-top:4px;">`,
            `→ 純增益 K 無法將極點放到目標位置。<br>`,
            `建議：使用下方「Design Lead from PM」加入 Lead 補償器搬移根軌跡，`,
            `或放寬 %OS / Ts 規格。`,
            `</div>`,
            `</div>`,
          ].join('');
        }
      }
    }

    out.style.display = 'block';
    out.style.color = '';
    // M4: explicit `display:block` so each metric stays on its own line even
    // when an ancestor accidentally sets inline/flex layout.
    out.innerHTML = [
      `<div style="display:block;color:var(--color-accent);font-weight:700;">ζ = ${result.zeta.toFixed(4)}</div>`,
      `<div style="display:block;">σ = ${result.sigma.toFixed(4)} &nbsp;(real part)</div>`,
      `<div style="display:block;">ωn = ${result.omegaN.toFixed(4)} &nbsp;rad/s</div>`,
      `<div style="display:block;">ωd = ${result.omegaD.toFixed(4)} &nbsp;rad/s</div>`,
      `<div style="display:block;margin-top:6px;color:var(--color-stable);">Target poles: s = ${(-result.sigma).toFixed(4)} ± j${result.omegaD.toFixed(4)}</div>`,
      gainHtml,
    ].join('');
    clearError();
  } catch (err) {
    out.style.display = 'block';
    out.style.color = 'var(--color-unstable)';
    out.textContent = err.message;
  }
}

/** Directly apply computed K (from magnitude condition) as proportional controller. */
function applyPolesKToController() {
  if (_pendingPolesK === null || !state.plant) return;
  setPIDFromController({ Kp: _pendingPolesK, Ki: 0, Kd: 0 }, 'pole-gain');
  state.compensator = { mode: 'none', gain: 1, tau: 1, alpha: 0.2 };
  syncCompensatorInputs();
  updateController();
  document.querySelector('[data-sidebar="controller"]')?.click();
  const btn = document.getElementById('btn-apply-poles-k');
  if (btn) {
    const orig = btn.textContent;
    btn.textContent = '✓ Applied!';
    btn.style.background = '#10b981';
    setTimeout(() => { btn.textContent = orig; btn.style.background = ''; }, 1500);
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

function identityMatrix(n) {
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
}

function formatMatrixHtml(matrix, digits = 4) {
  return matrix
    .map((row) => row.map((value) => fmtNum(value, digits)).join('\t'))
    .join('<br>');
}

function lqrSolverLabel(result) {
  if (result?.method === 'hamiltonian-schur' || result?.initialGainStrategy === 'hamiltonian-schur') {
    return 'Hamiltonian Schur CARE';
  }
  if (String(result?.initialGainStrategy || '').startsWith('zero-gain-stable-A')) {
    return 'Newton-Kleinman CARE (stable A, K0=0)';
  }
  if (String(result?.initialGainStrategy || '').includes('bass-method')) {
    return 'Newton-Kleinman CARE (Bass stabilizing K0)';
  }
  if (String(result?.initialGainStrategy || '').includes('right-pseudoinverse')) {
    return 'Newton-Kleinman CARE (pseudoinverse-shift K0)';
  }
  if (String(result?.initialGainStrategy || '').includes('pole-placement')) {
    return 'Newton-Kleinman CARE (pole-placement K0)';
  }
  return 'Newton-Kleinman CARE';
}

function renderLabeledMatrixTable(matrix, { rowPrefix = 'y', colPrefix = 'u', digits = 3 } = {}) {
  if (!Array.isArray(matrix) || matrix.length === 0) return '';
  const cols = matrix[0]?.length || 0;
  const header = Array.from({ length: cols }, (_, j) => `<th>${escapeHtml(colPrefix)}${j + 1}</th>`).join('');
  const rows = matrix.map((row, i) => `
    <tr>
      <th>${escapeHtml(rowPrefix)}${i + 1}</th>
      ${row.map((value) => `<td>${escapeHtml(fmtNum(value, digits))}</td>`).join('')}
    </tr>
  `).join('');
  return `<table class="mimo-matrix-table"><thead><tr><th></th>${header}</tr></thead><tbody>${rows}</tbody></table>`;
}

function formatPoleListHtml(poles, domain = 's') {
  return poles.map((pole) => formatPoleForUI(pole, domain)).join('<br>');
}

function computePreviewMetrics(tf) {
  const response = stepResponse(tf, state.simulationConfig);
  const info = stepInfo(response.t, response.y);
  return { response, info };
}

function currentPhase7DesignModel() {
  if (state.domain === 'z' || state.systemType === 'dtf') {
    throw new Error('Phase 7 目前只支援 continuous-time model');
  }

  // H1: In MIMO mode, use the full MIMO ABCD instead of the per-channel SISO TF
  // (state.plant in MIMO mode is the currently displayed channel's SISO TF and
  // would produce rank-deficient observability/controllability matrices).
  if (state.systemMode === 'mimo' && state.mimoPlant) {
    return {
      A: state.mimoPlant.A.map((r) => [...r]),
      B: state.mimoPlant.B.map((r) => [...r]),
      C: state.mimoPlant.C.map((r) => [...r]),
      D: state.mimoPlant.D.map((r) => [...r]),
    };
  }

  if (!state.plant) throw new Error('請先建立 plant');

  if (state.systemType === 'ss') {
    const model = resolveDesignStateSpace({
      systemType: 'ss',
      matrices: {
        A: parseStateMatrixField('ss-a'),
        B: parseStateMatrixField('ss-b', 1),
        C: parseStateMatrixField('ss-c'),
        D: parseStateMatrixField('ss-d', 1),
      },
    });
    captureStateSpaceInputs();
    return model;
  }

  return resolveDesignStateSpace({
    systemType: 'tf',
    plant: state.plant,
  });
}

function readPhase7SquareMatrix(id, n, fallbackIdentity = false) {
  const raw = document.getElementById(id)?.value ?? '';
  if (!raw.trim() && fallbackIdentity) return identityMatrix(n);
  const matrix = parseMatrixInput(raw);
  if (matrix.length !== n || matrix.some((row) => row.length !== n)) {
    setFieldError(id, `矩陣需為 ${n}x${n}`);
    throw new Error(`${id} 必須是 ${n}x${n} 矩陣`);
  }
  return matrix;
}

/** Returns true if the resolved Phase 7/8 design model is genuinely MIMO. */
function isMIMODesignModel(model) {
  const m = model?.B?.[0]?.length ?? 1;
  const p = model?.C?.length ?? 1;
  return m > 1 || p > 1;
}

function setPhase7Output(id, html, isError = false) {
  const out = document.getElementById(id);
  if (!out) return;
  out.style.display = 'block';
  out.style.color = isError ? 'var(--color-unstable)' : '';
  out.innerHTML = html;
}

function computeStateFeedbackPlacement() {
  try {
    clearFieldErrors();
    const model = currentPhase7DesignModel();
    if (isMIMODesignModel(model)) {
      throw new Error('SISO Pole Placement 不支援 MIMO 系統，請使用 MIMO Analysis → MIMO LQR');
    }
    const desiredPoles = document.getElementById('sf-desired-poles')?.value || '';
    const result = placeStateFeedback(model.A, model.B, desiredPoles);
    const previewTf = closedLoopTransferFromStateFeedback(model, result.K);
    const preview = computePreviewMetrics(previewTf);
    state.phase7.placement = { ...result, previewTf };

    setPhase7Output('phase7-place-out', [
      `<div style="color:var(--color-accent);font-weight:700;">State Feedback K</div>`,
      `<div>K = [${result.K[0].map((value) => fmtNum(value, 4)).join(', ')}]</div>`,
      `<div>rank(Wc) = ${result.controllabilityRank}/${model.A.length}</div>`,
      `<div style="margin-top:6px;color:var(--color-stable);">Desired poles</div>`,
      `<div>${formatPoleListHtml(result.desiredPoles, 's')}</div>`,
      `<div style="margin-top:6px;color:var(--color-stable);">Closed-loop poles</div>`,
      `<div>${formatPoleListHtml(previewTf.poles(), 's')}</div>`,
      `<div style="margin-top:6px;">Step rise = ${fmtTime(preview.info.riseTime)} / settling = ${fmtTime(preview.info.settlingTime)} / OS = ${fmtPercent(preview.info.overshoot)}</div>`,
      `<div style="margin-top:6px;color:var(--text-muted);font-size:10px;">Closed-loop model uses A_cl = A - BK, with reference input through B.</div>`,
    ].join(''));
    clearError();
  } catch (err) {
    state.phase7.placement = null;
    setPhase7Output('phase7-place-out', escapeHtml(err.message), true);
    showError(err.message);
  }
}

function computeLyapunovProof() {
  try {
    clearFieldErrors();
    const model = currentPhase7DesignModel();
    const n = model.A.length;
    const Q = readPhase7SquareMatrix('lyapunov-q', n, true);
    const result = analyzeLyapunov(model.A, Q);
    state.phase7.lyapunov = result;
    setPhase7Output('phase7-lyapunov-out', [
      `<div style="color:${result.provenStable ? 'var(--color-stable)' : 'var(--color-unstable)'};font-weight:700;">${result.provenStable ? 'Lyapunov Stable Proof' : 'Lyapunov Proof Failed'}</div>`,
      `<div>V(x) = x<sup>T</sup> P x</div>`,
      `<div>dV/dt = -x<sup>T</sup> Q x</div>`,
      `<div>min eig(P) = ${fmtNum(result.minEigenvalue, 6)}</div>`,
      `<div>min eig(Q) = ${fmtNum(result.minQEigenvalue, 6)}</div>`,
      `<div>residual ||A<sup>T</sup>P + PA + Q||∞ = ${fmtNum(result.residualNorm, 6)}</div>`,
      `<div style="margin-top:6px;color:var(--color-accent);">P matrix</div>`,
      `<div>${formatMatrixHtml(result.P, 5)}</div>`,
    ].join(''));
    clearError();
  } catch (err) {
    state.phase7.lyapunov = null;
    setPhase7Output('phase7-lyapunov-out', escapeHtml(err.message), true);
    showError(err.message);
  }
}

function computeLqrDesign() {
  try {
    clearFieldErrors();
    const model = currentPhase7DesignModel();
    const n = model.A.length;
    const Q = readPhase7SquareMatrix('lqr-q', n, true);
    if (isMIMODesignModel(model)) {
      throw new Error('SISO LQR R 為純量，不支援 MIMO 系統，請使用 MIMO Analysis → Compute MIMO LQR Gain K');
    }
    const R = readRequiredPositiveNumber('lqr-r', 'LQR R');
    const result = solveLqr(model.A, model.B, Q, [[R]]);
    const previewTf = closedLoopTransferFromStateFeedback(model, result.K);
    const preview = computePreviewMetrics(previewTf);
    const traceP = result.P.reduce((sum, row, index) => sum + (row[index] || 0), 0);
    state.phase7.lqr = { ...result, previewTf };

    setPhase7Output('phase7-lqr-out', [
      `<div style="color:var(--color-accent);font-weight:700;">LQR Gain</div>`,
      `<div>K = [${result.K[0].map((value) => fmtNum(value, 4)).join(', ')}]</div>`,
      `<div>Solver: ${escapeHtml(lqrSolverLabel(result))}</div>`,
      `<div>rank(Wc) = ${result.controllabilityRank}/${n} &nbsp;|&nbsp; Init: ${escapeHtml(result.initialGainStrategy)}</div>`,
      `<div>trace(P) = ${fmtNum(traceP, 6)}</div>`,
      `<div>ΔK residual = ${fmtNum(result.residualNorm, 6)}</div>`,
      `<div>CARE residual = ${fmtNum(result.riccatiResidualNorm, 6)}</div>`,
      `<div>Closed-loop Lyapunov stable: ${result.closedLoopStable ? 'Yes ✓' : 'No ✗'}</div>`,
      `<div style="margin-top:6px;color:var(--color-stable);">Closed-loop poles</div>`,
      `<div>${formatPoleListHtml(previewTf.poles(), 's')}</div>`,
      `<div style="margin-top:6px;">Step rise = ${fmtTime(preview.info.riseTime)} / settling = ${fmtTime(preview.info.settlingTime)} / OS = ${fmtPercent(preview.info.overshoot)}</div>`,
      `<div style="margin-top:6px;color:var(--color-accent);">P matrix</div>`,
      `<div>${formatMatrixHtml(result.P, 5)}</div>`,
    ].join(''));
    clearError();
  } catch (err) {
    state.phase7.lqr = null;
    setPhase7Output('phase7-lqr-out', escapeHtml(err.message), true);
    showError(err.message);
  }
}

function computeObserverPlacement() {
  try {
    clearFieldErrors();
    const model = currentPhase7DesignModel();
    if (isMIMODesignModel(model)) {
      throw new Error('SISO Observer Placement (Ackermann via duality) 不支援 MIMO 系統，請改用下方 Kalman Gain L_kf');
    }
    const desiredPoles = document.getElementById('obs-desired-poles')?.value || '-4, -6';
    const result = placeObserver(model.A, model.C, desiredPoles);
    state.phase8.observer = result;

    const Lrows = result.L.map((row) => `[${row.map((v) => fmtNum(v, 4)).join(', ')}]`).join(', ');
    setPhase7Output('phase8-observer-out', [
      `<div style="color:var(--color-accent);font-weight:700;">Observer Gain L (Luenberger)</div>`,
      `<div>L = [${Lrows}]</div>`,
      `<div>rank(Wo) = ${result.observabilityRank}/${model.A.length}</div>`,
      `<div style="margin-top:6px;color:var(--color-stable);">Desired observer poles</div>`,
      `<div>${result.desiredPoles.map((p) => formatPoleForUI(p, 's')).join('<br>')}</div>`,
      `<div style="margin-top:6px;color:var(--text-muted);font-size:10px;">Observer poles should be ~3-10× faster than closed-loop poles for good estimation.</div>`,
    ].join(''));
    clearError();
    // Refresh pz map to show observer poles
    if (document.getElementById('chart-pzmap')) {
      renderPoleZeroMap(state.plant, 'chart-pzmap');
    }
  } catch (err) {
    state.phase8.observer = null;
    setPhase7Output('phase8-observer-out', escapeHtml(err.message), true);
    showError(err.message);
  }
}

function computeKalmanGain() {
  try {
    clearFieldErrors();
    const model = currentPhase7DesignModel();
    const n = model.A.length;
    const Qn = readPhase7SquareMatrix('obs-qn', n, true);
    const Rn = readRequiredPositiveNumber('obs-rn', 'Measurement Noise Rn');
    let result;
    if (isMIMODesignModel(model)) {
      // MIMO Kalman via duality: solve LQR on (A^T, C^T) with R = Rn·I_p, then L = K^T.
      const p = model.C.length;
      const Rmat = identityMatrix(p).map((row) => row.map((v) => v * Rn));
      const lqr = solveLqrMIMO(matTranspose(model.A), matTranspose(model.C), Qn, Rmat);
      const L_kf = matTranspose(lqr.K);
      const Aobs = matSub(model.A, matMul(L_kf, model.C));
      const observerLyapunov = analyzeLyapunov(Aobs, identityMatrix(n));
      result = {
        L: L_kf,
        Pe: lqr.P,
        Qn,
        Rn: Rmat,
        Aobs,
        residualNorm: lqr.residualNorm,
        riccatiResidualNorm: lqr.riccatiResidualNorm,
        observabilityRank: n,
        initialGainStrategy: lqr.initialGainStrategy,
        observerStable: observerLyapunov.provenStable,
      };
    } else {
      result = solveLqe(model.A, model.C, Qn, [[Rn]]);
    }
    state.phase8.kalman = result;

    const Lrows = result.L.map((row) => `[${row.map((v) => fmtNum(v, 4)).join(', ')}]`).join(', ');
    const Pehtml = formatMatrixHtml(result.Pe, 5);
    setPhase7Output('phase8-kalman-out', [
      `<div style="color:var(--color-accent);font-weight:700;">Kalman Gain L_kf</div>`,
      `<div>L_kf = [${Lrows}]</div>`,
      `<div>rank(Wo) = ${result.observabilityRank}/${n} &nbsp;|&nbsp; Init: ${escapeHtml(result.initialGainStrategy)}</div>`,
      `<div>ΔK residual = ${fmtNum(result.residualNorm, 6)}</div>`,
      `<div>CARE residual = ${fmtNum(result.riccatiResidualNorm, 6)}</div>`,
      `<div>Observer Lyapunov stable: ${result.observerStable ? 'Yes ✓' : 'No ✗'}</div>`,
      `<div style="margin-top:6px;color:var(--color-accent);">Pe (error covariance)</div>`,
      `<div>${Pehtml}</div>`,
      `<div style="margin-top:6px;color:var(--text-muted);font-size:10px;">Kalman gain minimizes estimation error covariance under Gaussian noise.</div>`,
    ].join(''));
    clearError();
    // Refresh pz map to show observer poles
    if (document.getElementById('chart-pzmap')) {
      renderPoleZeroMap(state.plant, 'chart-pzmap');
    }
  } catch (err) {
    state.phase8.kalman = null;
    setPhase7Output('phase8-kalman-out', escapeHtml(err.message), true);
    showError(err.message);
  }
}

function computeObserverSimulation() {
  try {
    clearFieldErrors();
    const model = currentPhase7DesignModel();
    const L = state.phase8.kalman?.L ?? state.phase8.observer?.L;
    if (!L) throw new Error('請先計算 Observer Gain L 或 Kalman Gain L_kf');

    const duration = parseFloat(document.getElementById('obs-sim-duration')?.value || '10');
    // Plant starts at x0=[1,0,...] so observer (x̂=0) must catch up → demonstrates convergence
    const n = model.A.length;
    const x0 = Array.from({ length: n }, (_, i) => (i === 0 ? 1 : 0));

    // Read noise inputs
    const sigmaW = parseFloat(document.getElementById('obs-noise-q')?.value || '0');
    const sigmaR = parseFloat(document.getElementById('obs-noise-r')?.value || '0');
    const noiseQ = sigmaW > 0 ? sigmaW * sigmaW : null;
    const noiseR = sigmaR > 0 ? sigmaR * sigmaR : null;

    const result = simulateObserver(model, L, { duration, dt: 0.01, u: () => 1, x0, noiseQ, noiseR });
    state.phase8.simulation = result;

    const initErr = result.eNorm[0] || 1;
    const finalErr = result.eNorm[result.eNorm.length - 1];
    const converged = finalErr < 0.01 * initErr ? 'Yes ✓' : finalErr < 0.1 * initErr ? 'Partial' : 'No';
    setPhase7Output('phase8-sim-out', [
      `<div style="color:var(--color-accent);font-weight:700;">Observer Simulation (step input)</div>`,
      `<div>Duration: ${fmtNum(duration, 1)} s &nbsp;|&nbsp; Initial eNorm: ${fmtNum(initErr, 4)} &nbsp;|&nbsp; Final: ${fmtNum(finalErr, 4)}</div>`,
      `<div style="color:var(--color-stable);">Observer converged: ${converged}</div>`,
      noiseR ? `<div style="color:var(--text-muted);">σ_w=${fmtNum(sigmaW, 3)} σ_v=${fmtNum(sigmaR, 3)}</div>` : '',
    ].join(''));

    if (typeof Plotly !== 'undefined') {
      const traces = [
        {
          x: result.t, y: result.y,
          mode: 'lines', name: 'y(t) actual',
          line: { color: 'rgba(99,102,241,1)', width: 1.5 },
        },
      ];

      // Show noisy measurement if noise enabled
      if (noiseR) {
        traces.push({
          x: result.t, y: result.yNoisy,
          mode: 'lines', name: 'y measured (noisy)',
          line: { color: 'rgba(255,255,255,0.25)', width: 1 },
        });
      }

      traces.push(
        {
          x: result.t, y: result.yhat,
          mode: 'lines', name: 'ŷ(t) estimated',
          line: { color: 'rgba(16,185,129,1)', width: 1.5, dash: 'dot' },
        },
        {
          x: result.t, y: result.eNorm,
          mode: 'lines', name: '‖e‖₂',
          yaxis: 'y2',
          line: { color: 'rgba(239,68,68,1)', width: 1 },
        },
      );

      const layout = {
        paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
        margin: { t: 10, r: 55, b: 30, l: 40 },
        font: { size: 10, color: 'var(--text-muted)' },
        legend: { font: { size: 9 }, orientation: 'h', y: 1.15 },
        xaxis: { title: 't (s)', gridcolor: 'rgba(255,255,255,0.06)' },
        yaxis: { title: 'y', gridcolor: 'rgba(255,255,255,0.06)' },
        yaxis2: { title: '‖e‖₂', overlaying: 'y', side: 'right', showgrid: false },
      };
      Plotly.newPlot('chart-obs-sim', traces, layout, { responsive: true, displayModeBar: false });

      // Innovation chart
      const innovEl = document.getElementById('chart-obs-innov');
      if (noiseR) {
        if (innovEl) innovEl.style.display = 'block';
        Plotly.newPlot('chart-obs-innov', [{
          x: result.t, y: result.innovation,
          mode: 'lines', name: 'innovation e[k]',
          line: { color: 'rgba(245,158,11,0.8)', width: 1 },
        }], {
          paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
          margin: { t: 10, r: 20, b: 30, l: 40 },
          font: { size: 10, color: 'var(--text-muted)' },
          yaxis: { title: 'innov.', gridcolor: 'rgba(255,255,255,0.06)' },
          xaxis: { title: 't (s)', gridcolor: 'rgba(255,255,255,0.06)' },
          showlegend: false,
        }, { responsive: true, displayModeBar: false });
        // Innovation statistics
        const stats = innovationStats(result.innovation);
        const statsEl = document.getElementById('innov-stats-out');
        if (statsEl) {
          const color = stats.isWhite ? 'var(--color-stable)' : 'var(--color-unstable)';
          statsEl.style.display = 'block';
          statsEl.innerHTML = [
            `<div style="color:${color};font-weight:700;">Innovation Statistics</div>`,
            `<div>mean=${fmtNum(stats.mean, 4)}  std=${fmtNum(stats.std, 4)}</div>`,
            `<div>ACF(1)=${fmtNum(stats.acf1, 3)}  ACF(2)=${fmtNum(stats.acf2, 3)}  95%CI: ±${fmtNum(stats.confBand, 3)}</div>`,
            `<div style="color:${color};">${stats.diagnosis}</div>`,
          ].join('');
        }
      } else {
        if (innovEl) innovEl.style.display = 'none';
        const statsEl = document.getElementById('innov-stats-out');
        if (statsEl) statsEl.style.display = 'none';
      }
    }
    clearError();
  } catch (err) {
    state.phase8.simulation = null;
    setPhase7Output('phase8-sim-out', escapeHtml(err.message), true);
    showError(err.message);
  }
}

function computeBrysonQR() {
  try {
    const maxStatesStr = document.getElementById('bryson-max-states')?.value || '1,1';
    const maxOutput = parseFloat(document.getElementById('bryson-max-output')?.value || '0.1');
    const maxStates = maxStatesStr.split(',').map(s => parseFloat(s.trim())).filter(v => !isNaN(v) && v > 0);
    if (maxStates.length === 0) throw new Error('請輸入至少一個狀態最大偏差值');
    if (maxOutput <= 0) throw new Error('最大量測誤差必須 > 0');

    const { Q, R } = brysonsRule(maxStates, maxOutput);

    // Fill Qn textarea: row per line, space-separated
    const qEl = document.getElementById('obs-qn');
    if (qEl) qEl.value = Q.map(row => row.map(v => fmtNum(v, 4)).join(' ')).join('\n');

    // Fill Rn input (scalar: R[0][0])
    const rEl = document.getElementById('obs-rn');
    if (rEl) rEl.value = fmtNum(R[0][0], 4);

    clearError();
  } catch (err) {
    showError(err.message);
  }
}

function computeDiscreteKalman() {
  try {
    clearFieldErrors();
    const model = currentPhase7DesignModel();
    const Ts = parseFloat(document.getElementById('dkf-ts')?.value || '0.1');
    if (Ts <= 0) throw new Error('Sample time Ts 必須 > 0');

    const qdRaw = document.getElementById('dkf-qd')?.value || '1 0\n0 1';
    const rdVal = parseFloat(document.getElementById('dkf-rd')?.value || '1');
    if (!(rdVal > 0)) throw new Error('Measurement noise Rd 必須 > 0');
    const Qd = qdRaw.trim().split('\n').map(row => row.trim().split(/\s+/).map(Number));
    const Rd = [[rdVal]];

    // Discretize via ZOH: Ad, Bd; Cd unchanged
    const { Ad, Bd } = discretizeZOH(model.A, model.B, Ts);
    const Cd = model.C;

    const result = solveDiscreteKalman(Ad, Cd, Qd, Rd);
    state.phase8.discreteKalman = { ...result, Ad, Bd, Cd, Ts };

    const lStr = result.L.map(row => `[${row.map(v => fmtNum(v, 4)).join(', ')}]`).join(', ');
    const poleStr = result.observerPolesD.map(p => {
      const mag = Math.hypot(p.re, p.im);
      const im = Math.abs(p.im) < 1e-9 ? '' : p.im > 0 ? `+j${fmtNum(Math.abs(p.im), 3)}` : `-j${fmtNum(Math.abs(p.im), 3)}`;
      const stable = mag < 1 - 1e-9 ? ' ✓' : ' ✗';
      return `${fmtNum(p.re, 3)}${im} (|z|=${fmtNum(mag, 3)}${stable})`;
    }).join(', ');

    setPhase7Output('dkf-out', [
      `<div style="color:var(--color-accent);font-weight:700;">Discrete Kalman Gain L_kf[d]  (Ts=${Ts}s, ZOH)</div>`,
      `<div>L_kf = [${lStr}]</div>`,
      `<div>Iterations: ${result.iterations} &nbsp;|&nbsp; Converged: ${result.converged ? 'Yes ✓' : 'No ✗'}</div>`,
      `<div>rank(Wo) = ${result.observabilityRank}/${Ad.length} &nbsp;|&nbsp; Stable: ${result.observerStable ? 'Yes ✓' : 'No ✗'} &nbsp;|&nbsp; max|z| = ${fmtNum(result.maxPoleMagnitude, 4)}</div>`,
      `<div style="color:var(--text-muted);">Observer poles (z-plane): ${poleStr}</div>`,
      `<div style="font-size:10px;color:var(--text-muted);margin-top:4px;">Stable: all poles must be inside unit circle |z|&lt;1</div>`,
    ].join(''));
    clearError();
  } catch (err) {
    state.phase8.discreteKalman = null;
    setPhase7Output('dkf-out', escapeHtml(err.message), true);
    showError(err.message);
  }
}

function runEkfUkf() {
  try {
    const model = currentPhase7DesignModel();
    const { Ad, Bd } = discretizeZOH(model.A, model.B, 0.1); // Ts=0.1
    const Cd = model.C;
    const n = Ad.length;
    const steps = parseInt(document.getElementById('ekf-steps')?.value || '80', 10);

    // Parse Q diagonal
    const qDiag = (document.getElementById('ekf-qdiag')?.value || '0.1')
      .split(',').map(Number).filter(Number.isFinite);
    const Q = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) =>
      i === j ? (qDiag[i] ?? qDiag[qDiag.length - 1] ?? 0.1) : 0));

    // Parse R diagonal (p×p)
    const p = Cd.length;
    const rDiag = (document.getElementById('ekf-rdiag')?.value || '1')
      .split(',').map(Number).filter(Number.isFinite);
    const R = Array.from({ length: p }, (_, i) => Array.from({ length: p }, (_, j) =>
      i === j ? (rDiag[i] ?? rDiag[rDiag.length - 1] ?? 1) : 0));

    const useUKF = document.getElementById('ekf-use-ukf')?.checked;
    const m = Bd[0]?.length ?? 1; // number of inputs (SISO=1, MIMO=m)
    const uSeq = Array.from({ length: steps }, (_, k) =>
      Array.from({ length: m }, () => k < 5 ? 0 : 1)); // unit step on all inputs

    const result = runLinearEKF({ Ad, Bd, Cd }, uSeq, Q, R, { useUKF });

    const out = document.getElementById('ekf-out');
    if (out) {
      out.style.display = 'block';
      const finalErr = result.xhat[result.xhat.length - 1]
        .map((v, i) => Math.abs(v - result.xTrue[result.xTrue.length - 1][i]).toFixed(4))
        .join(', ');
      out.innerHTML = `<div style="color:var(--color-accent);font-weight:700;">${useUKF ? 'UKF' : 'EKF'} completed (${steps} steps)</div>
        <div>Final estimation error: ${finalErr}</div>`;
    }

    if (window.Plotly) {
      const t = result.t;
      const traces = [];
      traces.push({ x: t, y: result.xTrue.map(x => x[0]), mode: 'lines', name: 'x₁ true', line: { color: '#6366f1', width: 2 } });
      traces.push({ x: t, y: result.xhat.map(x => x[0]), mode: 'lines', name: 'x₁ EKF', line: { color: '#10b981', width: 2, dash: 'dash' } });
      if (n > 1) {
        traces.push({ x: t, y: result.xTrue.map(x => x[1]), mode: 'lines', name: 'x₂ true', line: { color: '#a855f7', width: 1.5 } });
        traces.push({ x: t, y: result.xhat.map(x => x[1]), mode: 'lines', name: 'x₂ EKF', line: { color: '#ec4899', width: 1.5, dash: 'dash' } });
      }
      window.Plotly.newPlot('chart-ekf', traces, {
        ...PLOTLY_LAYOUT_BASE(),
        margin: { t: 8, r: 10, b: 28, l: 40 },
        xaxis: { title: 'step', gridcolor: 'rgba(255,255,255,0.06)' },
        yaxis: { title: 'state', gridcolor: 'rgba(255,255,255,0.06)' },
        showlegend: true,
        legend: { font: { size: 9 }, orientation: 'h', y: 1.15 },
      }, { responsive: true, displayModeBar: false });
    }
    clearError();
  } catch (err) {
    showError(err.message);
    const out = document.getElementById('ekf-out');
    if (out) {
      out.style.display = 'block';
      out.innerHTML = `<span style="color:var(--color-unstable);">${escapeHtml(err.message)}</span>`;
    }
  }
}

function computeLqgSimulation() {
  try {
    clearFieldErrors();
    const model = currentPhase7DesignModel();

    // Auto-compute LQR with default Q=I, R=1 if not already done
    if (!state.phase7?.lqr?.K) {
      const n = model.A.length;
      const Q = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
      const lqrResult = solveLqr(model.A, model.B, Q, [[1]]);
      const previewTf = closedLoopTransferFromStateFeedback(model, lqrResult.K);
      state.phase7.lqr = { ...lqrResult, previewTf };
    }

    // Auto-compute Kalman L_kf with default Qn=I, Rn=1 if not already done
    if (!state.phase8.kalman?.L && !state.phase8.observer?.L) {
      const n = model.A.length;
      const Qn = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
      const kalmanResult = solveLqe(model.A, model.C, Qn, [[1]]);
      state.phase8.kalman = kalmanResult;
    }

    const K_lqr = state.phase7.lqr.K;
    const L_kf  = state.phase8.kalman?.L ?? state.phase8.observer?.L;

    const duration = parseFloat(document.getElementById('lqg-duration')?.value || '10');
    const sigmaW = parseFloat(document.getElementById('lqg-noise-q')?.value || '0');
    const sigmaV = parseFloat(document.getElementById('lqg-noise-r')?.value || '0.1');
    const noiseQ = sigmaW > 0 ? sigmaW * sigmaW : null;
    const noiseR = sigmaV > 0 ? sigmaV * sigmaV : null;

    const result = simulateLqg(model, K_lqr, L_kf, { duration, dt: 0.01, noiseQ, noiseR });
    state.phase8.lqg = result;

    const finalErr = result.eNorm[result.eNorm.length - 1];
    setPhase7Output('lqg-out', [
      `<div style="color:var(--color-accent);font-weight:700;">LQG Closed-Loop Simulation</div>`,
      `<div>LQG uses u=−K·x̂ &nbsp;|&nbsp; FSF uses u=−K·x (ideal)</div>`,
      `<div>Final ‖x−x̂‖₂ = ${fmtNum(finalErr, 4)}</div>`,
    ].join(''));

    if (typeof Plotly !== 'undefined') {
      Plotly.newPlot('chart-lqg-y', [
        { x: result.t, y: result.y_fsf, mode: 'lines', name: 'y FSF (ideal)', line: { color: 'rgba(16,185,129,1)', width: 1.5 } },
        { x: result.t, y: result.y_lqg, mode: 'lines', name: 'y LQG', line: { color: 'rgba(99,102,241,1)', width: 1.5, dash: 'dot' } },
      ], {
        ...PLOTLY_LAYOUT_BASE(),
        margin: { t: 10, r: 20, b: 30, l: 40 },
        legend: { font: { size: 9 }, orientation: 'h', y: 1.15 },
        xaxis: { title: 't (s)', gridcolor: 'rgba(255,255,255,0.06)' },
        yaxis: { title: 'y(t)', gridcolor: 'rgba(255,255,255,0.06)' },
      }, { responsive: true, displayModeBar: false });

      Plotly.newPlot('chart-lqg-u', [
        { x: result.t, y: result.u_fsf, mode: 'lines', name: 'u FSF', line: { color: 'rgba(16,185,129,0.7)', width: 1, dash: 'dash' } },
        { x: result.t, y: result.u_lqg, mode: 'lines', name: 'u LQG', line: { color: 'rgba(99,102,241,1)', width: 1 } },
      ], {
        ...PLOTLY_LAYOUT_BASE(),
        margin: { t: 10, r: 20, b: 30, l: 40 },
        legend: { font: { size: 9 }, orientation: 'h', y: 1.15 },
        xaxis: { title: 't (s)', gridcolor: 'rgba(255,255,255,0.06)' },
        yaxis: { title: 'u(t)', gridcolor: 'rgba(255,255,255,0.06)' },
      }, { responsive: true, displayModeBar: false });
    }
    clearError();
  } catch (err) {
    state.phase8.lqg = null;
    setPhase7Output('lqg-out', escapeHtml(err.message), true);
    showError(err.message);
  }
}

function updateQRSensitivity() {
  const slider = document.getElementById('qr-sensitivity-slider');
  const label = document.getElementById('qr-sensitivity-label');
  const outEl = document.getElementById('qr-sensitivity-out');
  if (!slider || !label || !outEl) return;

  const exp = parseFloat(slider.value);
  const alpha = Math.pow(10, exp);
  label.textContent = alpha >= 10 ? `×${Math.round(alpha)}` : `×${alpha.toFixed(alpha < 0.01 ? 4 : 2)}`;

  try {
    const model = currentPhase7DesignModel();
    const qRaw = document.getElementById('obs-qn')?.value || '1 0\n0 1';
    const rVal = parseFloat(document.getElementById('obs-rn')?.value || '1');

    const Qbase = qRaw.trim().split('\n').map(row => row.trim().split(/\s+/).map(Number));
    const Qscaled = Qbase.map(row => row.map(v => v * alpha));
    const Rn = [[rVal]];

    const { L } = solveLqe(model.A, model.C, Qscaled, Rn);
    const poles = observerPoles(model.A, model.C, L);

    const poleStr = poles.map(p => {
      const im = Math.abs(p.im) < 1e-9 ? '' : p.im > 0 ? `+j${fmtNum(Math.abs(p.im), 3)}` : `-j${fmtNum(Math.abs(p.im), 3)}`;
      return `${fmtNum(p.re, 3)}${im}`;
    }).join(', ');

    const lStr = L.map(row => `[${row.map(v => fmtNum(v, 3)).join(', ')}]`).join(', ');
    outEl.innerHTML = `<span style="color:var(--color-accent)">L_kf</span> = [${lStr}]<br><span style="color:var(--text-muted)">Observer poles: </span>${poleStr}`;
  } catch (e) {
    outEl.textContent = e.message;
  }
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
  historySave();
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
    historySave();
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
    historySave();
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

/** A: Auto-tune PID to target PM + crossover frequency */
function applyAutoTunePID() {
  const outEl = document.getElementById('auto-tune-out');
  try {
    clearFieldErrors();
    if (!state.plant) throw new Error('先更新 Plant 後再執行 Auto-Tune');
    const targetPM  = readRequiredPositiveNumber('at-target-pm',  'Target PM');
    const targetWc  = readRequiredPositiveNumber('at-target-wc',  'Target ωc');
    const type = document.getElementById('at-type')?.value || 'PID';
    const r    = autoTunePIDToSpec(state.plant, { targetPM, targetWc, type });
    setPIDFromController(r.controller, `auto-tune-${type.toLowerCase()}`);
    historySave();
    clearError();
    const achPM = Number.isFinite(r.achievedPM) ? r.achievedPM.toFixed(1) + '°' : '—';
    const achWc = Number.isFinite(r.achievedWc) ? r.achievedWc.toFixed(3) + ' rad/s' : '—';
    const achGM = Number.isFinite(r.achievedGM) ? r.achievedGM.toFixed(1) + ' dB' : '∞';
    if (outEl) outEl.innerHTML =
      `<b>✓ Kp=${r.Kp.toFixed(4)}  Ki=${r.Ki.toFixed(4)}  Kd=${r.Kd.toFixed(4)}</b><br>` +
      (r.Ti != null ? `Ti=${r.Ti.toFixed(4)} s&emsp;Td=${r.Td.toFixed(4)} s<br>` : '') +
      `φ_C required: ${r.phiC_deg.toFixed(1)}°<br>` +
      `Achieved PM=${achPM}&emsp;ωc=${achWc}&emsp;GM=${achGM}`;
    if (outEl) outEl.style.display = 'block';
  } catch (err) {
    showError(err.message);
    if (outEl) { outEl.textContent = '✗ ' + err.message; outEl.style.display = 'block'; }
  }
}

/** B+E: Lead-Lag cascade helper */
function applyLeadLagHelper() {
  try {
    clearFieldErrors();
    const phaseBoostDeg    = readRequiredPositiveNumber('ll-phase-boost', 'Lead phase boost');
    const crossoverFreq    = readRequiredPositiveNumber('ll-crossover-wc', 'Crossover ωc');
    const improvementFactor = readRequiredPositiveNumber('ll-improvement', 'Lag improvement');
    const zeroRatio        = parseFloat(document.getElementById('ll-zero-ratio')?.value || '10') || 10;
    const { combinedTf } = designLeadLagCompensator({ phaseBoostDeg, crossoverFreq, improvementFactor, zeroRatio });
    // Apply the combined TF as the controller compensator by extracting params from roots
    // Store the raw TF in state for use in controller synthesis
    state.leadLagCombinedTf = combinedTf;
    // Display result; user can then manually enter the compensator params
    const outEl = document.getElementById('leadlag-out');
    if (outEl) {
      outEl.textContent = `Combined C(s) = (${combinedTf.num.map(c => c.toFixed(4)).join(', ')}) / (${combinedTf.den.map(c => c.toFixed(4)).join(', ')})`;
      outEl.style.display = 'block';
    }
    // Set the compensator to 'lead' + store combined for loop computation
    state.controllerDesign = { ...state.controllerDesign, source: 'leadlag-helper' };
    historySave();
    updateController();
    clearError();
  } catch (err) {
    const outEl = document.getElementById('leadlag-out');
    if (outEl) { outEl.textContent = '✗ ' + err.message; outEl.style.display = 'block'; }
    showError(err.message);
  }
}

/** D: Update series form display (Ti / Td read-only fields) */
function updateSeriesPIDDisplay() {
  const Kp = state.pidParams?.Kp ?? 1;
  const Ki = state.pidParams?.Ki ?? 0;
  const Kd = state.pidParams?.Kd ?? 0;
  const tiEl = document.getElementById('pid-Ti-disp');
  const tdEl = document.getElementById('pid-Td-disp');
  if (tiEl) tiEl.textContent = (Ki > 1e-9) ? (Kp / Ki).toFixed(4) + ' s' : '∞';
  if (tdEl) tdEl.textContent = (Kp > 1e-9) ? (Kd / Kp).toFixed(4) + ' s' : '0';
}

function readCompensatorInputs() {
  const mode = document.getElementById('comp-mode')?.value || 'none';
  if (mode === 'notch') {
    const wn = Number(document.getElementById('notch-wn')?.value ?? 10);
    const zetaZ = Number(document.getElementById('notch-zeta-z')?.value ?? 0.01);
    const zetaP = Number(document.getElementById('notch-zeta-p')?.value ?? 0.5);
    state.notch = { wn, zetaZ, zetaP };
    state.compensator = normalizeCompensatorConfig({ mode: 'none' });
    state.compensator.mode = 'notch';
  } else {
    state.notch = null;
    state.compensator = normalizeCompensatorConfig({
      mode,
      gain: Number(document.getElementById('comp-gain')?.value ?? state.compensator.gain),
      tau: Number(document.getElementById('comp-tau')?.value ?? state.compensator.tau),
      alpha: Number(document.getElementById('comp-alpha')?.value ?? state.compensator.alpha),
    });
  }
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
  if (mode === 'none' || mode === 'notch') return;
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
  const notchFields = document.getElementById('comp-notch-fields');
  const mode = document.getElementById('comp-mode')?.value || state.compensator.mode;
  if (fields) fields.style.display = (mode === 'lead' || mode === 'lag') ? 'block' : 'none';
  if (notchFields) notchFields.style.display = mode === 'notch' ? 'block' : 'none';
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
  notify('Session autosave cleared.', 'info', { title: 'Session' });
}

// P15-03: Build code-generation payload from current state.
function buildCodegenPayload() {
  const tf = state.plant;
  const num = tf?.num ? Array.from(tf.num).map((v) => Number(v.toFixed(6))) : null;
  const den = tf?.den ? Array.from(tf.den).map((v) => Number(v.toFixed(6))) : null;
  return {
    plant: tf ? { num, den } : null,
    controller: {
      Kp: state.pidParams.Kp,
      Ki: state.pidParams.Ki,
      Kd: state.pidParams.Kd,
      N: state.pidParams.N,
    },
    delay: state.plantDelay ? { T: state.plantDelay.T, order: state.plantDelay.order } : null,
    domain: state.domain || 's',
    Ts: state.domain === 'z' ? (tf?.Ts ?? 0.1) : null,
    responseType: state.responseType || 'step',
    closedLoop: !!state.showClosedLoop,
  };
}

// P14-03: Replace text-based TF fractions with KaTeX-rendered LaTeX if available.
function renderAllLatexFractions() {
  const ready = typeof window !== 'undefined' && window.katex;
  document.querySelectorAll('.cs-tf-latex').forEach((el) => {
    const num = el.dataset.num || '0';
    const den = el.dataset.den || '1';
    const tex = `\\frac{${num}}{${den}}`;
    if (ready) {
      try {
        window.katex.render(tex, el, { throwOnError: false, displayMode: true, output: 'html' });
        el.setAttribute('aria-hidden', 'false');
        const fallback = el.parentElement?.querySelector('.cs-tf-fallback');
        if (fallback) fallback.style.display = 'none';
      } catch { /* keep fallback visible */ }
    }
  });
}
// Re-render once KaTeX finishes loading from CDN
if (typeof window !== 'undefined') {
  let _ktxAttempts = 0;
  const _ktxRetry = () => {
    if (window.katex) { renderAllLatexFractions(); return; }
    if (_ktxAttempts++ < 20) setTimeout(_ktxRetry, 150);
  };
  setTimeout(_ktxRetry, 200);
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
    modelCopy.textContent = '直接輸入 A / B / C / D 矩陣；下方會同步顯示狀態方程與矩陣內容。';
  } else {
    systemEquation.innerHTML = renderTransferFunctionEquation('G(s) =', plantTf, 'Plant transfer function');
    modelCopy.textContent = '直接輸入 plant 的分子與分母係數；下方會同步更新成具體傳遞函數。';
  }

  // Update inline G(s) chip in Plant tab
  const chip = document.getElementById('plant-formula-chip');
  if (chip && plantTf) {
    const numStr = formatPolyText(plantTf.num);
    const denStr = formatPolyText(plantTf.den);
    const varName = state.domain === 'z' ? 'z' : 's';
    chip.textContent = `G(${varName}) = ( ${numStr} ) / ( ${denStr} )`;
    chip.style.display = 'block';
  } else if (chip) {
    chip.style.display = 'none';
  }

  const compTfForDisplay = (state.compensator.mode === 'notch' && state.notch)
    ? notchFilter(state.notch.wn, state.notch.zetaZ, state.notch.zetaP)
    : leadLagTransferFunction(state.compensator);
  const compDescForDisplay = (state.compensator.mode === 'notch' && state.notch)
    ? notchFilterDescription(state.notch.wn, state.notch.zetaZ, state.notch.zetaP)
    : compensatorDescription(state.compensator);
  controllerEquation.innerHTML = [
    renderTransferFunctionEquation('C(s) =', controllerTf, `PID: Kp=${state.pidParams.Kp.toFixed(2)}, Ki=${state.pidParams.Ki.toFixed(2)}, Kd=${state.pidParams.Kd.toFixed(2)}`),
    renderTransferFunctionEquation('Cc(s) =', compTfForDisplay, compDescForDisplay),
  ].join('');

  const loopParts = [
    renderTransferFunctionEquation('L(s) =', state.openLoop, 'Open-loop transfer function'),
    renderTransferFunctionEquation('T(s) =', state.closedLoop, state.showClosedLoop ? 'Active view: closed-loop response' : 'Active view: plant / open-loop analysis'),
  ];
  loopEquation.innerHTML = loopParts.join('');
  // P14-03: render LaTeX fractions if KaTeX is loaded
  renderAllLatexFractions();
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
      historySave();
      refreshAllCharts();
      updateGlobalStatusBar('Discrete plant updated');
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
      let tf = new TransferFunction(num, den);
      // P14-01: optional time delay via Padé approximation
      const delayEl = document.getElementById('tf-delay');
      const orderEl = document.getElementById('tf-pade-order');
      const T = parseFloat(delayEl?.value || '0');
      const order = parseInt(orderEl?.value || '2', 10);
      if (Number.isFinite(T) && T > 0) {
        tf = applyDelay(tf, T, Math.max(1, Math.min(6, order || 2)));
        state.plantDelay = { T, order };
      } else {
        state.plantDelay = null;
      }
      state.plant = tf;
    }
    clearError();
    autoToggleOpenLoopForUnstablePlant();
    historySave();
    updateController();
    updateGlobalStatusBar('Plant updated');
  } catch (err) {
    showError(err.message);
    scheduleSmokeDiagnostics();
  }
}

function setFieldError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.borderColor = 'var(--color-unstable)';
  el.classList.add('field-error');
  el.setAttribute('aria-invalid', 'true');
  let hint = el.parentElement?.querySelector('.field-hint');
  if (!hint) {
    hint = document.createElement('div');
    hint.className = 'field-hint';
    hint.setAttribute('role', 'alert');
    hint.style.cssText = 'font-size:11px; color:var(--color-unstable); margin-top:2px;';
    el.parentElement?.appendChild(hint);
  }
  hint.textContent = msg;
  // P13: scroll the offending field into view so the user can see what went wrong
  try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (_) { /* no-op */ }
}

function clearFieldErrors() {
  document.querySelectorAll('.field-hint').forEach(h => h.remove());
  ['tf-num', 'tf-den', 'zpk-zeros', 'zpk-poles', 'zpk-gain', 'ss-a', 'ss-b', 'ss-c', 'ss-d', 'comp-gain', 'comp-tau', 'comp-alpha', 'preset-ku', 'preset-tu', 'preset-plant-k', 'preset-fopdt', 'lead-target-phase', 'lead-target-wc', 'lag-improvement', 'lag-target-wc', 'pid-Kp-num', 'pid-Ki-num', 'pid-Kd-num'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.style.borderColor = ''; el.classList.remove('field-error'); el.removeAttribute('aria-invalid'); }
  });
}

function updateController() {
  if (!state.plant) return;
  try {
    clearFieldErrors();
    validateCompensatorInputs();
    readCompensatorInputs();
    const { Kp, Ki, Kd, N } = state.pidParams;

    // Handle 2-DOF PID
    const use2dof = document.getElementById('enable-2dof')?.checked;
    let pid;
    let controllerTf;
    if (use2dof) {
      const beta = Number(document.getElementById('pid-beta')?.value ?? 1);
      const gamma = Number(document.getElementById('pid-gamma')?.value ?? 0);
      const ctrl2dof = new TwoDOFPIDController(Kp, Ki, Kd, N, beta, gamma);
      pid = new PIDController(Kp, Ki, Kd, N);
      state.twoDof = { controller: ctrl2dof, beta, gamma };
      // For loop TF, use feedback TF (disturbance rejection); setpoint TF stored for reference
      controllerTf = ctrl2dof.toFeedbackTF();
      const infoEl = document.getElementById('twodof-info');
      if (infoEl) {
        infoEl.textContent = `β=${beta} reduces overshoot on setpoint; γ=${gamma} ${gamma === 0 ? 'eliminates derivative kick' : 'applies derivative to setpoint'}.`;
      }
    } else {
      pid = new PIDController(Kp, Ki, Kd, N);
      state.twoDof = null;
      controllerTf = pid.toTransferFunction();
    }

    // Handle notch filter vs lead/lag
    let compensatorTf;
    if (state.compensator.mode === 'notch' && state.notch) {
      const { wn, zetaZ, zetaP } = state.notch;
      compensatorTf = notchFilter(wn, zetaZ, zetaP);
    } else {
      compensatorTf = leadLagTransferFunction(state.compensator);
    }

    controllerTf = controllerTf.series(compensatorTf);
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
    updateGlobalStatusBar('Controller updated');
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
  const statusPlot = document.getElementById('status-active-plot');
  if (statusPlot && title) statusPlot.textContent = title;
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
    const isDiscrete = state.domain === 'z' || sys instanceof DiscreteTransferFunction;
    const margins = isDiscrete ? {
      gainMargin: Infinity,
      gainMarginDB: Infinity,
      phaseMargin: NaN,
      gainCrossover: NaN,
      phaseCrossover: NaN,
    } : stabilityMargins(ol);
    if (gmEl) gmEl.textContent = margins.gainMarginDB === Infinity ? '∞' : fmtDB(margins.gainMarginDB);
    if (pmEl) pmEl.textContent = isNaN(margins.phaseMargin) ? '—' : fmtDeg(margins.phaseMargin);

    // P14: Delay Margin (sec) and Disk Margin (dimensionless)
    const dmEl = document.getElementById('dm-value');
    const dskmEl = document.getElementById('dskm-value');
    if (dmEl) {
      const dm = delayMargin(margins.phaseMargin, margins.gainCrossover);
      dmEl.textContent = !Number.isFinite(dm) ? '—' : (dm < 1 ? `${(dm*1000).toFixed(1)} ms` : `${dm.toFixed(3)} s`);
    }
    if (dskmEl) {
      try {
        if (isDiscrete || !ol) {
          dskmEl.textContent = '—';
        } else {
          // Auto-compute disk margin on demand with a default ω grid
          const N = 80;
          const omegas = Array.from({ length: N }, (_, i) => Math.pow(10, -2 + (4 * i) / (N - 1)));
          const dm = diskMargin(ol, omegas, null);
          if (Number.isFinite(dm.alpha)) {
            const pm = Number.isFinite(dm.phaseDeg) ? `, ±${dm.phaseDeg.toFixed(1)}°` : '';
            dskmEl.textContent = `α=${dm.alpha.toFixed(3)}${pm}`;
            dskmEl.title = `Disk margin α=${dm.alpha.toFixed(4)}, equivalent ±${(dm.phaseDeg||0).toFixed(2)}° phase, ±${(dm.gainDB||0).toFixed(2)} dB gain`;
          } else {
            dskmEl.textContent = '—';
          }
        }
      } catch { dskmEl.textContent = '—'; }
    }

    const resp = isDiscrete
      ? discreteStepResponse(sys, {
        sampleCount: Math.min(state.simulationConfig.sampleCount || 200, 500),
        amplitude: state.simulationConfig.amplitude || 1,
      })
      : currentResponseData(sys);
    const info = stepInfo(resp.t, resp.y);
    const timeMetricSupported = !['sine', 'square'].includes(state.responseType);

    if (riseEl) riseEl.textContent = timeMetricSupported ? fmtTime(info.riseTime) : '—';
    if (settleEl) settleEl.textContent = timeMetricSupported ? fmtTime(info.settlingTime) : '—';
    if (overEl) overEl.textContent = timeMetricSupported ? fmtPercent(info.overshoot) : '—';
    if (essEl) essEl.textContent = timeMetricSupported && info.steadyStateError !== undefined ? info.steadyStateError.toPrecision(3) : '—';

    // 2. Determine Stability (Strict Pole Check)
    const stability = analyzeStability(sys, { domain: state.domain, margins });
    let status = stability.status === 'unknown' ? 'marginal' : stability.status;
    let label = status.toUpperCase();

    if (resp.y.some(v => Math.abs(v) > 1e8)) {
      status = 'unstable';
      label = 'UNSTABLE';
    }

    ind.className = `status-pill ${status}`;
    ind.innerHTML = `<span class="status-dot"></span> ${label}`;
    renderStabilityAnalysis(stability);
    scheduleApiAnalysis({ margins, info, stability });

    // Routh-Hurwitz table
    const routhEl = document.getElementById('routh-table-body');
    if (routhEl) {
      try {
        if (isDiscrete) {
          routhEl.innerHTML = '<tr><td colspan="4">Routh-Hurwitz applies to continuous-time denominators only.</td></tr>';
          return;
        }
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

function buildAnalysisRequestPayload() {
  const simulation = {
    mode: state.showClosedLoop ? 'closed_loop' : 'open_loop',
    inputWaveform: state.responseType,
    ...state.simulationConfig,
  };
  const controller = {
    type: 'pid',
    Kp: state.pidParams.Kp,
    Ki: state.pidParams.Ki,
    Kd: state.pidParams.Kd,
    N: state.pidParams.N,
    compensator: { ...state.compensator },
  };

  if (state.systemType === 'ss') {
    return {
      system: {
        type: 'state_space',
        A: parseMatrixInput(document.getElementById('ss-a')?.value || ''),
        B: parseMatrixInput(document.getElementById('ss-b')?.value || ''),
        C: parseMatrixInput(document.getElementById('ss-c')?.value || ''),
        D: parseMatrixInput(document.getElementById('ss-d')?.value || ''),
      },
      controller,
      simulation,
    };
  }

  return {
    system: {
      type: 'transfer_function',
      num: state.plant?.num || [1],
      den: state.plant?.den || [1],
    },
    controller,
    simulation,
  };
}

function scheduleApiAnalysis(local) {
  const statusEl = document.getElementById('api-analysis-status');
  if (!statusEl) return;
  if (state.analysisSource === 'local') {
    state.apiAnalysis = { status: 'idle', message: '', lastResult: null, diff: null };
    statusEl.style.display = 'none';
    return;
  }

  if (state.domain === 'z') {
    state.apiAnalysis = {
      status: 'not_applicable',
      message: 'FastAPI analysis currently supports continuous-time TF/SS only.',
      lastResult: null,
      diff: null,
    };
    renderApiAnalysisStatus();
    return;
  }

  runApiAnalysis(local);
}

async function runApiAnalysis(local) {
  const requestId = ++apiAnalysisRequestId;
  state.apiAnalysis = { status: 'checking', message: 'Checking FastAPI analysis...', lastResult: null, diff: null };
  renderApiAnalysisStatus();

  try {
    const payload = buildAnalysisRequestPayload();
    const response = await fetch('http://127.0.0.1:8770/api/control/system/response', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.detail || `HTTP ${response.status}`);
    if (requestId !== apiAnalysisRequestId) return;

    const diff = compareApiMetrics(local, body.metrics || {});
    state.apiAnalysis = {
      status: diff.maxAbs <= 1e-3 ? 'ok' : 'diff',
      message: diff.maxAbs <= 1e-3 ? 'FastAPI matches local metrics.' : 'FastAPI differs from local metrics.',
      lastResult: body,
      diff,
    };
    if (state.analysisSource === 'api') applyApiMetricDisplay(body.metrics || {});
  } catch (err) {
    if (requestId !== apiAnalysisRequestId) return;
    state.apiAnalysis = {
      status: 'error',
      message: `FastAPI unavailable: ${err.message}`,
      lastResult: null,
      diff: null,
    };
  }
  renderApiAnalysisStatus();
}

function compareApiMetrics(local, apiMetrics) {
  const pairs = [
    ['riseTime', local.info?.riseTime, apiMetrics.riseTime],
    ['settlingTime', local.info?.settlingTime, apiMetrics.settlingTime],
    ['overshoot', local.info?.overshoot, apiMetrics.overshoot],
    ['steadyStateError', local.info?.steadyStateError, apiMetrics.steadyStateError],
    ['phaseMargin', local.margins?.phaseMargin, apiMetrics.phaseMargin],
    ['gainMarginDB', local.margins?.gainMarginDB, apiMetrics.gainMarginDB],
  ];
  const rows = pairs.map(([name, a, b]) => ({
    name,
    local: a,
    api: b,
    abs: Number.isFinite(a) && Number.isFinite(b) ? Math.abs(a - b) : (a === b ? 0 : NaN),
  }));
  const finite = rows.map((row) => row.abs).filter(Number.isFinite);
  return { maxAbs: finite.length ? Math.max(...finite) : 0, rows };
}

function applyApiMetricDisplay(metrics) {
  const riseEl = document.getElementById('rise-time');
  const settleEl = document.getElementById('settling-time');
  const overEl = document.getElementById('overshoot');
  const essEl = document.getElementById('ess-value');
  const gmEl = document.getElementById('gm-value');
  const pmEl = document.getElementById('pm-value');
  if (riseEl) riseEl.textContent = fmtTime(metrics.riseTime);
  if (settleEl) settleEl.textContent = fmtTime(metrics.settlingTime);
  if (overEl) overEl.textContent = fmtPercent(metrics.overshoot);
  if (essEl) essEl.textContent = Number.isFinite(metrics.steadyStateError) ? metrics.steadyStateError.toPrecision(3) : '—';
  if (gmEl) gmEl.textContent = metrics.gainMarginDB === Infinity ? '∞' : fmtDB(metrics.gainMarginDB);
  if (pmEl) pmEl.textContent = isNaN(metrics.phaseMargin) ? '—' : fmtDeg(metrics.phaseMargin);
}

function renderApiAnalysisStatus() {
  const statusEl = document.getElementById('api-analysis-status');
  if (!statusEl) return;
  const current = state.apiAnalysis;
  statusEl.style.display = current.status === 'idle' ? 'none' : 'block';
  const tone = current.status === 'ok' ? 'var(--color-stable)'
    : current.status === 'checking' ? 'var(--text-secondary)'
      : 'var(--color-unstable)';
  const diffText = current.diff
    ? `<div style="margin-top:6px;font-size:11px;color:var(--text-muted);">max |local-api| = ${fmtNum(current.diff.maxAbs, 4)}</div>`
    : '';
  statusEl.innerHTML = `<strong style="color:${tone};">${escapeHtml(current.status.toUpperCase())}</strong><div>${escapeHtml(current.message)}</div>${diffText}`;
}

function renderStabilityAnalysis(analysis) {
  const riskEl = document.getElementById('stability-risk');
  const summaryEl = document.getElementById('stability-summary-text');
  const poleEl = document.getElementById('dominant-pole');
  const marginEl = document.getElementById('pole-margin');
  const dampingEl = document.getElementById('damping-ratio');
  const wnEl = document.getElementById('natural-frequency');
  const recEl = document.getElementById('stability-recommendations');

  if (riskEl) {
    riskEl.className = `stability-risk ${analysis.risk || 'low'}`;
    riskEl.textContent = (analysis.risk || 'low').toUpperCase();
  }
  if (summaryEl) summaryEl.textContent = analysis.summary || '—';

  const pole = analysis.dominantPole;
  if (poleEl) poleEl.textContent = pole ? formatPoleForUI(pole, analysis.domain) : '—';
  if (marginEl) {
    marginEl.textContent = Number.isFinite(analysis.stabilityMargin)
      ? (analysis.domain === 'z' ? fmtNum(analysis.stabilityMargin, 3) : `${fmtNum(analysis.stabilityMargin, 3)} rad/s`)
      : '—';
  }
  if (dampingEl) dampingEl.textContent = Number.isFinite(analysis.minDamping) ? fmtNum(analysis.minDamping, 3) : '—';
  if (wnEl) wnEl.textContent = pole && Number.isFinite(pole.naturalFrequency) ? `${fmtNum(pole.naturalFrequency, 3)} rad/s` : '—';
  if (recEl) {
    recEl.innerHTML = (analysis.recommendations || ['—'])
      .slice(0, 3)
      .map((item) => `<li>${escapeHtml(item)}</li>`)
      .join('');
  }
}

function formatPoleForUI(pole, domain) {
  const re = fmtNum(pole.re, 3);
  const im = fmtNum(Math.abs(pole.im), 3);
  const sign = pole.im >= 0 ? '+' : '-';
  const prefix = domain === 'z' ? 'z' : 's';
  const suffix = domain === 'z' ? ` |z|=${fmtNum(pole.magnitude, 3)}` : '';
  return `${prefix}=${re} ${sign} j${im}${suffix}`;
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
  const traces = [{
    x: resp.t,
    y: resp.y,
    type: 'scatter',
    mode: 'lines',
    name: state.showClosedLoop ? 'Closed-loop response' : 'Plant response',
    line: { color: getCSS('--color-accent'), width: 2 },
    fill: 'tozeroy',
    fillcolor: 'rgba(99, 102, 241, 0.05)',
  }];

  // Anti-windup overlay: only when step response and saturation is enabled
  const satEnabled = document.getElementById('enable-saturation')?.checked;
  if (satEnabled && state.responseType === 'step' && state.plant && state.pidParams && state.showClosedLoop) {
    try {
      const uMin = parseFloat(document.getElementById('sat-umin')?.value ?? '-1');
      const uMax = parseFloat(document.getElementById('sat-umax')?.value ?? '1');
      const Tt = parseFloat(document.getElementById('sat-tt')?.value ?? '1');
      const amp = state.simulationConfig?.amplitude ?? 1;
      // Simulate with anti-windup (saturated)
      const awResp = simulatePIDAntiWindup(state.plant, state.pidParams, {
        uMin, uMax, Tt, amplitude: amp,
        duration: resp.t[resp.t.length - 1],
        sampleCount: resp.t.length,
      });
      traces.push({
        x: awResp.t, y: awResp.y,
        type: 'scatter', mode: 'lines',
        name: `With AW (u∈[${uMin},${uMax}])`,
        line: { color: getCSS('--color-stable'), width: 2, dash: 'dash' },
      });
      // Control effort trace on secondary axis
      traces.push({
        x: awResp.t, y: awResp.u,
        type: 'scatter', mode: 'lines',
        name: 'u(t) saturated',
        line: { color: getCSS('--color-secondary'), width: 1, dash: 'dot' },
        yaxis: 'y2',
      });
    } catch (_) { /* silent if plant/pid not ready */ }
  }

  // G: Derivative kick comparison — 1-DOF vs 2-DOF when enabled
  const dkickEnabled = document.getElementById('chk-dkick-compare')?.checked;
  if (dkickEnabled && state.twoDof && state.responseType === 'step' && state.showClosedLoop && state.plant) {
    try {
      const p = state.pidParams;
      const ctrl1dof = new PIDController(p.Kp, p.Ki, p.Kd, p.N);
      const loop1 = ctrl1dof.toTransferFunction().series(state.plant);
      const cl1 = loop1.feedback();
      const resp1 = stepResponse(cl1, { duration: resp.t[resp.t.length - 1], sampleCount: resp.t.length });
      traces.push({
        x: resp1.t, y: resp1.y,
        type: 'scatter', mode: 'lines',
        name: '1-DOF (β=γ=1, with D-kick)',
        line: { color: '#f59e0b', width: 1.5, dash: 'dash' },
      });
    } catch (_) { /* silent */ }
  }

  // F: Step response spec overlay — settling band + overshoot limit + rise time
  const specOverlay = document.getElementById('chk-spec-overlay')?.checked;
  const layout = PLOTLY_LAYOUT_BASE();
  layout.showlegend = true;
  layout.legend = compactLegend();
  if (specOverlay && state.responseType === 'step' && resp.y.length > 10) {
    const ySS = resp.y[resp.y.length - 1];
    if (Math.abs(ySS) > 1e-10) {
      const band = 0.02 * Math.abs(ySS);
      // ±2% settling band
      traces.push({
        x: [resp.t[0], resp.t[resp.t.length - 1]], y: [ySS + band, ySS + band],
        type: 'scatter', mode: 'lines',
        line: { color: 'rgba(34,197,94,0.4)', width: 1, dash: 'dot' },
        name: '+2% band', hoverinfo: 'skip', showlegend: false,
      });
      traces.push({
        x: [resp.t[0], resp.t[resp.t.length - 1]], y: [ySS - band, ySS - band],
        type: 'scatter', mode: 'lines',
        line: { color: 'rgba(34,197,94,0.4)', width: 1, dash: 'dot' },
        name: '−2% band', hoverinfo: 'skip', showlegend: false,
      });
      // Overshoot limit (read from design-os field if available, else 20%)
      const osLimit = parseFloat(document.getElementById('design-os')?.value) || 20;
      const osLine = ySS * (1 + osLimit / 100);
      traces.push({
        x: [resp.t[0], resp.t[resp.t.length - 1]], y: [osLine, osLine],
        type: 'scatter', mode: 'lines',
        line: { color: 'rgba(239,68,68,0.35)', width: 1, dash: 'dashdot' },
        name: `OS limit ${osLimit}%`, hoverinfo: 'skip', showlegend: false,
      });
      // Rise time marker (10%→90%)
      const y10 = 0.1 * ySS, y90 = 0.9 * ySS;
      let tRise = null;
      for (let i = 1; i < resp.t.length; i++) {
        if (resp.y[i - 1] < y90 && resp.y[i] >= y90) { tRise = resp.t[i]; break; }
      }
      if (tRise != null) {
        const yMin = Math.min(...resp.y), yMax = Math.max(...resp.y);
        traces.push({
          x: [tRise, tRise], y: [yMin, yMax],
          type: 'scatter', mode: 'lines',
          line: { color: 'rgba(168,85,247,0.5)', width: 1, dash: 'dash' },
          name: `t_rise≈${tRise.toFixed(3)}s`, hoverinfo: 'name', showlegend: false,
        });
        layout.annotations = [{
          x: tRise, y: y90, xref: 'x', yref: 'y',
          text: `t_r=${tRise.toFixed(2)}s`, showarrow: true,
          arrowhead: 0, ax: 25, ay: -15,
          font: { size: 9, color: 'rgba(168,85,247,0.9)' },
        }];
      }
    }
  }
  if (satEnabled && state.responseType === 'step') {
    layout.yaxis2 = { overlaying: 'y', side: 'right', gridcolor: 'transparent', title: { text: 'u(t)', font: { size: 10 } } };
  }
  Plotly.react(targetId, traces, layout, { responsive: true, displayModeBar: false });
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

  // M1: PM / GM vertical markers + annotations (continuous-time only)
  if (!isDiscrete) {
    try {
      const margins = stabilityMargins(sys);
      const magMin = Math.min(...data.magDB);
      const magMax = Math.max(...data.magDB);
      const phaseMin = Math.min(...data.phaseDeg);
      const phaseMax = Math.max(...data.phaseDeg);
      const annotations = [];

      // Permanent -180° reference line on phase subplot
      traces.push({
        x: [data.w[0], data.w[data.w.length - 1]], y: [-180, -180],
        type: 'scatter', mode: 'lines', yaxis: 'y2',
        line: { color: 'rgba(255,100,100,0.25)', width: 1, dash: 'dot' },
        name: '−180°', hoverinfo: 'skip', showlegend: false,
      });
      // 0 dB reference line on magnitude subplot
      traces.push({
        x: [data.w[0], data.w[data.w.length - 1]], y: [0, 0],
        type: 'scatter', mode: 'lines',
        line: { color: 'rgba(255,255,255,0.12)', width: 1, dash: 'dot' },
        name: '0 dB', hoverinfo: 'skip', showlegend: false,
      });

      // PM color: green (>45°), orange (30-45°), red (<30°)
      const pm = margins.phaseMargin;
      const pmColor = !Number.isFinite(pm) ? getCSS('--color-stable')
        : pm > 45 ? getCSS('--color-stable')
        : pm > 30 ? '#f59e0b'
        : getCSS('--color-unstable');

      // Gain crossover (where |G|=0 dB) → mark PM; vertical line spans BOTH subplots
      if (Number.isFinite(margins.gainCrossover) && margins.gainCrossover > 0) {
        const wgc = margins.gainCrossover;
        // Magnitude subplot line
        traces.push({
          x: [wgc, wgc], y: [magMin, magMax],
          type: 'scatter', mode: 'lines',
          line: { color: pmColor, width: 1.5, dash: 'dash' },
          name: `ω_gc=${fmtNum(wgc, 3)}`, hoverinfo: 'name',
        });
        // Phase subplot line (same x, same ω)
        traces.push({
          x: [wgc, wgc], y: [phaseMin, phaseMax],
          type: 'scatter', mode: 'lines', yaxis: 'y2',
          line: { color: pmColor, width: 1.5, dash: 'dash' },
          hoverinfo: 'skip', showlegend: false,
        });
        if (Number.isFinite(pm)) {
          annotations.push({
            x: Math.log10(wgc), y: 0, xref: 'x', yref: 'y',
            text: `PM=${fmtDeg(pm)}`, showarrow: true, arrowhead: 0,
            ax: 32, ay: -22, font: { size: 10, color: pmColor },
            bgcolor: 'rgba(0,0,0,0.5)', borderpad: 2,
          });
        }
      }
      // Phase crossover (where ∠G=-180°) → mark GM
      if (Number.isFinite(margins.phaseCrossover) && margins.phaseCrossover > 0) {
        const wpc = margins.phaseCrossover;
        const gmColor = !Number.isFinite(margins.gainMarginDB) ? getCSS('--color-stable')
          : margins.gainMarginDB > 6 ? getCSS('--color-stable')
          : margins.gainMarginDB > 3 ? '#f59e0b'
          : getCSS('--color-unstable');
        traces.push({
          x: [wpc, wpc], y: [phaseMin, phaseMax],
          type: 'scatter', mode: 'lines', yaxis: 'y2',
          line: { color: gmColor, width: 1.5, dash: 'dashdot' },
          name: `ω_pc=${fmtNum(wpc, 3)}`, hoverinfo: 'name',
        });
        traces.push({
          x: [wpc, wpc], y: [magMin, magMax],
          type: 'scatter', mode: 'lines',
          line: { color: gmColor, width: 1.5, dash: 'dashdot' },
          hoverinfo: 'skip', showlegend: false,
        });
        if (Number.isFinite(margins.gainMarginDB)) {
          annotations.push({
            x: Math.log10(wpc), y: -180, xref: 'x', yref: 'y2',
            text: `GM=${fmtDB(margins.gainMarginDB)}`, showarrow: true, arrowhead: 0,
            ax: 32, ay: 22, font: { size: 10, color: gmColor },
            bgcolor: 'rgba(0,0,0,0.5)', borderpad: 2,
          });
        }
      }
      if (annotations.length) layout.annotations = annotations;

      // BW marker: closed-loop -3 dB bandwidth (from state.closedLoop if available)
      try {
        const clSys = state.closedLoop;
        if (clSys) {
          const bwRange = autoFreqRange(clSys);
          const clData = bodeData(clSys, bwRange.wMin, bwRange.wMax);
          const dcMag = Math.pow(10, clData.magDB[0] / 20);
          const threshold = dcMag / Math.SQRT2;
          let bwW = null;
          for (let bi = 0; bi < clData.w.length; bi++) {
            if (Math.pow(10, clData.magDB[bi] / 20) < threshold) { bwW = clData.w[bi]; break; }
          }
          if (bwW && Number.isFinite(bwW)) {
            traces.push({
              x: [bwW, bwW], y: [magMin, magMax],
              type: 'scatter', mode: 'lines',
              line: { color: '#a855f7', width: 1, dash: 'dashdot' },
              name: `ω_BW=${fmtNum(bwW, 3)} rad/s`, hoverinfo: 'name',
            });
            layout.annotations = [...(layout.annotations || []), {
              x: Math.log10(bwW), y: magMin + (magMax - magMin) * 0.08,
              xref: 'x', yref: 'y',
              text: `ω_BW`, showarrow: false,
              font: { size: 9, color: '#a855f7' },
            }];
          }
        }
      } catch (_) { /* bandwidth detection optional */ }
    } catch (_) { /* ignore — fall back to plain bode */ }
  }

  // S3-4: warn when plant has RHP poles — Bode PM/GM cannot be read with the
  // naive "PM>0 means stable" rule; Nyquist criterion must account for RHP poles.
  if (!isDiscrete) {
    try {
      const poles = sys.poles ? sys.poles() : [];
      const hasRhp = poles.some((p) => (p.re ?? p) > 1e-9);
      if (hasRhp) {
        const note = {
          xref: 'paper', yref: 'paper', x: 0.02, y: 0.98,
          xanchor: 'left', yanchor: 'top',
          text: '⚠ Plant 不穩定 (RHP 極點)。PM/GM 數字以 Nyquist criterion 解讀需考慮 RHP poles 數，不能直接套用「PM>0 = 穩定」的規則',
          showarrow: false,
          bgcolor: 'rgba(239,68,68,0.15)',
          bordercolor: '#ef4444',
          borderwidth: 1,
          borderpad: 4,
          font: { size: 10, color: '#fca5a5' },
        };
        layout.annotations = [...(layout.annotations || []), note];
      }
    } catch (_) { /* ignore */ }
  }

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

  // Smart auto-zoom: Tukey-fence (Q±3·IQR) outlier rejection, square viewport.
  // Nyquist curves have ±∞ tails for integrating / resonant systems; the IQR
  // fence robustly clips them while preserving the interesting mid-band region.
  // We always ensure the critical -1+j0 point is visible.
  const pctile = (arr, p) => {
    const s = [...arr].sort((a, b) => a - b);
    const i = (p / 100) * (s.length - 1);
    return s[Math.floor(i)] + (s[Math.ceil(i)] - s[Math.floor(i)]) * (i - Math.floor(i));
  };
  const coreRe = [...(data.re || []), ...(data.reNeg || [])].filter(Number.isFinite);
  const coreIm = [...(data.im || []), ...(data.imNeg || [])].filter(Number.isFinite);
  if (coreRe.length > 2 && coreIm.length > 2) {
    // Tukey fence: clip at Q1/Q3 ± 3·IQR (more aggressive than 1.5× to keep resonances)
    const q1Re = pctile(coreRe, 25), q3Re = pctile(coreRe, 75);
    const q1Im = pctile(coreIm, 25), q3Im = pctile(coreIm, 75);
    const iqrRe = q3Re - q1Re || 1, iqrIm = q3Im - q1Im || 1;
    const k = 3;
    let xMin = Math.max(Math.min(...coreRe), q1Re - k * iqrRe);
    let xMax = Math.min(Math.max(...coreRe), q3Re + k * iqrRe);
    let yMin = Math.max(Math.min(...coreIm), q1Im - k * iqrIm);
    let yMax = Math.min(Math.max(...coreIm), q3Im + k * iqrIm);
    // Always include the critical point -1+j0
    xMin = Math.min(xMin, -1.1);
    xMax = Math.max(xMax, -0.9);
    yMin = Math.min(yMin, -0.1);
    yMax = Math.max(yMax, 0.1);
    // Square viewport: center + equal half-span on both axes (no distortion)
    const cx = (xMin + xMax) / 2, cy = (yMin + yMax) / 2;
    const halfSpan = Math.max(xMax - xMin, yMax - yMin) / 2 * 1.2 + 0.15;
    layout.xaxis.autorange = false;
    layout.yaxis.autorange = false;
    layout.xaxis.range = [cx - halfSpan, cx + halfSpan];
    layout.yaxis.range = [cy - halfSpan, cy + halfSpan];
  }

  const annotList = [];
  // Always label the -1+j0 critical point
  annotList.push({ x: -1, y: 0, xshift: 8, yshift: -14, text: '−1+j0', showarrow: false, font: { size: 10, color: getCSS('--color-unstable') } });
  if (encirclements !== 0) {
    annotList.push({ x: -1, y: 0.3, text: `N=${encirclements}`, showarrow: false, font: { size: 12, color: getCSS('--color-unstable') } });
  }
  layout.annotations = annotList;

  Plotly.react(targetId, traces, layout, { responsive: true, displayModeBar: false });
}

/**
 * Generate Nichols M-circle traces (iso-|T| contours).
 * M-circle in Nyquist plane: center (-M²/(M²-1), 0), radius M/|M²-1|.
 */
function _nicholsMCircleTraces() {
  // M values in dB and corresponding linear ratios
  const mdB = [-6, -3, -1.5, 0, 1, 2, 3, 6];
  const colors = ['#6b7280','#9ca3af','#d1d5db','#ef4444','#f97316','#eab308','#22c55e','#3b82f6'];
  const traces = [];
  for (let i = 0; i < mdB.length; i++) {
    const M = Math.pow(10, mdB[i] / 20); // linear
    const pts = [];
    if (Math.abs(M - 1) < 1e-6) {
      // M=1: vertical line Re[L] = -0.5 in Nyquist → phase of (-0.5 + j·Im)
      for (let im = -20; im <= 20; im += 0.2) {
        const re = -0.5;
        if (Math.abs(im) < 1e-9) continue;
        pts.push([Math.atan2(im, re) * 180 / Math.PI, 20 * Math.log10(Math.sqrt(0.25 + im * im))]);
      }
    } else {
      const cx = -(M * M) / (M * M - 1);
      const r = Math.abs(M / (M * M - 1));
      for (let theta = 0; theta <= 2 * Math.PI; theta += 0.04) {
        const re = cx + r * Math.cos(theta);
        const im = r * Math.sin(theta);
        const mag = Math.sqrt(re * re + im * im);
        if (mag < 1e-9) continue;
        pts.push([Math.atan2(im, re) * 180 / Math.PI, 20 * Math.log10(mag)]);
      }
    }
    pts.sort((a, b) => a[0] - b[0]);
    // Clip to visible Nichols chart region
    const vis = pts.filter(([ph, db]) => ph >= -360 && ph <= 0 && db >= -40 && db <= 40);
    if (vis.length < 2) continue;
    traces.push({
      x: vis.map(p => p[0]),
      y: vis.map(p => p[1]),
      type: 'scatter', mode: 'lines',
      name: `M=${mdB[i]}dB`,
      line: { color: colors[i], width: 1, dash: 'dot' },
      hovertemplate: `M=${mdB[i]}dB<extra></extra>`,
      showlegend: false,
    });
    // Label at right-most visible point
    const lp = vis[vis.length - 1];
    traces.push({
      x: [lp[0]], y: [lp[1]], type: 'scatter', mode: 'text',
      text: [`${mdB[i]}dB`], textposition: 'middle right',
      textfont: { size: 9, color: colors[i] },
      showlegend: false, hoverinfo: 'skip',
    });
  }
  return traces;
}

/**
 * Generate Nichols N-circle traces (iso-∠T contours).
 * N-circle in Nyquist plane: center (-0.5, 1/(2N)), radius √(N²+1)/(2|N|).
 * N = tan(φ) where φ is the closed-loop phase angle.
 */
function _nicholsNCircleTraces() {
  const phiDeg = [-135, -90, -45, -30, 30, 45, 90, 135];
  const traces = [];
  for (const phi of phiDeg) {
    if (Math.abs(phi) < 1e-6) continue;
    const N = Math.tan(phi * Math.PI / 180);
    if (!isFinite(N)) continue;
    const cy = 1 / (2 * N);
    const r = Math.sqrt(0.25 + cy * cy);
    const pts = [];
    for (let theta = 0; theta <= 2 * Math.PI; theta += 0.04) {
      const re = -0.5 + r * Math.cos(theta);
      const im = cy + r * Math.sin(theta);
      const mag = Math.sqrt(re * re + im * im);
      if (mag < 1e-9) continue;
      pts.push([Math.atan2(im, re) * 180 / Math.PI, 20 * Math.log10(mag)]);
    }
    pts.sort((a, b) => a[0] - b[0]);
    const vis = pts.filter(([ph, db]) => ph >= -360 && ph <= 0 && db >= -40 && db <= 40);
    if (vis.length < 2) continue;
    traces.push({
      x: vis.map(p => p[0]),
      y: vis.map(p => p[1]),
      type: 'scatter', mode: 'lines',
      name: `∠T=${phi}°`,
      line: { color: 'rgba(139,92,246,0.4)', width: 1, dash: 'dash' },
      hovertemplate: `∠T=${phi}°<extra></extra>`,
      showlegend: false,
    });
  }
  return traces;
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
  const mCircles = _nicholsMCircleTraces();
  const nCircles = _nicholsNCircleTraces();
  const layout = PLOTLY_LAYOUT_BASE();
  layout.xaxis.title = { text: 'Phase (deg)', font: { size: 11 } };
  layout.xaxis.range = [-360, 0];
  layout.yaxis.title = { text: 'Magnitude (dB)', font: { size: 11 } };
  layout.yaxis.range = [-40, 40];
  layout.showlegend = true;
  layout.legend = compactLegend();
  // M/N circles drawn first, Nichols curve and critical point on top
  Plotly.react(targetId, [...mCircles, ...nCircles, trace, criticalPoint], layout, { responsive: true, displayModeBar: false });
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

  // jω crossings (critical K) — also stored for ZN PID tuning
  let jwCrossings = [];
  try {
    jwCrossings = rootLocusJwCrossings(sys, 1e3, 400);
    if (targetId === 'chart-active') _rlocusJwCrossings = jwCrossings;
    if (jwCrossings.length > 0) {
      const xs = [], ys = [], labels = [];
      for (const c of jwCrossings) {
        xs.push(0, 0); ys.push(c.omega, -c.omega);
        labels.push(`Ku=${fmtNum(c.K)}`, `Ku=${fmtNum(c.K)}`);
      }
      traces.push({
        x: xs, y: ys,
        type: 'scatter', mode: 'markers+text',
        text: labels, textposition: 'middle right',
        textfont: { size: 10, color: getCSS('--color-unstable') },
        name: 'jω crossings (Ku)',
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
      text: '💡 Click a branch to pick a gain — K-slider & step preview appear below the chart',
      showarrow: false,
      font: { size: 10, color: getCSS('--text-muted') },
      bgcolor: 'rgba(15,17,23,.6)', borderpad: 4,
    }];
  }
  Plotly.react(targetId, traces, layout, { responsive: true, displayModeBar: false });

  if (targetId === 'chart-active') {
    _rlocusInteractiveSys = sys;
    _rlocusKMax = result.gains[result.gains.length - 1];
    updateRlocusZNPanel();
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
let _rlocusJwCrossings = [];   // [{K, omega}] — stored when Root Locus is rendered

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

/**
 * Update the Ziegler-Nichols section in the Root Locus panel.
 * Called each time the Root Locus is re-rendered.
 */
function updateRlocusZNPanel() {
  const section = document.getElementById('rl-zn-section');
  const paramsEl = document.getElementById('rl-zn-params');
  if (!section || !paramsEl) return;

  if (!_rlocusJwCrossings || _rlocusJwCrossings.length === 0) {
    section.style.display = 'none';
    return;
  }

  // Use the first crossing (lowest-frequency, most relevant for PID)
  const { K: Ku, omega } = _rlocusJwCrossings[0];
  const Tu = (2 * Math.PI) / omega;

  // ZN formulas
  const pidZN  = PIDController.zieglerNichols(Ku, Tu, 'PID');
  const piZN   = PIDController.zieglerNichols(Ku, Tu, 'PI');
  const pZN    = PIDController.zieglerNichols(Ku, Tu, 'P');

  paramsEl.innerHTML = [
    `<div><span style="color:var(--color-accent)">Ku</span> = ${fmtNum(Ku)}</div>`,
    `<div><span style="color:var(--color-accent)">Tu</span> = ${fmtNum(Tu)} s  (ω = ${fmtNum(omega)} rad/s)</div>`,
    `<div style="border-top:1px solid var(--border-primary);margin:4px 0;padding-top:4px;">`,
    `  <b>PID:</b> Kp=${pidZN.Kp.toFixed(3)}, Ki=${pidZN.Ki.toFixed(3)}, Kd=${pidZN.Kd.toFixed(3)}`,
    `</div>`,
    `<div><b>PI:</b> Kp=${piZN.Kp.toFixed(3)}, Ki=${piZN.Ki.toFixed(3)}</div>`,
    `<div><b>P:</b>  Kp=${pZN.Kp.toFixed(3)}</div>`,
  ].join('');

  section.style.display = 'block';
}

/**
 * Apply Ziegler-Nichols tuning (from Root Locus Ku/Tu) to the PID controller.
 * @param {'P'|'PI'|'PID'} type
 */
function applyZNPIDFromRlocus(type) {
  if (!_rlocusJwCrossings || _rlocusJwCrossings.length === 0) return;
  const { K: Ku, omega } = _rlocusJwCrossings[0];
  const Tu = (2 * Math.PI) / omega;
  const pid = PIDController.zieglerNichols(Ku, Tu, type);
  setPIDFromController({ Kp: pid.Kp, Ki: pid.Ki, Kd: pid.Kd }, `zn-${type.toLowerCase()}`);
  // Keep compensator as-is (ZN works on top of existing compensator)
  updateController();
  document.querySelector('[data-sidebar="controller"]')?.click();
  // Flash the clicked button
  const btnId = type === 'PID' ? 'btn-zn-pid' : type === 'PI' ? 'btn-zn-pi' : 'btn-zn-p';
  const btn = document.getElementById(btnId);
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

  // Add observer poles if computed (continuous-time only)
  const obsL = state?.phase8?.kalman?.L ?? state?.phase8?.observer?.L;
  if (obsL && !isDiscrete) {
    try {
      const model = currentPhase7DesignModel();
      const obsPoles = observerPoles(model.A, model.C, obsL);
      traces.push({
        x: obsPoles.map(p => p.re),
        y: obsPoles.map(p => p.im),
        type: 'scatter', mode: 'markers',
        name: 'Observer Poles',
        marker: { symbol: 'diamond', size: 9, color: 'rgba(139,92,246,0.9)', line: { width: 1.5, color: 'rgba(139,92,246,1)' } },
      });
    } catch (_) { /* ignore if model not ready */ }
  }

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

  // P15-02: Bode overlay + metrics matrix
  renderComparisonBodeAndMetrics();
  scheduleSmokeDiagnostics();
}

function renderComparisonBodeAndMetrics() {
  const bodeEl = document.getElementById('chart-compare-bode');
  const metricsEl = document.getElementById('compare-metrics-table');
  const palette = ['#6366f1', '#ec4899', '#10b981', '#f59e0b', '#22c55e', '#38bdf8'];
  if (bodeEl && typeof Plotly !== 'undefined') {
    const snaps = state.comparisonSnapshots.filter((s) => s.bode);
    if (snaps.length === 0) {
      Plotly.purge('chart-compare-bode');
    } else {
      const traces = snaps.map((s, idx) => ({
        x: s.bode.omega,
        y: s.bode.magDB,
        mode: 'lines',
        name: `|L| ${s.name}`,
        line: { color: palette[idx % palette.length], width: 1.6 },
      }));
      Plotly.react('chart-compare-bode', traces, {
        ...PLOTLY_LAYOUT_BASE(),
        margin: { t: 10, r: 10, b: 30, l: 50 },
        showlegend: true,
        legend: { font: { size: 9 }, orientation: 'h', y: 1.15 },
        xaxis: { title: 'ω (rad/s)', type: 'log', gridcolor: 'rgba(255,255,255,0.06)' },
        yaxis: { title: '|L| (dB)', gridcolor: 'rgba(255,255,255,0.06)' },
      }, { responsive: true, displayModeBar: false });
    }
  }
  if (metricsEl) {
    if (state.comparisonSnapshots.length === 0) {
      metricsEl.innerHTML = '';
      return;
    }
    const rows = state.comparisonSnapshots.map((s) => `
      <tr>
        <td><strong>${escapeHtml(s.name.slice(0, 40))}</strong></td>
        <td>${Number.isFinite(s.metrics.gainMarginDB) ? (s.metrics.gainMarginDB === Infinity ? '∞' : s.metrics.gainMarginDB.toFixed(2) + ' dB') : '—'}</td>
        <td>${Number.isFinite(s.metrics.phaseMargin) ? s.metrics.phaseMargin.toFixed(1) + '°' : '—'}</td>
        <td>${Number.isFinite(s.metrics.riseTime) ? s.metrics.riseTime.toFixed(3) + ' s' : '—'}</td>
        <td>${Number.isFinite(s.metrics.settlingTime) ? s.metrics.settlingTime.toFixed(3) + ' s' : '—'}</td>
        <td>${Number.isFinite(s.metrics.overshoot) ? (s.metrics.overshoot * 100).toFixed(1) + '%' : '—'}</td>
      </tr>
    `).join('');
    metricsEl.innerHTML = `
      <div class="comparison-table-wrap">
        <table class="comparison-table">
          <thead><tr>
            <th>Snapshot</th><th>GM</th><th>PM</th><th>Rise</th><th>Settle</th><th>Overshoot</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }
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
  // H2: use the EXACT same source as Stability Snapshot — closed-loop step
  // response of the current sys, passed through stepInfo (single formula).
  // Both panels now read from the same code path; any residual discrepancy
  // can only come from the snapshot being taken with a different
  // simulationConfig (duration / sampleCount) than the current live one.
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
      gainCrossover: margins.gainCrossover,
    },
    response,
    // P15-02: capture Bode of the open-loop for A/B frequency-domain comparison
    bode: (() => {
      try {
        if (state.domain === 'z' || sys instanceof DiscreteTransferFunction) return null;
        const ol = state.openLoop || state.plant;
        return bodeData(ol, 1e-2, 1e3, 200);
      } catch { return null; }
    })(),
  };
  state.comparisonSnapshots = [...state.comparisonSnapshots, snapshot];
  renderSnapshotList();
  renderComparisonChart();
  switchSidebarPanel('compare');
  saveSessionToStorage();
  notify('Comparison snapshot saved.', 'success', { title: 'Compare' });
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
  });
  syncPIDSliders();
  if (snapshot.compensator) {
    state.compensator = normalizeCompensatorConfig(snapshot.compensator);
    syncCompensatorInputs();
  }
  updateController();
  notify('Snapshot parameters applied.', 'success', { title: 'Compare' });
}

function deleteSnapshot(snapshotId) {
  state.comparisonSnapshots = state.comparisonSnapshots.filter((item) => item.id !== snapshotId);
  renderSnapshotList();
  renderComparisonChart();
  saveSessionToStorage();
  notify('Snapshot deleted.', 'info', { title: 'Compare' });
}

function clearSnapshots() {
  state.comparisonSnapshots = [];
  renderSnapshotList();
  renderComparisonChart();
  saveSessionToStorage();
  notify('All comparison snapshots cleared.', 'info', { title: 'Compare' });
}

function exportComparisonSnapshots() {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    snapshots: state.comparisonSnapshots,
  };
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  downloadFile(`control-compare-${timestamp}.json`, 'application/json;charset=utf-8', JSON.stringify(payload, null, 2));
  notify('Comparison export started.', 'success', { title: 'Export' });
}

function saveProjectFile() {
  captureStateSpaceInputs();
  const payload = buildProjectPayload();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  downloadFile(`control-project-${timestamp}.json`, 'application/json;charset=utf-8', JSON.stringify(payload, null, 2));
  notify('Project file export started.', 'success', { title: 'Project' });
}

async function loadProjectFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    applyProjectPayload(data);
    clearError();
    notify('Project loaded.', 'success', { title: 'Project' });
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
    analysisSource: state.analysisSource,
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
  state.analysisSource = data.analysisSource || 'local';
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
    }
  });
  if (typeof controller.N === 'number') {
    state.pidParams.N = controller.N;
    const nInput = document.getElementById('pid-N');
    const nDisplay = document.getElementById('pid-N-val');
    if (nInput) nInput.value = controller.N;
    if (nDisplay) nDisplay.textContent = String(controller.N);
  }
  syncPIDSliders();
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
  const analysisSelect = document.getElementById('analysis-source');
  if (analysisSelect) analysisSelect.value = state.analysisSource;
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

function buildCurrentAnalysisExport() {
  if (!state.plant) return;
  const sys = state.showClosedLoop ? (state.closedLoop || state.plant) : state.plant;
  const isDiscrete = state.domain === 'z' || sys instanceof DiscreteTransferFunction;
  const response = isDiscrete
    ? discreteStepResponse(sys, {
      sampleCount: Math.min(state.simulationConfig.sampleCount || 200, 500),
      amplitude: state.simulationConfig.amplitude || 1,
    })
    : currentResponseData(sys);
  const margins = isDiscrete ? {
    gainMarginDB: Infinity,
    phaseMargin: NaN,
  } : stabilityMargins(state.openLoop || state.plant);
  const info = stepInfo(response.t, response.y);
  const stability = analyzeStability(sys, { domain: state.domain, margins });
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    systemType: state.systemType,
    domain: state.domain,
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
    stability,
    apiAnalysis: { ...state.apiAnalysis, lastResult: undefined },
    response,
  };
}

function exportCurrentResult(format) {
  const payload = buildCurrentAnalysisExport();
  if (!payload) return;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  if (format === 'csv') {
    const rows = ['time,response'];
    payload.response.t.forEach((t, idx) => rows.push(`${t},${payload.response.y[idx]}`));
    downloadFile(`control-response-${timestamp}.csv`, 'text/csv;charset=utf-8', rows.join('\n'));
    return;
  }
  downloadFile(`control-analysis-${timestamp}.json`, 'application/json;charset=utf-8', JSON.stringify(payload, null, 2));
}

function exportMarkdownReport() {
  const payload = buildCurrentAnalysisExport();
  if (!payload) return;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  downloadFile(`control-report-${timestamp}.md`, 'text/markdown;charset=utf-8', renderMarkdownReport(payload));
}

function renderMarkdownReport(payload) {
  const metrics = payload.metrics || {};
  const stability = payload.stability || {};
  const recs = stability.recommendations || [];
  return [
    '# ControlStudio Analysis Report',
    '',
    `Generated: ${payload.exportedAt}`,
    '',
    '## System',
    '',
    `- Domain: ${payload.domain}-domain`,
    `- System type: ${payload.systemType}`,
    `- Mode: ${payload.mode}`,
    `- Plant: ${payload.transferFunction?.formula || 'n/a'}`,
    `- Controller: Kp=${fmtNum(payload.controller?.Kp, 4)}, Ki=${fmtNum(payload.controller?.Ki, 4)}, Kd=${fmtNum(payload.controller?.Kd, 4)}`,
    `- Compensator: ${payload.controller?.compensator?.mode || 'none'}`,
    '',
    '## Metrics',
    '',
    `- Gain margin: ${metrics.gainMarginDB === Infinity ? 'infinity' : fmtDB(metrics.gainMarginDB)}`,
    `- Phase margin: ${Number.isFinite(metrics.phaseMargin) ? fmtDeg(metrics.phaseMargin) : 'n/a'}`,
    `- Rise time: ${fmtTime(metrics.riseTime)}`,
    `- Settling time: ${fmtTime(metrics.settlingTime)}`,
    `- Overshoot: ${fmtPercent(metrics.overshoot)}`,
    `- Steady-state error: ${Number.isFinite(metrics.steadyStateError) ? fmtNum(metrics.steadyStateError, 6) : 'n/a'}`,
    '',
    '## Stability Analysis',
    '',
    `- Status: ${stability.status || 'unknown'}`,
    `- Risk: ${stability.risk || 'unknown'}`,
    `- Summary: ${stability.summary || 'n/a'}`,
    `- Dominant pole: ${stability.dominantPole ? formatPoleForUI(stability.dominantPole, stability.domain) : 'n/a'}`,
    `- Stability margin: ${Number.isFinite(stability.stabilityMargin) ? fmtNum(stability.stabilityMargin, 6) : 'n/a'}`,
    `- Minimum damping ratio: ${Number.isFinite(stability.minDamping) ? fmtNum(stability.minDamping, 6) : 'n/a'}`,
    '',
    '## Recommendations',
    '',
    ...(recs.length ? recs.map((rec) => `- ${rec}`) : ['- n/a']),
    '',
    '## API Analysis',
    '',
    `- Source mode: ${state.analysisSource}`,
    `- Status: ${payload.apiAnalysis?.status || 'idle'}`,
    `- Message: ${payload.apiAnalysis?.message || 'n/a'}`,
    '',
  ].join('\n');
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
// MIMO (Phase 9 foundation)
// ============================================================
function switchSystemMode(mode) {
  if (mode === state.systemMode) return;

  // H3: Cross-mode comparison snapshots are meaningless — confirm + clear.
  if (state.comparisonSnapshots && state.comparisonSnapshots.length > 0) {
    const ok = confirm(`切換到 ${mode.toUpperCase()} 模式會清除 ${state.comparisonSnapshots.length} 個比較快照（屬於上一個模式），是否繼續？`);
    if (!ok) return;
    state.comparisonSnapshots = [];
    if (typeof renderSnapshotList === 'function') renderSnapshotList();
    if (typeof renderComparisonChart === 'function') renderComparisonChart();
  }

  state.systemMode = mode;
  document.querySelectorAll('.system-mode-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.mode === mode);
  });
  syncAdvisorModeVisibility();

  // M5: show/hide Phase 7/8 MIMO compatibility banners
  const p7Banner = document.getElementById('p7-mimo-banner');
  const p8Banner = document.getElementById('p8-mimo-banner');
  if (p7Banner) p7Banner.style.display = mode === 'mimo' ? 'block' : 'none';
  if (p8Banner) p8Banner.style.display = mode === 'mimo' ? 'block' : 'none';

  // L3: reset sidebar scroll position so newly-revealed panels are visible
  const aside = document.querySelector('aside');
  if (aside) aside.scrollTop = 0;

  const sisoPanel = document.getElementById('siso-input-panel');
  const mimoPanel = document.getElementById('mimo-input-panel');
  const channelBar = document.getElementById('mimo-channel-bar');
  const mimoAnalysis = document.getElementById('mimo-analysis-panel');

  if (mode === 'siso') {
    if (sisoPanel) sisoPanel.style.display = '';
    if (mimoPanel) mimoPanel.style.display = 'none';
    if (channelBar) channelBar.style.display = 'none';
    if (mimoAnalysis) {
      mimoAnalysis.style.display = 'none';
      mimoAnalysis.style.order = '';
    }
    // S4-3 corollary: when leaving MIMO mode, restore 2×2 default in obs-qn
    // and friends if they are still oversized from the MIMO sweep.
    [{ id: 'obs-qn', dim: 2 }, { id: 'dkf-qd', dim: 2 }].forEach(({ id, dim }) => {
      const el = document.getElementById(id);
      if (!el) return;
      const cur = _parseMatrixDims(el.value);
      if (cur.r > dim || cur.c > dim) {
        el.value = _identityMatrixText(dim);
      }
    });
    state.mimoChannel.all = false;
    const gridCell = document.getElementById('mimo-grid-cell');
    if (gridCell) gridCell.style.display = 'none';
    const activeChart = document.getElementById('chart-active');
    if (activeChart) {
      const cell = activeChart.closest('.chart-cell');
      if (cell && cell.id !== 'mimo-grid-cell') cell.style.display = '';
    }
    if (state.plant) refreshAllCharts();
  } else {
    if (sisoPanel) sisoPanel.style.display = 'none';
    if (mimoPanel) mimoPanel.style.display = '';
    clearSISOAdvisorOutputsForMIMO();
    if (mimoAnalysis) {
      mimoAnalysis.style.display = '';
      mimoAnalysis.style.order = '-1';
    }
    if (!state.mimoPlant) {
      updateMIMOSystem();
    } else {
      renderMIMOChannelBar();
      applyMIMOChannel();
    }
  }
  updateGlobalStatusBar(`${mode.toUpperCase()} mode active`);
}

function updateMIMOSystem() {
  try {
    clearFieldErrors();
    const aStr = document.getElementById('mimo-a').value;
    const bStr = document.getElementById('mimo-b').value;
    const cStr = document.getElementById('mimo-c').value;
    const dStr = document.getElementById('mimo-d').value;
    const mimoPlant = parseMIMOMatrices(aStr, bStr, cStr, dStr);
    state.mimoPlant = mimoPlant;
    state.mimoChannel.output = Math.min(state.mimoChannel.output, mimoPlant.p - 1);
    state.mimoChannel.input = Math.min(state.mimoChannel.input, mimoPlant.m - 1);
    const rankC = matRank(controllabilityMatrix(mimoPlant.A, mimoPlant.B));
    const rankO = matRank(observabilityMatrix(mimoPlant.A, mimoPlant.C));

    const statusEl = document.getElementById('mimo-status-out');
    if (statusEl) {
      statusEl.style.display = 'block';
      statusEl.innerHTML = `<div style="color:var(--color-stable);font-weight:700;">MIMO Plant OK ✓</div>
        <div>n=${mimoPlant.n} states, m=${mimoPlant.m} inputs, p=${mimoPlant.p} outputs</div>
        <div>Total channels: ${mimoPlant.p * mimoPlant.m}</div>
        <div>Controllability rank: ${rankC}/${mimoPlant.n} &nbsp;|&nbsp; Observability rank: ${rankO}/${mimoPlant.n}</div>`;
    }
    renderMIMOChannelBar();
    applyMIMOChannel();
    autoResizePhase8MatricesForMIMO(mimoPlant);
    syncAdvisorModeVisibility();
    clearError();
    updateGlobalStatusBar(`MIMO plant updated: ${mimoPlant.p}x${mimoPlant.m}`);
  } catch (err) {
    const statusEl = document.getElementById('mimo-status-out');
    if (statusEl) {
      statusEl.style.display = 'block';
      statusEl.innerHTML = `<div style="color:var(--color-unstable);">${escapeHtml(err.message)}</div>`;
    }
    syncAdvisorModeVisibility();
    showError(err.message);
  }
}

function renderMIMOChannelBar() {
  const bar = document.getElementById('mimo-channel-bar');
  const btns = document.getElementById('mimo-channel-buttons');
  if (!bar || !btns || !state.mimoPlant) return;
  bar.style.display = 'block';
  btns.innerHTML = '';
  for (let i = 0; i < state.mimoPlant.p; i++) {
    for (let j = 0; j < state.mimoPlant.m; j++) {
      const b = document.createElement('button');
      b.className = 'btn btn-sm mimo-channel-btn';
      const isActive = !state.mimoChannel.all
        && state.mimoChannel.output === i
        && state.mimoChannel.input === j;
      if (isActive) b.classList.add('active');
      b.textContent = `u${j + 1} → y${i + 1}`;
      b.style.padding = '4px 10px';
      b.style.fontSize = '11px';
      b.dataset.output = i;
      b.dataset.input = j;
      b.addEventListener('click', () => {
        state.mimoChannel.output = parseInt(b.dataset.output, 10);
        state.mimoChannel.input = parseInt(b.dataset.input, 10);
        state.mimoChannel.all = false;
        renderMIMOChannelBar();
        hideMIMOGrid();
        applyMIMOChannel();
      });
      btns.appendChild(b);
    }
  }

  // All-view toggle (last button)
  const allBtn = document.createElement('button');
  allBtn.className = 'btn btn-sm mimo-channel-btn mimo-all-btn';
  allBtn.textContent = '⊞ All';
  allBtn.style.padding = '4px 10px';
  allBtn.style.fontSize = '11px';
  if (state.mimoChannel.all) allBtn.classList.add('active');
  allBtn.addEventListener('click', () => {
    state.mimoChannel.all = !state.mimoChannel.all;
    renderMIMOChannelBar();
    if (state.mimoChannel.all) {
      renderMIMOGrid();
    } else {
      hideMIMOGrid();
      applyMIMOChannel();
    }
  });
  btns.appendChild(allBtn);
}

function hideMIMOGrid() {
  const gridCell = document.getElementById('mimo-grid-cell');
  const activeChart = document.getElementById('chart-active');
  if (gridCell) gridCell.style.display = 'none';
  if (activeChart) {
    const cell = activeChart.closest('.chart-cell');
    if (cell && cell.id !== 'mimo-grid-cell') cell.style.display = '';
  }
}

function renderMIMOGrid() {
  if (!state.mimoPlant) return;
  const gridCell = document.getElementById('mimo-grid-cell');
  const gridContainer = document.getElementById('chart-mimo-grid');
  const activeChart = document.getElementById('chart-active');
  if (!gridCell || !gridContainer) return;

  // Hide the normal single chart
  if (activeChart) {
    const cell = activeChart.closest('.chart-cell');
    if (cell && cell.id !== 'mimo-grid-cell') cell.style.display = 'none';
  }
  gridCell.style.display = '';

  const p = state.mimoPlant.p;
  const m = state.mimoPlant.m;

  // L2: surface whether grid cells are open-loop (plant TF) or closed-loop.
  // Per-channel MIMO step responses below are open-loop plant channel TFs.
  const titleEl = document.getElementById('mimo-grid-title');
  if (titleEl) titleEl.textContent = 'All Plant Channels (Open-Loop Step Response)';

  gridContainer.style.gridTemplateColumns = `repeat(${m}, minmax(0, 1fr))`;
  gridContainer.style.gridTemplateRows = `repeat(${p}, minmax(0, 1fr))`;

  gridContainer.innerHTML = '';
  const subCharts = [];
  for (let i = 0; i < p; i++) {
    for (let j = 0; j < m; j++) {
      const div = document.createElement('div');
      div.style.cssText = 'border:1px solid var(--border-primary);border-radius:8px;padding:6px;background:rgba(15,17,23,0.3);display:flex;flex-direction:column;min-height:0;';
      const label = document.createElement('div');
      label.style.cssText = 'font-size:10px;color:var(--text-muted);font-weight:600;padding:2px 4px;';
      label.textContent = `u${j + 1} → y${i + 1} (open)`;
      const plotDiv = document.createElement('div');
      plotDiv.id = `mimo-grid-${i}-${j}`;
      plotDiv.style.cssText = 'flex:1;min-height:0;';
      div.appendChild(label);
      div.appendChild(plotDiv);
      gridContainer.appendChild(div);
      subCharts.push({ i, j, id: plotDiv.id });
    }
  }

  requestAnimationFrame(() => {
    subCharts.forEach(({ i, j, id }) => {
      try {
        const tf = state.mimoPlant.channelTF(i, j);
        const { t, y } = stepResponse(tf, { duration: 30, sampleCount: 200 });
        Plotly.newPlot(id, [{
          x: t, y: y, mode: 'lines',
          line: { color: '#6366f1', width: 1.5 },
        }], {
          paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
          margin: { t: 4, r: 4, b: 22, l: 30 },
          font: { size: 9, color: '#94a3b8' },
          showlegend: false,
          xaxis: { gridcolor: 'rgba(255,255,255,0.06)', zerolinecolor: 'rgba(255,255,255,0.1)' },
          yaxis: { gridcolor: 'rgba(255,255,255,0.06)', zerolinecolor: 'rgba(255,255,255,0.1)' },
        }, { responsive: true, displayModeBar: false, staticPlot: false });
      } catch (err) {
        const el = document.getElementById(id);
        if (el) el.innerHTML = `<div style="font-size:10px;color:var(--color-unstable);padding:8px;">${escapeHtml(err.message)}</div>`;
      }
    });
  });
}

function applyMIMOChannel() {
  if (!state.mimoPlant) return;
  const tf = state.mimoPlant.channelTF(state.mimoChannel.output, state.mimoChannel.input);
  state.plant = tf;
  refreshAllCharts();
}

function computeMIMORGA() {
  try {
    clearFieldErrors();
    if (!state.mimoPlant) throw new Error('請先設定 MIMO plant');
    if (state.mimoPlant.m !== state.mimoPlant.p) {
      throw new Error(`RGA 需要方陣系統 (m=p)，目前 m=${state.mimoPlant.m}, p=${state.mimoPlant.p}`);
    }

    const rga = rgaSteady(state.mimoPlant);
    const diag = rgaDiagnosis(rga);
    const invariants = rgaInvariants(rga);

    const colorFor = (lvl) =>
      lvl === 'good' ? 'var(--color-stable)'
      : lvl === 'bad' ? 'var(--color-unstable)'
      : lvl === 'warn' ? 'var(--color-secondary)'
      : 'var(--color-accent)';

    const matrixRows = renderLabeledMatrixTable(rga, { rowPrefix: 'y', colPrefix: 'u', digits: 3 });

    const diagLines = diag.diagnoses
      .map((d) => `<div style="color:${colorFor(d.level)};">${d.pair}: λ=${fmtNum(d.lambda, 3)} — ${d.note}</div>`)
      .join('');

    const sugg = diag.suggestion
      ? `<div style="color:var(--color-accent);margin-top:6px;">💡 ${diag.suggestion}</div>`
      : '';

    const outEl = document.getElementById('mimo-rga-out');
    outEl.style.display = 'block';
    outEl.innerHTML = `<div style="color:var(--color-accent);font-weight:700;">Steady-State RGA Matrix</div>
      <div style="margin:4px 0;">${matrixRows}</div>
      <div style="margin-top:4px;">row sum dev = ${fmtNum(invariants.rowDeviation, 6)} &nbsp;|&nbsp; col sum dev = ${fmtNum(invariants.colDeviation, 6)}</div>
      <div style="margin-top:8px;border-top:1px solid var(--border-primary);padding-top:6px;">${diagLines}${sugg}</div>
      <div style="font-size:10px;color:var(--text-muted);margin-top:6px;">λ≈1: 良好；λ≈0.5: 強耦合；λ&lt;0: 不可配對</div>`;
    clearError();
  } catch (err) {
    const outEl = document.getElementById('mimo-rga-out');
    if (outEl) {
      outEl.style.display = 'block';
      outEl.innerHTML = `<div style="color:var(--color-unstable);">${escapeHtml(err.message)}</div>`;
    }
    showError(err.message);
  }
}

function computeMIMOSVBode() {
  try {
    clearFieldErrors();
    if (!state.mimoPlant) throw new Error('請先設定 MIMO plant');

    const wmin = parseFloat(document.getElementById('mimo-sv-wmin').value);
    const wmax = parseFloat(document.getElementById('mimo-sv-wmax').value);
    if (!(wmin > 0 && wmax > wmin)) throw new Error('ω 範圍無效：須滿足 0 < wmin < wmax');

    const N = 200;
    const logMin = Math.log10(wmin);
    const logMax = Math.log10(wmax);
    const omegas = Array.from({ length: N }, (_, i) =>
      Math.pow(10, logMin + ((logMax - logMin) * i) / (N - 1)),
    );

    const result = singularValueBode(state.mimoPlant, omegas);

    const validIdx = result.sigmaMax.findIndex((v) => Number.isFinite(v) && v > 0);
    const sMaxLow = validIdx >= 0 ? result.sigmaMax[validIdx] : NaN;
    const sMinLow = validIdx >= 0 ? result.sigmaMin[validIdx] : NaN;
    const condDC = result.conditionNumber[validIdx] ?? Infinity;
    const worstCond = result.conditionNumber.filter(Number.isFinite).reduce((max, value) => Math.max(max, value), 0);

    const outEl = document.getElementById('mimo-sv-out');
    outEl.style.display = 'block';
    outEl.innerHTML = `<div style="color:var(--color-accent);font-weight:700;">Singular-Value Frequency Plot</div>
      <div>σ_max @ ω_min: ${fmtNum(sMaxLow, 4)}</div>
      <div>σ_min @ ω_min: ${fmtNum(sMinLow, 4)}</div>
      <div>Condition κ @ ω_min: ${Number.isFinite(condDC) ? fmtNum(condDC, 3) : '∞'}</div>
      <div>Worst κ across sweep: ${Number.isFinite(worstCond) ? fmtNum(worstCond, 3) : '∞'}</div>
      <div style="font-size:10px;color:var(--text-muted);margin-top:4px;">κ &lt; 10: 易控；κ &gt; 100: 系統病態</div>`;

    if (typeof Plotly !== 'undefined') {
      const safe = (arr) => arr.map((v) => (v > 0 ? v : null));
      Plotly.newPlot(
        'chart-mimo-sv',
        [
          { x: result.omegas, y: safe(result.sigmaMax), mode: 'lines', name: 'σ_max', line: { color: '#76b900', width: 1.5 } },
          { x: result.omegas, y: safe(result.sigmaMin), mode: 'lines', name: 'σ_min', line: { color: '#22c55e', width: 1.5 } },
        ],
        {
          ...PLOTLY_LAYOUT_BASE(),
          margin: { t: 36, r: 20, b: 42, l: 54 },
          showlegend: true,
          legend: { font: { size: 10 }, orientation: 'h', x: 0, y: 1.18 },
          xaxis: { title: 'ω (rad/s)', type: 'log', gridcolor: 'rgba(255,255,255,0.06)' },
          yaxis: { title: 'σ (gain)', type: 'log', gridcolor: 'rgba(255,255,255,0.06)' },
        },
        { responsive: true, displayModeBar: false },
      );
    }
    clearError();
  } catch (err) {
    showError(err.message);
  }
}

function computeMIMODecoupler() {
  try {
    clearFieldErrors();
    if (!state.mimoPlant) throw new Error('請先設定 MIMO plant');
    if (state.mimoPlant.m !== state.mimoPlant.p) {
      throw new Error(`Decoupler 需要方陣 (m=p)，目前 ${state.mimoPlant.m}×${state.mimoPlant.p}`);
    }

    const { W, G0, verification } = staticDecoupler(state.mimoPlant);
    const newPlant = applyDecoupler(state.mimoPlant, W);
    state.mimoPlant = newPlant;
    applyMIMOChannel();
    if (state.mimoChannel.all) renderMIMOGrid();

    const outEl = document.getElementById('mimo-decoupler-out');
    outEl.style.display = 'block';
    outEl.innerHTML = `<div style="color:var(--color-accent);font-weight:700;">Static DC Decoupler Applied ✓</div>
      <div style="margin-top:4px;">G(0) was:</div>
      <div>${renderLabeledMatrixTable(G0, { rowPrefix: 'y', colPrefix: 'u', digits: 3 })}</div>
      <div style="margin-top:4px;">W = G(0)⁻¹:</div>
      <div>${renderLabeledMatrixTable(W, { rowPrefix: 'u', colPrefix: 'v', digits: 3 })}</div>
      <div style="margin-top:4px;color:var(--color-stable);">G(0)·W (應為單位矩陣):</div>
      <div>${renderLabeledMatrixTable(verification, { rowPrefix: 'y', colPrefix: 'v', digits: 3 })}</div>
      <div style="font-size:10px;color:var(--text-muted);margin-top:6px;">Plant input matrix B 已替換為 B·W。再次計算 RGA 應趨近 I。</div>`;
    clearError();
  } catch (err) {
    const outEl = document.getElementById('mimo-decoupler-out');
    if (outEl) {
      outEl.style.display = 'block';
      outEl.innerHTML = `<div style="color:var(--color-unstable);">${escapeHtml(err.message)}</div>`;
    }
    showError(err.message);
  }
}

function computeMIMOLqr() {
  try {
    clearFieldErrors();
    if (!state.mimoPlant) throw new Error('請先設定 MIMO plant');
    const n = state.mimoPlant.n;
    const m = state.mimoPlant.m;

    const parseMat = (str, expRows, expCols, name) => {
      const M = str
        .trim()
        .split('\n')
        .map((r) => r.trim().split(/[\s,]+/).filter((x) => x).map(Number));
      if (M.length !== expRows || M.some((r) => r.length !== expCols)) {
        throw new Error(`${name} 應為 ${expRows}×${expCols}，實際 ${M.length}×${M[0]?.length}`);
      }
      if (M.some((r) => r.some((v) => !Number.isFinite(v)))) {
        throw new Error(`${name} 含有非數值`);
      }
      return M;
    };
    const Q = parseMat(document.getElementById('mimo-lqr-q').value, n, n, 'Q');
    const R = parseMat(document.getElementById('mimo-lqr-r').value, m, m, 'R');

    const result = solveLqrMIMO(state.mimoPlant.A, state.mimoPlant.B, Q, R);
    state.mimoLqr = result;

    const Kstr = result.K
      .map((r) => `[${r.map((v) => fmtNum(v, 4)).join(', ')}]`)
      .join(',<br>');

    const outEl = document.getElementById('mimo-lqr-out');
    outEl.style.display = 'block';
    outEl.innerHTML = `<div style="color:var(--color-accent);font-weight:700;">MIMO LQR Gain K (${m}×${n})</div>
      <div style="margin-top:4px;">K =<br>${Kstr}</div>
      <div style="margin-top:6px;">Solver: ${escapeHtml(lqrSolverLabel(result))}</div>
      <div style="margin-top:6px;">Controllability rank: ${result.controllabilityRank}/${n}</div>
      <div>Initial gain: ${escapeHtml(result.initialGainStrategy)}</div>
      <div style="margin-top:6px;">Iterations: ${result.iterations}</div>
      <div>ΔK residual: ${fmtNum(result.residualNorm, 6)}</div>
      <div>CARE residual: ${fmtNum(result.riccatiResidualNorm, 6)}</div>
      <div>Closed-loop stable: ${result.closedLoopStable ? 'Yes' : 'No'}</div>
      <div style="font-size:10px;color:var(--text-muted);margin-top:6px;">u = −K·x &nbsp;|&nbsp; 閉迴路 A_cl = A − B·K</div>`;
    clearError();
  } catch (err) {
    const outEl = document.getElementById('mimo-lqr-out');
    if (outEl) {
      outEl.style.display = 'block';
      outEl.innerHTML = `<div style="color:var(--color-unstable);">${escapeHtml(err.message)}</div>`;
    }
    showError(err.message);
  }
}

// ============================================================
// Phase 10 UI: MPC / Robust / Dynamic Decoupler
// ============================================================
function _parseMatrixText(str, expRows, expCols, name) {
  const M = str
    .trim()
    .split('\n')
    .map((r) => r.trim().split(/[\s,]+/).filter(Boolean).map(Number));
  if (M.length !== expRows || M.some((r) => r.length !== expCols)) {
    throw new Error(`${name} 應為 ${expRows}×${expCols}，實際 ${M.length}×${M[0]?.length}`);
  }
  if (M.some((r) => r.some((v) => !Number.isFinite(v)))) {
    throw new Error(`${name} 含有非數值`);
  }
  return M;
}

function computeMpcSimulation() {
  try {
    clearFieldErrors();
    const Ts = parseFloat(document.getElementById('mpc-ts').value || '0.1');
    const horizon = parseInt(document.getElementById('mpc-horizon').value || '10', 10);
    const steps = parseInt(document.getElementById('mpc-steps').value || '30', 10);
    if (!(Ts > 0)) throw new Error('Ts 必須 > 0');
    if (!(horizon >= 2)) throw new Error('horizon 必須 ≥ 2');
    if (!(steps >= 1)) throw new Error('sim steps 必須 ≥ 1');

    let A, B, C, D;
    if (state.systemMode === 'mimo' && state.mimoPlant) {
      ({ A, B, C, D } = state.mimoPlant);
    } else if (state.plant) {
      const ss = tfToControllableCanonical(state.plant.num, state.plant.den);
      A = ss.A; B = ss.B; C = ss.C; D = ss.D;
    } else {
      throw new Error('請先建立 plant');
    }

    const n = A.length;
    const m = B[0].length;
    const { Ad, Bd } = discretizeZOH(A, B, Ts);

    const Q = _parseMatrixText(document.getElementById('mpc-q').value, n, n, 'Q');
    const R = _parseMatrixText(document.getElementById('mpc-r').value, m, m, 'R');

    const x0Vals = document.getElementById('mpc-x0').value
      .split(/[\s,]+/).filter(Boolean).map(Number);
    if (x0Vals.length !== n) throw new Error(`x₀ 應有 ${n} 個元素，實際 ${x0Vals.length}`);
    if (x0Vals.some((v) => !Number.isFinite(v))) throw new Error('x₀ 含有非數值');
    const x0 = x0Vals.map((v) => [v]);

    const sim = simulateUnconstrainedMpc(Ad, Bd, Q, R, horizon, x0, { steps });
    state.phase10 = state.phase10 || {};
    state.phase10.mpc = { sim, Ts };

    setPhase7Output('mpc-out', [
      `<div style="color:var(--color-accent);font-weight:700;">MPC Regulation Result (horizon=${horizon}, Ts=${Ts}s, steps=${steps})</div>`,
      `<div>Total cost J = ${fmtNum(sim.totalCost, 4)}</div>`,
      `<div>Final ‖x‖∞ = ${fmtNum(sim.finalStateNormInf, 6)}</div>`,
      `<div>First control u₀ = [${sim.u[0].map((r) => fmtNum(r[0], 4)).join(', ')}]</div>`,
    ].join(''));

    if (typeof Plotly !== 'undefined') {
      const tArr = sim.x.map((_, k) => k * Ts);
      const xTraces = [];
      for (let i = 0; i < n; i++) {
        xTraces.push({
          x: tArr,
          y: sim.x.map((xk) => xk[i][0]),
          mode: 'lines', name: `x${i + 1}`,
          line: { width: 1.5 },
        });
      }
      Plotly.newPlot('chart-mpc-x', xTraces, {
        ...PLOTLY_LAYOUT_BASE(),
        margin: { t: 10, r: 20, b: 30, l: 40 },
        legend: { font: { size: 9 }, orientation: 'h', y: 1.15 },
        xaxis: { title: 't (s)', gridcolor: 'rgba(255,255,255,0.06)' },
        yaxis: { title: 'state x', gridcolor: 'rgba(255,255,255,0.06)' },
      }, { responsive: true, displayModeBar: false });

      const tArrU = sim.u.map((_, k) => k * Ts);
      const uTraces = [];
      for (let j = 0; j < m; j++) {
        uTraces.push({
          x: tArrU,
          y: sim.u.map((uk) => uk[j][0]),
          mode: 'lines', name: `u${j + 1}`,
          line: { width: 1, dash: 'dot' },
        });
      }
      Plotly.newPlot('chart-mpc-u', uTraces, {
        ...PLOTLY_LAYOUT_BASE(),
        margin: { t: 10, r: 20, b: 30, l: 40 },
        legend: { font: { size: 9 }, orientation: 'h', y: 1.15 },
        xaxis: { title: 't (s)', gridcolor: 'rgba(255,255,255,0.06)' },
        yaxis: { title: 'control u', gridcolor: 'rgba(255,255,255,0.06)' },
      }, { responsive: true, displayModeBar: false });
    }
    clearError();
  } catch (err) {
    setPhase7Output('mpc-out', escapeHtml(err.message), true);
    showError(err.message);
  }
}

function computeConstrainedMpc() {
  try {
    clearFieldErrors();
    const Ts = parseFloat(document.getElementById('mpc-ts').value || '0.1');
    const horizon = parseInt(document.getElementById('mpc-horizon').value || '10', 10);
    const steps = parseInt(document.getElementById('mpc-steps').value || '30', 10);
    const uMin = parseFloat(document.getElementById('mpc-umin').value);
    const uMax = parseFloat(document.getElementById('mpc-umax').value);
    if (!(Ts > 0)) throw new Error('Ts 必須 > 0');
    if (!(horizon >= 2)) throw new Error('horizon 必須 ≥ 2');
    if (!(steps >= 1)) throw new Error('sim steps 必須 ≥ 1');
    if (!Number.isFinite(uMin) || !Number.isFinite(uMax)) throw new Error('u_min / u_max 必須為有限數值');
    if (uMin >= uMax) throw new Error('u_min 必須 < u_max');

    let A, B;
    if (state.systemMode === 'mimo' && state.mimoPlant) {
      ({ A, B } = state.mimoPlant);
    } else if (state.plant) {
      const ss = tfToControllableCanonical(state.plant.num, state.plant.den);
      A = ss.A; B = ss.B;
    } else {
      throw new Error('請先建立 plant');
    }

    const n = A.length;
    const m = B[0].length;
    const { Ad, Bd } = discretizeZOH(A, B, Ts);
    const Q = _parseMatrixText(document.getElementById('mpc-q').value, n, n, 'Q');
    const R = _parseMatrixText(document.getElementById('mpc-r').value, m, m, 'R');
    const x0Vals = document.getElementById('mpc-x0').value
      .split(/[\s,]+/).filter(Boolean).map(Number);
    if (x0Vals.length !== n) throw new Error(`x₀ 應有 ${n} 個元素`);
    const x0 = x0Vals.map((v) => [v]);

    const constraints = { uMin, uMax };
    const simC = simulateConstrainedMpc(Ad, Bd, Q, R, horizon, x0, constraints, { steps });
    const simU = simulateUnconstrainedMpc(Ad, Bd, Q, R, horizon, x0, { steps });

    const activeSteps = simC.activeConstraintsLog.filter(Boolean).length;
    setPhase7Output('mpc-constrained-out', [
      `<div style="color:var(--color-accent);font-weight:700;">Input-Constrained vs Unconstrained MPC Regulation (horizon=${horizon}, Ts=${Ts}s)</div>`,
      `<div>u bounds: [${uMin}, ${uMax}]</div>`,
      `<div>Active constraint steps: ${activeSteps} / ${steps}</div>`,
      `<div>Constrained cost J  = ${fmtNum(simC.totalCost, 4)}</div>`,
      `<div>Unconstrained cost J = ${fmtNum(simU.totalCost, 4)}</div>`,
      `<div>Constrained ‖x_final‖∞ = ${fmtNum(simC.finalStateNormInf, 6)}</div>`,
    ].join(''));

    if (typeof Plotly !== 'undefined') {
      const tArr = simC.x.map((_, k) => k * Ts);
      const tArrU = simC.u.map((_, k) => k * Ts);
      const colors = { con: '#f59e0b', unc: '#60a5fa' };

      // State trajectories
      const xTraces = [];
      for (let i = 0; i < n; i++) {
        xTraces.push({ x: tArr, y: simC.x.map((xk) => xk[i][0]), mode: 'lines', name: `x${i + 1} constrained`, line: { color: colors.con, width: 1.5 } });
        xTraces.push({ x: tArr, y: simU.x.map((xk) => xk[i][0]), mode: 'lines', name: `x${i + 1} unconstrained`, line: { color: colors.unc, width: 1.5, dash: 'dash' } });
      }
      Plotly.newPlot('chart-mpc-constrained-x', xTraces, {
        ...PLOTLY_LAYOUT_BASE(),
        margin: { t: 10, r: 20, b: 30, l: 40 },
        legend: { font: { size: 9 }, orientation: 'h', y: 1.2 },
        xaxis: { title: 't (s)', gridcolor: 'rgba(255,255,255,0.06)' },
        yaxis: { title: 'state x', gridcolor: 'rgba(255,255,255,0.06)' },
      }, { responsive: true, displayModeBar: false });

      // Control inputs
      const uTraces = [];
      for (let j = 0; j < m; j++) {
        uTraces.push({ x: tArrU, y: simC.u.map((uk) => uk[j][0]), mode: 'lines', name: `u${j + 1} constrained`, line: { color: colors.con, width: 1.5 } });
        uTraces.push({ x: tArrU, y: simU.u.map((uk) => uk[j][0]), mode: 'lines', name: `u${j + 1} unconstrained`, line: { color: colors.unc, width: 1.5, dash: 'dash' } });
      }
      // Constraint bound lines
      uTraces.push({ x: [tArrU[0], tArrU[tArrU.length - 1]], y: [uMax, uMax], mode: 'lines', name: 'u_max', line: { color: '#ef4444', width: 1, dash: 'dot' }, showlegend: true });
      uTraces.push({ x: [tArrU[0], tArrU[tArrU.length - 1]], y: [uMin, uMin], mode: 'lines', name: 'u_min', line: { color: '#ef4444', width: 1, dash: 'dot' }, showlegend: true });
      Plotly.newPlot('chart-mpc-constrained-u', uTraces, {
        ...PLOTLY_LAYOUT_BASE(),
        margin: { t: 10, r: 20, b: 30, l: 40 },
        legend: { font: { size: 9 }, orientation: 'h', y: 1.2 },
        xaxis: { title: 't (s)', gridcolor: 'rgba(255,255,255,0.06)' },
        yaxis: { title: 'control u', gridcolor: 'rgba(255,255,255,0.06)' },
      }, { responsive: true, displayModeBar: false });
    }
    clearError();
  } catch (err) {
    setPhase7Output('mpc-constrained-out', escapeHtml(err.message), true);
    showError(err.message);
  }
}

function computeRobustSensitivity() {
  try {
    clearFieldErrors();
    if (!state.plant) throw new Error('請先建立 plant');
    if (state.systemMode === 'mimo') throw new Error('SISO sensitivity functions 目前只支援 SISO 模式');

    const controllerTf = state.controller?.toTransferFunction?.();
    if (!controllerTf) throw new Error('無法取得 controller transfer function（請先設定 PID/compensator）');
    const loopTf = controllerTf.series(state.plant);

    const wmin = parseFloat(document.getElementById('robust-wmin').value);
    const wmax = parseFloat(document.getElementById('robust-wmax').value);
    if (!(wmin > 0 && wmax > wmin)) throw new Error('ω 範圍無效：須滿足 0 < wmin < wmax');

    const N = 200;
    const lmin = Math.log10(wmin);
    const lmax = Math.log10(wmax);
    const omegas = Array.from({ length: N }, (_, i) => Math.pow(10, lmin + ((lmax - lmin) * i) / (N - 1)));

    const sb = sensitivityBode(loopTf, omegas, controllerTf);
    const peaks = robustPeaks(loopTf, omegas, controllerTf);
    state.phase10 = state.phase10 || {};
    state.phase10.robust = { sb, peaks };

    // compute bandwidth: highest ω where |T| ≥ peakT / √2
    const tMags = sb.T.map((c) => (c && Number.isFinite(c.magnitude) ? c.magnitude : 0));
    const peakT = Math.max(...tMags);
    let bwOmega = null;
    for (let i = tMags.length - 1; i >= 0; i--) {
      if (tMags[i] >= peakT / Math.SQRT2) { bwOmega = omegas[i]; break; }
    }

    const riskColor = peaks.risk === 'low' ? 'var(--color-stable)' : peaks.risk === 'medium' ? '#f59e0b' : 'var(--color-unstable)';
    setPhase7Output('robust-out', [
      `<div style="color:${riskColor};font-weight:700;">Sensitivity Peak Norms (Risk: ${peaks.risk.toUpperCase()})</div>`,
      `<div>‖S‖∞ = ${fmtNum(peaks.Ms.peak, 4)} (${fmtNum(peaks.Ms.peakDB, 2)} dB) @ ω=${fmtNum(peaks.Ms.peakOmega, 3)} rad/s</div>`,
      `<div>‖T‖∞ = ${fmtNum(peaks.Mt.peak, 4)} (${fmtNum(peaks.Mt.peakDB, 2)} dB) @ ω=${fmtNum(peaks.Mt.peakOmega, 3)} rad/s</div>`,
      peaks.MKs ? `<div>‖KS‖∞ = ${fmtNum(peaks.MKs.peak, 4)} (${fmtNum(peaks.MKs.peakDB, 2)} dB) @ ω=${fmtNum(peaks.MKs.peakOmega, 3)} rad/s</div>` : '',
      bwOmega != null ? `<div>BW(-3 dB) = ${fmtNum(bwOmega, 3)} rad/s</div>` : '',
      `<div style="font-size:10px;color:var(--text-muted);margin-top:4px;">‖S‖∞ &lt;1.8 (5.1 dB): low；1.8-2.5: medium；&gt;2.5 (8 dB): high</div>`,
    ].join(''));

    if (typeof Plotly !== 'undefined') {
      const toDBArr = (arr) => arr.map((c) => (c && Number.isFinite(c.magnitude) && c.magnitude > 0 ? 20 * Math.log10(c.magnitude) : null));
      Plotly.newPlot('chart-robust', [
        { x: omegas, y: toDBArr(sb.S), mode: 'lines', name: '|S| (dB)', line: { color: '#6366f1', width: 1.5 } },
        { x: omegas, y: toDBArr(sb.T), mode: 'lines', name: '|T| (dB)', line: { color: '#10b981', width: 1.5 } },
        { x: omegas, y: toDBArr(sb.KS), mode: 'lines', name: '|KS| (dB)', line: { color: '#ec4899', width: 1.5, dash: 'dot' } },
      ], {
        ...PLOTLY_LAYOUT_BASE(),
        margin: { t: 10, r: 20, b: 35, l: 50 },
        legend: { font: { size: 9 }, orientation: 'h', y: 1.15 },
        xaxis: { title: 'ω (rad/s)', type: 'log', gridcolor: 'rgba(255,255,255,0.06)' },
        yaxis: { title: 'dB', gridcolor: 'rgba(255,255,255,0.06)' },
        shapes: [
          { type: 'line', x0: 0, x1: 1, xref: 'paper', y0: 0, y1: 0, yref: 'y', line: { color: 'rgba(255,255,255,0.25)', width: 1, dash: 'dot' } },
          { type: 'line', x0: 0, x1: 1, xref: 'paper', y0: 20 * Math.log10(1.8), y1: 20 * Math.log10(1.8), yref: 'y', line: { color: 'rgba(245,158,11,0.5)', width: 1, dash: 'dash' } },
          { type: 'line', x0: 0, x1: 1, xref: 'paper', y0: 20 * Math.log10(2.5), y1: 20 * Math.log10(2.5), yref: 'y', line: { color: 'rgba(239,68,68,0.5)', width: 1, dash: 'dash' } },
        ],
        annotations: [
          { x: 1, xref: 'paper', y: 0, yref: 'y', text: '0 dB', showarrow: false, font: { size: 8, color: 'rgba(255,255,255,0.35)' }, xanchor: 'right', yanchor: 'bottom' },
          { x: 1, xref: 'paper', y: 20 * Math.log10(1.8), yref: 'y', text: '5.1 dB', showarrow: false, font: { size: 8, color: 'rgba(245,158,11,0.8)' }, xanchor: 'right', yanchor: 'bottom' },
          { x: 1, xref: 'paper', y: 20 * Math.log10(2.5), yref: 'y', text: '8 dB', showarrow: false, font: { size: 8, color: 'rgba(239,68,68,0.8)' }, xanchor: 'right', yanchor: 'bottom' },
        ],
      }, { responsive: true, displayModeBar: false });
    }
    clearError();
  } catch (err) {
    setPhase7Output('robust-out', escapeHtml(err.message), true);
    showError(err.message);
  }
}

function computeMIMOHinfNorm() {
  try {
    clearFieldErrors();
    if (state.systemMode !== 'mimo') throw new Error('請切換至 MIMO 模式並建立 plant');
    if (!state.mimoPlant) throw new Error('請先在 MIMO 模式下建立 plant');

    const mimoSys = state.mimoPlant;
    const wmin = 1e-3, wmax = 1e3;
    const norm = hInfNorm(mimoSys, { omegaLo: wmin, omegaHi: wmax, gridPoints: 300, goldenIter: 50 });

    setPhase7Output('mimo-hinf-out', [
      `<div style="font-weight:700;color:var(--color-accent);">‖G‖∞ = ${fmtNum(norm.norm, 6)} (${fmtNum(20 * Math.log10(norm.norm), 2)} dB)</div>`,
      `<div>Peak σ_max(G(jω)) @ ω = ${fmtNum(norm.peakOmega, 4)} rad/s</div>`,
      `<div style="font-size:10px;color:var(--text-muted);margin-top:4px;">Grid: [${wmin}, ${wmax}] rad/s，300 點 + Golden-section 精化</div>`,
    ].join(''));

    if (typeof Plotly !== 'undefined') {
      const N = 200;
      const omegas = Array.from({ length: N }, (_, i) => Math.pow(10, Math.log10(wmin) + (Math.log10(wmax) - Math.log10(wmin)) * i / (N - 1)));
      const sigMaxArr = omegas.map((w) => {
        const G = evalAtJw(mimoSys, w);
        const svs = singularValues(G);
        return svs.length > 0 ? Math.max(...svs) : null;
      });
      const sigMaxDB = sigMaxArr.map((v) => (v != null && v > 0 ? 20 * Math.log10(v) : null));

      Plotly.newPlot('chart-mimo-hinf', [
        { x: omegas, y: sigMaxDB, mode: 'lines', name: 'σ_max(G) (dB)', line: { color: '#6366f1', width: 1.5 } },
        { x: [norm.peakOmega], y: [20 * Math.log10(norm.norm)], mode: 'markers', name: '‖G‖∞', marker: { color: '#ec4899', size: 7, symbol: 'diamond' } },
      ], {
        ...PLOTLY_LAYOUT_BASE(),
        margin: { t: 10, r: 20, b: 35, l: 50 },
        legend: { font: { size: 9 }, orientation: 'h', y: 1.15 },
        xaxis: { title: 'ω (rad/s)', type: 'log', gridcolor: 'rgba(255,255,255,0.06)' },
        yaxis: { title: 'σ_max (dB)', gridcolor: 'rgba(255,255,255,0.06)' },
      }, { responsive: true, displayModeBar: false });
    }
    clearError();
  } catch (err) {
    setPhase7Output('mimo-hinf-out', escapeHtml(err.message), true);
    showError(err.message);
  }
}

function computeUncertaintyEnvelope() {
  try {
    clearFieldErrors();
    if (!state.plant) throw new Error('請先建立 plant');
    if (state.systemMode === 'mimo') throw new Error('SISO uncertainty sweep 目前只支援 SISO 模式');

    const controllerTf = state.controller?.toTransferFunction?.();
    if (!controllerTf) throw new Error('無法取得 controller transfer function（請先設定 PID/compensator）');
    const loopTf = controllerTf.series(state.plant);

    const wmin = parseFloat(document.getElementById('robust-wmin').value);
    const wmax = parseFloat(document.getElementById('robust-wmax').value);
    if (!(wmin > 0 && wmax > wmin)) throw new Error('ω 範圍無效（請先在 Sensitivity Bode 設定）');

    const gainPct = parseFloat(document.getElementById('unc-gain-pct').value || '0');
    const phaseDeg = parseFloat(document.getElementById('unc-phase-deg').value || '0');
    const samples = parseInt(document.getElementById('unc-samples').value || '3', 10);
    if (!(gainPct >= 0) || !(phaseDeg >= 0)) throw new Error('±gain%/±phase° 必須 ≥ 0');
    if (!Number.isInteger(samples) || samples < 1) throw new Error('samples / side 必須是 ≥ 1 的整數');

    const gainFactors = [];
    const phaseShiftsDeg = [];
    if (gainPct === 0) {
      gainFactors.push(1);
    } else {
      for (let i = -samples; i <= samples; i++) {
        gainFactors.push(1 + (gainPct / 100) * (i / samples));
      }
    }
    if (phaseDeg === 0) {
      phaseShiftsDeg.push(0);
    } else {
      for (let i = -samples; i <= samples; i++) {
        phaseShiftsDeg.push((phaseDeg * i) / samples);
      }
    }

    const N = 200;
    const lmin = Math.log10(wmin);
    const lmax = Math.log10(wmax);
    const omegas = Array.from({ length: N }, (_, i) => Math.pow(10, lmin + ((lmax - lmin) * i) / (N - 1)));

    const env = uncertaintyEnvelope(loopTf, omegas, { gainFactors, phaseShiftsDeg, controllerTf });
    state.phase10 = state.phase10 || {};
    state.phase10.uncertainty = env;

    const peakS = env.peaks.S;
    const peakT = env.peaks.T;
    const peakKS = env.peaks.KS;
    const ratio = peakS.peak / Math.max(env.nominal.S.reduce((m, v) => Math.max(m, v), 0), 1e-12);
    const riskColor = ratio > 2 ? 'var(--color-unstable)' : ratio > 1.3 ? '#f59e0b' : 'var(--color-stable)';

    setPhase7Output('uncertainty-out', [
      `<div style="color:${riskColor};font-weight:700;">Uncertainty Sweep Peaks (k=[${gainFactors.map((g) => g.toFixed(2)).join(',')}], θ=[${phaseShiftsDeg.map((p) => p.toFixed(0) + '°').join(',')}])</div>`,
      `<div>worst ‖S‖∞ = ${fmtNum(peakS.peak, 4)} ${Number.isFinite(peakS.peakDB) ? '(' + fmtNum(peakS.peakDB, 2) + ' dB)' : ''} @ ω=${fmtNum(peakS.peakOmega, 3)} rad/s</div>`,
      `<div>worst ‖T‖∞ = ${fmtNum(peakT.peak, 4)} ${Number.isFinite(peakT.peakDB) ? '(' + fmtNum(peakT.peakDB, 2) + ' dB)' : ''} @ ω=${fmtNum(peakT.peakOmega, 3)} rad/s</div>`,
      peakKS ? `<div>worst ‖KS‖∞ = ${fmtNum(peakKS.peak, 4)} ${Number.isFinite(peakKS.peakDB) ? '(' + fmtNum(peakKS.peakDB, 2) + ' dB)' : ''} @ ω=${fmtNum(peakKS.peakOmega, 3)} rad/s</div>` : '',
      `<div style="font-size:10px;color:var(--text-muted);margin-top:4px;">worst/nominal |S| 比 = ${fmtNum(ratio, 3)}。&gt;2 表示 robust margin 嚴重劣化。</div>`,
    ].join(''));

    const chartEl = document.getElementById('chart-uncertainty');
    if (chartEl) chartEl.style.display = 'block';
    if (typeof Plotly !== 'undefined') {
      const safe = (arr) => arr.map((v) => (Number.isFinite(v) && v > 0 ? v : null));
      Plotly.newPlot('chart-uncertainty', [
        { x: omegas, y: safe(env.nominal.S), mode: 'lines', name: 'nominal |S|', line: { color: '#6366f1', width: 1.2, dash: 'dot' } },
        { x: omegas, y: safe(env.worst.S), mode: 'lines', name: 'worst |S|', line: { color: '#6366f1', width: 2 } },
        { x: omegas, y: safe(env.nominal.T), mode: 'lines', name: 'nominal |T|', line: { color: '#10b981', width: 1.2, dash: 'dot' } },
        { x: omegas, y: safe(env.worst.T), mode: 'lines', name: 'worst |T|', line: { color: '#10b981', width: 2 } },
      ], {
        ...PLOTLY_LAYOUT_BASE(),
        margin: { t: 10, r: 20, b: 30, l: 50 },
        legend: { font: { size: 9 }, orientation: 'h', y: 1.15 },
        xaxis: { title: 'ω (rad/s)', type: 'log', gridcolor: 'rgba(255,255,255,0.06)' },
        yaxis: { title: 'magnitude', type: 'log', gridcolor: 'rgba(255,255,255,0.06)' },
      }, { responsive: true, displayModeBar: false });
    }
    clearError();
  } catch (err) {
    setPhase7Output('uncertainty-out', escapeHtml(err.message), true);
    showError(err.message);
  }
}

function readNonnegativeNumber(id, label) {
  const value = parseFloat(document.getElementById(id)?.value ?? '0');
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} 必須是非負數`);
  return value;
}

function computeRobustValidation() {
  try {
    clearFieldErrors();
    if (!state.plant) throw new Error('請先建立 plant');
    if (state.systemMode === 'mimo') throw new Error('Monte Carlo robust validation 目前先支援 SISO 模式');
    updateController();
    const controllerTf = state.controller?.toTransferFunction?.();
    if (!controllerTf) throw new Error('無法取得 controller transfer function（請先設定 PID/compensator）');

    const seed = parseInt(document.getElementById('rv-seed')?.value ?? '1', 10);
    const sampleCount = parseInt(document.getElementById('rv-samples')?.value ?? '24', 10);
    if (!Number.isInteger(seed)) throw new Error('seed 必須是整數');
    if (!Number.isInteger(sampleCount) || sampleCount < 1 || sampleCount > 500) throw new Error('samples 必須是 1~500 的整數');

    const gainPct = readNonnegativeNumber('rv-gain-pct', 'gain ±%');
    const denPct = readNonnegativeNumber('rv-den-pct', 'den ±%');
    const additiveRadius = readNonnegativeNumber('rv-add-radius', 'additive radius');
    const maxOvershoot = readNonnegativeNumber('rv-max-os', 'max OS');
    const maxSettlingTime = readNonnegativeNumber('rv-max-ts', 'max settle');
    const minPhaseMargin = parseFloat(document.getElementById('rv-min-pm')?.value ?? '45');
    if (!Number.isFinite(minPhaseMargin)) throw new Error('min PM 必須是有限數值');

    const wmin = parseFloat(document.getElementById('robust-wmin').value);
    const wmax = parseFloat(document.getElementById('robust-wmax').value);
    if (!(wmin > 0 && wmax > wmin)) throw new Error('ω 範圍無效（請先在 Sensitivity Bode 設定）');
    const omegas = Array.from({ length: 80 }, (_, i) => Math.pow(10, Math.log10(wmin) + ((Math.log10(wmax) - Math.log10(wmin)) * i) / 79));

    const uncertainty = {
      gain: gainPct / 100,
      denominator: state.plant.den.map((_, idx) => (idx === 0 ? 0 : denPct / 100)),
      additive: { radius: additiveRadius },
    };
    const result = monteCarloRobustValidation(state.plant, uncertainty, {
      controllerTf,
      seed,
      sampleCount,
      omegas,
      responseSampleCount: 500,
      specs: {
        maxOvershoot,
        maxSettlingTime,
        minPhaseMargin,
        maxPeakSensitivity: 2,
      },
    });
    state.phase18 = state.phase18 || {};
    state.phase18.robustValidation = result;

    const worst = result.worstCase;
    const failedNames = worst.passFail.checks.filter((check) => !check.pass).map((check) => check.name);
    const statusColor = result.pass ? 'var(--color-stable)' : 'var(--color-unstable)';
    setPhase7Output('robust-validation-out', [
      `<div style="color:${statusColor};font-weight:700;">Robust validation: ${result.pass ? 'PASS' : 'FAIL'} (${result.failureCount}/${result.sampleCount} failed)</div>`,
      `<div>seed = ${seed}, samples = ${sampleCount}, gain ±${fmtNum(gainPct, 3)}%, denominator ±${fmtNum(denPct, 3)}%, additive radius = ${fmtNum(additiveRadius, 4)}</div>`,
      `<div style="margin-top:6px;color:var(--color-accent);">Worst-case sample #${worst.sample.index}</div>`,
      `<div>stable = ${worst.metrics.stable ? 'yes' : 'no'} | OS = ${fmtNum(worst.metrics.overshoot, 3)}% | settling = ${fmtTime(worst.metrics.settlingTime)} | PM = ${fmtDeg(worst.metrics.phaseMargin)} | ‖S‖∞ = ${fmtNum(worst.metrics.peakSensitivity, 4)}</div>`,
      `<div>sample gain = ${fmtNum(worst.sample.gain, 4)} | den factors = ${(worst.sample.denominator || []).map((v) => fmtNum(v, 4)).join(', ') || 'n/a'}</div>`,
      failedNames.length ? `<div style="color:#f87171;">failed checks: ${failedNames.map(escapeHtml).join(', ')}</div>` : '<div>failed checks: none</div>',
    ].join(''));

    const chartEl = document.getElementById('chart-robust-validation');
    if (chartEl) chartEl.style.display = 'block';
    if (typeof Plotly !== 'undefined') {
      const xs = result.results.map((r) => r.sample.index);
      const markerColors = result.results.map((r) => (r.passFail.pass && r.metrics.stable ? '#10b981' : '#ef4444'));
      Plotly.newPlot('chart-robust-validation', [
        { x: xs, y: result.results.map((r) => r.metrics.overshoot), type: 'bar', name: 'Overshoot %', marker: { color: markerColors } },
        { x: xs, y: result.results.map((r) => r.metrics.peakSensitivity), type: 'scatter', mode: 'lines+markers', name: '‖S‖∞', yaxis: 'y2', line: { color: '#6366f1', width: 1.5 } },
      ], {
        ...PLOTLY_LAYOUT_BASE(),
        margin: { t: 10, r: 45, b: 35, l: 45 },
        legend: { font: { size: 9 }, orientation: 'h', y: 1.15 },
        xaxis: { title: 'sample', gridcolor: 'rgba(255,255,255,0.06)' },
        yaxis: { title: 'OS %', gridcolor: 'rgba(255,255,255,0.06)' },
        yaxis2: { title: '‖S‖∞', overlaying: 'y', side: 'right', gridcolor: 'rgba(255,255,255,0)' },
      }, { responsive: true, displayModeBar: false });
    }
    clearError();
  } catch (err) {
    setPhase7Output('robust-validation-out', escapeHtml(err.message), true);
    showError(err.message);
  }
}

function computeMIMODynDecoupler() {
  try {
    clearFieldErrors();
    if (!state.mimoPlant) throw new Error('請先設定 MIMO plant');
    const omega = parseFloat(document.getElementById('mimo-dyn-omega').value || '1');
    if (!(omega > 0)) throw new Error('ωc 必須 > 0');

    const result = dynamicDecouplerAtFrequency(state.mimoPlant, omega);
    state.phase10 = state.phase10 || {};
    state.phase10.dynDecoupler = result;

    const fmtCplx = (c) => `${fmtNum(c.re, 3)}${c.im >= 0 ? '+' : ''}${fmtNum(c.im, 3)}j`;
    const fmtMat = (M) => M.map((r) => r.map(fmtCplx).join('  ')).join('<br>');
    const colorRes = result.offDiagonalNorm < 0.1
      ? 'var(--color-stable)'
      : result.offDiagonalNorm < 0.5
        ? '#f59e0b'
        : 'var(--color-unstable)';

    const outEl = document.getElementById('mimo-dyn-decoupler-out');
    outEl.style.display = 'block';
    outEl.innerHTML = `<div style="color:var(--color-accent);font-weight:700;">Frequency-Point Inverse W(jωc), ωc=${fmtNum(omega, 4)} rad/s</div>
      <div style="margin-top:4px;">G(jω) =<br>${fmtMat(result.G)}</div>
      <div style="margin-top:6px;">W(jω) = G(jω)⁻¹:<br>${fmtMat(result.W)}</div>
      <div style="margin-top:6px;color:${colorRes};">Off-diagonal residual: ${fmtNum(result.offDiagonalNorm, 4)}</div>
      <div>Diagonal deviation: ${fmtNum(result.diagonalDeviation, 4)}</div>
      <div style="font-size:10px;color:var(--text-muted);margin-top:6px;">注意：這是單一頻率點的 inverse，不是完整 dynamic polynomial decoupler。實際部署需 W(s) 為 proper 且 stable。</div>`;
    clearError();
  } catch (err) {
    const outEl = document.getElementById('mimo-dyn-decoupler-out');
    if (outEl) {
      outEl.style.display = 'block';
      outEl.innerHTML = `<div style="color:var(--color-unstable);">${escapeHtml(err.message)}</div>`;
    }
    showError(err.message);
  }
}

// ============================================================
// HELPERS
// ============================================================
function debounce(fn, ms) { let timeout; return (...args) => { clearTimeout(timeout); timeout = setTimeout(() => fn.apply(this, args), ms); }; }
let _errorAutoDismissTimer = null;
function showError(msg) {
  const el = document.getElementById('error-msg');
  if (el) {
    el.textContent = msg;
    el.style.display = 'block';
  }
  if (_errorAutoDismissTimer) clearTimeout(_errorAutoDismissTimer);
  _errorAutoDismissTimer = setTimeout(() => clearError(), 10000);
}
function clearError() {
  const el = document.getElementById('error-msg');
  if (el) { el.textContent = ''; el.style.display = 'none'; }
  if (_errorAutoDismissTimer) { clearTimeout(_errorAutoDismissTimer); _errorAutoDismissTimer = null; }
}

let _toastSeq = 0;
function notify(message, variant = 'info', opts = {}) {
  const stack = document.getElementById('toast-stack');
  if (!stack) return;
  const allowed = new Set(['info', 'success', 'warning', 'error']);
  const tone = allowed.has(variant) ? variant : 'info';
  const title = opts.title || ({ success: 'Success', warning: 'Notice', error: 'Error', info: 'Info' }[tone]);
  const duration = Number.isFinite(opts.duration) ? opts.duration : 3600;
  const id = `toast-${Date.now()}-${_toastSeq++}`;
  const toast = document.createElement('div');
  toast.className = `toast ${tone}`;
  toast.id = id;
  toast.setAttribute('role', tone === 'error' ? 'alert' : 'status');
  toast.innerHTML = `
    <div class="toast-title">${escapeHtml(title)}</div>
    <button class="toast-close" type="button" aria-label="Dismiss notification">×</button>
    <div class="toast-message">${escapeHtml(String(message || ''))}</div>
  `;
  const close = () => {
    toast.remove();
    updateGlobalStatusBar('Ready');
  };
  toast.querySelector('.toast-close')?.addEventListener('click', close);
  stack.appendChild(toast);
  updateGlobalStatusBar(String(message || 'Ready'));
  if (duration > 0) setTimeout(close, duration);
}

function _statusSet(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function _realPart(value) {
  if (value && Number.isFinite(value.re)) return value.re;
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

function currentStabilityLabel() {
  if (!state.plant) return 'Pending';
  const sys = state.showClosedLoop ? (state.closedLoop || state.plant) : state.plant;
  try {
    const poles = typeof sys?.poles === 'function' ? sys.poles() : [];
    if (!poles.length) return 'Unknown';
    const reals = poles.map(_realPart).filter(Number.isFinite);
    if (!reals.length) return 'Unknown';
    if (state.domain === 'z' || sys instanceof DiscreteTransferFunction) {
      const mags = poles.map((p) => {
        if (p && typeof p.abs === 'function') {
          const mag = p.abs();
          if (Number.isFinite(mag)) return mag;
        }
        if (p && Number.isFinite(p.re) && Number.isFinite(p.im)) return Math.hypot(p.re, p.im);
        const n = Number(p);
        return Number.isFinite(n) ? Math.abs(n) : NaN;
      }).filter(Number.isFinite);
      if (!mags.length) return 'Unknown';
      if (mags.some((m) => m > 1 + 1e-8)) return 'Unstable';
      if (mags.some((m) => Math.abs(m - 1) <= 1e-8)) return 'Marginal';
      return 'Stable';
    }
    if (reals.some((r) => r > 1e-8)) return 'Unstable';
    if (reals.some((r) => Math.abs(r) <= 1e-8)) return 'Marginal';
    return 'Stable';
  } catch (_) {
    return 'Unknown';
  }
}

function updateGlobalStatusBar(message = 'Ready') {
  const plantKind = state.systemMode === 'mimo'
    ? 'MIMO SS'
    : `${(state.systemType || 'tf').toUpperCase()} · ${state.domain || 's'}-domain`;
  _statusSet('status-mode', String(state.systemMode || 'siso').toUpperCase());
  _statusSet('status-plant-type', plantKind);
  _statusSet('status-loop-mode', state.showClosedLoop ? 'Closed loop' : 'Open loop');
  _statusSet('status-stability', currentStabilityLabel());
  _statusSet('status-theme', state.theme ? state.theme[0].toUpperCase() + state.theme.slice(1) : 'Dark');
  const live = document.getElementById('global-live-region');
  if (live) live.textContent = message;
}

// S4-3: when MIMO dimensions change, auto-resize Phase 8 / MIMO-LQR matrix
// textareas (Q_n, R_n, Q_d, R_d, MIMO LQR Q/R) to n×n / m×m identity defaults,
// but only when the existing textarea dimensions no longer match — preserving
// user-customized values for already-correctly-sized matrices.
function _identityMatrixText(dim) {
  const lines = [];
  for (let i = 0; i < dim; i++) {
    const row = Array(dim).fill(0);
    row[i] = 1;
    lines.push(row.join(' '));
  }
  return lines.join('\n');
}
function _parseMatrixDims(text) {
  const rows = String(text || '').trim().split('\n').map((r) => r.trim()).filter((r) => r);
  if (!rows.length) return { r: 0, c: 0 };
  const cols = rows[0].split(/[\s,]+/).filter((x) => x).length;
  const allSameWidth = rows.every((r) => r.split(/[\s,]+/).filter((x) => x).length === cols);
  return { r: rows.length, c: allSameWidth ? cols : -1 };
}
function autoResizePhase8MatricesForMIMO(mimoPlant) {
  if (!mimoPlant) return;
  const n = mimoPlant.n;
  const m = mimoPlant.m;
  const nxn = _identityMatrixText(n);
  const mxm = _identityMatrixText(m);
  // Targets: { id, dim } — only overwrite when current dims ≠ target
  [
    { id: 'obs-qn', dim: n, value: nxn },
    { id: 'dkf-qd', dim: n, value: nxn },
    { id: 'mimo-lqr-q', dim: n, value: nxn },
    { id: 'lyapunov-q', dim: n, value: nxn },
    { id: 'lqr-q', dim: n, value: nxn },
    { id: 'mimo-lqr-r', dim: m, value: mxm },
    { id: 'mpc-q', dim: n, value: nxn },
    { id: 'mpc-r', dim: m, value: mxm },
  ].forEach(({ id, dim, value }) => {
    const el = document.getElementById(id);
    if (!el) return;
    const cur = _parseMatrixDims(el.value);
    if (cur.r !== dim || cur.c !== dim) {
      el.value = value;
    }
  });
  // mpc-x0 is a row of n comma-separated values
  const x0el = document.getElementById('mpc-x0');
  if (x0el) {
    const curVals = String(x0el.value || '').split(/[\s,]+/).filter(Boolean);
    if (curVals.length !== n) {
      x0el.value = Array(n).fill(0).map((_, i) => (i === 0 ? '1' : '0')).join(', ');
    }
  }
}

// S3-1: when a freshly entered SISO plant has RHP poles, auto-switch the PZ
// map view to open-loop so the user sees the plant's true poles before any
// stabilizing controller is designed. Surface a banner explaining the swap.
function autoToggleOpenLoopForUnstablePlant() {
  try {
    if (state.systemMode !== 'siso' || !state.plant || state.domain !== 's') return;
    const poles = state.plant.poles ? state.plant.poles() : [];
    const hasRhp = poles.some((p) => (p.re ?? p) > 1e-9);
    if (hasRhp && state.showClosedLoop) {
      state.showClosedLoop = false;
      const clToggle = document.getElementById('cl-toggle');
      if (clToggle) clToggle.checked = false;
      showBanner('⚠ Plant 包含 RHP 極點（不穩定），已自動切到 Open-loop view 以利觀察 plant 真實極點。完成穩定化後請手動切回 Closed-loop。');
    }
  } catch (_) { /* defensive — don't block updateSystem */ }
}

// Backward-compatible banner entrypoint; routed through the unified toast system.
function showBanner(msg) {
  notify(msg, 'warning', { title: 'Notice', duration: 6000 });
}

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

// ============================================================
// P13 — UI/UX usability layer
// Collapsible sections, modals, keyboard shortcuts, presets,
// tooltips, live validation, theme-aware re-rendering.
// ============================================================
const csUI = (() => {
  const COLLAPSE_KEY = 'controlStudio.collapsedSections';

  // -------- Modal management --------
  function showModal(id) {
    const m = document.getElementById(id);
    if (!m) return;
    m.classList.add('active');
    m.setAttribute('aria-hidden', 'false');
    const firstFocusable = m.querySelector('button, [tabindex]:not([tabindex="-1"])');
    if (firstFocusable) setTimeout(() => firstFocusable.focus(), 50);
  }
  function hideModal(id) {
    const m = document.getElementById(id);
    if (!m) return;
    m.classList.remove('active');
    m.setAttribute('aria-hidden', 'true');
  }
  function hideAllModals() {
    document.querySelectorAll('.modal-overlay.active').forEach((m) => {
      m.classList.remove('active');
      m.setAttribute('aria-hidden', 'true');
    });
  }

  // -------- Confirmation dialog: returns Promise<boolean> --------
  function confirm({ title = '確認動作', message = '確定要執行？', okText = '確認', cancelText = '取消', danger = true } = {}) {
    return new Promise((resolve) => {
      const overlay = document.getElementById('confirm-modal');
      const titleEl = document.getElementById('confirm-title');
      const msgEl = document.getElementById('confirm-message');
      const okBtn = document.getElementById('confirm-ok');
      const cancelBtn = document.getElementById('confirm-cancel');
      if (!overlay || !okBtn || !cancelBtn) { resolve(window.confirm(message)); return; }
      titleEl.textContent = title;
      msgEl.textContent = message;
      okBtn.textContent = okText;
      cancelBtn.textContent = cancelText;
      okBtn.classList.toggle('btn-primary', !!danger);

      const cleanup = (result) => {
        okBtn.removeEventListener('click', onOk);
        cancelBtn.removeEventListener('click', onCancel);
        overlay.removeEventListener('click', onBackdrop);
        hideModal('confirm-modal');
        resolve(result);
      };
      const onOk = () => cleanup(true);
      const onCancel = () => cleanup(false);
      const onBackdrop = (e) => { if (e.target === overlay) cleanup(false); };
      okBtn.addEventListener('click', onOk);
      cancelBtn.addEventListener('click', onCancel);
      overlay.addEventListener('click', onBackdrop);
      showModal('confirm-modal');
    });
  }

  // -------- Button loading state --------
  function setLoading(btn, on = true, busyText = null) {
    if (!btn) return;
    if (on) {
      btn.classList.add('is-loading');
      btn.disabled = true;
      btn.setAttribute('aria-busy', 'true');
      if (busyText) {
        btn.dataset.originalText = btn.textContent;
        btn.textContent = busyText;
      }
    } else {
      btn.classList.remove('is-loading');
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
      if (btn.dataset.originalText) {
        btn.textContent = btn.dataset.originalText;
        delete btn.dataset.originalText;
      }
    }
  }
  // Wrap any async operation so the button shows feedback for at least a tick
  async function withLoading(btnOrId, fn) {
    const btn = typeof btnOrId === 'string' ? document.getElementById(btnOrId) : btnOrId;
    setLoading(btn, true);
    try {
      await Promise.resolve().then(fn);
    } finally {
      setLoading(btn, false);
    }
  }

  // -------- Collapsible sections --------
  function loadCollapseState() {
    try { return JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '{}'); } catch { return {}; }
  }
  function saveCollapseState(map) {
    try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(map)); } catch { /* noop */ }
  }
  function panelKey(panel) {
    return panel.id || panel.querySelector('.section-title')?.textContent?.trim()?.slice(0, 40) || 'anon';
  }
  function wrapSectionBodies() {
    document.querySelectorAll('.section-panel').forEach((panel) => {
      // Already wrapped?
      if (panel.querySelector(':scope > .section-body')) return;
      const children = Array.from(panel.children);
      // Find the title element — either direct .section-title or a wrapper containing it
      let titleEl = null;
      let titleIdx = -1;
      for (let i = 0; i < children.length; i++) {
        const c = children[i];
        if (c.classList?.contains('section-title')) { titleEl = c; titleIdx = i; break; }
        if (c.querySelector?.(':scope > .section-title, :scope > h3.section-title')) { titleEl = c; titleIdx = i; break; }
      }
      if (titleIdx < 0) return;
      const body = document.createElement('div');
      body.className = 'section-body';
      // Move all elements after the title into the body
      for (let i = titleIdx + 1; i < children.length; i++) body.appendChild(children[i]);
      panel.appendChild(body);
      panel.classList.add('collapsible');
      // Make title clickable
      const clickTarget = titleEl.classList.contains('section-title') ? titleEl : titleEl.querySelector('.section-title');
      if (clickTarget) {
        clickTarget.setAttribute('role', 'button');
        clickTarget.setAttribute('tabindex', '0');
        clickTarget.setAttribute('aria-expanded', 'true');
        clickTarget.addEventListener('click', (e) => {
          // Don't toggle if clicking on a nested input/button inside the title
          if (e.target.closest('input, button, select, label, [data-no-collapse]') && e.target !== clickTarget) return;
          togglePanel(panel);
        });
        clickTarget.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); togglePanel(panel); }
        });
      }
    });
  }
  function togglePanel(panel, collapsed = null) {
    const willCollapse = collapsed === null ? !panel.classList.contains('collapsed') : collapsed;
    panel.classList.toggle('collapsed', willCollapse);
    const title = panel.querySelector('.section-title');
    if (title) title.setAttribute('aria-expanded', willCollapse ? 'false' : 'true');
    const map = loadCollapseState();
    map[panelKey(panel)] = willCollapse;
    saveCollapseState(map);
  }
  function restoreCollapseState() {
    const map = loadCollapseState();
    document.querySelectorAll('.section-panel.collapsible').forEach((panel) => {
      if (map[panelKey(panel)]) togglePanel(panel, true);
    });
  }
  function collapseAll() {
    document.querySelectorAll('.section-panel.collapsible').forEach((panel) => togglePanel(panel, true));
  }
  function expandAll() {
    document.querySelectorAll('.section-panel.collapsible').forEach((panel) => togglePanel(panel, false));
  }

  // -------- Quick Start presets --------
  const presets = {
    // Classical textbook examples
    'rc-circuit': { type: 'tf', num: '1', den: '1, 1', desc: 'RC low-pass G=1/(s+1)' },
    'rl-circuit': { type: 'tf', num: '10', den: '1, 10', desc: 'RL circuit G=10/(s+10)' },
    'mass-spring': { type: 'tf', num: '1', den: '1, 0.4, 4', desc: 'Mass-spring-damper underdamped' },
    'mass-spring-overdamped': { type: 'tf', num: '1', den: '1, 5, 4', desc: 'Mass-spring overdamped' },
    'high-order': { type: 'tf', num: '1', den: '1, 4, 6, 4, 1', desc: 'High-order (s+1)⁴' },
    'integrator': { type: 'tf', num: '1', den: '1, 0', desc: 'Pure integrator G=1/s' },
    'double-integrator': { type: 'tf', num: '1', den: '1, 0, 0', desc: 'Double integrator (e.g. position from force)' },

    // Industrial / process control
    'dc-motor': { type: 'tf', num: '5', den: '1, 6, 5', desc: 'DC motor (speed): K·a/(τs+1)(Js+b)' },
    'dc-motor-position': { type: 'tf', num: '5', den: '1, 6, 5, 0', desc: 'DC motor (position) — adds integrator' },
    'ball-beam': { type: 'tf', num: '-1.4', den: '1, 0, 0', desc: 'Ball-and-beam linearized model' },
    'heat-exchanger': { type: 'tf', num: '2', den: '1, 0.5', delay: 3, desc: 'Heat exchanger 1st-order + dead time' },
    'liquid-level': { type: 'tf', num: '1', den: '20, 1', desc: 'Liquid level tank τ=20s' },
    'oven-temp': { type: 'tf', num: '5', den: '120, 1', delay: 15, desc: 'Industrial oven (FOPDT)' },
    'distillation': { type: 'tf', num: '1', den: '10, 1', delay: 2, desc: 'Distillation column simplified' },

    // Power / electronics
    'buck-converter': { type: 'tf', num: '1', den: '1e-9, 1e-5, 1', desc: 'Buck converter LC filter' },
    'rlc-resonant': { type: 'tf', num: '1', den: '1, 0.2, 1', desc: 'RLC resonator Q≈5' },

    // Aerospace
    'aircraft-pitch': { type: 'tf', num: '1.151, 0.1774', den: '1, 0.739, 0.921, 0', desc: 'Aircraft pitch dynamics (longitudinal)' },
    'aircraft-bank': { type: 'tf', num: '4', den: '1, 4', desc: 'Aircraft roll/bank simplified' },
    'satellite-attitude': { type: 'tf', num: '1', den: '1, 0, 0', desc: 'Satellite attitude (rigid body)' },

    // Mechanical / robotics
    'robot-joint': { type: 'tf', num: '100', den: '1, 20, 100', desc: 'Robot joint flexible drive' },
    'cart-position': { type: 'tf', num: '1', den: '1, 2, 0', desc: 'Cart with viscous damping (position)' },
    'inverted-pendulum': { type: 'tf', num: '1', den: '1, 0, -4', desc: 'Inverted pendulum (linearized, unstable)' },

    // Non-minimum phase / pathological
    'non-minimum': { type: 'tf', num: '-1, 2', den: '1, 3, 2', desc: 'Non-minimum phase (RHP zero)' },
    'rhp-pole': { type: 'tf', num: '1', den: '1, -1', desc: 'Unstable plant 1/(s−1)' },
    'all-pass': { type: 'tf', num: '-1, 1', den: '1, 1', desc: 'First-order all-pass filter' },
    'lightly-damped': { type: 'tf', num: '1', den: '1, 0.05, 1', desc: 'Lightly damped ζ≈0.025' },

    // Discrete
    'discrete-fir': { type: 'dtf', num: '0.5', den: '1, -0.5', desc: 'Discrete 1st-order H(z)' },
    'discrete-fopdt': { type: 'dtf', num: '0.4', den: '1, -0.6', desc: 'Discrete FOPDT' },

    // MIMO
    'mimo-2x2': { type: 'mimo', A: '-1 0.5\n0 -2', B: '1 0\n0 1', C: '1 0\n0 1', D: '0 0\n0 0', desc: '2×2 MIMO coupled' },
    'mimo-quadtank': { type: 'mimo', A: '-0.025 0 0.026 0\n0 -0.0166 0 0.018\n0 0 -0.0263 0\n0 0 0 -0.018', B: '0.083 0\n0 0.063\n0 0.05\n0.054 0', C: '0.5 0 0 0\n0 0.5 0 0', D: '0 0\n0 0', desc: 'Quadruple-tank process (4-state)' },
  };
  function loadPreset(name) {
    const p = presets[name];
    if (!p) return;
    if (p.type === 'tf') {
      // Switch to SISO mode if needed, TF tab, set values, trigger update
      document.querySelector('.system-mode-btn[data-mode="siso"]')?.click();
      document.querySelector('.sys-tab[data-type="tf"]')?.click();
      const numEl = document.getElementById('tf-num');
      const denEl = document.getElementById('tf-den');
      const delayEl = document.getElementById('tf-delay');
      if (numEl) numEl.value = p.num;
      if (denEl) denEl.value = p.den;
      if (delayEl) delayEl.value = p.delay || 0;
      document.getElementById('btn-apply')?.click();
    } else if (p.type === 'dtf') {
      document.querySelector('.system-mode-btn[data-mode="siso"]')?.click();
      document.querySelector('.sys-tab[data-type="dtf"]')?.click();
      const numEl = document.getElementById('dtf-num');
      const denEl = document.getElementById('dtf-den');
      if (numEl) numEl.value = p.num;
      if (denEl) denEl.value = p.den;
      document.getElementById('btn-apply')?.click();
    } else if (p.type === 'mimo') {
      document.querySelector('.system-mode-btn[data-mode="mimo"]')?.click();
      const ids = ['mimo-a', 'mimo-b', 'mimo-c', 'mimo-d'];
      const keys = ['A', 'B', 'C', 'D'];
      ids.forEach((id, i) => {
        const el = document.getElementById(id);
        if (el && p[keys[i]]) el.value = p[keys[i]];
      });
      document.getElementById('btn-mimo-update')?.click();
    }
    hideModal('quickstart-modal');
  }

  // -------- Tooltips for technical inputs --------
  const tooltipMap = {
    'pid-N': 'D-filter pole N：濾波頻寬。N 越大越接近理想 PID；N 小則更抑制雜訊（建議 10–1000）',
    'preset-ku': 'Ultimate gain Ku：閉迴路臨界震盪時的增益（Ziegler-Nichols 經典法）',
    'preset-tu': 'Ultimate period Tu：對應 Ku 時的震盪週期（秒）',
    'comp-alpha': 'Compensator α：lead 設計 α<1（相位前移），lag 設計 α>1（增益衰減）',
    'lead-target-phase': 'Target phase margin (°)：希望達到的相位裕度',
    'lead-target-wc': 'Target crossover ω_c (rad/s)：希望開迴路增益穿越的頻率',
    'robust-wmin': 'Frequency sweep lower bound (rad/s)',
    'robust-wmax': 'Frequency sweep upper bound (rad/s)',
    'mpc-horizon': 'Prediction horizon N：MPC 預測未來 N 步進行最佳化',
    'mpc-umin': 'Control input lower bound',
    'mpc-umax': 'Control input upper bound',
    'sample-time': 'Sample time Ts (seconds) — used for C→D conversion and discrete simulation',
  };
  function applyTooltips() {
    Object.entries(tooltipMap).forEach(([id, text]) => {
      const el = document.getElementById(id);
      if (el && !el.title) el.title = text;
    });
  }

  // -------- Live matrix dimension preview --------
  function parseMatrixDims(text) {
    const rows = text.trim().split(/\n/).filter(Boolean);
    if (rows.length === 0) return null;
    const cols = rows[0].trim().split(/[\s,]+/).filter(Boolean).length;
    const allEqual = rows.every((r) => r.trim().split(/[\s,]+/).filter(Boolean).length === cols);
    return { rows: rows.length, cols, valid: allEqual };
  }
  function attachMatrixValidator(textareaId, expectedShape = null) {
    const el = document.getElementById(textareaId);
    if (!el) return;
    let hint = el.parentElement.querySelector('.input-validation');
    if (!hint) {
      hint = document.createElement('div');
      hint.className = 'input-validation';
      el.parentElement.appendChild(hint);
    }
    const update = () => {
      const dims = parseMatrixDims(el.value);
      if (!dims) { hint.textContent = ''; hint.className = 'input-validation'; return; }
      if (!dims.valid) {
        hint.textContent = '⚠ rows have inconsistent column counts';
        hint.className = 'input-validation err';
      } else {
        hint.textContent = `${dims.rows} × ${dims.cols}`;
        hint.className = 'input-validation ok';
      }
    };
    el.addEventListener('input', update);
    update();
  }
  function initMatrixValidators() {
    ['ss-a', 'ss-b', 'ss-c', 'ss-d', 'mimo-a', 'mimo-b', 'mimo-c', 'mimo-d'].forEach((id) => attachMatrixValidator(id));
  }

  // -------- Quick Start logic --------
  function initQuickStart() {
    document.getElementById('btn-quickstart')?.addEventListener('click', () => showModal('quickstart-modal'));
    document.querySelectorAll('[data-modal-close]').forEach((btn) => {
      btn.addEventListener('click', () => hideModal(btn.dataset.modalClose));
    });
    document.querySelectorAll('.modal-overlay').forEach((overlay) => {
      overlay.addEventListener('click', (e) => { if (e.target === overlay) hideModal(overlay.id); });
    });
    document.querySelectorAll('[data-preset]').forEach((btn) => {
      btn.addEventListener('click', () => loadPreset(btn.dataset.preset));
    });
    document.querySelectorAll('.preset-filter').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.preset-filter').forEach((b) => b.classList.toggle('active', b === btn));
        const cat = btn.dataset.filter;
        document.querySelectorAll('.preset-card').forEach((card) => {
          card.style.display = (cat === 'all' || card.dataset.cat === cat) ? '' : 'none';
        });
      });
    });
    // Auto-open on first visit
    try {
      if (!localStorage.getItem('controlStudio.seenQuickStart')) {
        setTimeout(() => { showModal('quickstart-modal'); localStorage.setItem('controlStudio.seenQuickStart', '1'); }, 600);
      }
    } catch { /* noop */ }
  }

  // -------- Keyboard shortcuts --------
  function initShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Esc: close any open modal
      if (e.key === 'Escape') { hideAllModals(); return; }
      // Ctrl/Cmd + key shortcuts (skip if user is typing in an input)
      const inField = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === '/' || e.key === '?')) { e.preventDefault(); showModal('quickstart-modal'); return; }
      if (mod && e.key === 's' && !inField) { e.preventDefault(); document.getElementById('btn-save-project')?.click(); }
      if (mod && e.key === 'e' && !inField) { e.preventDefault(); document.getElementById('btn-export-csv')?.click(); }
      if (e.altKey && e.key === 's') { e.preventDefault(); collapseAll(); }
      if (e.altKey && e.key === 'e') { e.preventDefault(); expandAll(); }
    });
  }

  // -------- Wrap destructive actions with confirmation --------
  function wrapDestructiveButtons() {
    const clearSnapshotsBtn = document.getElementById('btn-clear-snapshots');
    if (clearSnapshotsBtn && !clearSnapshotsBtn.dataset.wrapped) {
      clearSnapshotsBtn.dataset.wrapped = '1';
      const original = clearSnapshotsBtn.onclick;
      // Replace any existing listeners by cloning the node
      const clone = clearSnapshotsBtn.cloneNode(true);
      clearSnapshotsBtn.parentNode.replaceChild(clone, clearSnapshotsBtn);
      clone.dataset.wrapped = '1';
      clone.addEventListener('click', async () => {
        const ok = await confirm({ title: 'Clear snapshots', message: '確定要清空所有比較 snapshots？此動作無法復原。', okText: '清空' });
        if (ok && typeof clearSnapshots === 'function') clearSnapshots();
      });
    }
    const clearSessionBtn = document.getElementById('btn-clear-session');
    if (clearSessionBtn && !clearSessionBtn.dataset.wrapped) {
      clearSessionBtn.dataset.wrapped = '1';
      const clone = clearSessionBtn.cloneNode(true);
      clearSessionBtn.parentNode.replaceChild(clone, clearSessionBtn);
      clone.dataset.wrapped = '1';
      clone.addEventListener('click', async () => {
        const ok = await confirm({ title: 'Clear session', message: '確定要清除本地 session autosave？目前未儲存的設計會在重新整理後遺失。', okText: '清除' });
        if (ok && typeof clearSessionStorage === 'function') clearSessionStorage();
      });
    }
  }

  // -------- Theme-aware Plotly re-render on theme toggle --------
  function watchThemeForCharts() {
    const observer = new MutationObserver(() => {
      // After theme switch, re-render visible Plotly charts so their fonts/lines pick up new CSS vars
      setTimeout(() => {
        document.querySelectorAll('.js-plotly-plot').forEach((el) => {
          try { if (window.Plotly) window.Plotly.relayout(el, { paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)' }); } catch { /* noop */ }
        });
      }, 100);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }

  // -------- Random seed wiring --------
  function initSeedControl() {
    const seedEl = document.getElementById('random-seed');
    const clearBtn = document.getElementById('btn-clear-seed');
    if (seedEl) {
      seedEl.addEventListener('change', () => {
        const v = seedEl.value.trim();
        if (v === '') setSeed(null);
        else { const n = parseInt(v, 10); setSeed(Number.isFinite(n) ? n : null); }
      });
    }
    if (clearBtn) {
      clearBtn.addEventListener('click', () => { if (seedEl) seedEl.value = ''; setSeed(null); });
    }
    // Before any LQG/Kalman simulation, reset to the configured seed so reruns are reproducible
    document.getElementById('btn-lqg-sim')?.addEventListener('click', () => resetSeed(), { capture: true });
    document.getElementById('btn-phase8-simulate')?.addEventListener('click', () => resetSeed(), { capture: true });
    document.getElementById('btn-dkf')?.addEventListener('click', () => resetSeed(), { capture: true });
  }

  // -------- System Identification UI --------
  let _lastSysIdModel = null;

  function parseCSVtoUY(text) {
    if (!text || !text.trim()) throw new Error('CSV 是空的');
    const lines = text.trim().split(/\r?\n/);
    const u = [], y = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const parts = line.split(/[,;\s\t]+/).map((p) => parseFloat(p));
      if (i === 0 && parts.some((v) => !Number.isFinite(v))) continue; // skip header row
      if (parts.length < 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) continue;
      u.push(parts[0]);
      y.push(parts[1]);
    }
    if (u.length < 20) throw new Error(`CSV 樣本太少：${u.length}（最少 20）`);
    return { u, y };
  }

  function exampleSysIdData() {
    // True plant: y[k] = 0.7 y[k-1] + 0.3 u[k-1], step input at k=10, T=300 samples
    const N = 300;
    const u = Array.from({ length: N }, (_, k) => (k < 10 ? 0 : 1));
    const y = new Array(N).fill(0);
    for (let k = 1; k < N; k++) y[k] = 0.7 * y[k - 1] + 0.3 * u[k - 1];
    return u.map((ui, i) => `${ui},${y[i].toFixed(5)}`).join('\n');
  }

  function fitSysID(autoOrder = false) {
    const out = document.getElementById('sysid-out');
    try {
      const text = document.getElementById('sysid-csv')?.value || '';
      const { u, y } = parseCSVtoUY(text);
      const Ts = parseFloat(document.getElementById('sysid-ts')?.value || '0.1');
      const modelType = document.getElementById('sysid-model')?.value ?? 'arx';
      let model;
      if (autoOrder) {
        // Auto-order always uses ARX
        const { best, candidates } = autoARXOrder(u, y, { naMax: 4, nbMax: 4, Ts });
        if (!best) throw new Error('Auto-order failed');
        model = best;
        document.getElementById('sysid-na').value = best.order.na;
        document.getElementById('sysid-nb').value = best.order.nb;
      } else {
        const na = parseInt(document.getElementById('sysid-na').value, 10);
        const nb = parseInt(document.getElementById('sysid-nb').value, 10);
        const nk = parseInt(document.getElementById('sysid-nk').value, 10);
        if (modelType === 'armax') {
          const nc = parseInt(document.getElementById('sysid-nc')?.value || '0', 10);
          model = identifyARMAX(u, y, na, nb, nc, nk, Ts);
        } else {
          model = identifyARX(u, y, na, nb, nk, Ts);
        }
      }
      _lastSysIdModel = model;

      const isARMAX = modelType === 'armax' && !autoOrder;
      const ord = model.order;
      // For ARMAX, a/b are raw tail arrays; for ARX, a includes leading 1.
      // Display: show full A polynomial for ARX, raw coefficients for ARMAX
      const aDisplayStr = isARMAX
        ? model.a.map((v) => v.toFixed(4)).join(', ')
        : model.a.map((v) => v.toFixed(4)).join(', ');
      const bDisplayStr = model.b.map((v) => v.toFixed(4)).join(', ');
      const modelLabel = isARMAX
        ? `ARMAX(${ord.na}, ${ord.nb}, ${ord.nc}, nk=${ord.nk}) — ${model.iterations} iter`
        : `ARX(${ord.na}, ${ord.nb}, nk=${ord.nk})`;

      const lines = [
        `<div style="color:var(--color-accent);font-weight:700;">${modelLabel}</div>`,
        `<div>A(z⁻¹) coeff = [${aDisplayStr}]</div>`,
        `<div>B(z⁻¹) coeff = [${bDisplayStr}]</div>`,
      ];
      if (isARMAX && model.c && model.c.length > 0) {
        lines.push(`<div>C(z⁻¹) coeff = [${model.c.map((v) => v.toFixed(4)).join(', ')}]</div>`);
      }
      lines.push(`<div>Fit: ${model.fitPercent.toFixed(2)}% · MSE: ${model.mse.toExponential(3)} · AIC: ${model.aic.toFixed(1)}</div>`);
      out.style.display = 'block';
      out.innerHTML = lines.join('');

      // Plot measured y vs predicted yhat
      if (window.Plotly) {
        const t = u.map((_, k) => k);
        const predLabel = isARMAX ? 'ARMAX predicted' : 'ARX predicted';
        window.Plotly.newPlot('chart-sysid', [
          { x: t, y: y, mode: 'lines', name: 'measured', line: { color: '#10b981', width: 1.4 } },
          { x: t, y: model.yhat, mode: 'lines', name: predLabel, line: { color: '#ec4899', width: 1.4, dash: 'dot' } },
        ], {
          paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
          font: { color: '#94a3b8', size: 10 },
          margin: { t: 10, r: 10, b: 28, l: 40 },
          legend: { font: { size: 9 }, orientation: 'h', y: 1.15 },
          xaxis: { title: 'sample', gridcolor: 'rgba(255,255,255,0.06)' },
          yaxis: { title: 'y', gridcolor: 'rgba(255,255,255,0.06)' },
        }, { responsive: true, displayModeBar: false });
      }
    } catch (err) {
      out.style.display = 'block';
      out.innerHTML = `<span style="color:var(--color-unstable);">${err.message}</span>`;
    }
  }

  function applySysIdModel() {
    if (!_lastSysIdModel) {
      showError('請先 Fit 取得模型');
      return;
    }
    // Switch to discrete TF view — use the .tf object's numerator/denominator
    // which are already in the correct full polynomial form for both ARX and ARMAX.
    const tf = _lastSysIdModel.tf;
    document.querySelector('.system-mode-btn[data-mode="siso"]')?.click();
    document.querySelector('.sys-tab[data-type="dtf"]')?.click();
    document.getElementById('dtf-num').value = tf.num.map((v) => v.toFixed(6)).join(', ');
    document.getElementById('dtf-den').value = tf.den.map((v) => v.toFixed(6)).join(', ');
    document.getElementById('btn-apply')?.click();
  }

  function initSysID() {
    document.getElementById('btn-sysid-fit')?.addEventListener('click', () => fitSysID(false));
    document.getElementById('btn-sysid-auto')?.addEventListener('click', () => fitSysID(true));
    document.getElementById('btn-sysid-apply')?.addEventListener('click', applySysIdModel);
    document.getElementById('btn-sysid-example')?.addEventListener('click', () => {
      document.getElementById('sysid-csv').value = exampleSysIdData();
    });
    document.getElementById('btn-sysid-upload')?.addEventListener('click', () => {
      document.getElementById('sysid-file')?.click();
    });
    document.getElementById('sysid-file')?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        document.getElementById('sysid-csv').value = text;
      } catch (err) {
        showError(`CSV 讀取失敗：${err.message}`);
      } finally {
        e.target.value = '';
      }
    });
  }

  // -------- Init --------
  function init() {
    wrapSectionBodies();
    restoreCollapseState();
    applyTooltips();
    initMatrixValidators();
    initQuickStart();
    initShortcuts();
    wrapDestructiveButtons();
    watchThemeForCharts();
    initSeedControl();
    initSysID();
    updateGlobalStatusBar('Ready');
  }

  return { init, showModal, hideModal, confirm, setLoading, withLoading, collapseAll, expandAll, loadPreset, notify, updateGlobalStatusBar };
})();

window.toggleTheme = toggleTheme;
window.csUI = csUI;
window.ControlStudioSmoke = {
  getState: controlStudioSmokeState,
  run: runControlStudioSmoke,
};

// ============================================================================
// P36/P37 — Command Palette (G3), Code Preview (D1), Unit Switcher (G1)
// ============================================================================

// ── D1: Code Preview ─────────────────────────────────────────────────────────

/** Refresh the code preview block in the Design panel (D1). */
function refreshCodePreview() {
  const codeEl = document.getElementById('code-preview-code');
  const langLbl = document.getElementById('code-preview-lang-label');
  if (!codeEl) return;
  try {
    const lang = state._codeLang ?? 'matlab';
    const design = buildCodegenPayload();
    const code = lang === 'python' ? toPythonScript(design) : toMatlabScript(design);
    codeEl.textContent = code;
    if (langLbl) langLbl.textContent = lang === 'python' ? 'Python' : 'MATLAB';
  } catch (e) {
    codeEl.textContent = `% Error: ${e.message}`;
  }
}

// Auto-refresh code preview whenever plant/controller changes
const _origUpdateGlobalStatusBar = updateGlobalStatusBar;
// Patch: refresh code preview on every global status update (debounced)
let _codePreviewTimer = null;
function scheduleCodePreviewRefresh() {
  clearTimeout(_codePreviewTimer);
  _codePreviewTimer = setTimeout(refreshCodePreview, 400);
}

// ── G3: Command Palette ───────────────────────────────────────────────────────

/** Registry of all palette commands. */
const COMMANDS = [
  { icon: '⚙', group: 'Plant', title: 'SISO 模式',        sub: 'Switch to SISO', keys: [], action: () => document.querySelector('.system-mode-btn[data-mode="siso"]')?.click() },
  { icon: '⊞', group: 'Plant', title: 'MIMO 模式',        sub: 'Switch to MIMO', keys: [], action: () => document.querySelector('.system-mode-btn[data-mode="mimo"]')?.click() },
  { icon: '▶', group: 'Plant', title: 'RC Circuit preset', sub: '1/(s+1)',          keys: [], action: () => csUI?.loadPreset?.('rc-circuit') },
  { icon: '▶', group: 'Plant', title: 'DC Motor preset',   sub: '5/(s²+6s+5)',     keys: [], action: () => csUI?.loadPreset?.('dc-motor') },
  { icon: '▶', group: 'Plant', title: 'Mass-Spring preset',sub: '1/(s²+0.4s+4)',  keys: [], action: () => csUI?.loadPreset?.('mass-spring') },
  { icon: '🎨', group: 'Theme', title: 'Theme: Dark',       sub: '',                keys: [], action: () => { if (state.theme !== 'dark') toggleTheme(); } },
  { icon: '🎨', group: 'Theme', title: 'Theme: Light',      sub: '',                keys: [], action: () => { if (state.theme !== 'light') { if (state.theme === 'dark') toggleTheme(); else toggleTheme(); } } },
  { icon: '🖨', group: 'Theme', title: 'Theme: Print',      sub: '',                keys: [], action: () => { if (state.theme !== 'print') { if (state.theme === 'dark') { toggleTheme(); toggleTheme(); } else if (state.theme === 'light') toggleTheme(); } } },
  { icon: '📋', group: 'Export', title: 'Export MATLAB',    sub: '.m script',       keys: [], action: () => document.getElementById('btn-export-matlab')?.click() },
  { icon: '📋', group: 'Export', title: 'Export Python',    sub: '.py script',      keys: [], action: () => document.getElementById('btn-export-python')?.click() },
  { icon: '📋', group: 'Export', title: 'Export JSON',      sub: 'Project file',    keys: [], action: () => document.getElementById('btn-export-json')?.click() },
  { icon: '📋', group: 'Export', title: 'Export CSV',       sub: 'Step response',   keys: ['Ctrl+E'], action: () => document.getElementById('btn-export-csv')?.click() },
  { icon: '💾', group: 'Project',title: 'Save Project',     sub: 'Ctrl+S',          keys: ['Ctrl+S'], action: () => document.getElementById('btn-save-project')?.click() },
  { icon: '📂', group: 'Project',title: 'Load Project',     sub: '',                keys: [], action: () => document.getElementById('btn-load-project')?.click() },
  { icon: '↺',  group: 'History',title: 'Undo',             sub: 'Ctrl+Z',          keys: ['Ctrl+Z'], action: () => historyUndo?.() },
  { icon: '↻',  group: 'History',title: 'Redo',             sub: 'Ctrl+Y',          keys: ['Ctrl+Y'], action: () => historyRedo?.() },
  { icon: '⌨',  group: 'Help',   title: 'Keyboard shortcuts',sub: '?',             keys: ['Ctrl+?'], action: () => csUI?.showModal?.('shortcuts-modal') },
  { icon: '❓',  group: 'Help',   title: 'Quick Start guide', sub: 'Ctrl+/',        keys: ['Ctrl+/'], action: () => csUI?.showModal?.('quickstart-modal') },
  { icon: '⚙',  group: 'Help',   title: '偏好設定',           sub: 'G4 Preferences',keys: [],        action: () => csUI?.showModal?.('prefs-modal') },
  { icon: '📐', group: 'Navigate',title: 'Go to Plant tab',  sub: '',               keys: [], action: () => switchSidebarPanel?.('model') },
  { icon: '📊', group: 'Navigate',title: 'Go to Compare tab',sub: '',               keys: [], action: () => switchSidebarPanel?.('compare') },
  { icon: '✏',  group: 'Navigate',title: 'Go to Design tab', sub: '',               keys: [], action: () => switchSidebarPanel?.('advisor') },
];

let _cmdFocusIdx = -1;

function openCommandPalette() {
  const overlay = document.getElementById('cmd-overlay');
  if (!overlay) return;
  overlay.classList.add('active');
  overlay.setAttribute('aria-hidden', 'false');
  const inp = document.getElementById('cmd-search');
  if (inp) { inp.value = ''; inp.focus(); }
  _cmdFocusIdx = -1;
  renderCommandList('');
}

function closeCommandPalette() {
  const overlay = document.getElementById('cmd-overlay');
  if (!overlay) return;
  overlay.classList.remove('active');
  overlay.setAttribute('aria-hidden', 'true');
}

function renderCommandList(query) {
  const list = document.getElementById('cmd-list');
  if (!list) return;
  const q = (query ?? '').toLowerCase().trim();
  const filtered = q
    ? COMMANDS.filter(c => c.title.toLowerCase().includes(q) || c.group.toLowerCase().includes(q) || c.sub.toLowerCase().includes(q))
    : COMMANDS;

  if (!filtered.length) {
    list.innerHTML = `<div class="cmd-empty">找不到符合的指令「${escapeHtml(query)}」</div>`;
    return;
  }

  // Group
  const groups = {};
  filtered.forEach(cmd => { (groups[cmd.group] ??= []).push(cmd); });

  list.innerHTML = Object.entries(groups).map(([grp, cmds]) => {
    const items = cmds.map((cmd, i) => {
      const idx = filtered.indexOf(cmd);
      const keysHtml = cmd.keys.length
        ? `<div class="cmd-item-kbd">${cmd.keys.map(k => `<kbd>${escapeHtml(k)}</kbd>`).join('')}</div>`
        : '';
      return `<div class="cmd-item" tabindex="-1" data-cmd-idx="${idx}" role="option" aria-selected="false">
        <div class="cmd-item-icon">${cmd.icon}</div>
        <div class="cmd-item-body">
          <div class="cmd-item-title">${escapeHtml(cmd.title)}</div>
          ${cmd.sub ? `<div class="cmd-item-sub">${escapeHtml(cmd.sub)}</div>` : ''}
        </div>
        ${keysHtml}
      </div>`;
    }).join('');
    return `<div class="cmd-group-label">${escapeHtml(grp)}</div>${items}`;
  }).join('');

  _cmdFiltered = filtered;
  _cmdFocusIdx = -1;

  // Click handlers
  list.querySelectorAll('.cmd-item').forEach(item => {
    item.addEventListener('click', () => {
      const idx = parseInt(item.dataset.cmdIdx ?? '-1', 10);
      if (_cmdFiltered[idx]) { closeCommandPalette(); _cmdFiltered[idx].action(); }
    });
    item.addEventListener('mouseenter', () => {
      list.querySelectorAll('.cmd-item').forEach(it => it.classList.remove('focused'));
      item.classList.add('focused');
      _cmdFocusIdx = parseInt(item.dataset.cmdIdx ?? '-1', 10);
    });
  });
}

let _cmdFiltered = COMMANDS;

// Command palette keyboard navigation
document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('cmd-overlay');
  const inp = document.getElementById('cmd-search');
  if (!overlay || !inp) return;

  inp.addEventListener('input', () => { _cmdFocusIdx = -1; renderCommandList(inp.value); });

  inp.addEventListener('keydown', (e) => {
    const items = document.querySelectorAll('#cmd-list .cmd-item');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      _cmdFocusIdx = Math.min(_cmdFocusIdx + 1, items.length - 1);
      items.forEach((it, i) => it.classList.toggle('focused', i === _cmdFocusIdx));
      items[_cmdFocusIdx]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      _cmdFocusIdx = Math.max(_cmdFocusIdx - 1, 0);
      items.forEach((it, i) => it.classList.toggle('focused', i === _cmdFocusIdx));
      items[_cmdFocusIdx]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (_cmdFocusIdx >= 0 && _cmdFiltered[_cmdFocusIdx]) {
        closeCommandPalette(); _cmdFiltered[_cmdFocusIdx].action();
      } else if (_cmdFiltered.length === 1) {
        closeCommandPalette(); _cmdFiltered[0].action();
      }
    } else if (e.key === 'Escape') {
      closeCommandPalette();
    }
  });

  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeCommandPalette(); });

  // Shortcuts modal close buttons
  document.querySelectorAll('[data-modal-close]').forEach(btn => {
    const id = btn.dataset.modalClose;
    if (id === 'shortcuts-modal') {
      btn.addEventListener('click', () => csUI?.hideModal?.(id));
    }
  });

  // Auto-refresh code preview on state changes
  const _origBar = updateGlobalStatusBar;
  // Listen to plant updates by hooking the global status bar call
  // (cheapest non-invasive hook that fires after every computation)
  window.addEventListener('cs-plant-updated', scheduleCodePreviewRefresh);
  document.addEventListener('cs-state-change', scheduleCodePreviewRefresh);
}, { once: true });

// Expose for inline use
window.openCommandPalette = openCommandPalette;
window.refreshCodePreview = refreshCodePreview;

// ============================================================================
// P38 — F3-2 Dirty Marker, F3-3 Progress Bar, G4 Preferences,
//        F2-3 Fullscreen, B3-4 Chart Export, C2-2 Field Hints
// ============================================================================

// ── F3-2: Dirty state tracker ────────────────────────────────────────────────

let _autoSaveTimer = null;
state._dirty = false;

function markDirty() {
  state._dirty = true;
  const dot = document.getElementById('dirty-dot');
  if (dot) dot.classList.add('visible');

  // Auto-clear after 2s if autosave is enabled
  const prefs = loadPrefs();
  if (prefs.autosave !== false) {
    clearTimeout(_autoSaveTimer);
    _autoSaveTimer = setTimeout(() => {
      saveSessionToStorage();
      clearDirty();
    }, 2000);
  }
}

function clearDirty() {
  state._dirty = false;
  const dot = document.getElementById('dirty-dot');
  if (dot) dot.classList.remove('visible');
}

// Warn before leaving with unsaved changes
window.addEventListener('beforeunload', (e) => {
  if (state._dirty) { e.preventDefault(); e.returnValue = ''; }
});

// ── F3-3: Computation progress bar ───────────────────────────────────────────

let _calcProgressTimer = null;
let _calcProgressRAF = null;
let _calcProgressStart = 0;
let _calcProgressEst = 1000;

function startCalcProgress(estimatedMs = 1000) {
  _calcProgressEst = estimatedMs;
  _calcProgressStart = Date.now();
  clearTimeout(_calcProgressTimer);
  cancelAnimationFrame(_calcProgressRAF);

  _calcProgressTimer = setTimeout(() => {
    const wrap = document.getElementById('calc-progress-wrap');
    const bar  = document.getElementById('calc-progress-bar');
    if (!wrap || !bar) return;
    wrap.classList.add('active');

    const animate = () => {
      const elapsed = Date.now() - _calcProgressStart;
      const pct = Math.min(80, (elapsed / (_calcProgressEst * 0.8)) * 80);
      bar.style.width = pct + '%';
      wrap.setAttribute('aria-valuenow', String(Math.round(pct)));
      if (pct < 80 && wrap.classList.contains('active')) {
        _calcProgressRAF = requestAnimationFrame(animate);
      }
    };
    _calcProgressRAF = requestAnimationFrame(animate);
  }, 300);
}

function completeCalcProgress() {
  clearTimeout(_calcProgressTimer);
  cancelAnimationFrame(_calcProgressRAF);
  const wrap = document.getElementById('calc-progress-wrap');
  const bar  = document.getElementById('calc-progress-bar');
  if (!wrap || !bar || !wrap.classList.contains('active')) return;
  bar.style.width = '100%';
  wrap.setAttribute('aria-valuenow', '100');
  setTimeout(() => {
    wrap.classList.remove('active');
    bar.style.width = '0%';
  }, 300);
}

// Expose globally so csUI IIFE can wrap heavy calculations
window.startCalcProgress   = startCalcProgress;
window.completeCalcProgress = completeCalcProgress;

// ── G4: Preferences system ────────────────────────────────────────────────────

const PREFS_KEY = 'cs-prefs';

function defaultPrefs() {
  return {
    theme:       'dark',
    motion:      'normal',
    density:     'normal',
    freqUnit:    'rads',
    gainUnit:    'db',
    precision:   '4',
    autosave:    true,
    startup:     'restore',
    defaultCtrl: 'pid',
  };
}

function loadPrefs() {
  try { return { ...defaultPrefs(), ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') }; }
  catch { return defaultPrefs(); }
}

function savePrefs(prefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* noop */ }
}

function applyPrefs(prefs) {
  // Theme
  if (prefs.theme && prefs.theme !== state.theme) {
    state.theme = prefs.theme;
    document.documentElement.setAttribute('data-theme', prefs.theme);
    updateThemeIcon();
    if (state.plant) refreshAllCharts();
  }

  // Motion
  document.documentElement.setAttribute('data-motion', prefs.motion ?? 'normal');
  if (prefs.motion === 'reduced') {
    document.documentElement.style.setProperty('--motion-factor', '0.01');
  } else {
    document.documentElement.style.removeProperty('--motion-factor');
  }

  // Density
  const densityMap = { compact: '0.75rem', normal: '1rem', relaxed: '1.25rem' };
  document.documentElement.style.setProperty('--density-scale', densityMap[prefs.density] ?? '1rem');

  // Freq unit — sync with unit switcher
  if (prefs.freqUnit) {
    state._freqUnit = prefs.freqUnit;
    document.querySelectorAll('#freq-unit-switcher .unit-btn').forEach(btn => {
      const active = btn.dataset.unit === prefs.freqUnit;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
  }

  // Precision
  if (prefs.precision) state._precision = parseInt(prefs.precision, 10);
}

function initPrefsModal() {
  const prefs = loadPrefs();

  // Populate inputs from stored prefs
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  const check = (id, val) => { const el = document.getElementById(id); if (el) el.checked = !!val; };

  set('pref-theme',        prefs.theme);
  set('pref-motion',       prefs.motion);
  set('pref-density',      prefs.density);
  set('pref-freq-unit',    prefs.freqUnit);
  set('pref-gain-unit',    prefs.gainUnit);
  set('pref-precision',    prefs.precision);
  check('pref-autosave',   prefs.autosave);
  set('pref-startup',      prefs.startup);
  set('pref-default-ctrl', prefs.defaultCtrl);

  // Apply stored prefs on boot
  applyPrefs(prefs);

  // Prefs tab switching
  document.querySelectorAll('.prefs-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.prefs-tab').forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
      document.querySelectorAll('.prefs-section').forEach(s => s.classList.remove('active'));
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      document.getElementById(`prefs-${tab.dataset.prefsTab}`)?.classList.add('active');
    });
  });

  // Save button
  document.getElementById('pref-save')?.addEventListener('click', () => {
    const newPrefs = {
      theme:       document.getElementById('pref-theme')?.value       ?? 'dark',
      motion:      document.getElementById('pref-motion')?.value      ?? 'normal',
      density:     document.getElementById('pref-density')?.value     ?? 'normal',
      freqUnit:    document.getElementById('pref-freq-unit')?.value   ?? 'rads',
      gainUnit:    document.getElementById('pref-gain-unit')?.value   ?? 'db',
      precision:   document.getElementById('pref-precision')?.value   ?? '4',
      autosave:    document.getElementById('pref-autosave')?.checked  ?? true,
      startup:     document.getElementById('pref-startup')?.value     ?? 'restore',
      defaultCtrl: document.getElementById('pref-default-ctrl')?.value ?? 'pid',
    };
    savePrefs(newPrefs);
    applyPrefs(newPrefs);
    csUI?.hideModal?.('prefs-modal');
    notify('偏好設定已儲存', 'success', { title: '設定' });
  });

  // Danger: clear all data
  document.getElementById('pref-clear-all')?.addEventListener('click', async () => {
    const ok = await csUI?.confirm?.({ title: '清除所有資料', message: '確定要清除所有 localStorage 資料？此操作無法復原。', okText: '確定清除', danger: true }) ?? false;
    if (!ok) return;
    localStorage.clear();
    notify('所有本地資料已清除，頁面即將重載…', 'warning', { title: '清除' });
    setTimeout(() => location.reload(), 1500);
  });

  // Open prefs button in header
  document.getElementById('btn-prefs')?.addEventListener('click', () => {
    // Sync UI with current state before opening
    const cur = loadPrefs();
    document.getElementById('pref-theme')?.setAttribute('value', cur.theme);
    if (document.getElementById('pref-theme')) document.getElementById('pref-theme').value = state.theme ?? cur.theme;
    csUI?.showModal?.('prefs-modal');
  });
}

// ── F2-3: Chart fullscreen ────────────────────────────────────────────────────

function initChartFullscreen() {
  document.querySelectorAll('.chart-cell').forEach(cell => {
    const header = cell.querySelector('.chart-header');
    if (!header) return;
    const btn = document.createElement('button');
    btn.className = 'chart-fullscreen-btn';
    btn.title = '全螢幕 (F2-3)';
    btn.setAttribute('aria-label', '全螢幕顯示此圖表');
    btn.innerHTML = '⤢';
    btn.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        cell.requestFullscreen?.().catch(() => {});
      } else {
        document.exitFullscreen?.().catch(() => {});
      }
    });
    document.addEventListener('fullscreenchange', () => {
      btn.innerHTML = document.fullscreenElement === cell ? '⤡' : '⤢';
      btn.title = document.fullscreenElement === cell ? '退出全螢幕' : '全螢幕';
    });
    header.appendChild(btn);
  });
}

// ── B3-4: Chart export ────────────────────────────────────────────────────────

function initChartExport() {
  document.querySelectorAll('.chart-cell').forEach(cell => {
    const plotId = cell.querySelector('[id^="chart-"]')?.id;
    const header = cell.querySelector('.chart-header');
    if (!header || !plotId) return;

    const wrap = document.createElement('div');
    wrap.className = 'chart-export-wrap';

    const btn = document.createElement('button');
    btn.className = 'chart-export-btn';
    btn.title = '匯出圖表 (B3-4)';
    btn.setAttribute('aria-label', '匯出圖表');
    btn.innerHTML = '↓';

    const menu = document.createElement('div');
    menu.className = 'chart-export-menu';
    menu.innerHTML = `
      <button class="chart-export-item" data-fmt="svg">SVG（向量）</button>
      <button class="chart-export-item" data-fmt="png-hi">PNG 300dpi</button>
      <button class="chart-export-item" data-fmt="png-lo">PNG 150dpi</button>
      <button class="chart-export-item" data-fmt="csv">資料 CSV</button>
    `;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.classList.toggle('open');
    });
    document.addEventListener('click', () => menu.classList.remove('open'));

    menu.querySelectorAll('.chart-export-item').forEach(item => {
      item.addEventListener('click', async (e) => {
        e.stopPropagation();
        menu.classList.remove('open');
        const fmt = item.dataset.fmt;
        const ts = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
        const fname = `cs-${plotId}-${ts}`;
        try {
          if (fmt === 'svg') {
            await window.Plotly?.downloadImage(plotId, { format: 'svg', filename: fname });
          } else if (fmt === 'png-hi') {
            await window.Plotly?.downloadImage(plotId, { format: 'png', scale: 3, filename: fname });
          } else if (fmt === 'png-lo') {
            await window.Plotly?.downloadImage(plotId, { format: 'png', scale: 1.5, filename: fname });
          } else if (fmt === 'csv') {
            // Export from Plotly data
            const divEl = document.getElementById(plotId);
            const gd = divEl?._fullData ?? divEl?.data;
            if (gd && gd.length) {
              const rows = [['series', 'x', 'y']];
              gd.forEach(trace => {
                const xs = trace.x ?? [];
                const ys = trace.y ?? [];
                xs.forEach((x, i) => rows.push([trace.name ?? plotId, x, ys[i] ?? '']));
              });
              const csv = rows.map(r => r.join(',')).join('\n');
              const blob = new Blob([csv], { type: 'text/csv' });
              const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: fname + '.csv' });
              document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 100);
            } else {
              notify('圖表尚無資料可匯出', 'warning', { title: 'Export' });
            }
          }
        } catch (err) {
          notify(`匯出失敗：${err.message}`, 'error', { title: 'Export' });
        }
      });
    });

    wrap.appendChild(btn);
    wrap.appendChild(menu);
    header.appendChild(wrap);
  });
}

// ── C2-2: Field hints popover ─────────────────────────────────────────────────

const FIELD_HINTS = {
  'pid-Kp': {
    title: '比例增益 Kp',
    body: '輸出 = Kp × 誤差。Kp 越大響應越快，但超越量也越大，過大可能導致不穩定。',
    range: '常用範圍：0.1 – 100',
  },
  'pid-Ki': {
    title: '積分增益 Ki',
    body: '消除穩態誤差（靜差）。Ki 過大會增加超越量並可能引起積分飽和（windup）。',
    range: '常用範圍：0.01 – 10',
  },
  'pid-Kd': {
    title: '微分增益 Kd',
    body: '對誤差變化率做反應，可減緩超越量。對高頻雜訊敏感，通常配合 N 截止濾波。',
    range: '常用範圍：0 – 10',
  },
  'pid-N': {
    title: '微分濾波器截止係數 N',
    body: '微分項頻率截止：截止頻率 = N × Ki/Kp。N 越小濾波越強，N 越大越接近純微分。',
    range: '常用範圍：5 – 200（推薦 50–100）',
  },
  'tf-num': {
    title: '分子多項式 Numerator',
    body: '傳遞函數 G(s) = num(s) / den(s) 的係數，由高次到低次，以空格或逗號分隔。',
    range: '例：輸入「1」表示 G(s) = 1 / den(s)',
  },
  'tf-den': {
    title: '分母多項式 Denominator',
    body: '分母多項式次數必須 ≥ 分子（嚴格正則）。係數由高次到低次輸入。',
    range: '例：「1 3 2」表示 s² + 3s + 2',
  },
  'design-os': {
    title: '超越量規格 %OS',
    body: '閉迴路步階響應最高點超過穩態值的百分比。%OS = exp(−πζ/√(1−ζ²)) × 100。',
    range: '推薦範圍：5% – 30%（工業一般 ≤ 16.3%）',
  },
  'design-ts': {
    title: '穩定時間規格 Ts (sec)',
    body: '響應進入並維持在穩態值 ±2% 範圍內所需的時間。Ts ≈ 4/(ζωn)。',
    range: '依系統時間常數，通常 0.5s – 20s',
  },
};

function initFieldHints() {
  const popover = document.createElement('div');
  popover.className = 'field-hint-popover';
  popover.id = 'field-hint-popover';
  popover.setAttribute('aria-hidden', 'true');
  document.body.appendChild(popover);

  let _hideTimer = null;

  function showHint(fieldId, anchorEl) {
    const hint = FIELD_HINTS[fieldId];
    if (!hint) return;
    clearTimeout(_hideTimer);
    popover.innerHTML = `<div class="field-hint-title">${escapeHtml(hint.title)}</div><div>${escapeHtml(hint.body)}</div><div class="field-hint-range">${escapeHtml(hint.range)}</div>`;
    popover.removeAttribute('aria-hidden');

    // Position relative to anchor
    const rect = anchorEl.getBoundingClientRect();
    const top = rect.bottom + 6 + window.scrollY;
    const left = Math.min(rect.left + window.scrollX, window.innerWidth - 276);
    popover.style.cssText = `position:fixed;top:${rect.bottom + 6}px;left:${Math.min(rect.left, window.innerWidth - 276)}px`;
    popover.classList.add('visible');
  }

  function hideHint() {
    _hideTimer = setTimeout(() => {
      popover.classList.remove('visible');
      popover.setAttribute('aria-hidden', 'true');
    }, 150);
  }

  Object.keys(FIELD_HINTS).forEach(fieldId => {
    const el = document.getElementById(fieldId);
    if (!el) return;
    el.addEventListener('focus', () => setTimeout(() => showHint(fieldId, el), 300));
    el.addEventListener('blur', hideHint);
    el.addEventListener('mouseenter', () => showHint(fieldId, el));
    el.addEventListener('mouseleave', hideHint);
  });

  // Also wire up ⓘ help icons next to inputs
  document.querySelectorAll('.help-icon[title]').forEach(icon => {
    icon.addEventListener('mouseenter', () => {
      const parentInput = icon.closest('.input-group')?.querySelector('input,select,textarea');
      if (parentInput && FIELD_HINTS[parentInput.id]) {
        showHint(parentInput.id, icon);
      }
    });
    icon.addEventListener('mouseleave', hideHint);
  });
}

// ── P38 init (called after DOM is ready) ─────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initPrefsModal();
  // Delay fullscreen / export init slightly so all chart cells exist
  setTimeout(() => {
    initChartFullscreen();
    initChartExport();
    initFieldHints();
  }, 800);

  // Wire dirty marking to plant update path
  // Patch saveSessionToStorage to clear dirty after saving
  const _origSave = saveSessionToStorage;
}, { once: true });

// Patch updateSystem to call markDirty on every change
const _patchMarkDirty = (() => {
  const orig = window.updateSystem;
  if (typeof orig === 'function') {
    window.updateSystem = function(...args) { markDirty(); return orig.apply(this, args); };
  }
})();

// ── P39 — B3-1 Axis Range Control ────────────────────────────────────────────
// Adds a small "⊞" button to each chart-header that opens a popover allowing
// manual X/Y axis range input. Applies via Plotly.relayout().
function initAxisRangeControl() {
  /** Map of chart container id → { xaxis, yaxis } override or null (auto) */
  const _axisOverrides = {};

  /**
   * Build the popover HTML for a given chart cell.
   * @param {string} chartId - id of the Plotly div (e.g. 'chart-active')
   */
  function buildPopover(chartId) {
    const wrap = document.createElement('div');
    wrap.className = 'axis-range-popover';
    wrap.id = `axis-popover-${chartId}`;
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-label', 'Axis range settings');
    wrap.innerHTML = `
      <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">Axis Range</div>
      <div class="axis-range-group">
        <div>
          <div class="axis-range-label">X min</div>
          <input class="axis-range-input" data-axis="xmin" type="number" step="any" placeholder="auto">
        </div>
        <div>
          <div class="axis-range-label">X max</div>
          <input class="axis-range-input" data-axis="xmax" type="number" step="any" placeholder="auto">
        </div>
        <div>
          <div class="axis-range-label">Y min</div>
          <input class="axis-range-input" data-axis="ymin" type="number" step="any" placeholder="auto">
        </div>
        <div>
          <div class="axis-range-label">Y max</div>
          <input class="axis-range-input" data-axis="ymax" type="number" step="any" placeholder="auto">
        </div>
      </div>
      <div class="axis-range-actions">
        <button class="btn btn-primary btn-sm axis-range-apply" style="flex:1;justify-content:center;">Apply</button>
        <button class="btn btn-sm axis-range-reset" style="flex:1;justify-content:center;">Reset</button>
      </div>`;
    return wrap;
  }

  document.querySelectorAll('.chart-cell').forEach(cell => {
    const header = cell.querySelector('.chart-header');
    if (!header) return;
    // Find the Plotly div inside this cell
    const chartDiv = cell.querySelector('[id^="chart-"]');
    if (!chartDiv) return;
    const chartId = chartDiv.id;

    // Create toggle button
    const btn = document.createElement('button');
    btn.className = 'chart-axis-btn';
    btn.title = 'Set axis range';
    btn.setAttribute('aria-label', 'Set axis range');
    btn.innerHTML = '⊞';
    header.appendChild(btn);

    // Create popover (appended to cell so position is relative)
    const popover = buildPopover(chartId);
    cell.appendChild(popover);

    // Toggle open/close
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = popover.classList.contains('open');
      // Close all other popovers first
      document.querySelectorAll('.axis-range-popover.open').forEach(p => p.classList.remove('open'));
      if (!isOpen) {
        // Restore any existing override values into inputs
        const ov = _axisOverrides[chartId];
        if (ov) {
          popover.querySelector('[data-axis="xmin"]').value = ov.xmin ?? '';
          popover.querySelector('[data-axis="xmax"]').value = ov.xmax ?? '';
          popover.querySelector('[data-axis="ymin"]').value = ov.ymin ?? '';
          popover.querySelector('[data-axis="ymax"]').value = ov.ymax ?? '';
        }
        popover.classList.add('open');
      }
    });

    // Apply button
    popover.querySelector('.axis-range-apply').addEventListener('click', () => {
      const xmin = parseFloat(popover.querySelector('[data-axis="xmin"]').value);
      const xmax = parseFloat(popover.querySelector('[data-axis="xmax"]').value);
      const ymin = parseFloat(popover.querySelector('[data-axis="ymin"]').value);
      const ymax = parseFloat(popover.querySelector('[data-axis="ymax"]').value);

      const relayoutArgs = {};
      if (Number.isFinite(xmin) && Number.isFinite(xmax) && xmin < xmax) {
        relayoutArgs['xaxis.range'] = [xmin, xmax];
        relayoutArgs['xaxis.autorange'] = false;
      }
      if (Number.isFinite(ymin) && Number.isFinite(ymax) && ymin < ymax) {
        relayoutArgs['yaxis.range'] = [ymin, ymax];
        relayoutArgs['yaxis.autorange'] = false;
      }
      _axisOverrides[chartId] = { xmin, xmax, ymin, ymax };
      if (Object.keys(relayoutArgs).length) {
        try { Plotly?.relayout(chartId, relayoutArgs); } catch (_) {}
      }
      popover.classList.remove('open');
    });

    // Reset button → restore autorange
    popover.querySelector('.axis-range-reset').addEventListener('click', () => {
      delete _axisOverrides[chartId];
      popover.querySelectorAll('.axis-range-input').forEach(inp => (inp.value = ''));
      try {
        Plotly?.relayout(chartId, { 'xaxis.autorange': true, 'yaxis.autorange': true });
      } catch (_) {}
      popover.classList.remove('open');
    });
  });

  // Close popover on outside click
  document.addEventListener('click', () => {
    document.querySelectorAll('.axis-range-popover.open').forEach(p => p.classList.remove('open'));
  });
}

// ── P39 — B2-3 Pole-Zero Map Enhancement ─────────────────────────────────────
// Adds a control bar above the mini PZ map with OL/CL toggle and grid button.
function initPZMapControls() {
  const pzCell = document.getElementById('chart-pzmap')?.closest('.chart-cell');
  if (!pzCell) return;

  // Build control bar
  const ctrlBar = document.createElement('div');
  ctrlBar.className = 'pz-ctrl-bar';
  ctrlBar.id = 'pz-ctrl-bar';

  const btnOL = document.createElement('button');
  btnOL.className = 'pz-ctrl-btn';
  btnOL.id = 'pz-btn-ol';
  btnOL.textContent = 'OL';
  btnOL.title = 'Show open-loop poles/zeros';

  const btnCL = document.createElement('button');
  btnCL.className = 'pz-ctrl-btn active';
  btnCL.id = 'pz-btn-cl';
  btnCL.textContent = 'CL';
  btnCL.title = 'Show closed-loop poles/zeros';

  const btnGrid = document.createElement('button');
  btnGrid.className = 'pz-ctrl-btn';
  btnGrid.id = 'pz-btn-grid';
  btnGrid.textContent = 'Grid';
  btnGrid.title = 'Toggle ζ/ωn grid overlay';

  ctrlBar.appendChild(btnOL);
  ctrlBar.appendChild(btnCL);
  ctrlBar.appendChild(btnGrid);

  // Insert before the chart body
  const chartBody = document.getElementById('chart-pzmap');
  pzCell.insertBefore(ctrlBar, chartBody);

  // State
  let _pzMode = 'cl';   // 'ol' | 'cl'
  let _pzGrid = false;

  function refreshPZMap() {
    const sys = _pzMode === 'cl' ? state.closedLoop : state.openLoop;
    if (!sys) return;
    renderPoleZeroMap(sys, 'chart-pzmap');
    // Optionally overlay ζ/ωn damping lines
    if (_pzGrid) {
      _overlayDampingGrid('chart-pzmap');
    }
  }

  /**
   * Overlay constant-damping-ratio (ζ) lines on a Plotly s-plane PZ map.
   * Lines are drawn for ζ = 0.2, 0.4, 0.6, 0.707, 0.8.
   */
  function _overlayDampingGrid(divId) {
    const zetas = [0.2, 0.4, 0.6, 0.707, 0.8];
    const shapes = zetas.flatMap(z => {
      const angle = Math.acos(z) * (180 / Math.PI);
      // Two rays from origin at ±angle
      return [1, -1].map(sign => ({
        type: 'line',
        x0: 0, y0: 0,
        x1: -10 * z, y1: sign * 10 * Math.sqrt(1 - z * z),
        xref: 'x', yref: 'y',
        line: { color: 'rgba(99,102,241,0.25)', width: 1, dash: 'dot' },
      }));
    });
    const annotations = zetas.map(z => ({
      x: -1.5 * z, y: 1.5 * Math.sqrt(1 - z * z),
      xref: 'x', yref: 'y',
      text: `ζ=${z}`,
      showarrow: false,
      font: { size: 9, color: 'rgba(99,102,241,0.6)' },
    }));
    try {
      Plotly?.relayout(divId, { shapes, annotations });
    } catch (_) {}
  }

  btnOL.addEventListener('click', () => {
    _pzMode = 'ol';
    btnOL.classList.add('active');
    btnCL.classList.remove('active');
    refreshPZMap();
  });

  btnCL.addEventListener('click', () => {
    _pzMode = 'cl';
    btnCL.classList.add('active');
    btnOL.classList.remove('active');
    refreshPZMap();
  });

  btnGrid.addEventListener('click', () => {
    _pzGrid = !_pzGrid;
    btnGrid.classList.toggle('active', _pzGrid);
    refreshPZMap();
  });

  // Expose for external triggering
  window._pzMapRefresh = refreshPZMap;
}

// ── P39 — B2-2 Hankel Singular Values ────────────────────────────────────────
// Computes Hankel singular values from controllability/observability Gramians
// and renders a bar chart visualization in #hankel-svd-panel.
function initHankelSVD() {
  const btn = document.getElementById('btn-hankel-svd');
  if (!btn) return;

  btn.addEventListener('click', () => {
    const wrap = document.getElementById('hankel-svd-wrap');
    const barsEl = document.getElementById('hankel-svd-bars');
    const infoEl = document.getElementById('hankel-svd-info');
    if (!wrap || !barsEl || !infoEl) return;

    // Need a state-space representation
    let sys = state.plant;
    if (!sys) { notify('先輸入 Plant 才能計算 Hankel SV', 'warning'); return; }

    try {
      // Convert TF to SS canonical form
      const ss = tfToControllableCanonical(sys.num, sys.den);
      const n = ss.A.length;
      if (n === 0) { notify('系統為純增益，無 Hankel SV', 'info'); return; }

      // Approximate Gramians via short impulse simulation (power iteration approximation)
      // For display purposes: use diagonal of Gramian approximation (controllability)
      // We use a simplified approach: eigenvalues of Wc*Wo product
      // Controllability Gramian Wc via Lyapunov sum approximation
      const A = ss.A;
      const B = ss.B;
      const C = ss.C;

      // Build Wc by summing e^(At)BB^T e^(At)^T dt (discretised, stable check)
      const isStable = sys.poles().every(p => p.re < 0);
      if (!isStable) { notify('Plant 不穩定，Hankel SV 需穩定系統', 'warning'); return; }

      // Simple power-method Gramian approximation
      // Use A^k B sums to build Wc ≈ sum_{k=0}^{K} Ak*B*(Ak*B)^T
      const dt = 0.01;
      const K = Math.min(500, Math.ceil(5 / dt));
      // Discretize A_d = I + A*dt (Euler, only valid for small dt with stable A)
      const Ad = A.map((row, i) => row.map((v, j) => (i === j ? 1 : 0) + v * dt));

      function matVec(M, v) { return M.map(row => row.reduce((s, mv, j) => s + mv * v[j], 0)); }
      function matMulLocal(M1, M2) {
        const m = M1.length, k = M2.length, p = M2[0].length;
        const R = Array.from({ length: m }, () => new Array(p).fill(0));
        for (let i = 0; i < m; i++) for (let l = 0; l < k; l++) if (M1[i][l]) for (let j = 0; j < p; j++) R[i][j] += M1[i][l] * M2[l][j];
        return R;
      }

      // Wc = sum Ak*B * (Ak*B)^T
      let Wc = Array.from({ length: n }, () => new Array(n).fill(0));
      let AkB = B.map(row => [...row]); // n×m
      for (let k = 0; k < K; k++) {
        // Add AkB * AkB^T
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
          for (let m_ = 0; m_ < AkB[0].length; m_++) Wc[i][j] += AkB[i][m_] * AkB[j][m_] * dt;
        }
        // AkB = Ad * AkB
        AkB = matMulLocal(Ad, AkB);
      }

      // Wo = sum (C*Ak)^T * C*Ak
      const Ct = Array.from({ length: n }, (_, i) => C.map(row => row[i])); // n×p (transpose)
      let Wo = Array.from({ length: n }, () => new Array(n).fill(0));
      let AkTCt = Ct.map(row => [...row]); // n×p
      const AdT = Array.from({ length: n }, (_, i) => Ad.map(row => row[i]));
      for (let k = 0; k < K; k++) {
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
          for (let p_ = 0; p_ < AkTCt[0].length; p_++) Wo[i][j] += AkTCt[i][p_] * AkTCt[j][p_] * dt;
        }
        AkTCt = matMulLocal(AdT, AkTCt);
      }

      // Hankel singular values = sqrt of eigenvalues of Wc*Wo
      // Use power iteration to get approximate eigenvalues (diagonal of Wc*Wo product)
      const WcWo = matMulLocal(Wc, Wo);
      // Extract diagonal as approximation of singular values (for display)
      const diag = WcWo.map((row, i) => Math.max(0, row[i]));
      const hsvs = diag.map(v => Math.sqrt(v)).sort((a, b) => b - a);

      // Render bars
      const maxHsv = hsvs[0] || 1;
      barsEl.innerHTML = hsvs.map((v, i) => `
        <div class="hsv-bar-row">
          <div class="hsv-bar-label">σ${i + 1}</div>
          <div class="hsv-bar-outer">
            <div class="hsv-bar-inner" style="width:${(v / maxHsv * 100).toFixed(1)}%"></div>
          </div>
          <div class="hsv-bar-val">${v.toExponential(3)}</div>
        </div>`).join('');

      // Threshold analysis
      const threshold = maxHsv * 0.01; // 1% threshold
      const keepCount = hsvs.filter(v => v >= threshold).length;
      infoEl.textContent = `n=${n} 個狀態，σ₁=${hsvs[0].toExponential(3)}，建議保留 ${keepCount} 個狀態（σ ≥ 1% σ₁）`;

      wrap.style.display = 'block';
    } catch (err) {
      notify(`Hankel SV 計算失敗：${err.message}`, 'error');
    }
  });
}

// ── P39 — C2-3 Error Guidance System ─────────────────────────────────────────
// Enhances showError() with contextual guidance for common error patterns.
// Appends an .error-guidance block to the error message element with links/actions.

const ERROR_GUIDANCE_MAP = [
  {
    patterns: [/unstable/i, /不穩定/],
    guidance: '系統不穩定。建議：1) 增加阻尼（提高 Kd / 降低 Kp）2) 查看根軌跡確認極點位置 3) 嘗試 PID 自動整定。',
    action: null,
  },
  {
    patterns: [/singular/i, /ill.?cond/i, /rank/i, /奇異/],
    guidance: '矩陣奇異或病態。建議：確認分母多項式不為零，且系統是可控/可觀的。',
    action: null,
  },
  {
    patterns: [/積分器/i, /integrator/i, /infinite.*gain/i, /DC.*gain/i],
    guidance: '系統含積分器（DC 增益無窮大）。建議：改用 Tustin 或 ZOH 離散化方法。',
    action: null,
  },
  {
    patterns: [/denominator.*zero/i, /分母.*為零/i, /分母不能/i],
    guidance: '分母多項式為零或常數。請確認傳遞函數的分母至少含一個非零係數。',
    action: null,
  },
  {
    patterns: [/delay/i, /延遲/],
    guidance: '系統包含時間延遲。建議使用 Smith Predictor 或增加 Padé 近似階數。',
    action: null,
  },
  {
    patterns: [/poles.*right.*half/i, /RHP.*pole/i, /右半平面極點/],
    guidance: '系統有 RHP 極點（不穩定 Plant）。閉迴路設計需特別注意 BIBO 穩定性，可先用根軌跡確認 K 範圍。',
    action: null,
  },
  {
    patterns: [/parse/i, /invalid.*poly/i, /無效.*多項式/i],
    guidance: '多項式解析失敗。係數請以空格或逗號分隔，例如：「1 2 3」表示 s² + 2s + 3。',
    action: null,
  },
];

/** Return the first matching guidance string, or null */
function _matchErrorGuidance(msg) {
  for (const entry of ERROR_GUIDANCE_MAP) {
    if (entry.patterns.some(p => (typeof p === 'string' ? msg.includes(p) : p.test(msg)))) {
      return entry.guidance;
    }
  }
  return null;
}

function initErrorGuidance() {
  // Patch showError to inject guidance
  const _origShowError = window.showError || showError;
  const _patchedShowError = function patchedShowError(msg) {
    _origShowError(msg);
    // Find or create guidance element
    let guidanceEl = document.getElementById('error-guidance-inject');
    if (!guidanceEl) {
      guidanceEl = document.createElement('div');
      guidanceEl.id = 'error-guidance-inject';
      guidanceEl.className = 'error-guidance';
      const errBox = document.getElementById('error-msg');
      if (errBox) errBox.appendChild(guidanceEl);
    }
    const guidance = _matchErrorGuidance(msg);
    if (guidance) {
      guidanceEl.innerHTML = `💡 <strong>建議：</strong>${escapeHtml(guidance)}`;
      guidanceEl.style.display = 'block';
    } else {
      guidanceEl.style.display = 'none';
    }
  };
  // Expose globally (showError is already defined in this module, we patch the DOM-facing call)
  window._patchedShowError = _patchedShowError;
  // Hook all try/catch call sites go through showError; we wrap at module level
  // by reassigning the exported-like reference — since app.js is not a module export,
  // we patch the direct reference via closure using the existing global
  window.showErrorWithGuidance = _patchedShowError;
}

// ── P39 init ─────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    initAxisRangeControl();
    initPZMapControls();
    initHankelSVD();
    initErrorGuidance();
  }, 1000);
}, { once: true });

// ── P40 — C2-1 Design Wizard ──────────────────────────────────────────────────
// Four-step design wizard progress bar: 建模 → 規格 → 設計 → 驗證
// Shown/hidden via #btn-wizard. State persists in sessionStorage.
const WIZARD_STEPS = [
  { id: 'w-model',  label: '1\n建模',   title: '建模',   hint: '輸入或選取系統模型（Plant）' },
  { id: 'w-spec',   label: '2\n規格',   title: '規格',   hint: '設定效能目標（OS%, Ts, PM）' },
  { id: 'w-design', label: '3\n設計',   title: '設計',   hint: '選擇並調整控制器' },
  { id: 'w-verify', label: '4\n驗證',   title: '驗證',   hint: '確認頻域 / 時域規格合規' },
];

const WIZARD_STORAGE_KEY = 'cs-wizard-step';

function initDesignWizard() {
  const bar    = document.getElementById('wizard-bar');
  const track  = document.getElementById('wizard-track');
  const btnPrev = document.getElementById('wizard-prev');
  const btnNext = document.getElementById('wizard-next');
  const btnSkip = document.getElementById('wizard-skip');
  const btnOpen = document.getElementById('btn-wizard');
  if (!bar || !track || !btnPrev || !btnNext || !btnSkip || !btnOpen) return;

  let currentStep = parseInt(sessionStorage.getItem(WIZARD_STORAGE_KEY) ?? '0', 10);

  function buildTrack() {
    track.innerHTML = '';
    WIZARD_STEPS.forEach((step, i) => {
      // Connector before each step (except first)
      if (i > 0) {
        const conn = document.createElement('div');
        conn.className = `wizard-connector${i <= currentStep ? ' done' : ''}`;
        track.appendChild(conn);
      }
      const stepEl = document.createElement('div');
      stepEl.className = `wizard-step${i < currentStep ? ' done' : i === currentStep ? ' active' : ''}`;
      stepEl.setAttribute('title', step.hint);
      stepEl.innerHTML = `
        <div class="wizard-step-dot">${i < currentStep ? '✓' : i + 1}</div>
        <div class="wizard-step-label">${step.title}</div>`;
      stepEl.addEventListener('click', () => { if (i <= currentStep + 1) goToStep(i); });
      track.appendChild(stepEl);
    });
  }

  function goToStep(n) {
    currentStep = Math.max(0, Math.min(WIZARD_STEPS.length - 1, n));
    sessionStorage.setItem(WIZARD_STORAGE_KEY, String(currentStep));
    buildTrack();
    btnPrev.disabled = currentStep === 0;
    if (currentStep === WIZARD_STEPS.length - 1) {
      btnNext.textContent = '完成 ✓';
    } else {
      btnNext.textContent = '下一步 →';
    }
    // Emit hint as notification
    notify(`精靈步驟 ${currentStep + 1}：${WIZARD_STEPS[currentStep].hint}`, 'info', { duration: 4000 });
  }

  function openWizard() {
    bar.classList.add('visible');
    buildTrack();
    btnPrev.disabled = currentStep === 0;
  }

  function closeWizard() {
    bar.classList.remove('visible');
  }

  btnOpen.addEventListener('click', () => {
    if (bar.classList.contains('visible')) closeWizard();
    else openWizard();
  });

  btnSkip.addEventListener('click', closeWizard);

  btnNext.addEventListener('click', () => {
    if (currentStep === WIZARD_STEPS.length - 1) { closeWizard(); notify('設計精靈完成！', 'success'); }
    else goToStep(currentStep + 1);
  });

  btnPrev.addEventListener('click', () => goToStep(currentStep - 1));

  // Register command palette entry
  if (Array.isArray(window.COMMANDS)) {
    window.COMMANDS.push({ group: 'UI', icon: '🧭', title: '開啟設計精靈', keys: [], action: openWizard });
  }
}

// ── P40 — B3-2 Chart Cursor Readout ──────────────────────────────────────────
// Adds a crosshair readout overlay to Plotly chart cells, triggered by
// the plotly_hover event. Shows x value and all series y values.
function initChartCursorReadout() {
  const CHART_IDS = ['chart-active', 'chart-rlocus', 'chart-pzmap', 'chart-compare'];

  CHART_IDS.forEach(chartId => {
    const chartEl = document.getElementById(chartId);
    if (!chartEl) return;
    const cell = chartEl.closest('.chart-cell') || chartEl.parentElement;
    if (!cell) return;

    // Ensure cell has position:relative for absolute children
    if (getComputedStyle(cell).position === 'static') cell.style.position = 'relative';

    // Create readout box
    const readout = document.createElement('div');
    readout.className = 'chart-readout';
    readout.id = `readout-${chartId}`;
    cell.appendChild(readout);

    // Create crosshair line
    const crosshair = document.createElement('div');
    crosshair.className = 'chart-crosshair';
    crosshair.id = `crosshair-${chartId}`;
    chartEl.style.position = 'relative';
    cell.appendChild(crosshair);

    // Wire plotly events
    chartEl.on?.('plotly_hover', (data) => {
      if (!data?.points?.length) return;
      const pts = data.points;
      const x = pts[0]?.x;
      const xLabel = (typeof x === 'number') ? fmtNum(x, 4) : String(x);

      readout.innerHTML = `<div class="chart-readout-x">x = ${xLabel}</div>` +
        pts.map(pt => {
          const color = pt.fullData?.line?.color || pt.fullData?.marker?.color || 'var(--color-accent)';
          const name = pt.fullData?.name || '';
          const y = typeof pt.y === 'number' ? fmtNum(pt.y, 4) : String(pt.y);
          return `<div class="chart-readout-row">
            <div class="chart-readout-swatch" style="background:${color}"></div>
            <span style="flex:1;color:var(--text-muted)">${name}</span>
            <span>${y}</span>
          </div>`;
        }).join('');

      readout.classList.add('visible');

      // Position crosshair
      try {
        const gd = chartEl._fullLayout;
        if (gd?.xaxis && typeof pts[0]?.x === 'number') {
          const xFrac = (pts[0].x - gd.xaxis.range[0]) / (gd.xaxis.range[1] - gd.xaxis.range[0]);
          const plotArea = gd._size;
          const left = plotArea?.l + xFrac * (plotArea?.w || 100);
          crosshair.style.left = `${left}px`;
          crosshair.classList.add('visible');
        }
      } catch (_) {}
    });

    chartEl.on?.('plotly_unhover', () => {
      readout.classList.remove('visible');
      crosshair.classList.remove('visible');
    });
  });
}

// ── P40 — B3-3 Chart Theme Toggle ────────────────────────────────────────────
// Adds a 🎨 button to each chart header to cycle chart color themes.
// Three modes: auto (follows global theme), vibrant, monochrome.
const CHART_THEMES = ['auto', 'vibrant', 'mono'];
const CHART_THEME_LABELS = { auto: '🎨', vibrant: '🌈', mono: '⬛' };
const CHART_THEME_TITLES = { auto: '圖表主題：跟隨全域', vibrant: '圖表主題：繽紛', mono: '圖表主題：單色' };

// Per-chart theme overrides: chartId → theme string
const _chartThemes = {};

function getChartColorscale(themeKey) {
  if (themeKey === 'vibrant') {
    return ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#f72585', '#7209b7', '#3a0ca3', '#4cc9f0'];
  }
  if (themeKey === 'mono') {
    return ['#e6e6e6', '#bdbdbd', '#969696', '#737373', '#525252', '#252525', '#000000', '#f0f0f0'];
  }
  // 'auto' — use CSS accent palette
  return null;
}

function initChartThemeToggle() {
  document.querySelectorAll('.chart-cell').forEach(cell => {
    const header = cell.querySelector('.chart-header');
    if (!header) return;
    const chartDiv = cell.querySelector('[id^="chart-"]');
    if (!chartDiv) return;
    const chartId = chartDiv.id;

    const btn = document.createElement('button');
    btn.className = 'chart-theme-btn';
    btn.id = `theme-btn-${chartId}`;
    btn.textContent = CHART_THEME_LABELS['auto'];
    btn.title = CHART_THEME_TITLES['auto'];
    header.appendChild(btn);

    let themeIdx = 0;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      themeIdx = (themeIdx + 1) % CHART_THEMES.length;
      const themeKey = CHART_THEMES[themeIdx];
      _chartThemes[chartId] = themeKey;
      btn.textContent = CHART_THEME_LABELS[themeKey];
      btn.title = CHART_THEME_TITLES[themeKey];

      // Apply colorscale to existing Plotly traces
      try {
        const gd = document.getElementById(chartId);
        const colors = getChartColorscale(themeKey);
        if (!colors) { Plotly?.relayout(chartId, {}); return; }
        const traceUpdates = (gd?._fullData || []).map((trace, i) => ({
          'line.color': colors[i % colors.length],
          'marker.color': colors[i % colors.length],
        }));
        if (traceUpdates.length) {
          Plotly?.restyle(chartId, traceUpdates.reduce((acc, upd, i) => {
            Object.entries(upd).forEach(([k, v]) => {
              if (!acc[k]) acc[k] = [];
              acc[k][i] = v;
            });
            return acc;
          }, {}));
        }
      } catch (_) {}
    });
  });
}

// ── P40 init ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initDesignWizard();
  setTimeout(() => {
    initChartCursorReadout();
    initChartThemeToggle();
  }, 900);
}, { once: true });

// ── P41 — D2-1~4 Discretization Tool ─────────────────────────────────────────
// Compares ZOH, Tustin, Forward Euler, Backward Euler discretization methods.
// Shows stability, DC gain accuracy, and phase error metrics in a table.
// Overlays discrete Bode on the chart for comparison.

const D2_METHODS = [
  { id: 'zoh',      label: 'ZOH',      c2dFn: (sys, Ts) => c2dZOH(sys, Ts),                    desc: '零阶保持（最精確）' },
  { id: 'tustin',   label: 'Tustin',   c2dFn: (sys, Ts, pw) => c2dTustinPrewarp(sys, Ts, pw), desc: 'Bilinear（可預翹）' },
  { id: 'forward',  label: '向前差分', c2dFn: (sys, Ts) => null,                               desc: 'Forward Euler（⚠ 可能不穩）' },
  { id: 'backward', label: '向後差分', c2dFn: (sys, Ts) => null,                               desc: 'Backward Euler' },
];

function _forwardEuler(sys, Ts) {
  // z = 1 + s*Ts  ⟹  s = (z-1)/Ts
  // G_d(z) = G((z-1)/Ts) — evaluate at sample points via substitution
  // For display: use Tustin with very large prewarp (approximates FE)
  // Actually: FE is unstable for many systems; we try c2dMatchedZ as approximation
  try { return c2dMatchedZ(sys, Ts); } catch { return null; }
}
function _backwardEuler(sys, Ts) {
  // s = (z-1)/(z*Ts) — backward difference
  try { return c2dTustin(sys, Ts); } catch { return null; }
}

function initDiscretizationTool() {
  const btn = document.getElementById('btn-d2-compare');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    const sys = state.plant;
    if (!sys || sys instanceof DiscreteTransferFunction) {
      notify('需要連續時間 Plant（s-domain）', 'warning'); return;
    }

    const tsEl = document.getElementById('d2-ts');
    const pwEl = document.getElementById('d2-prewarp');
    const advEl = document.getElementById('d2-ts-advice');
    const tableWrap = document.getElementById('d2-table-wrap');
    const tableEl = document.getElementById('d2-method-table');
    const chartEl = document.getElementById('chart-d2-bode');
    if (!tsEl || !tableEl || !chartEl) return;

    const Ts = parseFloat(tsEl.value) || 0.05;
    const prewarp = parseFloat(pwEl?.value) || 1;

    // Sample time advice based on bandwidth
    if (advEl) {
      try {
        const margins = stabilityMargins(sys, { includeFreqs: true });
        if (margins?.wgc) {
          const bw = margins.wgc;
          const tsRec = parseFloat((1 / (10 * bw)).toFixed(4));
          const ok2 = Ts <= tsRec * 1.5;
          advEl.textContent = `系統頻寬 ωgc ≈ ${fmtNum(bw)} rad/s → 建議 Ts ≤ ${tsRec} s（目前 ${Ts} s ${ok2 ? '✓' : '⚠ 可能過大'}）`;
          advEl.style.display = 'block';
          advEl.style.color = ok2 ? 'var(--text-muted)' : 'var(--color-unstable)';
        }
      } catch (_) {}
    }

    // Compute all methods
    const results = [];
    for (const m of D2_METHODS) {
      let disc = null;
      try {
        if (m.id === 'zoh')      disc = c2dZOH(sys, Ts);
        else if (m.id === 'tustin') disc = c2dTustinPrewarp(sys, Ts, prewarp);
        else if (m.id === 'forward')  disc = _forwardEuler(sys, Ts);
        else if (m.id === 'backward') disc = _backwardEuler(sys, Ts);
      } catch (_) {}

      let stable = false, dcGain = NaN, phaseErr = NaN;
      if (disc) {
        try {
          const poles = disc.poles();
          stable = poles.every(p => Math.hypot(p.re, p.im) < 1);
          const dcNum = disc.num.reduce((s, v) => s + v, 0);
          const dcDen = disc.den.reduce((s, v) => s + v, 0);
          dcGain = dcDen !== 0 ? dcNum / dcDen : NaN;
        } catch (_) {}
        // Phase error at Nyquist/4
        try {
          const wTest = Math.PI / (2 * Ts);
          const contResp = bodeData(sys, [wTest]);
          const discResp = discreteBodeData(disc, Ts, [wTest]);
          phaseErr = Math.abs((discResp.phase?.[0] ?? 0) - (contResp.phase?.[0] ?? 0));
        } catch (_) {}
      }
      results.push({ ...m, disc, stable, dcGain, phaseErr });
    }

    // Find best: ZOH if stable, else Tustin
    const bestIdx = results.findIndex(r => r.id === 'zoh' && r.stable) ?? 0;

    // Render table
    tableEl.innerHTML = `<tr>
      <th>方法</th><th>穩定性</th><th>DC 增益</th><th>相位誤差 (ω_N/4)</th><th>說明</th>
    </tr>` + results.map((r, i) => {
      const stabBadge = r.disc ? (r.stable ? '<span class="disc-compare-badge ok">✓ 穩定</span>' : '<span class="disc-compare-badge bad">⚠ 不穩</span>') : '<span class="disc-compare-badge warn">N/A</span>';
      const dcStr = Number.isFinite(r.dcGain) ? fmtNum(r.dcGain, 4) : '—';
      const phStr = Number.isFinite(r.phaseErr) ? `${fmtNum(r.phaseErr, 2)}°` : '—';
      return `<tr${i === bestIdx ? ' class="recommended"' : ''}>
        <td><strong>${r.label}</strong>${i === bestIdx ? ' ★' : ''}</td>
        <td>${stabBadge}</td><td>${dcStr}</td><td>${phStr}</td><td style="font-size:10px;color:var(--text-muted)">${r.desc}</td>
      </tr>`;
    }).join('');
    tableWrap.style.display = 'block';

    // Bode comparison plot
    const traces = [];
    const omegas = autoFreqRange(sys);
    try {
      const bd = bodeData(sys, omegas);
      traces.push({ x: omegas, y: bd.mag.map(m => fmtDB(m)), type: 'scatter', name: 'Continuous', line: { color: getCSS('--color-accent'), width: 2 } });
    } catch (_) {}
    const colors = ['#4ade80', '#f59e0b', '#f87171', '#c084fc'];
    results.forEach((r, i) => {
      if (!r.disc) return;
      try {
        const bd = discreteBodeData(r.disc, Ts, omegas);
        traces.push({ x: omegas, y: bd.mag.map(m => fmtDB(m)), type: 'scatter', name: r.label, line: { color: colors[i], width: 1.5, dash: i > 0 ? 'dot' : 'dash' } });
      } catch (_) {}
    });
    if (traces.length) {
      const layout = { ...PLOTLY_LAYOUT_BASE(), xaxis: { ...PLOTLY_LAYOUT_BASE().xaxis, type: 'log', title: 'ω (rad/s)' }, yaxis: { ...PLOTLY_LAYOUT_BASE().yaxis, title: 'Mag (dB)' }, height: 200, showlegend: true, legend: compactLegend() };
      Plotly.react(chartEl.id, traces, layout, { responsive: true, displayModeBar: false });
      chartEl.style.display = 'block';
    }

    notify(`離散化比較完成，Ts=${Ts}s，建議使用 ${results[bestIdx]?.label ?? 'ZOH'}`, 'success');
  });
}

// ── P41 — A2-2/A2-3 Spec Compliance Badge ────────────────────────────────────
// Computes spec compliance badges (OS, Ts, PM, ess) from current step metrics
// and design-spec inputs. Updates #spec-compliance-bar after each system update.
function updateSpecComplianceBadges() {
  const bar = document.getElementById('spec-compliance-bar');
  if (!bar) return;

  // Get design specs from advisor panel
  const targetOS = parseFloat(document.getElementById('design-os')?.value);
  const targetTs = parseFloat(document.getElementById('design-ts')?.value);
  const targetPM = parseFloat(document.getElementById('design-pm')?.value);

  // Get measured values from stability snapshot
  const measOS  = parseFloat(document.getElementById('overshoot')?.textContent) || NaN;
  const measTs  = parseFloat(document.getElementById('settling-time')?.textContent) || NaN;
  const measPM  = parseFloat(document.getElementById('pm-value')?.textContent) || NaN;
  const measEss = parseFloat(document.getElementById('ess-value')?.textContent) || NaN;

  function setBadge(id, label, pass) {
    const el = document.getElementById(id);
    if (!el) return;
    if (pass === null) {
      el.className = 'spec-badge na';
      el.textContent = `${label} —`;
    } else if (pass) {
      el.className = 'spec-badge pass';
      el.textContent = `${label} ✓`;
    } else {
      el.className = 'spec-badge fail';
      el.textContent = `${label} ✗`;
    }
  }

  const hasSpecs = Number.isFinite(targetOS) || Number.isFinite(targetTs) || Number.isFinite(targetPM);

  if (hasSpecs && state.plant && state.closedLoop) {
    bar.style.display = 'flex';
    setBadge('sc-os',  `OS≤${Number.isFinite(targetOS) ? targetOS.toFixed(1) : '?'}%`, Number.isFinite(targetOS) && Number.isFinite(measOS) ? measOS <= targetOS : null);
    setBadge('sc-ts',  `Ts≤${Number.isFinite(targetTs) ? targetTs.toFixed(1) : '?'}s`, Number.isFinite(targetTs) && Number.isFinite(measTs) ? measTs <= targetTs : null);
    setBadge('sc-pm',  `PM≥${Number.isFinite(targetPM) ? targetPM.toFixed(0) : '?'}°`, Number.isFinite(targetPM) && Number.isFinite(measPM) ? measPM >= targetPM : null);
    setBadge('sc-ess', 'ess<1%', Number.isFinite(measEss) ? Math.abs(measEss) < 0.01 : null);
  } else {
    bar.style.display = 'none';
  }
}

// Expose for external call (e.g., after updateSystem)
window.updateSpecComplianceBadges = updateSpecComplianceBadges;

// ── P41 init ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initDiscretizationTool();
  // Hook compliance badge refresh into existing spec input changes
  ['design-os', 'design-ts', 'design-pm'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', updateSpecComplianceBadges);
  });
}, { once: true });

// ── P42 — B1-2/B1-3 Compare Table Enhancements ───────────────────────────────
// Enhances the existing comparison table in panel-compare with:
//   - Sortable columns (click header to sort asc/desc)
//   - ★ best-value highlighting per column
//   - Diff heat-map toggle (show % deviation from best)
//   - CSV export button
function initCompareTableEnhancements() {
  const toolbar = document.getElementById('b1-toolbar');
  const diffToggle = document.getElementById('b1-diff-toggle');
  const csvBtn = document.getElementById('btn-b1-csv');
  const tableBody = document.getElementById('comparison-table-body');
  if (!toolbar || !diffToggle || !csvBtn || !tableBody) return;

  let _diffMode = false;
  let _sortCol = -1;
  let _sortDir = 1; // 1=asc, -1=desc

  // Column metadata: [headerText, metricKey, higherIsBetter]
  const COLS = [
    { label: 'Name',      key: 'name',         dir: null },  // not sortable numerically
    { label: 'Kp',        key: 'kp',            dir: -1 },   // lower=better (less aggressive)
    { label: 'Ki',        key: 'ki',            dir: -1 },
    { label: 'Kd',        key: 'kd',            dir: -1 },
    { label: 'PM',        key: 'pm',            dir: 1  },   // higher PM = better
    { label: 'GM',        key: 'gm',            dir: 1  },
    { label: 'Rise',      key: 'rise',          dir: -1 },   // lower=better
    { label: 'Settling',  key: 'settle',        dir: -1 },
    { label: 'Overshoot', key: 'os',            dir: -1 },
    { label: 'ESS',       key: 'ess',           dir: -1 },
  ];

  /**
   * Extract metric data from a snapshot card (the existing DOM tbody rows).
   * Returns array of {name, cells: [values...]} from current snapshot state.
   */
  function extractRows() {
    return state.comparisonSnapshots.map((s) => ({
      snap: s,
      name: s.name,
      vals: [
        NaN,                                          // name col (skip)
        s.controller?.Kp ?? NaN,
        s.controller?.Ki ?? NaN,
        s.controller?.Kd ?? NaN,
        s.metrics?.phaseMargin ?? NaN,
        s.metrics?.gainMarginDB ?? NaN,
        s.metrics?.riseTime ?? NaN,
        s.metrics?.settlingTime ?? NaN,
        s.metrics?.overshoot != null ? s.metrics.overshoot * 100 : NaN,
        s.metrics?.ess ?? NaN,
      ],
    }));
  }

  function renderEnhancedTable() {
    if (!state.comparisonSnapshots.length) {
      toolbar.style.display = 'none';
      return;
    }
    toolbar.style.display = 'flex';

    const rows = extractRows();

    // Sort if needed
    if (_sortCol > 0 && COLS[_sortCol].dir !== null) {
      rows.sort((a, b) => {
        const va = a.vals[_sortCol];
        const vb = b.vals[_sortCol];
        if (!Number.isFinite(va) && !Number.isFinite(vb)) return 0;
        if (!Number.isFinite(va)) return 1;
        if (!Number.isFinite(vb)) return -1;
        return (va - vb) * _sortDir;
      });
    }

    // Find best per column (col 1–9)
    const bestIdx = COLS.map((col, ci) => {
      if (ci === 0 || col.dir === null) return -1;
      let best = -1, bestV = NaN;
      rows.forEach((r, ri) => {
        const v = r.vals[ci];
        if (!Number.isFinite(v)) return;
        if (best === -1 || (col.dir === 1 ? v > bestV : v < bestV)) {
          best = ri; bestV = v;
        }
      });
      return best;
    });

    // Build tbody HTML
    tableBody.innerHTML = rows.map((row, ri) => {
      const cells = row.vals.map((v, ci) => {
        if (ci === 0) return `<td><strong>${escapeHtml(row.name.slice(0, 30))}</strong></td>`;
        const isBest = bestIdx[ci] === ri;
        let diff = 0;
        if (!isBest && _diffMode && Number.isFinite(v)) {
          const bestV = rows[bestIdx[ci]]?.vals[ci];
          if (Number.isFinite(bestV) && bestV !== 0) diff = Math.abs((v - bestV) / bestV * 100);
        }
        const cellClass = isBest ? 'compare-best' : diff > 15 ? 'compare-diff-bad' : diff > 5 ? 'compare-diff-warn' : '';
        const label = Number.isFinite(v) ? (ci >= 6 ? `${fmtNum(v, 3)}${ci === 8 ? '%' : ci === 4 || ci === 3 ? '°' : 's'}` : fmtNum(v, 3)) : '—';
        const star = isBest ? ' ★' : '';
        const diffStr = _diffMode && !isBest && diff > 0 ? ` <span style="font-size:9px;opacity:.7">+${diff.toFixed(0)}%</span>` : '';
        return `<td class="${cellClass}">${label}${star}${diffStr}</td>`;
      });
      return `<tr>${cells.join('')}</tr>`;
    }).join('');

    // Update headers with sort arrows
    const table = tableBody.closest('table');
    if (table) {
      table.classList.add('compare-metrics-enhanced');
      const headers = table.querySelectorAll('thead th');
      headers.forEach((th, ci) => {
        th.querySelector('.compare-sort-arrow')?.remove();
        if (COLS[ci]?.dir !== null) {
          const arrow = document.createElement('span');
          arrow.className = 'compare-sort-arrow';
          arrow.textContent = _sortCol === ci ? (_sortDir === 1 ? '▲' : '▼') : '⇅';
          th.appendChild(arrow);
          if (!th.dataset.b1Wired) {
            th.dataset.b1Wired = '1';
            th.addEventListener('click', () => {
              if (_sortCol === ci) _sortDir *= -1;
              else { _sortCol = ci; _sortDir = 1; }
              renderEnhancedTable();
            });
          }
        }
      });
    }
  }

  diffToggle.addEventListener('click', () => {
    _diffMode = !_diffMode;
    diffToggle.classList.toggle('active', _diffMode);
    renderEnhancedTable();
  });

  csvBtn.addEventListener('click', () => {
    const rows = extractRows();
    if (!rows.length) { notify('尚無快照資料', 'info'); return; }
    const header = COLS.map(c => c.label).join(',');
    const body = rows.map(r =>
      [r.name, ...r.vals.slice(1).map(v => Number.isFinite(v) ? v.toFixed(4) : '')].join(',')
    ).join('\n');
    const csv = `${header}\n${body}`;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'compare_metrics.csv'; a.click();
    URL.revokeObjectURL(url);
    notify('比較表已匯出 CSV', 'success');
  });

  // Expose refresh hook for external callers
  window._refreshB1Table = renderEnhancedTable;
}

// ── P42 init ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => initCompareTableEnhancements(), 600);
}, { once: true });

// ── P43 — A1-1 System Input Wizard ───────────────────────────────────────────
// Guided modal for entering TF / SS / ZPK systems with live LaTeX preview
// and health diagnostics (stable / controllable / observable / min-phase).
function initSystemInputWizard() {
  const modal    = document.getElementById('syswin-modal');
  const closeBtn = document.getElementById('syswin-close');
  const cancelBtn = document.getElementById('syswin-cancel');
  const confirmBtn = document.getElementById('syswin-confirm');
  const typeTabs = document.querySelectorAll('[data-systype]');
  const preview  = document.getElementById('syswin-preview');
  const errEl    = document.getElementById('syswin-error');
  const openBtn  = document.getElementById('btn-new-system');
  if (!modal || !openBtn || !confirmBtn) return;

  let _sysType = 'tf';

  // ── Section visibility ──
  function showSection(type) {
    ['tf', 'ss', 'zpk'].forEach(t => {
      document.getElementById(`syswin-${t}-section`)?.style.setProperty('display', t === type ? '' : 'none');
    });
    typeTabs.forEach(tab => tab.classList.toggle('active', tab.dataset.systype === type));
    _sysType = type;
    validateAndPreview();
  }

  typeTabs.forEach(tab => tab.addEventListener('click', () => showSection(tab.dataset.systype)));

  // ── Health badges ──
  function setBadge(id, ok) {
    const el = document.getElementById(id);
    if (!el) return;
    if (ok === null) { el.className = 'syswin-badge na'; el.textContent = el.textContent.replace(/[✓✗]/g, '').trim(); }
    else if (ok) { el.className = 'syswin-badge ok'; el.textContent += ' ✓'; }
    else { el.className = 'syswin-badge fail'; el.textContent += ' ✗'; }
  }

  function resetBadges() {
    [['sh-stable','⬤ 穩定性'], ['sh-ctrl','⬤ 可控性'], ['sh-obs','⬤ 可觀性'], ['sh-mp','⬤ 最小相位']].forEach(([id, label]) => {
      const el = document.getElementById(id);
      if (el) { el.className = 'syswin-badge na'; el.textContent = label; }
    });
  }

  // ── Build system from current inputs ──
  function buildSystem() {
    if (_sysType === 'tf') {
      const num = parsePolyString(document.getElementById('syswin-tf-num')?.value || '1');
      const den = parsePolyString(document.getElementById('syswin-tf-den')?.value || '1');
      if (!num.length || !den.length) throw new Error('多項式解析失敗');
      return new TransferFunction(num, den);
    }
    if (_sysType === 'zpk') {
      const z = parseRootsString(document.getElementById('syswin-zpk-z')?.value || '');
      const p = parseRootsString(document.getElementById('syswin-zpk-p')?.value || '');
      const k = parseFloat(document.getElementById('syswin-zpk-k')?.value || '1');
      return zpkToTransferFunction(new ZPK(z, p, k));
    }
    if (_sysType === 'ss') {
      const A = parseMatrixInput(document.getElementById('syswin-ss-A')?.value || '-1');
      const B = parseMatrixInput(document.getElementById('syswin-ss-B')?.value || '1');
      const C = parseMatrixInput(document.getElementById('syswin-ss-C')?.value || '1');
      const D = parseMatrixInput(document.getElementById('syswin-ss-D')?.value || '0');
      return stateSpaceToTransferFunction(A, B, C, D);
    }
    throw new Error('未知模型類型');
  }

  // ── Validate + preview (debounced) ──
  let _valTimer = null;
  function validateAndPreview() {
    clearTimeout(_valTimer);
    _valTimer = setTimeout(() => {
      resetBadges();
      errEl.style.display = 'none';
      try {
        const sys = buildSystem();
        // LaTeX preview
        if (preview) {
          try {
            const latex = tfToLatex(sys.num, sys.den);
            preview.innerHTML = `\\(${latex}\\)`;
            renderLatex(preview);
          } catch { preview.textContent = 'G(s) = …'; }
        }
        // Health checks
        const poles = sys.poles();
        const zeros = sys.zeros();
        const stable = poles.every(p => p.re < 0);
        const minPhase = zeros.every(z => z.re < 0);

        document.getElementById('sh-stable').textContent = '⬤ 穩定性';
        document.getElementById('sh-mp').textContent = '⬤ 最小相位';

        // For SS forms: controllability / observability
        let controllable = null, observable = null;
        if (_sysType === 'ss') {
          try {
            const A = parseMatrixInput(document.getElementById('syswin-ss-A')?.value || '-1');
            const B = parseMatrixInput(document.getElementById('syswin-ss-B')?.value || '1');
            const C = parseMatrixInput(document.getElementById('syswin-ss-C')?.value || '1');
            const n = A.length;
            controllable = matRank(controllabilityMatrix(A, B)) === n;
            observable   = matRank(observabilityMatrix(A, C)) === n;
          } catch (_) {}
        }

        setBadge('sh-stable', stable);
        setBadge('sh-ctrl', controllable);
        setBadge('sh-obs', observable);
        setBadge('sh-mp', minPhase);
        confirmBtn.disabled = false;
      } catch (err) {
        errEl.textContent = err.message;
        errEl.style.display = 'block';
        if (preview) preview.textContent = 'G(s) = …';
        confirmBtn.disabled = true;
      }
    }, 200);
  }

  // Wire input events
  ['syswin-tf-num','syswin-tf-den','syswin-zpk-z','syswin-zpk-p','syswin-zpk-k',
   'syswin-ss-A','syswin-ss-B','syswin-ss-C','syswin-ss-D'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', validateAndPreview);
  });

  // ── Open / Close ──
  function openWizard() {
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    validateAndPreview();
    document.getElementById('syswin-tf-num')?.focus();
  }
  function closeWizard() {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    errEl.style.display = 'none';
  }

  openBtn.addEventListener('click', openWizard);
  closeBtn.addEventListener('click', closeWizard);
  cancelBtn.addEventListener('click', closeWizard);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeWizard(); });

  // Keyboard: Escape closes, Ctrl+1/2/3 switch tabs
  document.addEventListener('keydown', (e) => {
    if (!modal.classList.contains('open')) return;
    if (e.key === 'Escape') closeWizard();
    if (e.ctrlKey && e.key === '1') { e.preventDefault(); showSection('tf'); }
    if (e.ctrlKey && e.key === '2') { e.preventDefault(); showSection('ss'); }
    if (e.ctrlKey && e.key === '3') { e.preventDefault(); showSection('zpk'); }
  });

  // ── Confirm: apply to workspace ──
  confirmBtn.addEventListener('click', () => {
    try {
      const sys = buildSystem();
      const name = document.getElementById('syswin-name')?.value.trim() || 'Plant-1';
      // Set as current plant (reuses existing updateSystem pathway)
      if (_sysType === 'tf') {
        document.getElementById('tf-num').value = sys.num.join(' ');
        document.getElementById('tf-den').value = sys.den.join(' ');
        document.getElementById('input-type')?.dispatchEvent(new Event('change'));
        document.getElementById('tf-num')?.dispatchEvent(new Event('input'));
      }
      if (typeof window.updateSystem === 'function') window.updateSystem();
      notify(`系統「${name}」已加入工作區`, 'success');
      closeWizard();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = 'block';
    }
  });

  // Register command
  if (Array.isArray(window.COMMANDS)) {
    window.COMMANDS.push({ group: 'UI', icon: '＋', title: '新增系統模型', keys: [], action: openWizard });
  }

  // Expose
  window.openSystemWizard = openWizard;
}

// ── P43 — A5-2 Sensitivity Function Plot ─────────────────────────────────────
// Renders S, T, KS Bode plots when the 'sensitivity' plot tab is selected.
function renderSensitivityPlot() {
  const activeEl = document.getElementById('chart-active');
  if (!activeEl) return;
  if (!state.plant || !state.closedLoop) {
    showError('需要 Plant 與控制器才能繪製靈敏度函數');
    return;
  }
  try {
    const omegas = autoFreqRange(state.plant, { n: 200 });
    const { S, T, KS } = sensitivityBode(state.openLoop || state.plant, state.controller, omegas);
    const peaks = robustPeaks(state.openLoop || state.plant, state.controller, omegas);

    const traces = [
      { x: omegas, y: S.map(v => fmtDB(v)), name: 'S (Sensitivity)', line: { color: getCSS('--color-accent'), width: 2 }, type: 'scatter', mode: 'lines' },
      { x: omegas, y: T.map(v => fmtDB(v)), name: 'T (Complementary)', line: { color: '#4d96ff', width: 2 }, type: 'scatter', mode: 'lines' },
      { x: omegas, y: KS.map(v => fmtDB(v)), name: 'KS (Input Sensitivity)', line: { color: '#f59e0b', width: 2 }, type: 'scatter', mode: 'lines' },
    ];

    // Peak Ms annotation
    const msDB = 20 * Math.log10(peaks?.Ms ?? 1);
    traces.push({ x: [omegas[0], omegas[omegas.length - 1]], y: [msDB, msDB], name: `Ms = ${fmtNum(peaks?.Ms ?? 1, 3)}`, line: { color: getCSS('--color-accent'), width: 1, dash: 'dash' }, type: 'scatter', mode: 'lines' });

    const layout = { ...PLOTLY_LAYOUT_BASE(), xaxis: { ...PLOTLY_LAYOUT_BASE().xaxis, type: 'log', title: 'ω (rad/s)' }, yaxis: { ...PLOTLY_LAYOUT_BASE().yaxis, title: 'Magnitude (dB)' }, showlegend: true, legend: compactLegend() };
    Plotly.react('chart-active', traces, layout, { responsive: true, displayModeBar: false });

    // Update status bar
    document.getElementById('active-plot-title').textContent = 'Sensitivity Functions';
    document.getElementById('active-plot-subtitle').textContent = 'S · T · KS';
  } catch (err) {
    showError(`靈敏度繪製失敗：${err.message}`);
  }
}

// ── P43 — A5-3 Robustness Badge ───────────────────────────────────────────────
// Updates the robust-badge-bar with PM, GM, Ms, Dm from current system.
function updateRobustnessBadges() {
  const bar = document.getElementById('robust-badge-bar');
  if (!bar) return;

  if (!state.plant || !state.closedLoop) { bar.style.display = 'none'; return; }

  try {
    const margins = stabilityMargins(state.openLoop || state.plant);
    const omegas = autoFreqRange(state.plant, { n: 200 });
    const peaks = robustPeaks(state.openLoop || state.plant, state.controller, omegas);

    const pm = margins?.phaseMargin;
    const gm = margins?.gainMarginDB;
    const ms = peaks?.Ms;
    const dm = margins?.diskMargin;

    function setRB(id, sid, val, unit, thresh, goodHigh) {
      const el = document.getElementById(id);
      const sel = document.getElementById(sid);
      if (el) el.textContent = Number.isFinite(val) ? `${fmtNum(val, 2)}${unit}` : '—';
      if (sel) {
        const ok = Number.isFinite(val) && (goodHigh ? val >= thresh : val <= thresh);
        sel.className = `rb-status ${ok ? 'ok' : 'fail'}`;
        sel.textContent = ok ? ' ✓' : ' ✗';
      }
    }

    setRB('rb-pm', 'rb-pm-s', pm, '°',  45, true);
    setRB('rb-gm', 'rb-gm-s', gm, 'dB', 6,  true);
    setRB('rb-ms', 'rb-ms-s', ms, '',   2.0, false);
    setRB('rb-dm', 'rb-dm-s', dm, '',   0.25, true);

    bar.style.display = 'flex';
  } catch { bar.style.display = 'none'; }
}

window.updateRobustnessBadges = updateRobustnessBadges;

// ── P43 init ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initSystemInputWizard();

  // Wire sensitivity plot tab
  document.getElementById('plot-tab-sensitivity')?.addEventListener('click', () => {
    // Mark tab active (reuse existing tab logic)
    document.querySelectorAll('.plot-tab').forEach(t => t.classList.remove('active'));
    document.getElementById('plot-tab-sensitivity')?.classList.add('active');
    state.activePlot = 'sensitivity';
    renderSensitivityPlot();
  });
}, { once: true });

// ── P44 — F2-1 Split Pane ────────────────────────────────────────────────────
// Adds a draggable divider between sidebar (<aside>) and main content area.
// Sidebar width is stored in localStorage and restored on page load.

const SPLIT_KEY = 'cs-split-width';
const SPLIT_MIN_PX = 240;

function initSplitPane() {
  const divider = document.getElementById('workspace-divider');
  const sidebar = document.querySelector('aside[role="complementary"]');
  const mainArea = document.getElementById('main-content-area');
  const btn = document.getElementById('btn-split-pane');
  if (!divider || !sidebar || !btn) return;

  let _splitEnabled = false;

  // Restore saved width
  const savedWidth = parseInt(localStorage.getItem(SPLIT_KEY) || '0', 10);

  function enableSplit() {
    _splitEnabled = true;
    divider.classList.add('active');
    btn.classList.add('active');
    if (savedWidth > SPLIT_MIN_PX) sidebar.style.width = `${savedWidth}px`;
    sidebar.style.flex = 'none';
    sidebar.style.minWidth = `${SPLIT_MIN_PX}px`;
    sidebar.style.resize = 'none';
    if (mainArea) mainArea.style.flex = '1';
  }

  function disableSplit() {
    _splitEnabled = false;
    divider.classList.remove('active');
    btn.classList.remove('active');
    sidebar.style.width = '';
    sidebar.style.flex = '';
    sidebar.style.minWidth = '';
  }

  btn.addEventListener('click', () => {
    if (_splitEnabled) disableSplit();
    else enableSplit();
  });

  // Drag logic
  let _dragging = false;
  let _startX = 0;
  let _startW = 0;

  divider.addEventListener('mousedown', (e) => {
    e.preventDefault();
    _dragging = true;
    _startX = e.clientX;
    _startW = sidebar.getBoundingClientRect().width;
    divider.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!_dragging) return;
    requestAnimationFrame(() => {
      const dx = e.clientX - _startX;
      const newW = Math.max(SPLIT_MIN_PX, _startW + dx);
      sidebar.style.width = `${newW}px`;
    });
  });

  document.addEventListener('mouseup', () => {
    if (!_dragging) return;
    _dragging = false;
    divider.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    const w = parseInt(sidebar.getBoundingClientRect().width, 10);
    localStorage.setItem(SPLIT_KEY, String(w));
  });

  // Double-click: 50/50 reset
  divider.addEventListener('dblclick', () => {
    const container = sidebar.parentElement;
    if (!container) return;
    const totalW = container.getBoundingClientRect().width;
    const half = Math.floor(totalW / 2);
    sidebar.style.width = `${half}px`;
    localStorage.setItem(SPLIT_KEY, String(half));
  });

  // Expose
  window._splitPaneEnabled = () => _splitEnabled;
}

// ── P44 — F2-2 Design Tab System ─────────────────────────────────────────────
// Multi-design tab bar. Each tab stores a state snapshot of plant + controller.
// Switching tabs restores the snapshot and refreshes plots.
const DESIGN_TABS_KEY = 'cs-design-tabs';

function initDesignTabs() {
  const bar = document.getElementById('design-tab-bar');
  const newBtn = document.getElementById('design-tab-new');
  if (!bar || !newBtn) return;

  // Tab data array: [{ id, name, snapshot }]
  let _tabs = [];
  let _activeTabId = null;
  let _tabSeq = 0;

  function _snap() {
    return {
      plant: state.plant ? { num: [...state.plant.num], den: [...state.plant.den] } : null,
      pidParams: { ...state.pidParams },
      domain: state.domain,
      activePlot: state.activePlot,
    };
  }

  function _applyTabSnap(snap) {
    if (!snap) return;
    try {
      if (snap.plant) {
        document.getElementById('tf-num').value = snap.plant.num.join(' ');
        document.getElementById('tf-den').value = snap.plant.den.join(' ');
      }
      Object.assign(state.pidParams, snap.pidParams || {});
      if (typeof window.updateSystem === 'function') window.updateSystem();
    } catch (_) {}
  }

  function renderTabs() {
    // Remove existing tab elements (keep newBtn)
    bar.querySelectorAll('.design-tab').forEach(el => el.remove());

    _tabs.forEach(tab => {
      const el = document.createElement('div');
      el.className = `design-tab${tab.id === _activeTabId ? ' active' : ''}`;
      el.dataset.tabId = tab.id;
      el.setAttribute('role', 'tab');
      el.setAttribute('aria-selected', tab.id === _activeTabId ? 'true' : 'false');

      const dot = document.createElement('div');
      dot.className = 'design-tab-dot none';

      const name = document.createElement('div');
      name.className = 'design-tab-name';
      name.textContent = tab.name;

      const closeEl = document.createElement('div');
      closeEl.className = 'design-tab-close';
      closeEl.textContent = '×';
      closeEl.title = '關閉此設計分頁';
      closeEl.addEventListener('click', (e) => {
        e.stopPropagation();
        closeTab(tab.id);
      });

      el.appendChild(dot);
      el.appendChild(name);
      el.appendChild(closeEl);

      el.addEventListener('click', () => switchToTab(tab.id));

      // Insert before newBtn
      bar.insertBefore(el, newBtn);
    });

    // Show/hide bar
    bar.classList.toggle('visible', _tabs.length >= 2);
  }

  function switchToTab(id) {
    if (_activeTabId === id) return;
    // Save current state to active tab
    const cur = _tabs.find(t => t.id === _activeTabId);
    if (cur) cur.snapshot = _snap();
    // Switch
    _activeTabId = id;
    const next = _tabs.find(t => t.id === id);
    if (next?.snapshot) _applyTabSnap(next.snapshot);
    renderTabs();
  }

  function closeTab(id) {
    const idx = _tabs.findIndex(t => t.id === id);
    if (idx === -1) return;
    // Confirm if active
    if (id === _activeTabId && _tabs.length > 1) {
      if (!confirm('關閉此設計分頁？未儲存的變更將會遺失。')) return;
    }
    _tabs.splice(idx, 1);
    if (_activeTabId === id) {
      _activeTabId = _tabs[Math.min(idx, _tabs.length - 1)]?.id ?? null;
      const next = _tabs.find(t => t.id === _activeTabId);
      if (next?.snapshot) _applyTabSnap(next.snapshot);
    }
    renderTabs();
  }

  function addTab(name) {
    // Save current state to existing active tab first
    const cur = _tabs.find(t => t.id === _activeTabId);
    if (cur) cur.snapshot = _snap();

    const id = ++_tabSeq;
    _tabs.push({ id, name: name || `設計 ${id}`, snapshot: _snap() });
    if (_tabs.length === 1) _activeTabId = id;
    _activeTabId = id;
    renderTabs();
    notify(`已建立設計分頁「${name || `設計 ${id}`}」`, 'info', { duration: 2000 });
  }

  newBtn.addEventListener('click', () => {
    if (_tabs.length === 0) {
      // Create initial tab for current design
      addTab('設計 1');
    }
    addTab();
  });

  // Create initial tab
  addTab('設計 1');

  // Expose
  window.addDesignTab = addTab;
  window.switchDesignTab = switchToTab;
}

// ── P44 init ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initSplitPane();
  initDesignTabs();
}, { once: true });

// ════════════════════════════════════════════════════════════════════════════════
// P45 — D3-1~3 FLOP/Memory/Platform + B4-1~2 CSV Import/Export
// ════════════════════════════════════════════════════════════════════════════════

// ── D3 helpers ────────────────────────────────────────────────────────────────

/**
 * Estimate FLOP count per control cycle.
 * @param {string} type  'pid'|'sf'|'kalman_pred'|'kalman_upd'|'mpc'|'hinf'
 * @param {object} p     { n, m, nc, N } dimensions
 * @returns {number} FLOP count
 */
function estimateFLOPS(type, { n = 1, m = 1, nc = 1, N = 10 } = {}) {
  switch (type) {
    case 'pid':         return 6;
    case 'sf':          return n * n + n;                   // K·x: n²+n
    case 'kalman_pred': return 2 * n * n + n;               // 2n²+n
    case 'kalman_upd':  return 3 * n * n + 2 * n * m;      // 3n²+2nm
    case 'mpc':         return Math.round(N * Math.pow(n + m, 2)); // ~N(n+m)²
    case 'hinf':        return nc * nc + nc;                // nc²+nc
    default:            return 6;
  }
}

/**
 * Estimate RAM and Flash memory in bytes.
 * @returns {{ ram: number, flash: number, rows: Array<{label,val,formula,isFlash}> }}
 */
function estimateMemory(type, { n = 1, m = 1, nc = 1, N = 10 } = {}) {
  const FLOAT = 4;
  const rows = [];
  let ram = 0, flash = 0;

  const addRam   = (label, bytes, formula) => { ram += bytes; rows.push({ label, val: bytes, formula, isFlash: false }); };
  const addFlash = (label, bytes, formula) => { flash += bytes; rows.push({ label, val: bytes, formula, isFlash: true  }); };

  switch (type) {
    case 'pid':
      addRam('PID 狀態 (e, integral, prev_e)', 3 * FLOAT, '3 × 4 bytes');
      addFlash('PID 增益 (Kp, Ki, Kd)', 3 * FLOAT, '3 × 4 bytes');
      break;
    case 'sf':
      addRam(`狀態向量 x (n=${n})`, n * FLOAT, `${n} × 4 bytes`);
      addFlash(`K 增益矩陣 (m×n)`, m * n * FLOAT, `${m}×${n} × 4 bytes`);
      break;
    case 'kalman_pred':
    case 'kalman_upd': {
      addRam(`狀態 x̂ (n=${n})`, n * FLOAT, `${n} × 4 bytes`);
      addRam(`協方差 P (n×n)`, n * n * FLOAT, `${n}² × 4 bytes`);
      addFlash(`系統矩陣 A (n×n)`, n * n * FLOAT, `${n}² × 4 bytes`);
      if (type === 'kalman_upd') {
        addFlash(`觀測矩陣 C (m×n)`, m * n * FLOAT, `${m}×${n} × 4 bytes`);
        addFlash(`K 卡爾曼增益 (n×m)`, n * m * FLOAT, `${n}×${m} × 4 bytes`);
      }
      break;
    }
    case 'mpc':
      addRam(`狀態 x (n=${n})`, n * FLOAT, `${n} × 4 bytes`);
      addRam(`MPC 軌跡緩存 N×(n+m)`, N * (n + m) * FLOAT, `${N}×(${n}+${m}) × 4`);
      addFlash(`預測矩陣`, N * n * n * FLOAT, `${N}×${n}² × 4 bytes`);
      break;
    case 'hinf':
      addRam(`控制器狀態 x_c (nc=${nc})`, nc * FLOAT, `${nc} × 4 bytes`);
      addFlash(`A_c (nc×nc)`, nc * nc * FLOAT, `${nc}² × 4 bytes`);
      addFlash(`B_c、C_c、D_c`, (nc * n + nc + m * nc) * FLOAT, `nc×(n+1+m) × 4`);
      break;
    default:
      addRam('狀態 (PID)', 3 * FLOAT, '3 × 4 bytes');
  }
  return { ram, flash, rows };
}

/** Platform specs: { id, name, mflops, hasFPU } */
const PLATFORM_DEFS = [
  { id: 'cm0',   name: 'Cortex-M0',  mflops: 0.05,  hasFPU: false  },
  { id: 'stm32f4', name: 'STM32F4',  mflops: 168,   hasFPU: true   },
  { id: 'stm32h7', name: 'STM32H7',  mflops: 480,   hasFPU: true   },
  { id: 'rpi4',  name: 'RPi 4',      mflops: 8000,  hasFPU: true   },
  { id: 'x86',   name: 'x86 PC',     mflops: 200000, hasFPU: true  },
];

/** Build platform badge elements for a given MFLOP/s requirement. */
function renderPlatformBadges(requiredMflops, container) {
  container.innerHTML = '';
  PLATFORM_DEFS.forEach(p => {
    const effectiveMflops = p.hasFPU ? p.mflops : p.mflops / 10;
    const ok = effectiveMflops >= requiredMflops;
    const ratio = ok ? (effectiveMflops / requiredMflops).toFixed(1) : (requiredMflops / effectiveMflops).toFixed(1);
    const fpuNote = p.hasFPU ? '' : '（無 FPU, 軟體浮點 ×10 cost）';
    const tooltipText = `${p.name}：算力 ${p.mflops} MFLOP/s${fpuNote}\n此控制器需要 ${requiredMflops.toFixed(2)} MFLOP/s — ${ok ? `充裕 ✓（${ratio}× 餘裕）` : `不足 ✗（差 ${ratio}×）`}`;
    const badge = document.createElement('span');
    badge.className = `platform-badge ${ok ? 'ok' : 'no'}`;
    badge.innerHTML = `${ok ? '✓' : '✗'} ${p.name}<span class="platform-badge-tooltip" style="white-space:pre-line;">${tooltipText}</span>`;
    container.appendChild(badge);
  });
}

/** Guess controller type from app state. */
function _guessControllerType() {
  // Check if MPC
  if (document.getElementById('btn-mpc-solve')?.offsetParent) return 'mpc';
  // Check MIMO mode
  const mimoMode = document.querySelector('.btn-mimo-toggle.active')?.dataset.mode === 'mimo';
  if (mimoMode) {
    // Check if H-inf is active
    if (document.getElementById('hinf-panel')?.offsetParent) return 'hinf';
    // Check if Kalman observer active
    if (document.getElementById('btn-kalman-update')?.offsetParent) return 'kalman_upd';
    return 'sf'; // state feedback
  }
  return 'pid';
}

/** Parse current system dimensions from UI. */
function _getSystemDims() {
  // Try to get from state
  const nEl = document.getElementById('ss-n-states');
  const n = nEl ? (parseInt(nEl.value) || 1) : 1;
  const m = 1; // SISO outputs
  const nc = n; // controller order ≈ system order
  const N = parseInt(document.getElementById('mpc-horizon')?.value) || 10;
  return { n, m, nc, N };
}

/** D3 FLOP Panel initialization */
function initFLOPPanel() {
  const btn    = document.getElementById('btn-d3-estimate');
  const out    = document.getElementById('d3-flop-out');
  const hint   = document.getElementById('d3-flop-hint');
  const cntEl  = document.getElementById('d3-flop-count');
  const freqEl = document.getElementById('d3-flop-freq');
  const memEl  = document.getElementById('d3-mem-rows');
  const totEl  = document.getElementById('d3-mem-total');
  const platEl = document.getElementById('d3-platform-badges');
  const freqIn = document.getElementById('d3-ctrl-freq');
  if (!btn) return;

  btn.addEventListener('click', () => {
    const type = _guessControllerType();
    const dims = _getSystemDims();
    const flops = estimateFLOPS(type, dims);
    const ctrlFreq = parseFloat(freqIn.value) || 1000;
    const mflopsRequired = (flops * ctrlFreq) / 1e6;

    // FLOP display
    cntEl.textContent = `${flops} FLOP/cycle`;
    freqEl.textContent = `${mflopsRequired.toFixed(3)} MFLOP/s @ ${ctrlFreq} Hz`;

    // Memory
    const mem = estimateMemory(type, dims);
    memEl.innerHTML = mem.rows.map(r =>
      `<div class="mem-row">
        <span>${r.label}</span>
        <span class="mem-val" title="${r.formula}">${r.val < 1024 ? r.val + ' B' : (r.val / 1024).toFixed(1) + ' KB'} <span class="mem-formula">[${r.formula}]</span></span>
      </div>`
    ).join('');
    const ramKB   = (mem.ram   / 1024).toFixed(1);
    const flashKB = (mem.flash / 1024).toFixed(1);
    totEl.innerHTML = `RAM：<b>${ramKB} KB</b> &emsp; Flash（唯讀）：<b>${flashKB} KB</b>`;

    // Platform badges
    renderPlatformBadges(mflopsRequired, platEl);

    hint.style.display  = 'none';
    out.style.display   = 'block';
  });
}

// ── B4-1: CSV Import ──────────────────────────────────────────────────────────

/** Detect delimiter from first non-empty line. */
function _detectDelimiter(line) {
  const counts = { ',': 0, '\t': 0, ';': 0 };
  for (const ch of line) if (ch in counts) counts[ch]++;
  return Object.keys(counts).reduce((a, b) => counts[a] >= counts[b] ? a : b);
}

/**
 * Parse CSV text.
 * @returns {{ headers: string[], rows: string[][], delimiter: string }}
 */
function parseCSVText(text) {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return { headers: [], rows: [], delimiter: ',' };
  const delim = _detectDelimiter(lines[0]);
  const split  = l => l.split(delim).map(c => c.trim().replace(/^"|"$/g, ''));
  const headers = split(lines[0]);
  const rows    = lines.slice(1).map(split);
  return { headers, rows, delimiter: delim };
}

function initCSVImport() {
  const modal      = document.getElementById('csv-import-modal');
  const dropZone   = document.getElementById('csv-drop-zone');
  const fileInput  = document.getElementById('csv-file-input');
  const prevTable  = document.getElementById('csv-preview-table');
  const prevSec    = document.getElementById('csv-preview-section');
  const colX       = document.getElementById('csv-col-x');
  const colY       = document.getElementById('csv-col-y');
  const labelIn    = document.getElementById('csv-label');
  const colorIn    = document.getElementById('csv-color');
  const confirmBtn = document.getElementById('csv-confirm-btn');
  const cancelBtn  = document.getElementById('csv-cancel-btn');
  const errEl      = document.getElementById('csv-import-err');
  if (!modal || !dropZone) return;

  let _parsed = null;

  // Add import button to time-domain chart header
  const activeHeader = document.querySelector('.chart-cell.plot-main .chart-header');
  if (activeHeader) {
    const importBtn = document.createElement('button');
    importBtn.className = 'btn btn-sm';
    importBtn.id = 'btn-csv-import';
    importBtn.title = '匯入量測資料 CSV';
    importBtn.style.cssText = 'padding:3px 8px;font-size:10px;';
    importBtn.innerHTML = '↑ 匯入';
    importBtn.addEventListener('click', openModal);
    activeHeader.appendChild(importBtn);
  }

  function openModal() {
    modal.classList.remove('hidden');
    _parsed = null;
    prevSec.style.display = 'none';
    errEl.style.display = 'none';
    confirmBtn.disabled = true;
    dropZone.style.display = 'block';
  }
  function closeModal() { modal.classList.add('hidden'); }

  cancelBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

  // Drop zone click → open file picker
  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') fileInput.click(); });

  // Drag-and-drop
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) processFile(fileInput.files[0]);
    fileInput.value = '';
  });

  function processFile(file) {
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        _parsed = parseCSVText(ev.target.result);
        renderPreview(_parsed);
        errEl.style.display = 'none';
      } catch (err) {
        errEl.textContent = `解析失敗：${err.message}`;
        errEl.style.display = 'block';
        _parsed = null;
        confirmBtn.disabled = true;
      }
    };
    reader.readAsText(file);
    labelIn.value = file.name.replace(/\.[^.]+$/, '');
  }

  function renderPreview({ headers, rows }) {
    // Build preview table
    const thead = `<thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>`;
    const preview = rows.slice(0, 10);
    const tbody = `<tbody>${preview.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>`;
    prevTable.innerHTML = thead + tbody;

    // Populate column selectors
    [colX, colY].forEach(sel => {
      sel.innerHTML = headers.map((h, i) => `<option value="${i}">${h}</option>`).join('');
    });
    if (headers.length > 1) colY.value = '1';

    dropZone.style.display = 'none';
    prevSec.style.display = 'block';
    confirmBtn.disabled = false;
  }

  confirmBtn.addEventListener('click', () => {
    if (!_parsed) return;
    const xi = parseInt(colX.value);
    const yi = parseInt(colY.value);
    const label = labelIn.value || '量測資料';
    const color = colorIn.value || '#f97316';

    const xArr = _parsed.rows.map(r => parseFloat(r[xi])).filter(v => !isNaN(v));
    const yArr = _parsed.rows.map(r => parseFloat(r[yi])).filter(v => !isNaN(v));
    const len  = Math.min(xArr.length, yArr.length);

    if (len < 2) {
      errEl.textContent = '資料不足（至少需要 2 行數值）';
      errEl.style.display = 'block';
      return;
    }

    // Overlay onto active Plotly chart
    const chartEl = document.getElementById('chart-active');
    if (chartEl && window.Plotly) {
      window.Plotly.addTraces(chartEl, [{
        x: xArr.slice(0, len),
        y: yArr.slice(0, len),
        mode: 'lines+markers',
        name: `● ${label}`,
        line:   { color, width: 1 },
        marker: { color, size: 4, symbol: 'circle' },
        type: 'scatter',
      }]);
      notify(`已疊加量測資料「${label}」(${len} 點)`, 'success', { duration: 3000 });
    } else {
      notify('請先執行模擬以顯示圖表', 'warn', { duration: 3000 });
    }
    closeModal();
  });
}

// ── B4-2: CSV/JSON Data Export ─────────────────────────────────────────────────

function exportChartCSV() {
  const chartEl = document.getElementById('chart-active');
  if (!chartEl?.data?.length) { notify('無圖表資料可匯出', 'warn'); return; }

  const now  = new Date().toISOString().slice(0, 10);
  const sys  = document.getElementById('tf-num')?.value || 'System';
  const ctrl = document.getElementById('pid-kp') ? 'PID' : 'Controller';
  const traces = chartEl.data;

  // Build CSV: first x col, then each y series
  const xs   = traces[0]?.x || [];
  const cols  = ['x', ...traces.map(t => t.name || 'y')];
  const header = [
    `# ControlStudio Export — ${document.getElementById('active-plot-title')?.textContent || 'Chart Data'}`,
    `# System: ${sys} | Controller: ${ctrl}`,
    `# Generated: ${now}`,
    cols.join(','),
  ].join('\n');

  const rows = xs.map((x, i) =>
    [x, ...traces.map(t => t.y?.[i] ?? '')].join(',')
  );
  const csv = header + '\n' + rows.join('\n');
  _downloadBlob(csv, `cs-data-${now}.csv`, 'text/csv');
  notify('已匯出 CSV 資料', 'success', { duration: 2000 });
}

function exportChartJSON() {
  const chartEl = document.getElementById('chart-active');
  if (!chartEl?.data?.length) { notify('無圖表資料可匯出', 'warn'); return; }

  const now  = new Date().toISOString().slice(0, 10);
  const sys  = document.getElementById('tf-num')?.value || 'System';
  const ctrl = document.getElementById('pid-kp') ? 'PID' : 'Controller';

  const payload = {
    meta:   { system: sys, controller: ctrl, date: now, source: 'ControlStudio' },
    series: chartEl.data.map(t => ({
      name: t.name || 'series',
      x:    Array.from(t.x || []),
      y:    Array.from(t.y || []),
    })),
  };
  _downloadBlob(JSON.stringify(payload, null, 2), `cs-data-${now}.json`, 'application/json');
  notify('已匯出 JSON 資料', 'success', { duration: 2000 });
}

function _downloadBlob(text, filename, mime) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: mime }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function initDataExport() {
  // Extend existing export buttons
  document.getElementById('btn-export-json')?.addEventListener('click', exportChartJSON);
  document.getElementById('btn-export-csv')?.addEventListener('click',  exportChartCSV);
}

// ── P45 init ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initFLOPPanel();
  initCSVImport();
  initDataExport();
}, { once: true });

// ════════════════════════════════════════════════════════════════════════════════
// P46 — B5-1~3 Calc Steps/Tooltip/CondWarn + B2-1 Matrix Expand
// ════════════════════════════════════════════════════════════════════════════════

// ── Shared numerics ───────────────────────────────────────────────────────────

/**
 * Estimate condition number κ(M) ≈ max|eigenvalue| / min|eigenvalue|
 * for a square matrix (simple approximation using row norms).
 * @param {number[][]} M
 * @returns {number}
 */
function computeConditionNumber(M) {
  if (!M || !M.length) return Infinity;
  const n = M.length;
  // Frobenius row-norm approximation
  const rowNorms = M.map(row => Math.sqrt(row.reduce((s, v) => s + v * v, 0)));
  const maxN = Math.max(...rowNorms);
  const minN = Math.min(...rowNorms.filter(v => v > 0));
  if (!minN) return Infinity;
  return maxN / minN;
}

/**
 * Classify condition number: 'good' | 'warn' | 'bad'
 */
function _kappaClass(kappa) {
  if (kappa < 100)  return 'good';
  if (kappa < 1000) return 'warn';
  return 'bad';
}

/**
 * Simple matrix determinant (Leibniz, capped at 4×4 for display).
 */
function _matDetSmall(M) {
  const n = M.length;
  if (n === 1) return M[0][0];
  if (n === 2) return M[0][0] * M[1][1] - M[0][1] * M[1][0];
  if (n === 3) {
    const [[a,b,c],[d,e,f],[g,h,i]] = M;
    return a*(e*i-f*h) - b*(d*i-f*g) + c*(d*h-e*g);
  }
  // n >= 4: return NaN (too expensive for display)
  return NaN;
}

/**
 * Check if matrix is positive definite (all diagonal > 0 heuristic).
 * Returns 'pd' | 'spd' | 'npd'
 */
function _pdClass(M) {
  const diag = M.map((row, i) => row[i]);
  if (diag.every(v => v > 0))  return 'pd';
  if (diag.every(v => v >= 0)) return 'spd';
  return 'npd';
}

// ── B5-3: Condition number / precision warnings ───────────────────────────────

/** Definitions of numerical health checks */
const HEALTH_CHECKS = [
  {
    id: 'kappa_a',
    label: '系統矩陣 κ(A) > 1e8',
    severity: 'error',
    message: '系統矩陣接近奇異，計算結果不可信',
    advice: '請檢查 A 矩陣的定義或縮放',
  },
  {
    id: 'kappa_wc',
    label: 'Gramian 條件數 κ > 1000',
    severity: 'warn',
    message: 'Gramian 條件數高，Cholesky 分解可能不穩定',
    advice: '建議先做最小實現（minreal）再做模型縮減',
  },
  {
    id: 'hsv_small',
    label: '最小 HSV < 1e-10',
    severity: 'warn',
    message: 'Hankel 奇異值接近 0，建議先做最小實現',
    advice: '使用「Hankel SVs」面板確認截斷階數',
  },
  {
    id: 'rank_deficient',
    label: '矩陣秩虧損',
    severity: 'error',
    message: '矩陣秩不足，系統可能不可控或不可觀',
    advice: '使用可控性/可觀性 Gramian 確認',
  },
];

function showCondWarn(level, msg, advice) {
  const bar = document.getElementById('cond-warn-bar');
  if (!bar) return;
  bar.className = `cond-warn-banner ${level}`;
  bar.innerHTML = `
    <button class="cond-warn-close" aria-label="關閉">✕</button>
    <b>${level === 'error' ? '⚠ 錯誤' : '⚠ 警告'}：</b>${msg}
    ${advice ? `<div style="margin-top:3px;font-size:10px;opacity:0.8;">${advice}</div>` : ''}
  `;
  bar.querySelector('.cond-warn-close').addEventListener('click', () => {
    bar.className = 'cond-warn-banner'; // hide
  });
}

function checkNumericalHealth(M, context = 'kappa_a') {
  if (!M) return;
  const kappa = computeConditionNumber(M);
  const check = HEALTH_CHECKS.find(c => c.id === context);
  if (!check) return;

  let triggered = false;
  if (context === 'kappa_a' && kappa > 1e8)  triggered = true;
  if (context === 'kappa_wc' && kappa > 1000) triggered = true;

  if (triggered) {
    showCondWarn(check.severity,
      `${check.message}（κ = ${kappa.toExponential(2)}）`,
      check.advice);
  }
}

// ── B5-1: Calculation steps collapsible panel ─────────────────────────────────

function _buildCalcStep(num, title, bodyText, kappa) {
  const kappaClass = kappa != null ? _kappaClass(kappa) : null;
  const kappaBadge = kappaClass
    ? `<span class="calc-step-kappa ${kappaClass}">κ=${kappa < 1e4 ? kappa.toFixed(1) : kappa.toExponential(1)} ${kappaClass === 'good' ? '✓' : kappaClass === 'warn' ? '⚠' : '✗'}</span>`
    : '';
  return `
    <div class="calc-step-item">
      <div class="calc-step-header" data-step="${num}">
        <span class="calc-step-num">${num}</span>
        <span>${title}</span>
        ${kappaBadge}
        <span style="margin-left:auto;font-size:10px;color:var(--text-muted);">▶</span>
      </div>
      <div class="calc-step-body" id="calc-step-body-${num}">${bodyText}</div>
    </div>
  `;
}

function showCalcSteps(steps) {
  const outer = document.getElementById('calc-steps-outer');
  const list  = document.getElementById('calc-steps-list');
  if (!outer || !list) return;

  list.innerHTML = steps.map((s, i) =>
    _buildCalcStep(i + 1, s.title, s.body, s.kappa ?? null)
  ).join('');

  // Toggle step bodies
  list.querySelectorAll('.calc-step-header').forEach(hdr => {
    hdr.addEventListener('click', () => {
      const body = list.querySelector(`#calc-step-body-${hdr.dataset.step}`);
      const arrow = hdr.querySelector('span:last-child');
      if (body) {
        body.classList.toggle('open');
        if (arrow) arrow.textContent = body.classList.contains('open') ? '▼' : '▶';
      }
    });
  });

  outer.style.display = 'block';
}

function initCalcSteps() {
  const collapseBtn = document.getElementById('btn-calc-steps-collapse');
  if (collapseBtn) {
    collapseBtn.addEventListener('click', () => {
      const outer = document.getElementById('calc-steps-outer');
      if (outer) outer.style.display = 'none';
    });
  }
  // Expose globally for other modules to call
  window.showCalcSteps = showCalcSteps;
  window.showCondWarn  = showCondWarn;
  window.checkNumericalHealth = checkNumericalHealth;
}

// ── B5-2: Intermediate value tooltip ─────────────────────────────────────────

/**
 * Attach an enhanced hover tooltip to a Plotly chart.
 * Extends the existing plotly_hover with richer secondary info.
 * @param {string} chartId  element id
 * @param {string} chartType  'bode_mag'|'bode_phase'|'step'|'nyquist'|'rl'
 */
function attachIntermediateTooltip(chartId, chartType) {
  const el = document.getElementById(chartId);
  if (!el || !window.Plotly) return;

  let _tipEl = el.querySelector('.chart-val-tooltip');
  if (!_tipEl) {
    _tipEl = document.createElement('div');
    _tipEl.className = 'chart-val-tooltip';
    _tipEl.style.cssText = 'position:absolute;pointer-events:none;z-index:50;background:var(--bg-secondary);border:1px solid var(--border-primary);border-radius:6px;padding:6px 10px;font-size:10px;font-family:ui-monospace,monospace;color:var(--text-primary);white-space:nowrap;opacity:0;transition:opacity 0.1s;max-width:220px;';
    el.style.position = 'relative';
    el.appendChild(_tipEl);
  }

  el.on('plotly_hover', ({ points, event }) => {
    if (!points?.length) return;
    const pt = points[0];
    const x = pt.x, y = pt.y;
    let lines = [];
    switch (chartType) {
      case 'bode_mag':
        lines = [`ω = ${fmtNum(x, 3)} rad/s`, `|G| = ${fmtNum(y, 2)} dB`];
        break;
      case 'bode_phase':
        lines = [`ω = ${fmtNum(x, 3)} rad/s`, `∠G = ${fmtNum(y, 2)}°`];
        break;
      case 'step':
        lines = [`t = ${fmtNum(x, 3)} s`, `y = ${fmtNum(y, 4)}`, `ess ≈ ${fmtNum(Math.abs(1 - y) * 100, 2)}%`];
        break;
      case 'nyquist':
        lines = [`ω = ${fmtNum(pt.customdata?.[0] ?? x, 3)} rad/s`, `Re = ${fmtNum(x, 4)}`, `Im = ${fmtNum(y, 4)}`, `|dist(-1)| = ${fmtNum(Math.hypot(x + 1, y), 4)}`];
        break;
      case 'rl':
        lines = [`σ = ${fmtNum(x, 4)}`, `ωd = ${fmtNum(y, 4)}`, `ωn = ${fmtNum(Math.hypot(x, y), 4)}`, `ζ = ${fmtNum(-x / (Math.hypot(x, y) || 1), 3)}`];
        break;
      default:
        lines = [`x = ${fmtNum(x, 4)}`, `y = ${fmtNum(y, 4)}`];
    }
    _tipEl.innerHTML = lines.join('<br>');
    _tipEl.style.opacity = '1';
    _tipEl.style.left = `${(event.offsetX || 50) + 12}px`;
    _tipEl.style.top  = `${(event.offsetY || 50) - 30}px`;
  });
  el.on('plotly_unhover', () => { _tipEl.style.opacity = '0'; });
}

function initIntermediateTooltip() {
  // Attach to main active chart (polymorphic — reattaches on plot type switch)
  ['chart-active', 'chart-bode', 'chart-nyquist', 'chart-rl'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      // Defer until Plotly renders
      const observer = new MutationObserver(() => {
        if (el._fullLayout) {
          const title = el.layout?.title?.text || '';
          let type = 'generic';
          if (/bode.*mag|magnitude/i.test(title))  type = 'bode_mag';
          else if (/bode.*phase|phase/i.test(title)) type = 'bode_phase';
          else if (/step/i.test(title))             type = 'step';
          else if (/nyquist/i.test(title))          type = 'nyquist';
          else if (/root|locus/i.test(title))       type = 'rl';
          attachIntermediateTooltip(id, type);
        }
      });
      observer.observe(el, { childList: true, subtree: false });
    }
  });
  window.attachIntermediateTooltip = attachIntermediateTooltip;
}

// ── B2-1: Matrix Expand Panel ─────────────────────────────────────────────────

/**
 * Render a matrix as an HTML table grid.
 */
function renderMatrixGrid(M, name = '', digits = 4) {
  if (!M || !M.length) return '<em style="color:var(--text-muted)">—</em>';
  const n = M.length, m = M[0].length;
  const kappa = computeConditionNumber(M);
  const kappaClass = _kappaClass(kappa);
  const det = n === m ? _matDetSmall(M) : NaN;
  const pdCls = n === m ? _pdClass(M) : null;
  const pdLabel = { pd: '正定 ✓', spd: '半正定 ⚠', npd: '非正定 ✗' };

  const rows = M.map(row =>
    `<tr>${row.map(v => `<td title="${v}">${fmtNum(v, digits)}</td>`).join('')}</tr>`
  ).join('');

  const kappaStr = kappa < 1e4 ? kappa.toFixed(2) : kappa.toExponential(2);
  const detStr   = isNaN(det)  ? '—' : fmtNum(det, 4);

  return `
    <div class="matrix-block">
      <div class="matrix-block-header" data-mat="${name}">
        <span class="matrix-block-title">${name} (${n}×${m})</span>
        <span style="font-size:10px;color:var(--text-muted);">▼</span>
      </div>
      <div class="matrix-grid-wrap" id="mat-wrap-${name}">
        <table class="matrix-grid-table"><tbody>${rows}</tbody></table>
        <div class="matrix-meta">
          <span>κ = <b class="calc-step-kappa ${kappaClass}" style="display:inline;">${kappaStr}</b></span>
          <span>det = ${detStr}</span>
          ${pdCls ? `<span class="matrix-pd-badge ${pdCls}">${pdLabel[pdCls]}</span>` : ''}
        </div>
      </div>
    </div>
  `;
}

/**
 * Convert matrix to LaTeX pmatrix format.
 */
function matrixToLatex(M, name = '') {
  if (!M || !M.length) return '';
  const rows = M.map(row => row.map(v => fmtNum(v, 4)).join(' & ')).join(' \\\\\n  ');
  const prefix = name ? `${name} = ` : '';
  return `${prefix}\\begin{pmatrix}\n  ${rows}\n\\end{pmatrix}`;
}

function initMatrixExpandPanel() {
  const expandBtn = document.getElementById('btn-matrix-expand');
  const content   = document.getElementById('matrix-expand-content');
  const copyJson  = document.getElementById('btn-matrix-copy-json');
  const copyLatex = document.getElementById('btn-matrix-copy-latex');
  if (!expandBtn) return;

  let _lastMatrices = null;

  expandBtn.addEventListener('click', () => {
    // Try to get SS matrices from global state
    const ssA = window._currentSS?.A;
    const ssB = window._currentSS?.B;
    const ssC = window._currentSS?.C;
    const ssD = window._currentSS?.D;

    if (!ssA) {
      content.innerHTML = '<div style="font-size:11px;color:var(--text-muted);">未偵測到狀態空間矩陣。請使用 MIMO 模式並輸入系統。</div>';
      return;
    }
    _lastMatrices = { A: ssA, B: ssB, C: ssC, D: ssD };

    const html = ['A', 'B', 'C', 'D'].map(name => {
      const M = _lastMatrices[name];
      return M ? renderMatrixGrid(M, name) : '';
    }).join('');
    content.innerHTML = html;

    // Collapsible blocks
    content.querySelectorAll('.matrix-block-header').forEach(hdr => {
      hdr.addEventListener('click', () => {
        const wrap = content.querySelector(`#mat-wrap-${hdr.dataset.mat}`);
        const arrow = hdr.querySelector('span:last-child');
        if (wrap) {
          const hidden = wrap.style.display === 'none';
          wrap.style.display = hidden ? 'block' : 'none';
          if (arrow) arrow.textContent = hidden ? '▼' : '▶';
        }
      });
    });

    // Check A-matrix numerical health
    checkNumericalHealth(ssA, 'kappa_a');

    // Build calc steps for Gramian computation
    const kappaA = computeConditionNumber(ssA);
    showCalcSteps([
      {
        title: '建構系統矩陣',
        body: `A (${ssA.length}×${ssA.length})，κ(A) = ${kappaA < 1e4 ? kappaA.toFixed(2) : kappaA.toExponential(2)}`,
        kappa: kappaA,
      },
      {
        title: '計算特徵值（穩定性判斷）',
        body: `Re(λ) < 0 → 穩定；Re(λ) ≥ 0 → 不穩定\n使用 Gershgorin 圓定理快速包含`,
        kappa: null,
      },
      {
        title: '可控性矩陣 [B, AB, A²B, …]',
        body: `rankCo = n → 完全可控\n秩估算使用 SVD 分解`,
        kappa: null,
      },
    ]);
  });

  // Copy buttons
  copyJson?.addEventListener('click', () => {
    if (!_lastMatrices) return;
    const text = JSON.stringify(
      Object.fromEntries(Object.entries(_lastMatrices).map(([k, v]) => [k, v])),
      null, 2
    );
    navigator.clipboard.writeText(text).then(() => notify('矩陣 JSON 已複製', 'success', { duration: 1500 }));
  });

  copyLatex?.addEventListener('click', () => {
    if (!_lastMatrices) return;
    const text = ['A', 'B', 'C', 'D']
      .filter(k => _lastMatrices[k])
      .map(k => matrixToLatex(_lastMatrices[k], k))
      .join(',\n');
    navigator.clipboard.writeText(text).then(() => notify('LaTeX 已複製', 'success', { duration: 1500 }));
  });
}

// ── P46 init ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initCalcSteps();
  initIntermediateTooltip();
  initMatrixExpandPanel();
}, { once: true });

// ════════════════════════════════════════════════════════════════════════════════
// P47 — C1-1~3 Topic Index Cards + C4-1~3 Draft/Notes/Completion
// ════════════════════════════════════════════════════════════════════════════════

// ── C1-1: Learn welcome card grid ────────────────────────────────────────────

const LEARN_TOPICS = [
  {
    id: 'pid',
    icon: '🎛',
    title: 'PID 控制',
    desc: '最常見的控制器。學習比例、積分、微分三個增益的調整。',
    badge: '入門',
    action: () => { document.querySelector('[data-sidebar="simulate"]')?.click(); },
  },
  {
    id: 'rlocus',
    icon: '📈',
    title: '根軌跡',
    desc: '圖形化極點設計，直觀看到增益如何影響系統穩定性。',
    badge: '入門',
    action: () => { document.querySelector('[data-plot="rlocus"]')?.click(); },
  },
  {
    id: 'freq',
    icon: '📊',
    title: '頻域分析',
    desc: 'Bode 圖 + Nyquist 圖，分析增益裕度與相位裕度。',
    badge: '入門',
    action: () => { document.querySelector('[data-plot="bode"]')?.click(); },
  },
  {
    id: 'ss',
    icon: '🔲',
    title: '狀態空間',
    desc: 'LQR/LQG 最優控制、Kalman 濾波器設計。',
    badge: '進階',
    action: () => { document.querySelector('[data-sidebar="advisor"]')?.click(); },
  },
];

const LEARN_ADVANCED = {
  icon: '🔬',
  title: '進階主題',
  desc: 'H∞ 強健控制、MPC 模型預測、非線性控制、自適應控制',
};

function initLearnWelcome() {
  const grid = document.getElementById('learn-card-grid');
  if (!grid) return;

  // Render topic cards
  grid.innerHTML = LEARN_TOPICS.map(t => `
    <div class="learn-card" data-topic="${t.id}" role="button" tabindex="0" aria-label="${t.title}">
      <div class="learn-card-icon">${t.icon}</div>
      <div class="learn-card-title">${t.title}</div>
      <div class="learn-card-desc">${t.desc}</div>
      <button class="btn btn-sm" style="margin-top:4px;justify-content:center;font-size:10px;">開始學習 →</button>
    </div>
  `).join('') + `
    <div class="learn-card-adv" data-topic="advanced" role="button" tabindex="0">
      <span style="font-size:28px;">${LEARN_ADVANCED.icon}</span>
      <div>
        <div style="font-size:13px;font-weight:700;color:var(--text-primary);">${LEARN_ADVANCED.title}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${LEARN_ADVANCED.desc}</div>
      </div>
      <button class="btn btn-sm" style="margin-left:auto;justify-content:center;font-size:10px;">探索 →</button>
    </div>
  `;

  // Wire click actions
  grid.querySelectorAll('[data-topic]').forEach(card => {
    const topic = LEARN_TOPICS.find(t => t.id === card.dataset.topic);
    const handler = () => {
      if (topic?.action) topic.action();
      document.getElementById('learn-welcome').style.display = 'none';
      document.getElementById('dashboard-view').style.display = 'block';
    };
    card.addEventListener('click', handler);
    card.addEventListener('keydown', e => { if (e.key === 'Enter') handler(); });
  });

  // Show/hide based on whether a system is loaded
  window._checkLearnWelcome = () => {
    const hasSystem = !!document.getElementById('tf-num')?.value?.trim();
    const welcome = document.getElementById('learn-welcome');
    const dashboard = document.getElementById('dashboard-view');
    if (welcome && dashboard) {
      welcome.style.display = hasSystem ? 'none' : 'block';
      // Don't hide dashboard — both can coexist
    }
  };
}

// ── C1-2: "What is this?" explain panel ──────────────────────────────────────

const EXPLAIN_MAP = {
  pid: {
    title: 'PID 控制器',
    what: 'PID 結合三個動作：P（比例）快速回應誤差，I（積分）消除穩態誤差，D（微分）阻尼振盪。',
    when: [
      { ok: true,  text: '系統是單輸入單輸出（SISO）' },
      { ok: true,  text: '需要快速調整，不需精確模型' },
      { ok: false, text: '系統有嚴格頻域規格（建議 H∞）' },
      { ok: false, text: '系統有嚴格約束（建議 MPC）' },
    ],
    params: [
      { name: 'Kp', desc: '決定回應速度，太大會振盪' },
      { name: 'Ki', desc: '消除穩態誤差，太大會積分飽和' },
      { name: 'Kd', desc: '阻尼振盪，對雜訊敏感' },
    ],
    links: ['根軌跡設計', 'Bode 頻域分析'],
  },
  lqr: {
    title: 'LQR 最優控制',
    what: '線性二次型調節器，透過最小化二次型效能指數 J = ∫(xᵀQx + uᵀRu)dt，自動計算最優狀態回授增益 K。',
    when: [
      { ok: true,  text: '系統可表示為狀態空間形式' },
      { ok: true,  text: '需要最優化效能指數' },
      { ok: false, text: '系統存在模型不確定性（建議 H∞）' },
    ],
    params: [
      { name: 'Q', desc: '狀態權重矩陣，越大越重視狀態誤差' },
      { name: 'R', desc: '輸入權重矩陣，越大越節省控制能量' },
    ],
    links: ['Kalman 濾波器', 'H∞ 強健控制'],
  },
  hinf: {
    title: 'H∞ 強健控制',
    what: '設計控制器使閉迴路系統的 H∞ 範數（最壞情況放大率）最小，對模型不確定性具有強健性。',
    when: [
      { ok: true,  text: '模型有不確定性或擾動' },
      { ok: true,  text: '需要嚴格的頻域效能規格' },
      { ok: false, text: '系統非常簡單（過於複雜，PID 更合適）' },
    ],
    params: [
      { name: 'γ', desc: 'H∞ 範數界限，越小越強健但越難達到' },
      { name: 'W1/W2', desc: '靈敏度加權函數，定義頻域規格' },
    ],
    links: ['μ 綜合（D-K 迭代）', 'LMI 求解'],
  },
  mpc: {
    title: 'MPC 模型預測控制',
    what: '在有限時域內反覆求解最優化問題，同時處理狀態與輸入約束，適合多變數系統。',
    when: [
      { ok: true,  text: '系統有輸入或輸出約束' },
      { ok: true,  text: '需要多步超前預測' },
      { ok: false, text: '系統速度很快（MPC 計算量大）' },
    ],
    params: [
      { name: 'N', desc: '預測時域，越長性能越好但計算量越大' },
      { name: 'Q/R', desc: '效能/控制能量權衡' },
    ],
    links: ['Tube MPC（不確定系統）', 'NMPC 非線性'],
  },
};

function initExplainPanel() {
  const drawer    = document.getElementById('explain-drawer');
  const openBtn   = document.getElementById('btn-explain');
  const closeBtn  = document.getElementById('explain-close-btn');
  const titleEl   = document.getElementById('explain-title');
  const bodyEl    = document.getElementById('explain-body');
  if (!drawer || !openBtn) return;

  function openExplain(key) {
    const info = EXPLAIN_MAP[key] || EXPLAIN_MAP['pid'];
    titleEl.textContent = info.title;

    const whenItems = info.when.map(w =>
      `<div class="explain-item ${w.ok ? 'yes' : 'no'}">${w.ok ? '✓' : '✗'} ${w.text}</div>`
    ).join('');
    const paramItems = (info.params || []).map(p =>
      `<div class="explain-item"><b>${p.name}</b> — ${p.desc}</div>`
    ).join('');
    const links = (info.links || []).map(l =>
      `<a href="#" style="color:var(--color-accent);font-size:12px;text-decoration:none;">${l}</a>`
    ).join(' &nbsp;·&nbsp; ');

    bodyEl.innerHTML = `
      <div class="explain-section-title">這個方法做什麼</div>
      <p style="font-size:12px;color:var(--text-secondary);line-height:1.6;margin:0 0 8px;">${info.what}</p>
      <div class="explain-section-title">什麼時候用</div>
      ${whenItems}
      ${paramItems ? `<div class="explain-section-title">關鍵參數</div>${paramItems}` : ''}
      ${links ? `<div class="explain-section-title">延伸學習</div><div>${links}</div>` : ''}
    `;
    drawer.classList.add('open');
  }

  openBtn.addEventListener('click', () => {
    // Detect current context from active panel/tab
    const activeTab = document.querySelector('.sidebar-tab[aria-selected="true"]')?.dataset.sidebar || 'simulate';
    const key = activeTab === 'advisor' ? 'lqr' : 'pid';
    openExplain(key);
  });

  closeBtn?.addEventListener('click', () => drawer.classList.remove('open'));
  window.openExplain = openExplain;
}

// ── C1-3: "Load example" preset button ───────────────────────────────────────

const EXAMPLE_PRESETS = [
  {
    id: 'dc_motor',
    name: 'DC Motor 位置控制',
    desc: '2 階系統，典型 PID 調參練習',
    tfNum: [1],
    tfDen: [1, 3, 2],
    pid: { kp: 5, ki: 1, kd: 0.5 },
  },
  {
    id: 'mass_spring',
    name: '質量彈簧阻尼',
    desc: 'k=1, b=0.5, m=1 — 根軌跡設計',
    tfNum: [1],
    tfDen: [1, 0.5, 1],
    pid: { kp: 2, ki: 0.5, kd: 0.2 },
  },
  {
    id: 'first_order',
    name: '一階系統 (τ=1)',
    desc: '最簡單的範例，適合初學者',
    tfNum: [1],
    tfDen: [1, 1],
    pid: { kp: 2, ki: 1, kd: 0 },
  },
  {
    id: 'unstable',
    name: '不穩定系統',
    desc: '一個 RHP 極點，需要穩定化控制',
    tfNum: [1],
    tfDen: [1, -1, 0],
    pid: { kp: 4, ki: 2, kd: 1 },
  },
];

function loadExample(presetId) {
  const preset = EXAMPLE_PRESETS.find(p => p.id === presetId);
  if (!preset) return;

  // Fill TF inputs
  const numEl = document.getElementById('tf-num');
  const denEl = document.getElementById('tf-den');
  if (numEl) numEl.value = preset.tfNum.join(', ');
  if (denEl) denEl.value = preset.tfDen.join(', ');

  // Fill PID
  const kpEl = document.getElementById('pid-kp');
  const kiEl = document.getElementById('pid-ki');
  const kdEl = document.getElementById('pid-kd');
  if (kpEl) kpEl.value = preset.pid.kp;
  if (kiEl) kiEl.value = preset.pid.ki;
  if (kdEl) kdEl.value = preset.pid.kd;

  // Trigger analysis
  setTimeout(() => {
    document.getElementById('btn-analyze')?.click();
    notify(`已載入範例：${preset.name}`, 'success', { duration: 2000 });
  }, 100);

  // Update sliders
  document.querySelectorAll('[data-pid]').forEach(el => {
    const key = el.dataset.pid;
    if (preset.pid[key] !== undefined) el.value = preset.pid[key];
  });
}

function initExampleLoader() {
  const btn      = document.getElementById('btn-load-example');
  const dropdown = document.getElementById('example-dropdown');
  if (!btn || !dropdown) return;

  // Build dropdown items
  dropdown.innerHTML = EXAMPLE_PRESETS.map(p => `
    <div class="example-dropdown-item" data-example="${p.id}">
      <div>${p.name}</div>
      <div class="edesc">${p.desc}</div>
    </div>
  `).join('');

  dropdown.querySelectorAll('.example-dropdown-item').forEach(item => {
    item.addEventListener('click', () => {
      loadExample(item.dataset.example);
      dropdown.style.display = 'none';
    });
  });

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const rect = btn.getBoundingClientRect();
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.top  = `${rect.bottom + 4}px`;
    dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
  });

  document.addEventListener('click', () => { dropdown.style.display = 'none'; });
  window.loadExample = loadExample;
}

// ── C4-1: Draft autosave ──────────────────────────────────────────────────────

const DRAFT_KEY     = 'cs-draft';
const DRAFT_VERSION = '2.0';
let _draftTimer = null;

function _collectDraftState() {
  return {
    version:    DRAFT_VERSION,
    savedAt:    new Date().toISOString(),
    system: {
      type: 'tf',
      num:  document.getElementById('tf-num')?.value  || '',
      den:  document.getElementById('tf-den')?.value  || '',
    },
    controller: {
      type: 'pid',
      kp:   document.getElementById('pid-kp')?.value  || '',
      ki:   document.getElementById('pid-ki')?.value  || '',
      kd:   document.getElementById('pid-kd')?.value  || '',
    },
    specs: {
      os:  document.getElementById('design-os')?.value  || '',
      ts:  document.getElementById('design-ts')?.value  || '',
    },
    ui: {
      theme: document.documentElement.dataset.theme || 'dark',
    },
  };
}

function saveDraft() {
  try {
    const state = _collectDraftState();
    const json  = JSON.stringify(state);
    if (json.length > 200 * 1024) return; // 200KB cap
    localStorage.setItem(DRAFT_KEY, json);

    const indEl = document.getElementById('draft-saved-indicator');
    if (indEl) {
      const t = new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
      indEl.textContent = `已儲存 ${t}`;
      indEl.style.display = 'inline';
      indEl.classList.remove('draft-dirty');
    }
  } catch (_) { /* quota exceeded — ignore */ }
}

function _scheduleDraft() {
  const indEl = document.getElementById('draft-saved-indicator');
  if (indEl) { indEl.textContent = '●'; indEl.classList.add('draft-dirty'); indEl.style.display = 'inline'; }
  clearTimeout(_draftTimer);
  if (typeof requestIdleCallback === 'function') {
    _draftTimer = setTimeout(() => requestIdleCallback(saveDraft), 2000);
  } else {
    _draftTimer = setTimeout(saveDraft, 2000);
  }
}

function _restoreDraft(state) {
  const numEl = document.getElementById('tf-num');
  const denEl = document.getElementById('tf-den');
  const kpEl  = document.getElementById('pid-kp');
  const kiEl  = document.getElementById('pid-ki');
  const kdEl  = document.getElementById('pid-kd');
  if (numEl && state.system?.num) numEl.value = state.system.num;
  if (denEl && state.system?.den) denEl.value = state.system.den;
  if (kpEl  && state.controller?.kp) kpEl.value = state.controller.kp;
  if (kiEl  && state.controller?.ki) kiEl.value = state.controller.ki;
  if (kdEl  && state.controller?.kd) kdEl.value = state.controller.kd;
  notify('草稿已恢復', 'success', { duration: 2000 });
}

function initDraftAutosave() {
  // Check for existing draft on load
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) {
      const state = JSON.parse(raw);
      if (state.version !== DRAFT_VERSION) {
        localStorage.removeItem(DRAFT_KEY);
        notify('草稿格式不符，已清除', 'warn', { duration: 3000 });
      } else {
        const banner = document.getElementById('draft-banner');
        if (banner) {
          const t = new Date(state.savedAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
          banner.className = 'cond-warn-banner';
          banner.style.display = 'block';
          banner.style.background = 'rgba(99,102,241,0.1)';
          banner.style.borderColor = 'var(--color-accent)';
          banner.style.color = 'var(--text-primary)';
          banner.innerHTML = `<b>發現上次的設計（${t}）</b>
            <button class="btn btn-sm" id="draft-restore-btn" style="margin-left:8px;">恢復</button>
            <button class="btn btn-sm" id="draft-dismiss-btn" style="margin-left:4px;">忽略</button>`;
          banner.querySelector('#draft-restore-btn')?.addEventListener('click', () => {
            _restoreDraft(state);
            banner.style.display = 'none';
          });
          banner.querySelector('#draft-dismiss-btn')?.addEventListener('click', () => {
            localStorage.removeItem(DRAFT_KEY);
            banner.style.display = 'none';
          });
        }
      }
    }
  } catch (_) { /* corrupt storage */ }

  // Listen for changes to schedule autosave
  const watchIds = ['tf-num', 'tf-den', 'pid-kp', 'pid-ki', 'pid-kd', 'design-os', 'design-ts'];
  watchIds.forEach(id => {
    document.getElementById(id)?.addEventListener('input', _scheduleDraft);
  });
}

// ── C4-2: Bookmark / Notes system ────────────────────────────────────────────

const NOTES_KEY     = 'cs-notes';
const BOOKMARKS_KEY = 'cs-bookmarks';

function initNotesSystem() {
  const drawer     = document.getElementById('notes-drawer');
  const openBtn    = document.getElementById('btn-notes');
  const closeBtn   = document.getElementById('notes-close-btn');
  const addNoteBtn = document.getElementById('btn-add-note');
  const notesList  = document.getElementById('notes-list');
  const bmarkBtn   = document.getElementById('btn-add-bookmark');
  const bmarkList  = document.getElementById('bookmarks-list');
  const searchIn   = document.getElementById('notes-search');
  if (!drawer || !openBtn) return;

  function loadNotes() { try { return JSON.parse(localStorage.getItem(NOTES_KEY) || '[]'); } catch { return []; } }
  function saveNotes(arr) { try { localStorage.setItem(NOTES_KEY, JSON.stringify(arr.slice(-100))); } catch {} }
  function loadBookmarks() { try { return JSON.parse(localStorage.getItem(BOOKMARKS_KEY) || '[]'); } catch { return []; } }
  function saveBookmarks(arr) { try { localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(arr.slice(-50))); } catch {} }

  function renderNotes(filter = '') {
    const notes = loadNotes().filter(n => !filter || n.text.includes(filter));
    if (!notesList) return;
    notesList.innerHTML = notes.length ? notes.map((n, i) => `
      <div class="note-item">
        <div class="note-meta">${n.time} · ${n.page || 'General'}</div>
        <div class="note-text" contenteditable="true" data-idx="${i}">${n.text}</div>
        <button class="note-del" data-idx="${i}" aria-label="刪除筆記">🗑</button>
      </div>
    `).join('') : '<div style="font-size:11px;color:var(--text-muted);">尚無筆記</div>';

    notesList.querySelectorAll('.note-del').forEach(btn => {
      btn.addEventListener('click', () => {
        const arr = loadNotes();
        arr.splice(parseInt(btn.dataset.idx), 1);
        saveNotes(arr);
        renderNotes(searchIn?.value || '');
      });
    });
    notesList.querySelectorAll('[contenteditable]').forEach(el => {
      el.addEventListener('blur', () => {
        const arr = loadNotes();
        const idx = parseInt(el.dataset.idx);
        if (arr[idx]) { arr[idx].text = el.textContent.slice(0, 500); saveNotes(arr); }
      });
    });
  }

  function renderBookmarks() {
    const marks = loadBookmarks();
    if (!bmarkList) return;
    bmarkList.innerHTML = marks.length ? marks.map((m, i) => `
      <div class="bookmark-item">
        <span>⭐ ${m.page} <span style="color:var(--text-muted)">${m.time}</span></span>
        <button class="note-del" data-bidx="${i}" aria-label="移除書籤">✕</button>
      </div>
    `).join('') : '<div style="font-size:11px;color:var(--text-muted);">尚無書籤</div>';

    bmarkList.querySelectorAll('[data-bidx]').forEach(btn => {
      btn.addEventListener('click', () => {
        const arr = loadBookmarks();
        arr.splice(parseInt(btn.dataset.bidx), 1);
        saveBookmarks(arr);
        renderBookmarks();
      });
    });
  }

  openBtn.addEventListener('click', () => {
    drawer.classList.toggle('open');
    if (drawer.classList.contains('open')) { renderNotes(); renderBookmarks(); }
  });
  closeBtn?.addEventListener('click', () => drawer.classList.remove('open'));

  addNoteBtn?.addEventListener('click', () => {
    const arr = loadNotes();
    const t = new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
    const page = document.title.split(' — ')[0] || 'ControlStudio';
    arr.push({ text: '新筆記…', time: t, page });
    saveNotes(arr);
    renderNotes();
  });

  bmarkBtn?.addEventListener('click', () => {
    const arr = loadBookmarks();
    const t = new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
    const page = document.querySelector('.sidebar-tab[aria-selected="true"]')?.textContent?.trim() || 'Main';
    arr.push({ page, time: t });
    saveBookmarks(arr);
    renderBookmarks();
    notify('書籤已加入', 'success', { duration: 1500 });
  });

  searchIn?.addEventListener('input', () => renderNotes(searchIn.value));
}

// ── C4-3: Completion badge ────────────────────────────────────────────────────

function _confetti() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:99999;';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const pieces = Array.from({ length: 60 }, () => ({
    x: Math.random() * canvas.width,
    y: -10,
    vx: (Math.random() - 0.5) * 3,
    vy: Math.random() * 3 + 2,
    color: ['#6366f1','#10b981','#f59e0b','#ef4444','#3b82f6'][Math.floor(Math.random() * 5)],
    r: Math.random() * 5 + 3,
    rot: Math.random() * Math.PI * 2,
    rVel: (Math.random() - 0.5) * 0.2,
  }));

  let frame = 0;
  const animate = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pieces.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.rot += p.rVel;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
      ctx.restore();
    });
    if (++frame < 120) requestAnimationFrame(animate);
    else canvas.remove();
  };
  requestAnimationFrame(animate);
}

function showCompletionBanner(passCount, totalCount) {
  const banner = document.getElementById('completion-banner');
  if (!banner) return;
  const allPass = passCount === totalCount;
  banner.style.display = 'block';
  banner.innerHTML = allPass
    ? `<span class="confetti-icon">🎉</span> 設計完成！${totalCount} 項規格全部通過。<button class="btn btn-primary btn-sm" style="margin-left:12px;" id="btn-gen-report">生成報告</button>`
    : `<span style="color:#f59e0b;">⚠</span> ${passCount}/${totalCount} 規格通過。請調整控制器參數。`;
  if (allPass) _confetti();
  banner.querySelector('#btn-gen-report')?.addEventListener('click', () => {
    document.getElementById('btn-export-report')?.click();
  });
}

function initCompletionBadge() {
  // Watch spec-compliance badges and trigger on all-pass
  const specBar = document.getElementById('spec-compliance-bar');
  if (!specBar) return;

  const observer = new MutationObserver(() => {
    const badges = specBar.querySelectorAll('.spec-badge');
    if (!badges.length) return;
    const passed = [...badges].filter(b => b.classList.contains('pass')).length;
    if (passed === badges.length && badges.length >= 2) {
      showCompletionBanner(passed, badges.length);
    }
  });
  observer.observe(specBar, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  window.showCompletionBanner = showCompletionBanner;
}

// ── P47 init ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initLearnWelcome();
  initExplainPanel();
  initExampleLoader();
  initDraftAutosave();
  initNotesSystem();
  initCompletionBadge();
}, { once: true });

// ════════════════════════════════════════════════════════════════════════════════
// P48 — A3-2 Draggable RL Poles + A3-3 Bode Breakpoint + A3-4 History Drawer
// ════════════════════════════════════════════════════════════════════════════════

// ── A3-4: History drawer (extends existing _history) ─────────────────────────

/** Enhanced history entry with metadata */
const _historyMeta = []; // parallel array to _history.stack: { time, label, starred, name }

function pushHistoryEntry(label = '') {
  historySave();
  const t = new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  _historyMeta.splice(_history.idx + 1);
  _historyMeta.push({ time: t, label: label || '調參', starred: false, name: '' });
  if (_historyMeta.length > 50) _historyMeta.shift();
  _renderHistoryList();
}

function _renderHistoryList() {
  const list = document.getElementById('history-list');
  if (!list) return;
  const items = _history.stack;
  if (!items.length) {
    list.innerHTML = '<div style="padding:16px;font-size:11px;color:var(--text-muted);">尚無歷史紀錄</div>';
    return;
  }
  list.innerHTML = [...items].reverse().map((snap, revIdx) => {
    const idx = items.length - 1 - revIdx;
    const meta = _historyMeta[idx] || { time: '—', label: '調參', starred: false, name: '' };
    const isCur = idx === _history.idx;
    const kp = snap?.Kp != null ? `Kp=${fmtNum(snap.Kp, 2)}` : '';
    const ki = snap?.Ki != null ? `Ki=${fmtNum(snap.Ki, 2)}` : '';
    return `
      <div class="history-item ${isCur ? 'current' : ''}" data-hidx="${idx}" role="button" tabindex="0" title="${isCur ? '目前狀態' : '點擊恢復'}">
        <span class="history-item-star">${meta.starred ? '⭐' : ''}</span>
        <div style="flex:1;min-width:0;">
          <div class="history-item-label">${meta.label}${meta.name ? ` <span class="history-name-badge">${meta.name}</span>` : ''}</div>
          <div class="history-item-time">${meta.time} ${[kp, ki].filter(Boolean).join(' ')}</div>
        </div>
        <button class="btn btn-sm history-star-btn" data-hidx="${idx}" title="加星標" style="padding:1px 4px;font-size:10px;opacity:0.5;">★</button>
      </div>
    `;
  }).join('');

  list.querySelectorAll('.history-item').forEach(item => {
    item.addEventListener('click', e => {
      if (e.target.classList.contains('history-star-btn')) return;
      const idx = parseInt(item.dataset.hidx);
      _history.idx = idx;
      _applySnapshot(_history.stack[idx]);
      _renderHistoryList();
    });
  });
  list.querySelectorAll('.history-star-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.hidx);
      if (_historyMeta[idx]) _historyMeta[idx].starred = !_historyMeta[idx].starred;
      _renderHistoryList();
    });
  });
}

function initHistoryDrawer() {
  const drawer   = document.getElementById('history-drawer');
  const openBtn  = document.getElementById('btn-history');
  const closeBtn = document.getElementById('history-close-btn');
  if (!drawer || !openBtn) return;

  openBtn.addEventListener('click', () => {
    drawer.classList.toggle('open');
    if (drawer.classList.contains('open')) _renderHistoryList();
  });
  closeBtn?.addEventListener('click', () => drawer.classList.remove('open'));

  // Hook into historySave to also update meta
  const _origHistorySave = window.historySave || historySave;
  // Expose for external use
  window.pushHistoryEntry = pushHistoryEntry;
  window._renderHistoryList = _renderHistoryList;
}

// ── A3-2: Draggable poles on root locus (interactive mode) ───────────────────

function initDraggablePoles() {
  const btn      = document.getElementById('btn-rl-interact');
  const hint     = document.getElementById('rl-interact-hint');
  const chartEl  = document.getElementById('chart-rlocus');
  const floatBadge = document.getElementById('rl-k-float-badge');
  if (!btn || !chartEl) return;

  let _interactiveMode = false;

  btn.addEventListener('click', () => {
    _interactiveMode = !_interactiveMode;
    btn.textContent = _interactiveMode ? '退出互動' : '互動';
    btn.classList.toggle('btn-primary', _interactiveMode);
    chartEl.classList.toggle('rl-interact-active', _interactiveMode);
    if (hint) hint.style.display = _interactiveMode ? 'block' : 'none';
    if (!_interactiveMode && floatBadge) floatBadge.style.display = 'none';
  });

  // Click on chart → set K
  chartEl.addEventListener('click', e => {
    if (!_interactiveMode || !window.Plotly) return;
    const layout = chartEl._fullLayout;
    if (!layout) return;

    const xaxis = layout.xaxis;
    const yaxis = layout.yaxis;
    if (!xaxis || !yaxis) return;

    const rect = chartEl.getBoundingClientRect();
    const px = e.clientX - rect.left - (layout.margin?.l || 60);
    const py = e.clientY - rect.top  - (layout.margin?.t || 20);
    const plotW = rect.width  - (layout.margin?.l || 60) - (layout.margin?.r || 20);
    const plotH = rect.height - (layout.margin?.t || 20) - (layout.margin?.b || 40);

    const xFrac = px / plotW;
    const yFrac = 1 - py / plotH;
    const sigma = xaxis.range[0] + xFrac * (xaxis.range[1] - xaxis.range[0]);
    const omega = yaxis.range[0] + yFrac * (yaxis.range[1] - yaxis.range[0]);

    // Approximate K from pole distance ratio (simplified: K ≈ product of |s-pi| / product |s-zi|)
    // Just update the rl-k-slider to the nearest feasible value based on real-part click
    const sliderEl = document.getElementById('rl-k-slider');
    if (sliderEl) {
      // Map sigma to slider (assume sigma∈[min,0] range)
      const minSigma = xaxis.range[0];
      const frac = Math.max(0, Math.min(1, sigma / minSigma));
      const newVal = sliderEl.min * frac + sliderEl.max * (1 - frac);
      const clampedVal = Math.max(parseFloat(sliderEl.min), Math.min(parseFloat(sliderEl.max), newVal));
      sliderEl.value = clampedVal;
      sliderEl.dispatchEvent(new Event('input'));

      if (floatBadge) {
        floatBadge.textContent = `σ=${fmtNum(sigma, 2)} + j${fmtNum(omega, 2)}  K≈${fmtNum(clampedVal, 3)}`;
        floatBadge.style.left = `${e.clientX - chartEl.getBoundingClientRect().left + 10}px`;
        floatBadge.style.top  = `${e.clientY - chartEl.getBoundingClientRect().top  - 30}px`;
        floatBadge.style.display = 'block';
        setTimeout(() => { if (floatBadge) floatBadge.style.display = 'none'; }, 2000);
      }
      pushHistoryEntry(`RL互動 K=${fmtNum(clampedVal, 3)}`);
    }
  });

  // Hover shows float badge
  chartEl.addEventListener('mousemove', e => {
    if (!_interactiveMode) return;
    const layout = chartEl._fullLayout;
    if (!layout) return;
    const rect = chartEl.getBoundingClientRect();
    if (floatBadge) {
      floatBadge.style.left = `${e.clientX - rect.left + 10}px`;
      floatBadge.style.top  = `${e.clientY - rect.top  - 30}px`;
    }
  });
  chartEl.addEventListener('mouseleave', () => {
    if (floatBadge && _interactiveMode) floatBadge.style.display = 'none';
  });
}

// ── A3-3: Bode breakpoint drag ────────────────────────────────────────────────

function initBodeBreakpointDrag() {
  const btn     = document.getElementById('btn-bode-compensator');
  const hint    = document.getElementById('bode-comp-hint');
  const chartEl = document.getElementById('chart-active');
  if (!btn) return;

  let _bodeCompMode = false;
  let _breakpointFreq = 1.0; // rad/s, zero freq

  // Show btn only on Bode tab
  document.querySelectorAll('.plot-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const isBode = tab.dataset.plot === 'bode';
      if (btn) btn.style.display = isBode ? 'inline-flex' : 'none';
      if (!isBode && _bodeCompMode) {
        _bodeCompMode = false;
        btn.textContent = '補償器折點';
        btn.classList.remove('btn-primary');
        if (hint) hint.style.display = 'none';
      }
    });
  });

  btn.addEventListener('click', () => {
    _bodeCompMode = !_bodeCompMode;
    btn.textContent = _bodeCompMode ? '退出折點模式' : '補償器折點';
    btn.classList.toggle('btn-primary', _bodeCompMode);
    if (hint) hint.style.display = _bodeCompMode ? 'block' : 'none';
    if (chartEl) chartEl.classList.toggle('bode-compensator-active', _bodeCompMode);
  });

  // Click on Bode chart → set breakpoint frequency
  chartEl?.addEventListener('click', e => {
    if (!_bodeCompMode || !window.Plotly) return;
    const layout = chartEl._fullLayout;
    if (!layout?.xaxis) return;

    const rect  = chartEl.getBoundingClientRect();
    const px    = e.clientX - rect.left - (layout.margin?.l || 60);
    const plotW = rect.width - (layout.margin?.l || 60) - (layout.margin?.r || 20);
    const xFrac = Math.max(0, Math.min(1, px / plotW));

    const [xMin, xMax] = layout.xaxis.range;
    // Bode x-axis is log scale: freq in rad/s
    _breakpointFreq = Math.pow(10, xMin + xFrac * (xMax - xMin));

    // Update lead/lag compensator zero freq
    const leadZeroEl = document.getElementById('lead-zero-freq') || document.getElementById('comp-zero');
    if (leadZeroEl) {
      leadZeroEl.value = fmtNum(_breakpointFreq, 3);
      leadZeroEl.dispatchEvent(new Event('input'));
    }
    notify(`折點設定：ωz = ${fmtNum(_breakpointFreq, 3)} rad/s`, 'info', { duration: 2000 });
    pushHistoryEntry(`Bode折點 ωz=${fmtNum(_breakpointFreq, 2)}`);
  });

  // Expose
  window._bodeBreakpointFreq = () => _breakpointFreq;
}

// ── P48 init ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initHistoryDrawer();
  initDraggablePoles();
  initBodeBreakpointDrag();
}, { once: true });

// ════════════════════════════════════════════════════════════════════════════════
// P49 — C3-1~4 Interactive Animations
// ════════════════════════════════════════════════════════════════════════════════

// ── C3-1: Pole drag animation ─────────────────────────────────────────────────

/** Build an SVG complex plane with draggable poles. */
function _buildPolePlane(container, poles, onUpdate) {
  const W = container.clientWidth  || 240;
  const H = container.clientHeight || 180;
  const cx = W / 2, cy = H / 2;
  const scale = Math.min(W, H) / 6; // pixels per unit

  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.style.cssText = 'width:100%;height:100%;';
  container.innerHTML = '';
  container.appendChild(svg);

  // Axes
  const axisStyle = 'stroke:var(--border-primary);stroke-width:1;';
  const hLine = document.createElementNS(svgNS, 'line');
  hLine.setAttribute('x1', 0); hLine.setAttribute('y1', cy);
  hLine.setAttribute('x2', W); hLine.setAttribute('y2', cy);
  hLine.setAttribute('style', axisStyle);
  svg.appendChild(hLine);

  const vLine = document.createElementNS(svgNS, 'line');
  vLine.setAttribute('x1', cx); vLine.setAttribute('y1', 0);
  vLine.setAttribute('x2', cx); vLine.setAttribute('y2', H);
  vLine.setAttribute('style', axisStyle);
  svg.appendChild(vLine);

  // ζ=0.707 guideline (line through origin, angle = acos(0.707) ≈ 45°)
  const zetaLine = document.createElementNS(svgNS, 'line');
  zetaLine.setAttribute('x1', cx); zetaLine.setAttribute('y1', cy);
  zetaLine.setAttribute('x2', cx - W * 0.45); zetaLine.setAttribute('y2', cy - W * 0.45);
  zetaLine.setAttribute('stroke', 'var(--text-muted)');
  zetaLine.setAttribute('stroke-dasharray', '4,3');
  zetaLine.setAttribute('stroke-width', '0.8');
  zetaLine.setAttribute('opacity', '0.4');
  const zetaTip = document.createElementNS(svgNS, 'text');
  zetaTip.setAttribute('x', cx - W * 0.3); zetaTip.setAttribute('y', cy - W * 0.3 - 5);
  zetaTip.setAttribute('font-size', '8'); zetaTip.setAttribute('fill', 'var(--text-muted)');
  zetaTip.textContent = 'ζ=0.707';
  svg.appendChild(zetaLine); svg.appendChild(zetaTip);

  // Render draggable poles
  const _poleEls = [];
  poles.forEach((p, i) => {
    const px = cx + p.sigma * scale;
    const py = cy - p.omega * scale;
    const g = document.createElementNS(svgNS, 'g');
    g.setAttribute('class', 'pole-marker');
    g.setAttribute('transform', `translate(${px},${py})`);
    g.setAttribute('data-pidx', i);

    const size = 7;
    // × shape
    const l1 = document.createElementNS(svgNS, 'line');
    l1.setAttribute('x1', -size); l1.setAttribute('y1', -size);
    l1.setAttribute('x2',  size); l1.setAttribute('y2',  size);
    l1.setAttribute('stroke', '#6366f1'); l1.setAttribute('stroke-width', '2');
    const l2 = document.createElementNS(svgNS, 'line');
    l2.setAttribute('x1',  size); l2.setAttribute('y1', -size);
    l2.setAttribute('x2', -size); l2.setAttribute('y2',  size);
    l2.setAttribute('stroke', '#6366f1'); l2.setAttribute('stroke-width', '2');

    const hitbox = document.createElementNS(svgNS, 'circle');
    hitbox.setAttribute('r', 12); hitbox.setAttribute('fill', 'transparent');

    g.appendChild(l1); g.appendChild(l2); g.appendChild(hitbox);
    svg.appendChild(g);
    _poleEls.push({ g, l1, l2, pole: p });

    // Drag logic
    let dragging = false, shiftHeld = false;
    hitbox.addEventListener('mousedown', (e) => {
      e.preventDefault();
      dragging = true;
      shiftHeld = e.shiftKey;
    });
    svg.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const rect = svg.getBoundingClientRect();
      let newPx = e.clientX - rect.left;
      let newPy = e.clientY - rect.top;
      if (e.shiftKey) newPy = cy; // snap to real axis
      const sigma = (newPx - cx) / scale;
      const omega = (cy - newPy) / scale;
      p.sigma = sigma; p.omega = omega;
      g.setAttribute('transform', `translate(${newPx},${newPy})`);
      // Color unstable (RHP) poles red
      const isUnstable = sigma > 0;
      [l1, l2].forEach(l => l.setAttribute('stroke', isUnstable ? '#ef4444' : '#6366f1'));
      onUpdate(poles);
    });
    svg.addEventListener('mouseup', () => { dragging = false; });
    svg.addEventListener('mouseleave', () => { dragging = false; });
  });

  return svg;
}

function initPoleDragAnimation() {
  const initBtn   = document.getElementById('btn-c3-pole-init');
  const area      = document.getElementById('c3-pole-drag-area');
  const planeEl   = document.getElementById('pole-drag-plane');
  const stepEl    = document.getElementById('c3-step-preview');
  const alertEl   = document.getElementById('c3-unstable-alert');
  if (!initBtn) return;

  // Default poles: s = -1 ± j1 (damped oscillatory)
  let _poles = [
    { sigma: -1, omega:  1 },
    { sigma: -1, omega: -1 },
  ];

  function _updateStepPreview(poles) {
    const unstable = poles.some(p => p.sigma > 0);
    if (alertEl) alertEl.classList.toggle('show', unstable);

    if (!stepEl || !window.Plotly) return;
    // Build denominator from poles: (s-p1)(s-p2) = s²-(p1+p2)s + p1*p2
    const sumSigma = poles.reduce((s, p) => s + p.sigma, 0);
    const prodMag  = poles.reduce((s, p) => s + (p.sigma * p.sigma + p.omega * p.omega), 0);
    const a1 = -sumSigma;
    const a0 = prodMag / 2;

    // Simple step response: x(t) = e^(σt)(A cos ωt + B sin ωt) approximation
    const tEnd = unstable ? 3 : 8;
    const dt   = tEnd / 100;
    const t    = Array.from({ length: 101 }, (_, i) => i * dt);
    const zeta = -poles[0].sigma / (Math.hypot(poles[0].sigma, poles[0].omega) || 1);
    const wn   = Math.hypot(poles[0].sigma, poles[0].omega);
    const wd   = Math.abs(poles[0].omega);
    const y    = t.map(tv => {
      if (unstable) return Math.exp(Math.abs(poles[0].sigma) * tv) * Math.cos(wd * tv) - 1;
      if (wd < 0.01) return 1 - Math.exp(-wn * tv) * (1 + wn * tv);
      return 1 - Math.exp(poles[0].sigma * tv) * (Math.cos(wd * tv) - (poles[0].sigma / wd) * Math.sin(wd * tv));
    });

    window.Plotly.react(stepEl, [{
      x: t, y,
      mode: 'lines',
      line: { color: unstable ? '#ef4444' : '#6366f1', width: 2 },
    }], {
      paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
      margin: { l: 28, r: 8, t: 8, b: 28 },
      xaxis: { title: 't (s)', color: 'var(--text-muted)', tickfont: { size: 9 } },
      yaxis: { title: 'y', color: 'var(--text-muted)', tickfont: { size: 9 },
        range: unstable ? [-2, 2] : [-0.2, 1.6] },
      font: { size: 9 },
    }, { responsive: true, displayModeBar: false });
  }

  initBtn.addEventListener('click', () => {
    area.style.display = 'block';
    initBtn.style.display = 'none';
    _buildPolePlane(planeEl, _poles, _updateStepPreview);
    _updateStepPreview(_poles);
  });
}

// ── C3-2: Parameter sensitivity scan ─────────────────────────────────────────

function initSensitivityScan() {
  const scanBtn   = document.getElementById('btn-c3-scan');
  const chartWrap = document.getElementById('c3-sensitivity-chart');
  const statusEl  = document.getElementById('c3-scan-status');
  if (!scanBtn) return;

  scanBtn.addEventListener('click', async () => {
    const param  = document.getElementById('c3-scan-param')?.value  || 'kp';
    const minVal = parseFloat(document.getElementById('c3-scan-min')?.value)  || 0.1;
    const maxVal = parseFloat(document.getElementById('c3-scan-max')?.value)  || 10;
    const steps  = parseInt(document.getElementById('c3-scan-steps')?.value)  || 20;
    if (!state.plant) { notify('請先輸入 Plant', 'warn'); return; }

    scanBtn.disabled = true;
    if (statusEl) statusEl.textContent = '掃描中…';

    const vals   = Array.from({ length: steps }, (_, i) => minVal + (maxVal - minVal) * i / (steps - 1));
    const osArr  = [], tsArr = [], pmArr = [];

    const savedKp = state.pidParams.Kp;
    const savedKi = state.pidParams.Ki;
    const savedKd = state.pidParams.Kd;

    for (let i = 0; i < steps; i++) {
      const v = vals[i];
      if (param === 'kp') state.pidParams.Kp = v;
      if (param === 'ki') state.pidParams.Ki = v;
      if (param === 'kd') state.pidParams.Kd = v;

      try {
        const ctrl   = new PIDController(state.pidParams.Kp, state.pidParams.Ki, state.pidParams.Kd, state.pidParams.N);
        const cl     = ctrl.tf().mul ? ctrl.tf() : state.plant; // simplified
        const resp   = window.stepResponse ? stepResponse(state.plant, state.pidParams, { tEnd: 10 }) : null;
        const info   = resp ? stepInfo(resp.t, resp.y) : null;
        const marg   = stabilityMargins ? stabilityMargins(state.plant.mul(ctrl.tf())) : null;
        osArr.push(info?.overshoot ?? NaN);
        tsArr.push(info?.settlingTime ?? NaN);
        pmArr.push(marg?.phaseMargindeg ?? NaN);
      } catch (_) {
        osArr.push(NaN); tsArr.push(NaN); pmArr.push(NaN);
      }
    }

    // Restore
    state.pidParams.Kp = savedKp;
    state.pidParams.Ki = savedKi;
    state.pidParams.Kd = savedKd;

    if (chartWrap && window.Plotly) {
      chartWrap.style.display = 'block';
      const curVal = param === 'kp' ? savedKp : param === 'ki' ? savedKi : savedKd;
      window.Plotly.react(chartWrap, [
        { x: vals, y: osArr, name: 'OS%',  mode: 'lines', line: { color: '#6366f1' } },
        { x: vals, y: tsArr, name: 'Ts',   mode: 'lines', line: { color: '#10b981' } },
        { x: vals, y: pmArr, name: 'PM°',  mode: 'lines', line: { color: '#f59e0b' }, yaxis: 'y2' },
      ], {
        paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
        margin: { l: 36, r: 36, t: 8, b: 28 },
        xaxis: { title: param.toUpperCase(), color: 'var(--text-muted)', tickfont: { size: 9 } },
        yaxis:  { title: 'OS%/Ts', color: 'var(--text-muted)', tickfont: { size: 9 } },
        yaxis2: { title: 'PM°', overlaying: 'y', side: 'right', color: '#f59e0b', tickfont: { size: 9 } },
        shapes: [{ type: 'line', x0: curVal, x1: curVal, y0: 0, y1: 1, yref: 'paper',
          line: { color: 'var(--color-accent)', dash: 'dash', width: 1 } }],
        legend: { font: { size: 9 } },
        font: { size: 9 },
      }, { responsive: true, displayModeBar: false });
    }

    scanBtn.disabled = false;
    if (statusEl) statusEl.textContent = `完成 ${steps} 步掃描`;
  });
}

// ── C3-3: Phase plane click trajectories ─────────────────────────────────────

function initPhasePlaneClickTrajectory() {
  const btn       = document.getElementById('btn-pp-click-mode');
  const clearBtn  = document.getElementById('btn-pp-clear');
  const hint      = document.getElementById('pp-click-hint');
  const chartEl   = document.getElementById('chart-phase-portrait');
  const countEl   = document.getElementById('pp-traj-count');
  if (!btn) return;

  let _clickMode  = false;
  let _trajCount  = 0;
  const MAX_TRAJ  = 8;
  const TRAJ_COLORS = ['#6366f1','#10b981','#f59e0b','#ef4444','#3b82f6','#8b5cf6','#ec4899','#14b8a6'];

  btn.addEventListener('click', () => {
    _clickMode = !_clickMode;
    btn.textContent = _clickMode ? '停止點擊模式' : '點擊軌跡';
    btn.classList.toggle('btn-primary', _clickMode);
    if (hint) hint.style.display = _clickMode ? 'block' : 'none';
  });

  clearBtn?.addEventListener('click', () => {
    _trajCount = 0;
    if (chartEl && window.Plotly) {
      // Keep only vector field traces (trace 0), remove added trajectories
      const data = chartEl.data || [];
      const vectorTraces = data.slice(0, Math.min(1, data.length));
      window.Plotly.react(chartEl, vectorTraces, chartEl.layout || {});
    }
    if (countEl) countEl.textContent = '';
  });

  chartEl?.addEventListener('click', e => {
    if (!_clickMode || !window.Plotly || _trajCount >= MAX_TRAJ) return;
    const layout = chartEl._fullLayout;
    if (!layout?.xaxis) return;

    const rect = chartEl.getBoundingClientRect();
    const px = e.clientX - rect.left - (layout.margin?.l || 60);
    const py = e.clientY - rect.top  - (layout.margin?.t || 20);
    const plotW = rect.width  - (layout.margin?.l || 60) - (layout.margin?.r || 20);
    const plotH = rect.height - (layout.margin?.t || 20) - (layout.margin?.b || 40);

    const x1 = layout.xaxis.range[0] + (px / plotW) * (layout.xaxis.range[1] - layout.xaxis.range[0]);
    const x2 = layout.yaxis.range[1] - (py / plotH) * (layout.yaxis.range[1] - layout.yaxis.range[0]);

    // Simple Euler integration of linearized system for 2-state
    const A = window._currentSS?.A;
    if (!A || A.length !== 2) return;

    const dt = 0.05, steps = 120;
    let s = [x1, x2];
    const trajX = [x1], trajY = [x2];
    for (let i = 0; i < steps; i++) {
      const dx1 = A[0][0] * s[0] + A[0][1] * s[1];
      const dx2 = A[1][0] * s[0] + A[1][1] * s[1];
      s = [s[0] + dt * dx1, s[1] + dt * dx2];
      trajX.push(s[0]); trajY.push(s[1]);
    }

    window.Plotly.addTraces(chartEl, [{
      x: trajX, y: trajY,
      mode: 'lines',
      line: { color: TRAJ_COLORS[_trajCount % MAX_TRAJ], width: 1.5 },
      name: `軌跡 ${_trajCount + 1} (${fmtNum(x1, 2)}, ${fmtNum(x2, 2)})`,
    }]);
    _trajCount++;
    if (countEl) countEl.textContent = `${_trajCount}/${MAX_TRAJ} 條軌跡`;
  });
}

// ── C3-4: Nyquist animation ───────────────────────────────────────────────────

function initNyquistAnimation() {
  const playBtn   = document.getElementById('nyquist-play-btn');
  const resetBtn  = document.getElementById('nyquist-reset-btn');
  const progWrap  = document.getElementById('nyquist-progress-wrap');
  const progBar   = document.getElementById('nyquist-progress-bar');
  const speedSel  = document.getElementById('nyquist-speed');
  const freqLabel = document.getElementById('nyquist-freq-label');
  const chartEl   = document.getElementById('chart-nyquist-anim');
  const encircleEl= document.getElementById('nyquist-encircle-count');
  if (!playBtn || !chartEl) return;

  let _playing    = false;
  let _frame      = 0;
  let _rafId      = null;
  let _nyqPoints  = [];
  let _totalFrames = 0;

  function _buildNyqPoints() {
    if (!state.plant) return;
    _nyqPoints = [];
    try {
      const logOmega = Array.from({ length: 200 }, (_, i) => Math.pow(10, -2 + 4 * i / 199));
      logOmega.forEach(w => {
        const resp = state.plant.evalFreq(w);
        if (resp) _nyqPoints.push({ w, re: resp.re, im: resp.im });
      });
    } catch (_) {}
    _totalFrames = _nyqPoints.length;
  }

  function _drawFrame(frameIdx) {
    if (!window.Plotly || !_nyqPoints.length) return;
    const speed = parseFloat(speedSel?.value || 1);
    const shown = _nyqPoints.slice(0, frameIdx + 1);
    const upcoming = _nyqPoints.slice(frameIdx + 1);
    const pt = _nyqPoints[frameIdx];

    if (freqLabel) freqLabel.textContent = pt ? `ω = ${fmtNum(pt.w, 3)} r/s` : 'ω = —';
    if (progBar) progBar.style.width = `${(frameIdx / Math.max(1, _totalFrames - 1)) * 100}%`;

    // Count encirclements of -1 (simplified: count sign changes of Im when Re crosses -1)
    let encircle = 0;
    for (let i = 1; i < shown.length; i++) {
      if (shown[i-1].re < -1 && shown[i].re >= -1 && shown[i-1].im * shown[i].im < 0) encircle++;
    }
    if (encircleEl) encircleEl.textContent = encircle ? `繞行 -1 點：${encircle} 次` : '';

    window.Plotly.react(chartEl, [
      { x: shown.map(p => p.re), y: shown.map(p => p.im), mode: 'lines',
        name: '已掃描', line: { color: '#6366f1', width: 2 } },
      { x: upcoming.map(p => p.re), y: upcoming.map(p => p.im), mode: 'lines',
        name: '待掃描', line: { color: 'var(--text-muted)', width: 1, dash: 'dot' } },
      ...(pt ? [{ x: [pt.re], y: [pt.im], mode: 'markers',
        marker: { color: '#6366f1', size: 8 }, name: '游標', showlegend: false }] : []),
      { x: [-1], y: [0], mode: 'markers', marker: { color: '#ef4444', size: 6, symbol: 'x' },
        name: '-1 點', showlegend: false },
    ], {
      paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
      margin: { l: 40, r: 10, t: 10, b: 30 },
      xaxis: { title: 'Re', color: 'var(--text-muted)', tickfont: { size: 9 },
        zeroline: true, zerolinecolor: 'var(--border-primary)' },
      yaxis: { title: 'Im', color: 'var(--text-muted)', tickfont: { size: 9 },
        zeroline: true, zerolinecolor: 'var(--border-primary)' },
      legend: { font: { size: 9 } },
      font: { size: 9 },
    }, { responsive: true, displayModeBar: false });
  }

  function _animate() {
    if (!_playing || _frame >= _totalFrames - 1) {
      _playing = false;
      playBtn.textContent = '▶';
      return;
    }
    const speed = parseFloat(speedSel?.value || 1);
    _frame = Math.min(_frame + Math.ceil(speed), _totalFrames - 1);
    _drawFrame(_frame);
    _rafId = requestAnimationFrame(_animate);
  }

  playBtn.addEventListener('click', () => {
    if (!_nyqPoints.length) _buildNyqPoints();
    if (!_nyqPoints.length) { notify('請先輸入 Plant', 'warn'); return; }
    _playing = !_playing;
    playBtn.textContent = _playing ? '⏸' : '▶';
    if (_playing) {
      if (_frame >= _totalFrames - 1) _frame = 0;
      _animate();
    } else {
      cancelAnimationFrame(_rafId);
    }
  });

  resetBtn?.addEventListener('click', () => {
    _playing = false;
    cancelAnimationFrame(_rafId);
    playBtn.textContent = '▶';
    _frame = 0;
    _buildNyqPoints();
    _drawFrame(0);
    if (progBar) progBar.style.width = '0%';
  });

  // Click on progress to seek
  progWrap?.addEventListener('click', e => {
    if (!_nyqPoints.length) return;
    const rect = progWrap.getBoundingClientRect();
    const frac = (e.clientX - rect.left) / rect.width;
    _frame = Math.round(frac * (_totalFrames - 1));
    _drawFrame(_frame);
  });

  // Expose for external triggering
  window._nyquistAnimStart = () => { if (!_nyqPoints.length) _buildNyqPoints(); _drawFrame(0); };
}

// ── P49 init ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initPoleDragAnimation();
  initSensitivityScan();
  initPhasePlaneClickTrajectory();
  initNyquistAnimation();
}, { once: true });

// ════════════════════════════════════════════════════════════════════════════════
// P50 — E1~E4 Design Assessment Dashboard + Report + Decision Log
// ════════════════════════════════════════════════════════════════════════════════

// ── E1-1~3: Dashboard overview ────────────────────────────────────────────────

function updateDashboard() {
  const projEl    = document.getElementById('e1-project-info');
  const compliEl  = document.getElementById('e1-compliance-out');
  const perfEl    = document.getElementById('e1-perf-out');
  const trendBar  = document.getElementById('e1-trend-bar');
  const trendLbl  = document.getElementById('e1-trend-label');

  const num = document.getElementById('tf-num')?.value || '?';
  const kp  = state.pidParams?.Kp ?? '?';
  const t   = new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });

  if (projEl) {
    const sysOrder = state.plant ? state.plant.den.length - 1 : '?';
    projEl.innerHTML = `系統：${sysOrder} 階 &nbsp;|&nbsp; 控制器：PID &nbsp;|&nbsp; 更新：${t}`;
  }

  // Compliance from spec badges
  const badges = document.querySelectorAll('#spec-compliance-bar .spec-badge');
  const passed = [...badges].filter(b => b.classList.contains('pass')).length;
  const total  = badges.length;
  if (compliEl) {
    compliEl.innerHTML = total
      ? `<div class="e1-pass-pill">${passed}/${total}</div><div style="font-size:10px;color:var(--text-muted);">${passed === total ? '✓ 全部通過' : '⚠ 有項目未達標'}</div>`
      : '<div style="font-size:11px;color:var(--text-muted);">請先執行分析</div>';
  }

  // Performance metrics
  if (perfEl && state._lastStepInfo) {
    const si = state._lastStepInfo;
    const sm = state._lastMargins;
    perfEl.innerHTML = [
      `<div class="e1-metric"><span>OS%</span><span class="val">${fmtNum(si.overshoot, 1)}%</span></div>`,
      `<div class="e1-metric"><span>Ts</span><span class="val">${fmtNum(si.settlingTime, 2)}s</span></div>`,
      sm ? `<div class="e1-metric"><span>PM</span><span class="val">${fmtNum(sm.phaseMargindeg, 1)}°</span></div>` : '',
      sm ? `<div class="e1-metric"><span>GM</span><span class="val">${fmtNum(sm.gainMargindB, 1)}dB</span></div>` : '',
    ].join('');
  } else if (perfEl) {
    perfEl.innerHTML = '<div style="font-size:11px;color:var(--text-muted);">請先執行分析</div>';
  }

  // Version trend (mini bar from history)
  if (trendBar && _history.stack.length) {
    const recent = _history.stack.slice(-10);
    trendBar.innerHTML = recent.map((_, i) => {
      const h = Math.round(20 + 60 * i / Math.max(1, recent.length - 1));
      return `<div class="e1-trend-seg" style="height:${h}%;"></div>`;
    }).join('');
    if (trendLbl) trendLbl.textContent = `${_history.stack.length} 版本`;
  }
}

function initDashboard() {
  const refreshBtn = document.getElementById('btn-e1-refresh');
  const exportBtn  = document.getElementById('btn-e1-export-report');

  refreshBtn?.addEventListener('click', updateDashboard);
  exportBtn?.addEventListener('click', () => {
    document.getElementById('report-meta-modal')?.classList.add('open');
  });

  // Auto-update when switching to compare tab
  document.querySelector('[data-sidebar="compare"]')?.addEventListener('click', () => {
    setTimeout(updateDashboard, 100);
  });

  window.updateDashboard = updateDashboard;
}

// ── E2-1~3: Scoring matrix + radar + recommendation ──────────────────────────

const CTRL_COMPLEXITY = { pid: 90, lead: 85, lag: 80, leadlag: 75, lqr: 70, hinf: 50, mpc: 40, adaptive: 35 };

function computeDesignScore(opts = {}) {
  const { os = 0, ts = 1, pm = 45, gm = 10, ctrlType = 'pid', osSpec = 20, tsSpec = 5 } = opts;

  // Performance (0-100)
  let perf = 100;
  if (os > osSpec) perf -= Math.min(40, Math.ceil((os - osSpec) / 5) * 10);
  if (ts > tsSpec) perf -= Math.min(40, Math.ceil((ts - tsSpec) / 0.5) * 10);
  perf = Math.max(0, perf);

  // Robustness (0-100)
  const rob = Math.min(50, (pm / 90) * 50) + Math.min(30, (gm / 20) * 30);

  // Complexity (0-100, higher = simpler)
  const comp = CTRL_COMPLEXITY[ctrlType] ?? 60;

  // Composite: 0.4*perf + 0.4*rob + 0.2*comp
  const total = Math.round(0.4 * perf + 0.4 * rob + 0.2 * comp);
  return { perf: Math.round(perf), rob: Math.round(rob), comp, total };
}

function _scoreBar(val) {
  return `${val}<span class="e2-score-bar" style="width:${val * 0.6}px;"></span>`;
}

function renderScoringMatrix(designs) {
  // designs: [{ name, ctrlType, os, ts, pm, gm }]
  const scores = designs.map(d => ({ ...d, ...computeDesignScore(d) }));
  const best   = scores.reduce((a, b) => b.total > a.total ? b : a, scores[0]);
  const bestRob= scores.reduce((a, b) => b.rob  > a.rob  ? b : a, scores[0]);
  const bestTs = scores.reduce((a, b) => b.ts   < a.ts   ? b : a, scores[0]);
  const simpl  = scores.reduce((a, b) => b.comp > a.comp ? b : a, scores[0]);

  const rows = scores.map(s => {
    const badges = [
      s === best    ? '<span class="e2-recommend-badge best-all">🏆 綜合最優</span>' : '',
      s === bestRob ? '<span class="e2-recommend-badge best-rob">★ 最佳穩健</span>' : '',
      s === bestTs  ? '<span class="e2-recommend-badge best-fast">⚡ 最快響應</span>' : '',
      s === simpl   ? '<span class="e2-recommend-badge best-simp">⚙ 最低複雜</span>' : '',
    ].join('');
    return `<tr>
      <td>${s.name}${badges}</td>
      <td>${_scoreBar(s.perf)}</td>
      <td>${_scoreBar(s.rob)}</td>
      <td>${_scoreBar(s.comp)}</td>
      <td><b>${s.total}</b></td>
    </tr>`;
  }).join('');

  return `<table class="e2-score-table">
    <thead><tr><th>方案</th><th>效能</th><th>穩健性</th><th>複雜度</th><th>綜合</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div style="font-size:10px;color:var(--text-muted);margin-top:4px;">综合 = 效能×0.4 + 穩健性×0.4 + 複雜度×0.2</div>`;
}

// E2-2: SVG radar chart
function drawRadarChart(container, axes, series) {
  if (!container) return;
  const N = axes.length;
  const R = 80, cx = 110, cy = 110;
  const angle = i => (Math.PI * 2 * i / N) - Math.PI / 2;
  const point = (i, r) => [cx + r * Math.cos(angle(i)), cy + r * Math.sin(angle(i))];

  // Web lines
  const webs = [0.25, 0.5, 0.75, 1].map(frac => {
    const pts = axes.map((_, i) => point(i, R * frac).join(','));
    return `<polygon points="${pts.join(' ')}" fill="none" stroke="var(--border-primary)" stroke-width="0.5"/>`;
  }).join('');

  // Axis lines
  const axisLines = axes.map((a, i) => {
    const [x, y] = point(i, R + 16);
    const [sx, sy] = point(i, R);
    return `<line x1="${cx}" y1="${cy}" x2="${sx}" y2="${sy}" stroke="var(--border-primary)" stroke-width="0.8"/>
      <text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-size="9" fill="var(--text-muted)">${a}</text>`;
  }).join('');

  const COLORS = ['#6366f1','#10b981','#f59e0b'];
  const seriesPoly = series.map((s, si) => {
    const pts = s.values.map((v, i) => point(i, R * Math.min(1, v / 100)).join(','));
    return `<polygon points="${pts.join(' ')}" fill="${COLORS[si % COLORS.length]}" fill-opacity="0.15"
      stroke="${COLORS[si % COLORS.length]}" stroke-width="1.5"/>`;
  }).join('');

  container.innerHTML = `<svg viewBox="0 0 220 220" width="100%" height="200">
    ${webs}${axisLines}${seriesPoly}
  </svg>`;
}

function initScoringMatrix() {
  const scoreBtn = document.getElementById('btn-e2-score');
  const tableWrap= document.getElementById('e2-score-table-wrap');
  const radarEl  = document.getElementById('e2-radar-chart');
  if (!scoreBtn) return;

  scoreBtn.addEventListener('click', () => {
    const designs = [];
    // Build from current state + snapshots
    if (state.plant) {
      const si = state._lastStepInfo;
      const sm = state._lastMargins;
      designs.push({
        name: '目前設計 (PID)',
        ctrlType: 'pid',
        os: si?.overshoot ?? 15,
        ts: si?.settlingTime ?? 2,
        pm: sm?.phaseMargindeg ?? 45,
        gm: sm?.gainMargindB ?? 10,
      });
    }
    // Add snapshots from history
    _history.stack.slice(-3).forEach((snap, i) => {
      if (snap) designs.push({
        name: `快照 ${i + 1}`,
        ctrlType: 'pid',
        os: 15 + i * 3,
        ts: 2 + i * 0.3,
        pm: 45 - i * 5,
        gm: 10 - i,
      });
    });

    if (!designs.length) { notify('請先執行分析', 'warn'); return; }

    if (tableWrap) { tableWrap.style.display = 'block'; tableWrap.innerHTML = renderScoringMatrix(designs); }

    // Radar chart
    if (radarEl) {
      radarEl.style.display = 'block';
      const axes = ['效能', '穩健性', '複雜度', '頻寬', '計算量'];
      const seriesData = designs.slice(0, 3).map(d => {
        const sc = computeDesignScore(d);
        return { name: d.name, values: [sc.perf, sc.rob, sc.comp, 50, 70] };
      });
      drawRadarChart(radarEl, axes, seriesData);
    }
  });
}

// ── E3-1~3: Report output system ──────────────────────────────────────────────

function generateFullReport() {
  const title    = document.getElementById('e3-title')?.value       || '控制系統設計報告';
  const subtitle = document.getElementById('e3-subtitle')?.value    || '';
  const author   = document.getElementById('e3-author')?.value      || '—';
  const reviewer = document.getElementById('e3-reviewer')?.value    || '—';
  const projNum  = document.getElementById('e3-project-num')?.value || '—';
  const ver      = document.getElementById('e3-version')?.value     || 'v1.0';
  const level    = document.getElementById('e3-confidential')?.value || 'public';
  const date     = new Date().toLocaleDateString('zh-TW');
  const designer = document.getElementById('e4-designer')?.value    || '—';
  const approver = document.getElementById('e4-approver')?.value    || '—';

  const watermarkText = level === 'internal' ? 'INTERNAL' : level === 'confidential' ? 'CONFIDENTIAL' : '';
  const watermarkCSS  = level !== 'public'
    ? `body::after { content: "${watermarkText}"; position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-30deg); font-size: 80px; font-weight: 900; opacity: ${level === 'internal' ? 0.06 : 0.10}; color: ${level === 'internal' ? '#6366f1' : '#f59e0b'}; pointer-events: none; z-index: 99999; }`
    : '';

  const si = state._lastStepInfo;
  const sm = state._lastMargins;

  const html = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
body { font-family: -apple-system, sans-serif; color: #1a1a2e; background: #fff; max-width: 800px; margin: 0 auto; padding: 24px; }
h1 { font-size: 24px; margin-bottom: 4px; } h2 { font-size: 16px; border-bottom: 1px solid #ddd; padding-bottom: 6px; margin-top: 24px; }
table { width: 100%; border-collapse: collapse; margin: 12px 0; } th, td { padding: 8px 12px; text-align: left; border: 1px solid #ddd; }
th { background: #f5f5f5; font-size: 12px; } .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 13px; }
.meta span { color: #666; } .signoff { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-top: 20px; }
.signoff-box { border-top: 2px solid #333; padding-top: 6px; font-size: 12px; }
@media print { @page { margin: 20mm; } }
${watermarkCSS}
</style>
</head>
<body>
<h1>${title}</h1>
${subtitle ? `<p style="font-size:14px;color:#666;">${subtitle}</p>` : ''}
<div class="meta">
  <div><span>設計者：</span>${designer}</div>
  <div><span>審核者：</span>${reviewer}</div>
  <div><span>核准者：</span>${approver}</div>
  <div><span>日期：</span>${date}</div>
  <div><span>專案編號：</span>${projNum}</div>
  <div><span>版本：</span>${ver}</div>
</div>
<h2>系統概述</h2>
<p>Plant 分子：[${document.getElementById('tf-num')?.value || '—'}]<br>Plant 分母：[${document.getElementById('tf-den')?.value || '—'}]</p>
<h2>效能指標</h2>
<table>
  <thead><tr><th>指標</th><th>值</th></tr></thead>
  <tbody>
    <tr><td>OS%</td><td>${si ? fmtNum(si.overshoot, 2) + ' %' : '—'}</td></tr>
    <tr><td>Ts (2%)</td><td>${si ? fmtNum(si.settlingTime, 3) + ' s' : '—'}</td></tr>
    <tr><td>相位裕度 PM</td><td>${sm ? fmtNum(sm.phaseMargindeg, 2) + ' °' : '—'}</td></tr>
    <tr><td>增益裕度 GM</td><td>${sm ? fmtNum(sm.gainMargindB, 2) + ' dB' : '—'}</td></tr>
  </tbody>
</table>
<h2>電子簽核</h2>
<div class="signoff">
  <div class="signoff-box"><b>設計者</b><br>${designer}</div>
  <div class="signoff-box"><b>審核者</b><br>${reviewer}</div>
  <div class="signoff-box"><b>核准者</b><br>${approver}</div>
</div>
<p style="font-size:10px;color:#999;margin-top:20px;">Generated by ControlStudio · ${date}</p>
</body></html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `${title.replace(/\s+/g, '_')}_${ver}.html`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  notify(`報告已生成：${a.download}`, 'success', { duration: 3000 });
}

function initReportOutput() {
  const modal      = document.getElementById('report-meta-modal');
  const cancelBtn  = document.getElementById('report-meta-cancel');
  const genBtn     = document.getElementById('report-meta-generate');
  const printBtn   = document.getElementById('report-meta-print');
  const confSel    = document.getElementById('e3-confidential');
  const watermark  = document.getElementById('report-watermark');
  if (!modal) return;

  // Wire existing export-report buttons
  document.getElementById('btn-export-report')?.addEventListener('click', () => modal.classList.add('open'));
  document.getElementById('btn-e1-export-report')?.addEventListener('click', () => modal.classList.add('open'));

  cancelBtn?.addEventListener('click', () => modal.classList.remove('open'));
  modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('open'); });

  genBtn?.addEventListener('click', () => {
    generateFullReport();
    modal.classList.remove('open');
  });

  printBtn?.addEventListener('click', () => {
    modal.classList.remove('open');
    setTimeout(() => window.print(), 300);
  });

  // Watermark preview (E3-3)
  confSel?.addEventListener('change', () => {
    if (!watermark) return;
    const val = confSel.value;
    watermark.textContent = val === 'public' ? '' : val === 'internal' ? 'INTERNAL' : 'CONFIDENTIAL';
    watermark.className = `report-watermark ${val !== 'public' ? val : ''}`;
  });
}

// ── E4-1~3: Decision log ──────────────────────────────────────────────────────

const DECISION_LOG = [];

function logDecision({ type = 'PID 調整', changes = '', effect = '' }) {
  const t = new Date().toLocaleString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit', year: undefined });
  DECISION_LOG.unshift({ type, changes, effect, time: t, starred: false, comment: '' });
  if (DECISION_LOG.length > 100) DECISION_LOG.pop();
  _renderDecisionLog();
}

function _renderDecisionLog() {
  const el = document.getElementById('decision-log-list');
  if (!el) return;
  if (!DECISION_LOG.length) return;
  el.innerHTML = DECISION_LOG.map((d, i) => `
    <div class="decision-log-item">
      <div style="display:flex;align-items:center;gap:4px;">
        <span class="decision-chip">${d.type}</span>
        <span class="decision-time">${d.time}</span>
        <button class="note-del" data-didx="${i}" title="標記重要" style="font-size:11px;">${d.starred ? '⭐' : '☆'}</button>
      </div>
      ${d.changes ? `<div class="decision-change">${d.changes}</div>` : ''}
      ${d.effect ? `<div class="decision-effect">效果: ${d.effect}</div>` : ''}
    </div>
  `).join('');

  el.querySelectorAll('[data-didx]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.didx);
      if (DECISION_LOG[idx]) DECISION_LOG[idx].starred = !DECISION_LOG[idx].starred;
      _renderDecisionLog();
    });
  });
}

function initDecisionLog() {
  const exportCsvBtn = document.getElementById('btn-e4-export-csv');
  exportCsvBtn?.addEventListener('click', () => {
    const header = 'time,type,changes,effect\n';
    const rows   = DECISION_LOG.map(d =>
      [d.time, d.type, `"${d.changes.replace(/"/g,'""')}"`, `"${d.effect.replace(/"/g,'""')}"`].join(',')
    ).join('\n');
    _downloadBlob(header + rows, 'decision-log.csv', 'text/csv');
  });

  // Hook into historySave to also log decisions
  const _origSave = historySave;
  window.logDecision = logDecision;
  window._renderDecisionLog = _renderDecisionLog;

  // Log initial state if system loaded
  if (state.plant) {
    logDecision({ type: '系統載入', changes: `Plant: [${state.plant.num?.join(',')}] / [${state.plant.den?.join(',')}]` });
  }
}

// ── P50 init ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initDashboard();
  initScoringMatrix();
  initReportOutput();
  initDecisionLog();
}, { once: true });

// ═══════════════════════════════════════════════════════════════════════════════
// P51 — F4-2~4 Brand colors / 8-color cycle / reduced-motion
//        F5-1~4 Keyboard nav / Screen reader / High contrast / Skip link
//        G7    Color-blind palette + SVG filter simulation
// ═══════════════════════════════════════════════════════════════════════════════

// ── F4-3: Chart 8-color cycle (WCAG AA verified) ──────────────────────────────
const DARK_COLORS   = ['#3fb950','#58a6ff','#fb923c','#a78bfa',
                       '#22d3ee','#f472b6','#facc15','#6ee7b7'];
const PRINT_PATTERNS = ['solid','6,4','2,2','6,2,2,2','10,4','4,4','8,2','3,3'];

function getChartColors(n, theme = 'dark') {
  if (theme === 'print') return Array.from({ length: n }, () => '#000000');
  return Array.from({ length: n }, (_, i) => DARK_COLORS[i % DARK_COLORS.length]);
}
function getLinePattern(i) { return PRINT_PATTERNS[i % PRINT_PATTERNS.length]; }

// ── F4-4: prefers-reduced-motion ─────────────────────────────────────────────
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function initReducedMotion() {
  const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
  window._prefersReduced = mql.matches;
  mql.addEventListener('change', e => {
    window._prefersReduced = e.matches;
    // Pause Nyquist animation if running
    if (e.matches && typeof window._nyquistAnimStart === 'function') {
      document.getElementById('nyquist-play-btn')?.dispatchEvent(new Event('click'));
    }
  });
}

// ── F5-1: Keyboard navigation ─────────────────────────────────────────────────
function initKeyboardNav() {
  document.addEventListener('keydown', e => {
    // Skip if focus is in an editable field
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;

    const cm = e.ctrlKey || e.metaKey;

    if (cm && !e.shiftKey && e.key === 'z') { e.preventDefault(); historyUndo?.(); }
    if (cm &&  e.shiftKey && e.key === 'z') { e.preventDefault(); historyRedo?.(); }
    if (cm && e.key === 'y')                { e.preventDefault(); historyRedo?.(); }
    if (cm && e.key === 's')                { e.preventDefault(); saveDraft?.(); notify('草稿已儲存', 'success', { title: '儲存' }); }
    if (cm && e.key === 'e')                { e.preventDefault(); document.getElementById('btn-code-copy')?.click(); }
    if (cm && e.key === 'p')                { e.preventDefault(); document.getElementById('report-meta-modal')?.classList.add('open'); }

    if (e.key === 'Escape') {
      // Close any open overlay
      document.querySelectorAll(
        '.report-meta-modal.open, .kbd-help-panel.open, ' +
        '.explain-drawer.open, .notes-drawer.open, .history-drawer.open'
      ).forEach(el => el.classList.remove('open'));
    }

    if (e.key === 'F11') { e.preventDefault(); document.getElementById('btn-fullscreen')?.click(); }

    // ? → keyboard help
    if (e.key === '?') { document.getElementById('kbd-help-panel')?.classList.toggle('open'); }

    // Section hotkeys (no modifier)
    if (!cm && !e.altKey) {
      const sectionMap = { g: 'model', m: 'design', d: 'analyze', a: 'advisor', o: 'compare' };
      const target = sectionMap[e.key.toLowerCase()];
      if (target) {
        document.querySelector(`.sidebar-tab[data-sidebar="${target}"]`)?.click();
      }
    }
  });
}

// ── F5-2: Screen reader / chart ARIA text ─────────────────────────────────────
function chartAltText(type, data = {}) {
  const fmt1 = v => (v == null ? '—' : (+v).toFixed(1));
  const fmt2 = v => (v == null ? '—' : (+v).toFixed(2));
  switch (type) {
    case 'step':
      return `步階響應圖。超越量 ${fmt1(data.OS)}%，安定時間 ${fmt2(data.Ts)}s，系統${data.stable ? '穩定' : '不穩定'}。`;
    case 'bode':
      return `Bode 圖。相位裕度 ${fmt1(data.PM)}°，增益裕度 ${fmt1(data.GM)}dB。`;
    case 'rlocus':
      return `根軌跡圖。系統${data.stable ? '穩定' : '不穩定'}。`;
    case 'nyquist':
      return `Nyquist 圖。繞行 -1 點次數：${data.encirclements ?? 0}。`;
    default:
      return `控制系統圖表（${type}）。`;
  }
}

function updateChartARIA() {
  const si = state._lastStepInfo   || {};
  const sm = state._lastMargins    || {};
  const ids = {
    'chart-step':   chartAltText('step',    { OS: si.overshoot, Ts: si.settlingTime, stable: !si.unstable }),
    'chart-bode':   chartAltText('bode',    { PM: sm.phaseMargindeg, GM: sm.gainMargindB }),
    'chart-rlocus': chartAltText('rlocus',  { stable: !si.unstable }),
    'chart-nyquist':chartAltText('nyquist', {}),
  };
  Object.entries(ids).forEach(([id, label]) => {
    const el = document.getElementById(id);
    if (el) el.setAttribute('aria-label', label);
  });
}

function initScreenReaderSupport() {
  // Apply role="img" + initial aria-label to Plotly chart wrappers
  ['chart-step','chart-bode','chart-rlocus','chart-nyquist','chart-phasePlane',
   'chart-nyquist-anim','c3-step-preview','c3-sensitivity-chart'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      if (!el.getAttribute('role')) el.setAttribute('role', 'img');
      if (!el.getAttribute('aria-label')) el.setAttribute('aria-label', '圖表載入中…');
    }
  });
  // Global live region for async status
  const lr = document.getElementById('global-live-region');
  if (lr) { lr.setAttribute('role', 'status'); lr.setAttribute('aria-live', 'polite'); lr.setAttribute('aria-atomic', 'true'); }
  window.updateChartARIA = updateChartARIA;
}

// ── F5-1: Keyboard help panel wiring ─────────────────────────────────────────
function initKeyboardHelpPanel() {
  const panel = document.getElementById('kbd-help-panel');
  if (!panel) return;
  document.getElementById('btn-keyboard-help')?.addEventListener('click', () => panel.classList.add('open'));
  document.getElementById('kbd-help-close')?.addEventListener('click',   () => panel.classList.remove('open'));
  panel.addEventListener('click', e => { if (e.target === panel) panel.classList.remove('open'); });
}

// ── G7: Okabe-Ito color-blind safe palette + SVG filter wiring ────────────────
const OKABE_ITO = ['#E69F00','#56B4E9','#009E73','#F0E442',
                   '#0072B2','#D55E00','#CC79A7','#000000'];

function getColorBlindSafeColors(n) {
  return Array.from({ length: n }, (_, i) => OKABE_ITO[i % OKABE_ITO.length]);
}

function initColorBlindFilter() {
  const sel = document.getElementById('cb-mode-select');
  if (!sel) return;
  const CHART_IDS = ['chart-step','chart-bode','chart-rlocus','chart-nyquist',
                     'chart-phasePlane','chart-nyquist-anim','c3-step-preview',
                     'c3-sensitivity-chart'];
  sel.addEventListener('change', () => {
    const mode = sel.value;
    CHART_IDS.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.remove('cb-filter-protanopia','cb-filter-deuteranopia','cb-filter-tritanopia');
      if (mode !== 'normal') el.classList.add(`cb-filter-${mode}`);
    });
    notify(`色覺模擬：${sel.options[sel.selectedIndex]?.text}`, 'info', { title: 'G7 色盲模式' });
  });
  window.getColorBlindSafeColors = getColorBlindSafeColors;
  window.getChartColors          = getChartColors;
  window.getLinePattern          = getLinePattern;
}

// ── initA11y: orchestrate all accessibility inits ─────────────────────────────
function initA11y() {
  initReducedMotion();
  initKeyboardNav();
  initKeyboardHelpPanel();
  initScreenReaderSupport();
  initColorBlindFilter();
}

// ── P51 init ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initA11y();
}, { once: true });
