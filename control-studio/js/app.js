import { TransferFunction } from './control/transfer-function.js';
import { DiscreteTransferFunction } from './control/discrete-transfer-function.js';
import { parseMatrixInput, stateSpaceToTransferFunction, controllabilityMatrix, observabilityMatrix } from './control/state-space.js?v=p5';
import { matRank } from './math/matrix.js?v=p5';
import { PIDController, TwoDOFPIDController } from './control/pid.js';
import { compensatorDescription, designLagCompensator, designLeadCompensator, leadLagTransferFunction, normalizeCompensatorConfig, notchFilter, notchFilterDescription } from './control/compensator.js?v=control-lag-1';
import { impulseResponse, rampResponse, simulatePIDAntiWindup, stepResponse } from './analysis/time-response.js';
import { discreteStepResponse } from './analysis/discrete-response.js';
import { bodeData, nyquistData, autoFreqRange, nicholsData, nyquistEncirclements } from './analysis/frequency-response.js';
import { discreteBodeData } from './analysis/discrete-frequency-response.js?v=p5';
import { rootLocusData, rootLocusAsymptotes, rootLocusBreakPoints, rootLocusJwCrossings, sortRootLocusBranches } from './analysis/root-locus.js?v=p4';
import { stabilityMargins, stepInfo, routhTable, analyzeStability } from './control/stability.js';
import { parsePolyString, fmtNum, fmtDeg, fmtDB, fmtTime, fmtPercent } from './utils/format.js';
import { zpkToTransferFunction, parseRootsString } from './control/zpk.js';
import { c2dMatchedZ, c2dTustin, c2dTustinPrewarp, c2dZOH } from './control/c2d.js?v=p5';
import { specsToTargetPoles, designLeadForPM, deadbeatGain } from './control/design.js?v=p5';
import { polyadd, polyscale, polyroots } from './math/polynomial.js?v=p4';
import { Complex } from './math/complex.js';
import { analyzeLyapunov, augmentWithIntegralAction, brysonsRule, checkPoleRegion, closedLoopTransferFromStateFeedback, designIntegralLQR, discretizeZOH, innovationStats, lqrWithPoleRegion, observerPoles, placeObserver, placeStateFeedback, resolveDesignStateSpace, simulateLqg, simulateObserver, solveDiscreteKalman, solveLqe, solveLqr, solveLqrMIMO } from './control/state-feedback.js?v=p8d';
import { matIdentity, matTranspose, matSub, matMul } from './math/matrix.js?v=p5';
import { BlockEditor } from './editor/editor.js';
import { MIMOStateSpace, parseMIMOMatrices, rgaSteady, rgaDiagnosis, rgaInvariants, singularValueBode, staticDecoupler, applyDecoupler, dynamicDecouplerAtFrequency, evalAtJw, singularValues } from './control/mimo.js';
import { simulateConstrainedMpc, simulateUnconstrainedMpc } from './control/mpc.js';
import { sensitivityBode, robustPeaks, uncertaintyEnvelope, hInfNorm, additiveUncertaintyEnvelope, diskMargin } from './control/robust.js';
import { applyDelay, padeApprox, delayMargin, smithPredictor } from './control/delay.js';
import { polyToLatex, tfToLatex, renderLatex, pidToLatex } from './utils/latex.js';
import { setSeed, getSeed, resetSeed } from './math/rng.js';
import { identifyARMAX, identifyARX, autoARXOrder } from './control/sysid.js';
import { toMatlabScript, toPythonScript, downloadScript } from './utils/codegen.js';
import { mixedSensitivityCost, tunePIDForMixedSensitivity, defaultMixedSensitivityWeights } from './control/hinf_synth.js';
import { gaTunePID, nsga2TunePID } from './control/ga_tuner.js';
import { runLinearEKF } from './control/ekf.js';
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
    if (!state.plant || state.domain !== 's') return;
    const Ts = Number(document.getElementById('c2d-ts')?.value);
    const method = document.getElementById('c2d-method')?.value || 'tustin';
    try {
      let disc;
      if (method === 'zoh') {
        disc = c2dZOH(state.plant, Ts);
      } else if (method === 'tustin-prewarp') {
        const omegaW = parseFloat(document.getElementById('c2d-prewarp-omega')?.value || '1');
        disc = c2dTustinPrewarp(state.plant, Ts, omegaW);
      } else if (method === 'matched-z') {
        disc = c2dMatchedZ(state.plant, Ts);
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
    } catch (err) {
      showError(err.message);
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
  document.getElementById('btn-apply-lead-helper')?.addEventListener('click', applyLeadHelper);
  document.getElementById('btn-apply-lag-helper')?.addEventListener('click', applyLagHelper);
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
    }).catch(() => {
      prompt('Share URL (Ctrl+C to copy):', url);
    });
  });

  // ── Undo / Redo buttons & keyboard shortcuts ─────────────────
  document.getElementById('btn-undo')?.addEventListener('click', historyUndo);
  document.getElementById('btn-redo')?.addEventListener('click', historyRedo);

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') { e.preventDefault(); historyUndo(); }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); historyRedo(); }
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
    const isActive = tab.dataset.sidebar === panelName;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
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
      historySave();
      clearError();
      return;
    }

    if (preset.startsWith('tl-')) {
      const Ku = readRequiredPositiveNumber('preset-ku', 'Ku');
      const Tu = readRequiredPositiveNumber('preset-tu', 'Tu');
      const type = preset === 'tl-pi' ? 'PI' : 'PID';
      setPIDFromController(PIDController.tyreusLuyben(Ku, Tu, type), `tyreus-luyben-${type.toLowerCase()}`);
      historySave();
      clearError();
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
    const uSeq = Array.from({ length: steps }, (_, k) => [k < 5 ? 0 : 1]); // step input

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
  showError('已清除本地 session autosave');
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

  // L1: title is shown in the chart-header (#active-plot-title); avoid duplicating it inside the plot.
  const layout = PLOTLY_LAYOUT_BASE();
  layout.showlegend = true;
  layout.legend = compactLegend();
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

      // Gain crossover (where |G|=0 dB) → mark PM
      if (Number.isFinite(margins.gainCrossover) && margins.gainCrossover > 0) {
        const wgc = margins.gainCrossover;
        traces.push({
          x: [wgc, wgc], y: [magMin, magMax],
          type: 'scatter', mode: 'lines',
          line: { color: getCSS('--color-stable'), width: 1, dash: 'dash' },
          name: `ω_gc=${fmtNum(wgc, 3)}`, hoverinfo: 'name',
        });
        if (Number.isFinite(margins.phaseMargin)) {
          annotations.push({
            x: Math.log10(wgc), y: 0, xref: 'x', yref: 'y',
            text: `PM=${fmtDeg(margins.phaseMargin)}`, showarrow: true, arrowhead: 0,
            ax: 30, ay: -20, font: { size: 10, color: getCSS('--color-stable') },
          });
        }
      }
      // Phase crossover (where ∠G=-180°) → mark GM
      if (Number.isFinite(margins.phaseCrossover) && margins.phaseCrossover > 0) {
        const wpc = margins.phaseCrossover;
        traces.push({
          x: [wpc, wpc], y: [phaseMin, phaseMax],
          type: 'scatter', mode: 'lines', yaxis: 'y2',
          line: { color: getCSS('--color-unstable'), width: 1, dash: 'dash' },
          name: `ω_pc=${fmtNum(wpc, 3)}`, hoverinfo: 'name',
        });
        if (Number.isFinite(margins.gainMarginDB)) {
          annotations.push({
            x: Math.log10(wpc), y: -180, xref: 'x', yref: 'y2',
            text: `GM=${fmtDB(margins.gainMarginDB)}`, showarrow: true, arrowhead: 0,
            ax: 30, ay: 20, font: { size: 10, color: getCSS('--color-unstable') },
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
  layout.yaxis.scaleanchor = 'x';
  if (encirclements !== 0) {
    layout.annotations = [{ x: -1, y: 0.3, text: `N=${encirclements}`, showarrow: false, font: { size: 12, color: getCSS('--color-unstable') } }];
  }
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

// Non-blocking informational banner (toast) — distinct visual from showError
// (which is red and treated as failure). Auto-dismisses after 6 s.
let _bannerAutoDismissTimer = null;
function showBanner(msg) {
  let el = document.getElementById('info-banner');
  if (!el) {
    el = document.createElement('div');
    el.id = 'info-banner';
    el.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(245,158,11,0.95);color:#0f1117;padding:10px 18px;border-radius:8px;font-size:12px;z-index:1000;box-shadow:0 10px 25px rgba(0,0,0,0.25);max-width:80%;line-height:1.5;';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.display = 'block';
  if (_bannerAutoDismissTimer) clearTimeout(_bannerAutoDismissTimer);
  _bannerAutoDismissTimer = setTimeout(() => { if (el) el.style.display = 'none'; }, 6000);
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
  }

  return { init, showModal, hideModal, confirm, setLoading, withLoading, collapseAll, expandAll, loadPreset };
})();

window.toggleTheme = toggleTheme;
window.csUI = csUI;
window.ControlStudioSmoke = {
  getState: controlStudioSmokeState,
  run: runControlStudioSmoke,
};
