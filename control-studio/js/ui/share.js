/**
 * share.js — P65 Share & Export Enhancement
 *
 * Q1-1  URL sharing (serializeDesign / shareDesign / restoreFromURL)
 * Q1-2  Code generation v2 (C99 + annotated comments)
 * Q1-3  PDF report generation (buildReportHTML / generatePDFReport)
 * Q1-4  Chart quick copy (copyChartToClipboard)
 *
 * Depends on app-level context injected via initShareModule(ctx).
 * ctx: { state, updateGlobalStatusBar, buildCodegenPayload, toPythonScript,
 *         stepResponse, stepInfo, TransferFunction, applyDesignPayload? }
 */

let _ctx = null;

export function initShareModule(ctx) {
  _ctx = ctx;
  // Expose C99 generator globally (Q1-2 requirement)
  window.toC99Script = toC99Script;
}

// ── Q1-1: URL Design Sharing ──────────────────────────────────────────────────

export function serializePlant(plant) {
  if (!plant) return null;
  if (_ctx?.TransferFunction && plant instanceof _ctx.TransferFunction) {
    return { type: 'tf', num: plant.num?.[0] ?? plant.num, den: plant.den };
  }
  if (plant?.A !== undefined) {
    return { type: 'ss', A: plant.A, B: plant.B, C: plant.C, D: plant.D };
  }
  return null;
}

export function serializeSpecs() {
  const fields = ['design-os', 'design-ts', 'design-pm', 'design-tr', 'design-gm'];
  const specs = {};
  fields.forEach(id => {
    const v = document.getElementById(id)?.value;
    if (v) specs[id.replace('design-', '')] = v;
  });
  return specs;
}

export function serializeDesign() {
  const state = _ctx.state;
  return {
    v: 2,
    plant: serializePlant(state.plant),
    pid: state.pidParams,
    compensator: state.compensator,
    domain: state.domain,
    showClosedLoop: state.showClosedLoop,
    specs: serializeSpecs(),
    activePlot: state.activePlot,
    sidebarTab: state.sidebarTab,
    chartAnnotations: state.chartAnnotationsEnabled,
    snapshots: (state.comparisonSnapshots || []).slice(0, 3),
    notes: localStorage.getItem('cs-design-notes') ?? '',
  };
}

export async function shareDesign() {
  try {
    const payload = serializeDesign();
    const json    = JSON.stringify(payload);
    const encoded = btoa(encodeURIComponent(json).replace(/%([0-9A-F]{2})/g,
      (_, p1) => String.fromCharCode(parseInt(p1, 16))));
    const url = `${location.origin}${location.pathname}#design=${encoded}`;
    await navigator.clipboard.writeText(url);
    _ctx.updateGlobalStatusBar(`分享連結已複製（${url.length} 字元）`);
    setTimeout(() => _ctx.updateGlobalStatusBar(''), 3000);
  } catch (err) {
    console.warn('[CS P65] share error', err);
    _ctx.updateGlobalStatusBar('分享失敗：請手動複製網址');
  }
}

export function restoreFromURL() {
  const hash = location.hash;
  if (!hash.startsWith('#design=')) return false;
  try {
    const encoded = hash.slice(8);
    const json = decodeURIComponent(
      atob(encoded).split('').map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('')
    );
    const payload = JSON.parse(json);
    if (payload.v !== 2) throw new Error('version mismatch');
    _ctx.applyDesignPayload?.(payload);
    history.replaceState(null, '', location.pathname);
    _ctx.updateGlobalStatusBar('已載入分享的設計');
    setTimeout(() => _ctx.updateGlobalStatusBar(''), 3000);
    return true;
  } catch {
    _ctx.updateGlobalStatusBar('連結格式錯誤或版本不符');
    setTimeout(() => _ctx.updateGlobalStatusBar(''), 3000);
    return false;
  }
}

export function initShareDesign() {
  document.getElementById('btn-share-design')?.addEventListener('click', shareDesign);
}

// ── Q1-2: Code Generation v2 (C99) ───────────────────────────────────────────

export function toC99Script(design) {
  const kp   = design?.controller?.Kp ?? 1;
  const ki   = design?.controller?.Ki ?? 0;
  const kd   = design?.controller?.Kd ?? 0;
  const n    = design?.controller?.N  ?? 100;
  const pm   = design?.stability?.phaseMargin;
  const gm   = design?.stability?.gainMarginDB;
  const ts   = design?.metrics?.settlingTime;
  const os   = design?.metrics?.overshoot;
  const date = new Date().toISOString().slice(0, 10);
  return `/* ControlStudio Auto-Generated PID — ${date}
 * PM = ${Number.isFinite(pm) ? pm.toFixed(1) + '°' : 'N/A'}  GM = ${Number.isFinite(gm) ? gm.toFixed(1) + ' dB' : 'N/A'}
 * Ts = ${Number.isFinite(ts) ? ts.toFixed(3) + ' s' : 'N/A'}  OS = ${Number.isFinite(os) ? os.toFixed(1) + '%' : 'N/A'}
 */

typedef struct {
  double kp;    /* Proportional gain = ${kp} */
  double ki;    /* Integral gain     = ${ki} */
  double kd;    /* Derivative gain   = ${kd} */
  double n;     /* Filter coeff      = ${n}  */
  double integral;
  double prev_error;
} PIDState;

static PIDState pid_state = { ${kp}, ${ki}, ${kd}, ${n}, 0.0, 0.0 };

double pid_update(PIDState *s, double setpoint, double measurement, double dt) {
  double error = setpoint - measurement;
  s->integral += error * dt;
  double derivative = (error - s->prev_error) / dt;
  s->prev_error = error;
  return s->kp * error + s->ki * s->integral + s->kd * derivative;
}`;
}

export function initCodegenV2() {
  window.toC99Script = toC99Script;
  document.querySelectorAll('.code-lang-tab[data-codelang]').forEach(tab => {
    tab.addEventListener('click', () => {
      const lang = tab.dataset.codelang;
      if (lang === 'c99') {
        _ctx.state._codeLang = 'c99';
        const codeEl = document.getElementById('code-preview-code');
        if (codeEl) {
          try {
            const design = _ctx.buildCodegenPayload();
            codeEl.textContent = toC99Script(design);
          } catch { codeEl.textContent = '// C99 generation requires plant + controller'; }
        }
      }
    });
  });
}

// ── Q1-3: PDF Report ──────────────────────────────────────────────────────────

export function buildReportHTML(opts = {}) {
  const { svgMap = {}, designState = {} } = opts;
  const state   = _ctx.state;
  const stab    = designState._lastStability ?? state._lastStability ?? {};
  const date    = new Date().toLocaleDateString('zh-TW');
  const pm      = stab.phaseMargin;
  const gm      = stab.gainMarginDb;
  const pid     = state.pidParams ?? {};
  const metrics = (() => {
    try {
      if (!state.plant) return {};
      const sys  = state.closedLoop || state.plant;
      const resp = _ctx.stepResponse(sys, { duration: 20, sampleCount: 300 });
      return _ctx.stepInfo(resp.t, resp.y);
    } catch { return {}; }
  })();
  const specRows = [
    { spec: 'Phase Margin', target: '> 45°', actual: Number.isFinite(pm) ? pm.toFixed(1) + '°' : 'N/A', pass: Number.isFinite(pm) && pm >= 45 },
    { spec: 'Gain Margin',  target: '> 6 dB', actual: Number.isFinite(gm) ? gm.toFixed(1) + ' dB' : 'N/A', pass: Number.isFinite(gm) && gm >= 6 },
    { spec: 'Overshoot',    target: '< 20%',  actual: Number.isFinite(metrics.overshoot)     ? metrics.overshoot.toFixed(1)     + '%' : 'N/A', pass: Number.isFinite(metrics.overshoot)     && metrics.overshoot < 20 },
    { spec: 'Settling Time',target: '—',      actual: Number.isFinite(metrics.settlingTime)  ? metrics.settlingTime.toFixed(3)  + ' s' : 'N/A', pass: true },
  ];
  const stepSvg = svgMap['chart-active'] || '';
  return `<!DOCTYPE html>
<html lang="zh-TW"><head><meta charset="UTF-8">
<title>ControlStudio 設計報告</title>
<style>
body { font-family: 'Georgia', serif; color: #000; background: #fff; margin: 0; padding: 24px; font-size: 13px; }
h1 { font-size: 24px; margin-bottom: 4px; } h2 { font-size: 16px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
table { border-collapse: collapse; width: 100%; margin: 12px 0; }
td, th { border: 1px solid #ccc; padding: 6px 10px; text-align: left; }
th { background: #f5f5f5; font-weight: 700; }
.pass { color: #16a34a; font-weight: 700; } .fail { color: #dc2626; font-weight: 700; }
.page-break { page-break-before: always; }
pre { background: #f8f8f8; padding: 12px; border: 1px solid #ddd; font-size: 11px; overflow: auto; }
img { max-width: 100%; } .no-print { display: none; }
@media print { .no-print { display: none; } body { padding: 0; } }
</style></head><body>
<h1>ControlStudio 設計報告</h1>
<p>生成日期：${date} | ControlStudio v2 | 自動生成，僅供參考</p>
<h2>1. 系統摘要</h2>
<table><tr><th>項目</th><th>值</th></tr>
<tr><td>Kp</td><td>${pid.Kp ?? '—'}</td></tr>
<tr><td>Ki</td><td>${pid.Ki ?? '—'}</td></tr>
<tr><td>Kd</td><td>${pid.Kd ?? '—'}</td></tr>
<tr><td>Phase Margin</td><td>${Number.isFinite(pm) ? pm.toFixed(1) + '°' : 'N/A'}</td></tr>
<tr><td>Gain Margin</td><td>${Number.isFinite(gm) ? gm.toFixed(1) + ' dB' : 'N/A'}</td></tr>
</table>
<h2>2. 規格合規</h2>
<table><tr><th>規格</th><th>目標</th><th>實際值</th><th>狀態</th></tr>
${specRows.map(r => `<tr><td>${r.spec}</td><td>${r.target}</td><td>${r.actual}</td><td class="${r.pass ? 'pass' : 'fail'}">${r.pass ? 'PASS' : 'FAIL'}</td></tr>`).join('')}
</table>
<h2>3. 圖表</h2>
${stepSvg ? `<img src="${stepSvg}" alt="Step Response">` : '<p><em>（圖表不可用）</em></p>'}
<h2>4. 程式碼</h2>
<pre>${typeof _ctx.toPythonScript !== 'undefined' && state.plant ? _ctx.toPythonScript(_ctx.buildCodegenPayload()) : '# No plant defined'}</pre>
<p class="no-print"><button onclick="window.print()">列印 / 儲存為 PDF</button></p>
</body></html>`;
}

export async function generatePDFReport() {
  const btn = document.getElementById('btn-pdf-report');
  if (btn) btn.textContent = '生成中…';
  try {
    const svgMap = {};
    try {
      const chartEl = document.getElementById('chart-active');
      if (chartEl?._fullLayout) {
        svgMap['chart-active'] = await Plotly.toImage('chart-active', { format: 'svg', width: 800, height: 400 });
      }
    } catch {}
    const html = buildReportHTML({ svgMap, designState: _ctx.state });
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); }
  } catch (err) { console.warn('[CS P65] PDF report error', err); }
  if (btn) btn.textContent = '報告';
}

export function initPDFReport() {
  document.getElementById('btn-pdf-report')?.addEventListener('click', generatePDFReport);
}

// ── Q1-4: Chart Quick Copy ────────────────────────────────────────────────────

export async function copyChartToClipboard(chartId) {
  const btn      = document.getElementById('btn-copy-chart');
  const origText = btn?.textContent ?? 'Copy';
  try {
    if (btn) btn.textContent = 'Working';
    const dataURL = await Plotly.toImage(chartId, { format: 'png', width: 1200, height: 600, scale: 2 });
    const res     = await fetch(dataURL);
    const blob    = await res.blob();
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    if (btn) { btn.textContent = '已複製'; setTimeout(() => { if (btn) btn.textContent = origText; }, 1500); }
    _ctx.updateGlobalStatusBar('圖表已複製為 PNG（@2x）');
    setTimeout(() => _ctx.updateGlobalStatusBar(''), 2000);
  } catch {
    try {
      const dataURL = await Plotly.toImage(chartId, { format: 'png', width: 1200, height: 600, scale: 2 });
      const w = window.open();
      if (w) { w.document.write(`<img src="${dataURL}" style="max-width:100%">`); }
    } catch {}
    if (btn) btn.textContent = origText;
    _ctx.updateGlobalStatusBar('已在新分頁開啟（請右鍵儲存）');
    setTimeout(() => _ctx.updateGlobalStatusBar(''), 2000);
  }
}

export function initChartCopy() {
  document.getElementById('btn-copy-chart')?.addEventListener('click', () => {
    copyChartToClipboard('chart-active');
  });
}

export function initShareExport() {
  initShareDesign();
  initCodegenV2();
  initPDFReport();
  initChartCopy();
}
