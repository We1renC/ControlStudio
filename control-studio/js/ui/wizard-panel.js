/**
 * wizard-panel.js — P34-05: Design Wizard UI Panel
 *
 * Wraps the P33-04 designWizard() function and renders its output
 * as a structured HTML panel — ready for injection into the app shell.
 *
 * Exports:
 *   renderWizardPanel  — full interactive HTML panel for design wizard output
 *   renderWorkflowStep — single step card
 *   buildWizardForm    — HTML form that collects spec inputs
 */

import { designWizard } from '../control/productization.js';

// ── Escape ────────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Complexity badge ──────────────────────────────────────────────────────────
function complexityBadge(c) {
  const map = {
    'low':       ['cs-badge cs-badge--ok',      '●○○○ Low'],
    'medium':    ['cs-badge cs-badge--info',     '●●○○ Medium'],
    'high':      ['cs-badge cs-badge--warn',     '●●●○ High'],
    'very-high': ['cs-badge cs-badge--error',    '●●●● Very High'],
  };
  const [cls, label] = map[c] ?? ['cs-badge', esc(c)];
  return `<span class="${cls}" title="Design complexity">${label}</span>`;
}

// ── Single workflow step ───────────────────────────────────────────────────────

/**
 * Render one workflow step as an HTML card.
 *
 * @param {{ step:number, action:string, api:string, note:string }} stepObj
 * @returns {string}  HTML string.
 */
export function renderWorkflowStep(stepObj) {
  const { step, action, api, note } = stepObj;
  return (
    `<li class="cs-wizard-step" data-step="${step}">\n` +
    `  <div class="cs-wizard-step__num" aria-hidden="true">${step}</div>\n` +
    `  <div class="cs-wizard-step__body">\n` +
    `    <p class="cs-wizard-step__action">${esc(action)}</p>\n` +
    `    <pre class="cs-wizard-step__api" tabindex="0" ` +
    `aria-label="API call: ${esc(api)}">${esc(api)}</pre>\n` +
    `    <p class="cs-wizard-step__note">${esc(note)}</p>\n` +
    `  </div>\n` +
    `</li>`
  );
}

// ── Full wizard panel ─────────────────────────────────────────────────────────

/**
 * Render the complete design wizard output as an HTML panel.
 *
 * @param {object}  spec  Wizard spec (forwarded to designWizard()).
 * @param {object}  [opts]
 * @param {string}  [opts.id='cs-wizard']
 * @param {boolean} [opts.showAlternatives=true]
 * @returns {{ html:string, result:object }}
 *   `result` is the raw designWizard() output for programmatic use.
 */
export function renderWizardPanel(spec = {}, opts = {}) {
  const result  = designWizard(spec);
  const panelId = opts.id ?? 'cs-wizard';
  const showAlt = opts.showAlternatives !== false;

  const {
    recommendation,
    controllerType,
    workflow,
    complexity,
    warnings,
    alternatives,
  } = result;

  // ── Header ──
  let html = `<section class="cs-wizard-panel" id="${esc(panelId)}" ` +
    `aria-labelledby="${esc(panelId)}-title">\n`;

  html += `  <header class="cs-wizard-panel__header">\n`;
  html += `    <h2 id="${esc(panelId)}-title" class="cs-wizard-panel__title">`;
  html += `Design Wizard</h2>\n`;
  html += `    <div class="cs-wizard-panel__meta">\n`;
  html += `      <span class="cs-wizard-panel__ctrl-type">${esc(controllerType)}</span>\n`;
  html += `      ${complexityBadge(complexity)}\n`;
  html += `    </div>\n`;
  html += `  </header>\n`;

  // ── Recommendation ──
  html += `  <div class="cs-wizard-panel__rec" role="note">\n`;
  html += `    <p>${esc(recommendation)}</p>\n`;
  html += `  </div>\n`;

  // ── Warnings ──
  if (warnings.length > 0) {
    html += `  <ul class="cs-wizard-panel__warnings" role="list" aria-label="Warnings">\n`;
    for (const w of warnings) {
      html += `    <li class="cs-wizard-warn" role="alert">⚠ ${esc(w)}</li>\n`;
    }
    html += `  </ul>\n`;
  }

  // ── Workflow steps ──
  html += `  <div class="cs-wizard-panel__workflow">\n`;
  html += `    <h3 id="${esc(panelId)}-workflow">Design Workflow</h3>\n`;
  html += `    <ol class="cs-wizard-steps" aria-labelledby="${esc(panelId)}-workflow">\n`;
  for (const step of workflow) {
    html += renderWorkflowStep(step).replace(/^/gm, '      ') + '\n';
  }
  html += `    </ol>\n`;
  html += `  </div>\n`;

  // ── Alternatives ──
  if (showAlt && alternatives.length > 0) {
    html += `  <div class="cs-wizard-panel__alts">\n`;
    html += `    <h3>Alternative Approaches</h3>\n`;
    html += `    <ul class="cs-wizard-alts" role="list">\n`;
    for (const alt of alternatives) {
      html += `      <li>${esc(alt)}</li>\n`;
    }
    html += `    </ul>\n`;
    html += `  </div>\n`;
  }

  html += `</section>`;

  return { html, result };
}

// ── Spec input form ───────────────────────────────────────────────────────────

/**
 * Build an HTML form that collects design spec inputs for the wizard.
 * Does NOT include <form> submit logic — that's the app shell's responsibility.
 *
 * @param {object}  [defaultSpec]  Pre-populate field values.
 * @param {object}  [opts]
 * @param {string}  [opts.id='cs-wizard-form']
 * @param {string}  [opts.submitLabel='Run Wizard']
 * @returns {string}  HTML form string.
 */
export function buildWizardForm(defaultSpec = {}, opts = {}) {
  const formId  = opts.id ?? 'cs-wizard-form';
  const btnText = opts.submitLabel ?? 'Run Wizard';

  const numField = (id, label, defaultVal, min, max, step = 'any', hint = '') => {
    const hintAttr = hint ? ` aria-describedby="${esc(id)}-hint"` : '';
    const hintHtml = hint ? `<span id="${esc(id)}-hint" class="cs-field-hint">${esc(hint)}</span>` : '';
    const val      = defaultSpec[id] !== undefined ? ` value="${esc(defaultSpec[id])}"` : '';
    return (
      `<div class="cs-field">\n` +
      `  <label class="cs-label" for="${esc(id)}">${esc(label)}</label>\n` +
      (hintHtml ? `  ${hintHtml}\n` : '') +
      `  <input class="cs-input" type="number" id="${esc(id)}" name="${esc(id)}" ` +
      `min="${min}" max="${max}" step="${step}"${val}${hintAttr}>\n` +
      `</div>`
    );
  };

  const checkField = (id, label, defaultVal = false) => {
    const checked = (defaultSpec[id] ?? defaultVal) ? ' checked' : '';
    return (
      `<div class="cs-field cs-field--checkbox">\n` +
      `  <input class="cs-checkbox" type="checkbox" id="${esc(id)}" name="${esc(id)}"${checked}>\n` +
      `  <label class="cs-label cs-label--inline" for="${esc(id)}">${esc(label)}</label>\n` +
      `</div>`
    );
  };

  const selectField = (id, label, options, defaultVal) => {
    const opts_ = options.map(([val, text]) =>
      `<option value="${esc(val)}"${(defaultSpec[id] ?? defaultVal) === val ? ' selected' : ''}>${esc(text)}</option>`
    ).join('\n      ');
    return (
      `<div class="cs-field">\n` +
      `  <label class="cs-label" for="${esc(id)}">${esc(label)}</label>\n` +
      `  <select class="cs-select" id="${esc(id)}" name="${esc(id)}">\n      ${opts_}\n  </select>\n` +
      `</div>`
    );
  };

  const html = (
    `<form class="cs-wizard-form" id="${esc(formId)}" novalidate ` +
    `aria-label="Design Wizard Specification">\n` +

    `  <fieldset class="cs-fieldset">\n` +
    `    <legend class="cs-legend">Performance Targets</legend>\n` +
    numField('overshoot',    'Max Overshoot (%)',      '',  0, 100, 0.1,
             'e.g. 10 for 10%') + '\n' +
    numField('settlingTime', 'Settling Time (s)',       '',  0, 1000, 0.01,
             '2% criterion') + '\n' +
    numField('bandwidth',    'Bandwidth (rad/s)',       '',  0, 10000, 1,
             'Optional — target closed-loop bandwidth') + '\n' +
    numField('phaseMargin',  'Min Phase Margin (°)',  45,   0, 180, 1) + '\n' +
    numField('gainMargin',   'Min Gain Margin (dB)',   6,   0,  60, 0.5) + '\n' +
    `  </fieldset>\n\n` +

    `  <fieldset class="cs-fieldset">\n` +
    `    <legend class="cs-legend">System Properties</legend>\n` +
    selectField('topology', 'Topology', [['siso','SISO (single loop)'],['mimo','MIMO (multi-loop)']], 'siso') + '\n' +
    numField('nInputs',  'Number of Inputs',  1, 1, 32, 1) + '\n' +
    numField('nOutputs', 'Number of Outputs', 1, 1, 32, 1) + '\n' +
    checkField('robustness', 'Parametric uncertainty / robustness required') + '\n' +
    checkField('nonlinear',  'Nonlinear plant') + '\n' +
    checkField('adaptive',   'Time-varying or unknown plant (adaptive)') + '\n' +
    checkField('safety',     'Hard safety constraints (CLF-CBF / Safe MPC)') + '\n' +
    checkField('discrete',   'Digital implementation (embedded / real-time)') + '\n' +
    numField('Ts', 'Sample Time Ts (s)', '', 0, 100, 0.0001, 'Required if discrete') + '\n' +
    `  </fieldset>\n\n` +

    `  <div class="cs-form-actions">\n` +
    `    <button type="submit" class="cs-btn cs-btn--primary">${esc(btnText)}</button>\n` +
    `    <button type="reset"  class="cs-btn cs-btn--secondary">Reset</button>\n` +
    `  </div>\n` +
    `</form>`
  );

  return html;
}
