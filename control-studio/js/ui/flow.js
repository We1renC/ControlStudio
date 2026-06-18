/**
 * flow.js — P62 Design Flow State Machine
 *
 * K1-1  Flow bar step computation & rendering
 * K1-2  Spec validation predicates
 * K1-4  Kp quick recommendation card
 *
 * Inject via initFlowModule(ctx) before calling initFlowBar() / initKpRecommend().
 * ctx: { state, updateGlobalStatusBar, switchWorkflowTab, bodeData, autoFreqRange }
 */

let _ctx = null;

export function initFlowModule(ctx) {
  _ctx = ctx;
}

// ── K1-2: Spec helper predicates ─────────────────────────────────────────────

export function hasAnySpec() {
  return !!(
    document.getElementById('design-os')?.value ||
    document.getElementById('design-ts')?.value ||
    document.getElementById('design-pm')?.value ||
    document.getElementById('design-tr')?.value
  );
}

export function allSpecsReasonable() {
  const os = parseFloat(document.getElementById('design-os')?.value);
  const pm = parseFloat(document.getElementById('design-pm')?.value);
  const ts = parseFloat(document.getElementById('design-ts')?.value);
  if (Number.isFinite(os) && (os < 0 || os > 80)) return false;
  if (Number.isFinite(pm) && (pm < 0 || pm > 90)) return false;
  if (Number.isFinite(ts) && ts <= 0) return false;
  return true;
}

export function allSpecsPassing() {
  const stab = _ctx.state._lastStability;
  if (!stab || stab.status === 'unstable') return false;
  const pm = stab.phaseMargin;
  const gm = stab.gainMarginDb;
  const pmOk = !Number.isFinite(pm) || pm >= 30;
  const gmOk = !Number.isFinite(gm) || gm >= 6;
  return pmOk && gmOk;
}

// ── K1-1: Compute step statuses ───────────────────────────────────────────────

export function computeFlowSteps() {
  const state = _ctx.state;
  const hasPlant = !!state.plant;
  const hasController = !!(state.pidParams && (state.pidParams.Kp !== 0 || state.pidParams.Ki !== 0 || state.pidParams.Kd !== 0));
  const hasSpec = hasAnySpec();
  const specOk = allSpecsReasonable();
  const specPass = allSpecsPassing();
  const exported = !!state._lastExportTime;

  return [
    {
      id: 'plant',
      label: '建立 Plant',
      step: 1,
      status: hasPlant ? 'done' : 'active',
      hint: hasPlant ? null : '在識別 Tab 輸入傳遞函數',
      wfTab: 'identify',
    },
    {
      id: 'specs',
      label: '設定規格',
      step: 2,
      status: hasSpec
        ? (specOk ? 'done' : 'warning')
        : (hasPlant ? 'active' : 'pending'),
      hint: hasSpec ? null : '在設計 Tab 設定 OS / PM 規格',
      wfTab: 'design',
    },
    {
      id: 'controller',
      label: '設計控制器',
      step: 3,
      status: hasController
        ? 'done'
        : (hasSpec ? 'active' : 'pending'),
      hint: hasController ? null : '調整 PID 或使用設計精靈',
      wfTab: 'design',
    },
    {
      id: 'verify',
      label: '驗證',
      step: 4,
      status: specPass ? 'done'
        : (hasController ? 'active' : 'pending'),
      hint: specPass ? null : '檢查穩定裕度與規格合規',
      wfTab: 'analyse',
    },
    {
      id: 'export',
      label: '匯出',
      step: 5,
      status: exported ? 'done' : 'pending',
      hint: '在實作 Tab 生成程式碼或下載報告',
      wfTab: 'implement',
    },
  ];
}

export function renderFlowBar(steps) {
  const container = document.getElementById('flow-bar-steps');
  if (!container) return;
  container.innerHTML = steps.map(s => {
    const icon = s.status === 'done' ? 'OK'
      : s.status === 'warning' ? '!'
      : s.status === 'active' ? String(s.step)
      : String(s.step);
    const hintHtml = s.hint ? `<span class="fb-hint">${s.hint}</span>` : '';
    return `<button class="fb-step fb-${s.status}" role="listitem"
      data-wf="${s.wfTab}" title="${s.label}${s.hint ? ': ' + s.hint : ''}"
      aria-label="步驟 ${s.step}：${s.label}（${s.status === 'done' ? '完成' : s.status === 'active' ? '進行中' : s.status === 'warning' ? '警告' : '待做'}）">
      <span class="fb-icon">${icon}</span>
      <span class="fb-label">${s.label}</span>
      ${hintHtml}
    </button>`;
  }).join('');
  container.querySelectorAll('.fb-step[data-wf]').forEach(btn => {
    btn.addEventListener('click', () => _ctx.switchWorkflowTab(btn.dataset.wf));
  });
}

export function updateFlowBar() {
  const bar = document.getElementById('flow-bar');
  if (!bar) return;
  const steps = computeFlowSteps();
  renderFlowBar(steps);
}

export function initFlowBar() {
  const toggle = document.getElementById('flow-bar-toggle');
  const bar = document.getElementById('flow-bar');
  if (!toggle || !bar) return;
  const KEY = 'cs-flow-bar-collapsed';
  if (localStorage.getItem(KEY) === '1') {
    bar.classList.add('fb-collapsed');
    toggle.textContent = '∨';
    toggle.setAttribute('aria-expanded', 'false');
  }
  toggle.addEventListener('click', () => {
    const collapsed = bar.classList.toggle('fb-collapsed');
    toggle.textContent = collapsed ? '∨' : '∧';
    toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    localStorage.setItem(KEY, collapsed ? '1' : '0');
  });
  updateFlowBar();
}

// ── K1-4: Kp Quick Recommendation ────────────────────────────────────────────

export function recommendInitialKp(sys) {
  const { bodeData, autoFreqRange } = _ctx;
  try {
    const dcGain = Math.abs(sys.dcGain?.() ?? NaN);
    if (Number.isFinite(dcGain) && dcGain > 1e-10) {
      const kpByDC = 1 / dcGain;
      const kpRecommended = +(Math.min(kpByDC, kpByDC * 0.8)).toPrecision(2);
      return {
        value: kpRecommended,
        reasoning: `G(s) DC Gain ≈ ${dcGain.toPrecision(3)}，推薦 Kp ≈ 1/|G(0)|×0.8 = ${kpRecommended}`,
        confidence: 'medium',
      };
    }
    try {
      const range = autoFreqRange(sys);
      const wm = Math.sqrt(range.wMin * range.wMax);
      const bd = bodeData(sys, wm * 0.9, wm * 1.1);
      const magAtWm = bd.magDB?.[Math.floor(bd.magDB.length / 2)];
      if (Number.isFinite(magAtWm)) {
        const kpHz = +(Math.pow(10, -magAtWm / 20) * 0.5).toPrecision(2);
        return {
          value: kpHz,
          reasoning: `積分型系統，以中頻增益估算 Kp ≈ ${kpHz}（保守值）`,
          confidence: 'low',
        };
      }
    } catch {}
  } catch {}
  return { value: 1.0, reasoning: '無法自動估算，使用預設值 Kp = 1', confidence: 'low' };
}

let _kpRecDismissed = false;

export function updateKpRecommend() {
  const card = document.getElementById('kp-recommend-card');
  if (!card) return;
  const state = _ctx.state;
  const hasPlant = !!state.plant;
  const pidKp = parseFloat(document.getElementById('pid-Kp')?.value ?? '1');
  if (!hasPlant || _kpRecDismissed || pidKp > 0.01) {
    card.style.display = 'none';
    return;
  }
  const rec = recommendInitialKp(state.plant);
  document.getElementById('kp-rec-value').textContent = `Kp ≈ ${rec.value}`;
  document.getElementById('kp-rec-reason').textContent = rec.reasoning;
  card.style.display = 'block';
}

export function initKpRecommend() {
  const applyBtn = document.getElementById('kp-rec-apply');
  const dismissBtn = document.getElementById('kp-rec-dismiss');
  if (!applyBtn || !dismissBtn) return;

  applyBtn.addEventListener('click', () => {
    const state = _ctx.state;
    if (!state.plant) return;
    const rec = recommendInitialKp(state.plant);
    const kpSlider = document.getElementById('pid-Kp');
    const kpNum = document.getElementById('pid-Kp-num');
    if (kpSlider && kpNum) {
      kpSlider.value = rec.value;
      kpNum.value = rec.value;
      kpSlider.dispatchEvent(new Event('input', { bubbles: true }));
    }
    _kpRecDismissed = true;
    document.getElementById('kp-recommend-card').style.display = 'none';
  });

  dismissBtn.addEventListener('click', () => {
    _kpRecDismissed = true;
    document.getElementById('kp-recommend-card').style.display = 'none';
  });
}
