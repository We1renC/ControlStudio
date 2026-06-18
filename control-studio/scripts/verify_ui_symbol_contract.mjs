#!/usr/bin/env node
/**
 * verify_ui_symbol_contract.mjs
 *
 * Runtime UI source must not depend on emoji / pictographic glyphs for buttons,
 * status badges, alerts, command icons, or dynamically injected DOM text.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const uiDir = path.join(ROOT, 'js', 'ui');
const files = [
  path.join(ROOT, 'index.html'),
  path.join(ROOT, 'js', 'app.js'),
  path.join(ROOT, 'js', 'control', 'productization.js'),
  path.join(ROOT, 'js', 'control', 'state-feedback.js'),
  ...fs.readdirSync(uiDir)
    .filter((name) => name.endsWith('.js'))
    .map((name) => path.join(uiDir, name)),
];

// Allow compact geometric controls already used as controls or layout markers.
// Prohibited examples include ✓, ✗, ⚠, ℹ, ⓘ, ⚙, fullwidth ＋, ✕, 📄, 🔗,
// keyboard glyphs, and all pictographic emoji.
const allowedGeometric = new Set(['▶', '◀', '⏸', '▼', '↔', '⬇']);
const disallowedPattern = /[\p{Extended_Pictographic}\u24D8\u2705\u2713\u2715\u2717\u21C5\u2318\u2325\u21E7\u2303\u26A0\u2139\uFF0B]/gu;

const findings = [];
for (const file of files) {
  const rel = path.relative(ROOT, file);
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\n/);
  lines.forEach((line, index) => {
    const glyphs = [...line.matchAll(disallowedPattern)]
      .map((match) => match[0])
      .filter((glyph) => !allowedGeometric.has(glyph));
    if (glyphs.length) {
      findings.push({
        file: rel,
        line: index + 1,
        glyphs: [...new Set(glyphs)].join(' '),
        text: line.trim().slice(0, 180),
      });
    }
  });
}

if (findings.length) {
  console.error('Runtime UI source contains disallowed emoji/pictographic glyphs:');
  findings.slice(0, 40).forEach((f) => {
    console.error(`  ${f.file}:${f.line} [${f.glyphs}] ${f.text}`);
  });
  if (findings.length > 40) {
    console.error(`  ... ${findings.length - 40} more`);
  }
  process.exit(1);
}

console.log('UI symbol contract: PASS');
