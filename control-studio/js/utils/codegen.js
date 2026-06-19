// codegen.js — Export ControlStudio designs as MATLAB / Python (python-control) scripts.

function formatArray(arr) {
  return `[${arr.map((v) => Number(v).toString()).join(', ')}]`;
}

/**
 * Generate a MATLAB script reproducing the current plant + controller + analyses.
 *
 * @param {{
 *   plant: {num:number[], den:number[]}|null,
 *   controller: {Kp:number, Ki:number, Kd:number, N:number}|null,
 *   delay: {T:number, order:number}|null,
 *   domain: 's'|'z',
 *   Ts: number|null,
 *   responseType: string,
 *   closedLoop: boolean,
 * }} design
 */
export function toMatlabScript(design) {
  const lines = [];
  const hasPlant = Boolean(design.plant);
  const canExportController = Boolean(design.controller && design.domain !== 'z');
  const skippedContinuousController = Boolean(design.controller && design.domain === 'z');
  lines.push('% ControlStudio export — MATLAB script');
  lines.push(`% Generated ${new Date().toISOString()}`);
  lines.push('');
  if (design.domain === 'z' && hasPlant) {
    const Ts = design.Ts ?? 0.1;
    lines.push(`Ts = ${Ts};`);
    lines.push(`numG = ${formatArray(design.plant.num)};`);
    lines.push(`denG = ${formatArray(design.plant.den)};`);
    lines.push(`G = tf(numG, denG, Ts);`);
  } else if (hasPlant) {
    lines.push(`numG = ${formatArray(design.plant.num)};`);
    lines.push(`denG = ${formatArray(design.plant.den)};`);
    lines.push('G = tf(numG, denG);');
    if (design.delay && design.delay.T > 0) {
      lines.push(`G.InputDelay = ${design.delay.T};   % dead time (use pade(${design.delay.order}) for analytical approximations)`);
    }
  }
  if (skippedContinuousController) {
    lines.push('% Continuous PID export skipped for z-domain plant; provide an explicit discrete controller before deployment.');
  }
  if (canExportController) {
    const { Kp, Ki, Kd, N } = design.controller;
    lines.push('');
    lines.push(`Kp = ${Kp}; Ki = ${Ki}; Kd = ${Kd}; N = ${N};`);
    lines.push('C = pid(Kp, Ki, Kd, 1/N);');
  }
  if (hasPlant) {
    const responseSystem = canExportController && design.closedLoop ? 'T' : 'G';
    const responseTitle = canExportController && design.closedLoop ? 'Closed-loop response' : 'Plant response';
    lines.push('');
    if (canExportController) {
      lines.push('L = series(C, G);');
    }
    if (canExportController && design.closedLoop) {
      lines.push('T = feedback(L, 1);');
    }
    lines.push('');
    lines.push('figure;');
    if (design.responseType === 'impulse') lines.push(`impulse(${responseSystem});`);
    else lines.push(`step(${responseSystem});`);
    lines.push(`grid on; title("${responseTitle}");`);
    if (canExportController) {
      lines.push('');
      lines.push('figure; bode(L); grid on; title("Open-loop Bode");');
      lines.push('[Gm, Pm, Wcg, Wcp] = margin(L);');
      lines.push('fprintf("GM = %.2f dB at %.3f rad/s\\n", 20*log10(Gm), Wcg);');
      lines.push('fprintf("PM = %.2f deg at %.3f rad/s\\n", Pm, Wcp);');
    }
  }
  return lines.join('\n');
}

/**
 * Generate a Python script using python-control (`pip install control`).
 */
export function toPythonScript(design) {
  const lines = [];
  const hasPlant = Boolean(design.plant);
  const canExportController = Boolean(design.controller && design.domain !== 'z');
  const skippedContinuousController = Boolean(design.controller && design.domain === 'z');
  lines.push('# ControlStudio export — Python (python-control) script');
  lines.push(`# Generated ${new Date().toISOString()}`);
  lines.push('import numpy as np');
  lines.push('import matplotlib.pyplot as plt');
  lines.push('import control as ct');
  lines.push('');
  if (design.domain === 'z' && hasPlant) {
    const Ts = design.Ts ?? 0.1;
    lines.push(`Ts = ${Ts}`);
    lines.push(`G = ct.tf(${pythonArray(design.plant.num)}, ${pythonArray(design.plant.den)}, Ts)`);
  } else if (hasPlant) {
    lines.push(`G = ct.tf(${pythonArray(design.plant.num)}, ${pythonArray(design.plant.den)})`);
    if (design.delay && design.delay.T > 0) {
      lines.push(`# Approximate dead time T=${design.delay.T} via Padé order ${design.delay.order}`);
      lines.push(`numP, denP = ct.pade(${design.delay.T}, ${design.delay.order})`);
      lines.push('G = ct.series(G, ct.tf(numP, denP))');
    }
  }
  if (skippedContinuousController) {
    lines.push('# Continuous PID export skipped for z-domain plant; provide an explicit discrete controller before deployment.');
  }
  if (canExportController) {
    const { Kp, Ki, Kd, N } = design.controller;
    lines.push('');
    lines.push(`Kp, Ki, Kd, N = ${Kp}, ${Ki}, ${Kd}, ${N}`);
    lines.push('# PID with derivative filter pole at N');
    lines.push('C = ct.tf([Kp + Kd*N, Kp*N + Ki, Ki*N], [1, N, 0])');
  }
  if (hasPlant) {
    const responseSystem = canExportController && design.closedLoop ? 'T' : 'G';
    const responseTitle = canExportController && design.closedLoop ? 'Closed-loop response' : 'Plant response';
    lines.push('');
    if (canExportController) {
      lines.push('L = ct.series(C, G)');
    }
    if (canExportController && design.closedLoop) {
      lines.push('T = ct.feedback(L, 1)');
    }
    lines.push('');
    lines.push(`# ${responseTitle}`);
    if (design.responseType === 'impulse') lines.push(`t, y = ct.impulse_response(${responseSystem})`);
    else lines.push(`t, y = ct.step_response(${responseSystem})`);
    lines.push(`plt.figure(); plt.plot(t, y); plt.grid(); plt.title("${responseTitle}"); plt.xlabel("t (s)"); plt.ylabel("y"); plt.show()`);
    if (canExportController) {
      lines.push('');
      lines.push('# Open-loop Bode + margins');
      lines.push('ct.bode_plot(L, dB=True, omega_num=400); plt.show()');
      lines.push('gm, pm, wcg, wcp = ct.margin(L)');
      lines.push('print(f"GM = {20*np.log10(gm):.2f} dB at {wcg:.3f} rad/s")');
      lines.push('print(f"PM = {pm:.2f} deg at {wcp:.3f} rad/s")');
    }
  }
  return lines.join('\n');
}

function pythonArray(arr) {
  return `[${arr.map((v) => Number(v).toString()).join(', ')}]`;
}

/**
 * Trigger a browser download of the generated script.
 */
export function downloadScript(content, filename, mimeType = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
}
