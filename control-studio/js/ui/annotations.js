/**
 * annotations.js — P61 In-Chart Engineering Annotations
 *                  J1-3 Root Locus Geometric Annotations
 *
 * All functions are pure: they receive data and return { annotations, shapes }.
 * No direct state access — callers pass `annotationsEnabled` as the last param.
 *
 * Exports:
 *   buildStepAnnotations(resp, info, enabled)
 *   buildBodeAnnotations(margins, bodeData, enabled)
 *   buildNyquistAnnotations(sys, data, enabled)
 *   buildRLocusAnnotations(branches, jwCrossings, enabled)   ← J1-3 NEW
 */

import { fmtNum, fmtTime, fmtPercent } from '../utils/format.js';

// ── J1-1: Step Response Annotations ──────────────────────────────────────────

export function buildStepAnnotations(resp, info, enabled = true) {
  if (!enabled) return { annotations: [], shapes: [] };
  if (!info || !resp || resp.t.length < 4) return { annotations: [], shapes: [] };
  const annotations = [], shapes = [];
  const t = resp.t, y = resp.y;
  const yss = info.steadyState ?? y[y.length - 1];
  if (!Number.isFinite(yss) || Math.abs(yss) < 1e-10) return { annotations: [], shapes: [] };
  const accentColor = '#818cf8';
  const stableColor = '#22c55e';
  const warnColor   = '#f59e0b';
  const dangerColor = '#ef4444';

  // ① Rise Time arrow
  if (Number.isFinite(info.riseTime) && info.riseTime > 0) {
    const t10  = t.find((_, i) => y[i] >= yss * 0.1) ?? 0;
    const t90  = t.find((_, i) => y[i] >= yss * 0.9) ?? info.riseTime;
    const yMid = yss * 0.5;
    const tickH = Math.abs(yss) * 0.03;
    shapes.push({ type: 'line', x0: t10, x1: t90, y0: yMid, y1: yMid, line: { color: accentColor, width: 1.5 } });
    shapes.push({ type: 'line', x0: t10, x1: t10, y0: yMid - tickH, y1: yMid + tickH, line: { color: accentColor, width: 1.5 } });
    shapes.push({ type: 'line', x0: t90, x1: t90, y0: yMid - tickH, y1: yMid + tickH, line: { color: accentColor, width: 1.5 } });
    annotations.push({
      x: (t10 + t90) / 2, y: yMid, xref: 'x', yref: 'y',
      text: `Tr=${fmtTime(info.riseTime)}`, showarrow: false,
      font: { size: 10, color: accentColor }, yshift: 10,
      bgcolor: 'rgba(0,0,0,0.55)', borderpad: 2,
    });
  }

  // ② Overshoot arrow
  const os = info.overshoot ?? 0;
  if (os > 2 && Number.isFinite(os)) {
    const yMax  = yss * (1 + os / 100);
    const tPeak = (() => {
      let tmax = t[0], ymax = y[0];
      for (let i = 1; i < y.length; i++) { if (y[i] > ymax) { ymax = y[i]; tmax = t[i]; } }
      return tmax;
    })();
    const osColor = os > 20 ? dangerColor : os > 10 ? warnColor : accentColor;
    const tickW   = (t[t.length - 1] - t[0]) * 0.01;
    shapes.push({ type: 'line', x0: tPeak, x1: tPeak, y0: yss, y1: yMax, line: { color: osColor, width: 1.5 } });
    shapes.push({ type: 'line', x0: tPeak - tickW, x1: tPeak + tickW, y0: yss,  y1: yss,  line: { color: osColor, width: 1.5 } });
    shapes.push({ type: 'line', x0: tPeak - tickW, x1: tPeak + tickW, y0: yMax, y1: yMax, line: { color: osColor, width: 1.5 } });
    annotations.push({
      x: tPeak, y: (yss + yMax) / 2, xref: 'x', yref: 'y',
      text: `OS=${fmtPercent(os)}`, showarrow: false,
      font: { size: 10, color: osColor }, xshift: 28,
      bgcolor: 'rgba(0,0,0,0.55)', borderpad: 2,
    });
  }

  // ③+④ Settling Band + Settling Time
  const band = 0.02 * Math.abs(yss);
  if (Number.isFinite(info.settlingTime) && info.settlingTime > 0) {
    const tEnd   = t[t.length - 1];
    const yMin   = Math.min(0, ...y);
    const yMaxAll = Math.max(...y);
    const ts     = info.settlingTime;
    shapes.push({ type: 'line', x0: 0, x1: tEnd, y0: yss + band, y1: yss + band, line: { color: 'rgba(34,197,94,0.45)', width: 1, dash: 'dash' } });
    shapes.push({ type: 'line', x0: 0, x1: tEnd, y0: yss - band, y1: yss - band, line: { color: 'rgba(34,197,94,0.45)', width: 1, dash: 'dash' } });
    shapes.push({ type: 'line', x0: ts, x1: ts, y0: yMin, y1: yMaxAll, line: { color: stableColor, width: 1, dash: 'dot' } });
    annotations.push({ x: ts, y: yMaxAll, xref: 'x', yref: 'y', text: `Ts=${fmtTime(ts)}`, showarrow: false, font: { size: 10, color: stableColor }, yshift: -14, bgcolor: 'rgba(0,0,0,0.55)', borderpad: 2 });
    annotations.push({ x: tEnd, y: yss + band, xref: 'x', yref: 'y', text: '±2%', showarrow: false, font: { size: 9, color: 'rgba(34,197,94,0.7)' }, xshift: 14 });
  }

  // ⑤ Steady-State Error
  const ess = Math.abs(info.steadyStateError ?? (1 - yss));
  if (Number.isFinite(ess) && ess > 0.005 && Number.isFinite(yss)) {
    const essColor = ess > 0.05 ? dangerColor : warnColor;
    const tEnd = t[t.length - 1];
    shapes.push({ type: 'line', x0: tEnd * 0.97, x1: tEnd * 0.97, y0: yss, y1: 1.0, line: { color: essColor, width: 1.5 } });
    annotations.push({ x: tEnd, y: (yss + 1) / 2, xref: 'x', yref: 'y', text: `ess=${ess.toPrecision(3)}`, showarrow: false, font: { size: 9, color: essColor }, xshift: -4, bgcolor: 'rgba(0,0,0,0.55)', borderpad: 2 });
  }

  return { annotations, shapes };
}

// ── J1-2: Bode PM/GM Annotations ─────────────────────────────────────────────

export function buildBodeAnnotations(margins, bodeData, enabled = true) {
  if (!enabled) return { annotations: [], shapes: [] };
  const annotations = [], shapes = [];
  const { phaseMargin: pm, gainMarginDB: gm, gainCrossover: wgc, phaseCrossover: wpc } = margins;
  const phaseDeg = bodeData.phaseDeg ?? [];
  const magDB    = bodeData.magDB   ?? [];
  const w        = bodeData.w       ?? [];

  if (Number.isFinite(pm) && Number.isFinite(wgc) && wgc > 0 && phaseDeg.length > 0) {
    const idx = w.reduce((best, wi, i) => Math.abs(wi - wgc) < Math.abs(w[best] - wgc) ? i : best, 0);
    const phAtWgc = phaseDeg[idx];
    if (Number.isFinite(phAtWgc)) {
      const pmColor = pm > 45 ? '#22c55e' : pm > 30 ? '#f59e0b' : '#ef4444';
      shapes.push({ type: 'line', xref: 'x', yref: 'y2', x0: Math.log10(wgc), x1: Math.log10(wgc), y0: -180, y1: phAtWgc, line: { color: pmColor, width: 2 } });
      annotations.push({ xref: 'x', yref: 'y2', x: Math.log10(wgc), y: (-180 + phAtWgc) / 2, text: `PM=${pm.toFixed(1)}°`, showarrow: false, font: { size: 10, color: pmColor }, xshift: 28, bgcolor: 'rgba(0,0,0,0.55)', borderpad: 2 });
    }
  }

  if (Number.isFinite(gm) && Number.isFinite(wpc) && wpc > 0 && magDB.length > 0) {
    const idx = w.reduce((best, wi, i) => Math.abs(wi - wpc) < Math.abs(w[best] - wpc) ? i : best, 0);
    const magAtWpc = magDB[idx];
    if (Number.isFinite(magAtWpc)) {
      const gmColor = gm > 6 ? '#22c55e' : gm > 3 ? '#f59e0b' : '#ef4444';
      shapes.push({ type: 'line', xref: 'x', yref: 'y', x0: Math.log10(wpc), x1: Math.log10(wpc), y0: magAtWpc, y1: 0, line: { color: gmColor, width: 2 } });
      annotations.push({ xref: 'x', yref: 'y', x: Math.log10(wpc), y: magAtWpc / 2, text: `GM=${gm.toFixed(1)}dB`, showarrow: false, font: { size: 10, color: gmColor }, xshift: -28, bgcolor: 'rgba(0,0,0,0.55)', borderpad: 2 });
    }
  }
  return { annotations, shapes };
}

// ── J1-4: Nyquist Annotations ─────────────────────────────────────────────────

export function buildNyquistAnnotations(sys, data, enabled = true) {
  if (!enabled) return { annotations: [], shapes: [] };
  const annotations = [], shapes = [];
  const re = data.re ?? [], im = data.im ?? [], wArr = data.w ?? [];
  if (re.length < 4 || wArr.length < 4) return { annotations, shapes };

  // Frequency tick marks at decade intervals
  const wMin = wArr[0], wMax = wArr[wArr.length - 1];
  const log0 = Math.ceil(Math.log10(wMin)), log1 = Math.floor(Math.log10(wMax));
  for (let logW = log0; logW <= log1; logW++) {
    const wTick = Math.pow(10, logW);
    const idx   = wArr.reduce((best, wi, i) => Math.abs(wi - wTick) < Math.abs(wArr[best] - wTick) ? i : best, 0);
    if (!Number.isFinite(re[idx]) || !Number.isFinite(im[idx])) continue;
    annotations.push({
      x: re[idx], y: im[idx], xref: 'x', yref: 'y',
      text: `ω=${wTick < 1 ? wTick.toFixed(2) : wTick < 10 ? wTick.toFixed(1) : fmtNum(wTick)}`,
      showarrow: true, arrowhead: 0, arrowwidth: 1,
      arrowcolor: 'rgba(148,163,184,0.5)', ax: 18, ay: -18,
      font: { size: 9, color: 'rgba(148,163,184,0.8)' },
      bgcolor: 'rgba(0,0,0,0.4)', borderpad: 2,
    });
  }

  // Minimum distance circle (1/Ms)
  try {
    let minDist = Infinity;
    for (let i = 0; i < re.length; i++) {
      const dist = Math.sqrt((re[i] + 1) ** 2 + im[i] ** 2);
      if (Number.isFinite(dist) && dist < minDist) minDist = dist;
    }
    if (Number.isFinite(minDist) && minDist > 0 && minDist < 5) {
      const Ms = 1 / minDist;
      const MsdB = 20 * Math.log10(Ms);
      const cxArr = [], cyArr = [];
      for (let i = 0; i <= 120; i++) {
        const ang = (i / 120) * 2 * Math.PI;
        cxArr.push(-1 + minDist * Math.cos(ang));
        cyArr.push(minDist * Math.sin(ang));
      }
      data._msCircleTrace = {
        x: cxArr, y: cyArr, type: 'scatter', mode: 'lines',
        name: `Ms=${Ms.toFixed(2)}`,
        line: { color: 'rgba(249,115,22,0.5)', width: 1.5, dash: 'dot' },
        showlegend: true, hoverinfo: 'name',
      };
      annotations.push({
        x: -1 + minDist, y: 0,
        xref: 'x', yref: 'y',
        text: `Ms=${Ms.toFixed(2)}(${MsdB.toFixed(1)}dB)`,
        showarrow: true, arrowhead: 0, arrowwidth: 1,
        arrowcolor: 'rgba(249,115,22,0.5)', ax: 30, ay: -20,
        font: { size: 9, color: 'rgba(249,115,22,0.85)' },
        bgcolor: 'rgba(0,0,0,0.4)', borderpad: 2,
      });
    }
  } catch { /* ignore */ }

  return { annotations, shapes };
}

// ── J1-3: Root Locus Geometric Annotations ────────────────────────────────────
// NEW — damping-ratio lines, natural-frequency arcs, critical-gain labels

export function buildRLocusAnnotations(branches, jwCrossings = [], enabled = true) {
  if (!enabled) return { annotations: [], shapes: [] };
  const annotations = [], shapes = [];

  // Compute axis extent from branch data
  let xMin = 0, xMax = 0, yMax = 0;
  for (const b of branches) {
    for (const x of b.re) { if (Number.isFinite(x)) { xMin = Math.min(xMin, x); xMax = Math.max(xMax, x); } }
    for (const y of b.im) { if (Number.isFinite(y)) { yMax = Math.max(yMax, Math.abs(y)); } }
  }
  if (xMin === 0 && xMax === 0 && yMax === 0) return { annotations, shapes };

  // Pad extent slightly for visual breathing room
  const xLow  = Math.min(xMin * 1.2, -0.1);
  const yHigh = Math.max(yMax * 1.15, 0.5);

  // ① Damping-ratio grid lines (ζ = 0.2 / 0.4 / 0.6 / 0.8)
  // Ray from origin: x = -ζ·r, y = sqrt(1-ζ²)·r  (r ≥ 0)
  // For upper half: endpoint at either x = xLow or y = yHigh (whichever is reached first)
  const zetaVals  = [0.2, 0.4, 0.6, 0.8];
  const zetaColor = 'rgba(148,163,184,0.30)';
  const lblColor  = 'rgba(148,163,184,0.75)';

  for (const zeta of zetaVals) {
    const sq = Math.sqrt(1 - zeta * zeta);    // sin(arccos(ζ))
    // Upper ray: direction (-ζ, sq)
    // Compute r at xLow: r = xLow / (-ζ)
    // Compute r at yHigh: r = yHigh / sq
    const rByX = -xLow / zeta;               // always > 0 since xLow < 0
    const rByY = yHigh / sq;
    const r    = Math.min(rByX, rByY);
    const x1   = -zeta * r;
    const y1   = sq    * r;

    // Upper ray
    shapes.push({
      _rl_zeta: true,
      type: 'line', x0: 0, y0: 0, x1, y1,
      line: { color: zetaColor, width: 1, dash: 'dot' },
      xref: 'x', yref: 'y',
    });
    // Lower ray (mirror)
    shapes.push({
      _rl_zeta: true,
      type: 'line', x0: 0, y0: 0, x1, y1: -y1,
      line: { color: zetaColor, width: 1, dash: 'dot' },
      xref: 'x', yref: 'y',
    });
    // Label at midpoint of upper ray
    annotations.push({
      _rl_zeta: true,
      x: x1 * 0.7, y: y1 * 0.7 + 0.08,
      xref: 'x', yref: 'y',
      text: `ζ=${zeta}`,
      showarrow: false,
      font: { size: 9, color: lblColor },
      bgcolor: 'rgba(0,0,0,0)',
    });
  }

  // ② Natural-frequency arcs (circles centred at origin)
  // Choose ωn values that are meaningful relative to the data extent
  const wnMax = Math.sqrt(xLow ** 2 + yHigh ** 2);
  if (wnMax > 0) {
    const exp  = Math.floor(Math.log10(wnMax));
    const step = Math.pow(10, exp - 1);
    const wnVals = [];
    for (let wn = step; wn <= wnMax * 1.1; wn += step) wnVals.push(wn);
    // Keep only 4-5 nicely spaced values
    const thinned = wnVals.filter((_, i) => i % Math.max(1, Math.floor(wnVals.length / 5)) === 0).slice(0, 5);

    for (const wn of thinned) {
      // Draw partial arc from angle 90° to 180° (left half-plane, upper half)
      const pts = 60;
      const arcX = [], arcY = [];
      for (let i = 0; i <= pts; i++) {
        const ang = Math.PI / 2 + (i / pts) * (Math.PI / 2); // π/2 → π
        arcX.push(wn * Math.cos(ang));
        arcY.push(wn * Math.sin(ang));
      }
      // Add lower mirror
      const arcXFull = [...arcX, ...[...arcX].reverse()];
      const arcYFull = [...arcY, ...[...arcY].reverse().map(v => -v)];
      shapes.push({
        _rl_wn: true,
        type: 'path',
        path: `M ${arcXFull.map((x, i) => `${x.toFixed(3)},${arcYFull[i].toFixed(3)}`).join(' L ')}`,
        line: { color: 'rgba(99,102,241,0.18)', width: 1, dash: 'dot' },
        xref: 'x', yref: 'y',
      });
      // Label at top of arc (angle = 135° → upper left)
      const lblX = wn * Math.cos(3 * Math.PI / 4);
      const lblY = wn * Math.sin(3 * Math.PI / 4);
      if (lblX >= xLow && lblY <= yHigh) {
        annotations.push({
          _rl_wn: true,
          x: lblX, y: lblY,
          xref: 'x', yref: 'y',
          text: `ωn=${fmtNum(wn, 2)}`,
          showarrow: false,
          font: { size: 9, color: 'rgba(99,102,241,0.6)' },
          bgcolor: 'rgba(0,0,0,0)',
        });
      }
    }
  }

  // ③ Critical gain label from jω crossings
  for (const { K, omega } of jwCrossings) {
    if (!Number.isFinite(K) || !Number.isFinite(omega)) continue;
    annotations.push({
      _rl_ku: true,
      x: 0, y: omega,
      xref: 'x', yref: 'y',
      text: `Ku=${fmtNum(K, 3)}<br>Tu=${fmtNum((2 * Math.PI) / omega, 3)}s`,
      showarrow: true, arrowhead: 2, arrowsize: 0.8, arrowwidth: 1.5,
      arrowcolor: '#ef4444', ax: 40, ay: -25,
      font: { size: 9, color: '#ef4444' },
      bgcolor: 'rgba(15,17,23,0.75)', borderpad: 3,
      bordercolor: 'rgba(239,68,68,0.4)', borderwidth: 1,
    });
  }

  return { annotations, shapes };
}
