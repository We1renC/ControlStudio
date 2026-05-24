#!/usr/bin/env node
/**
 * docs/build.mjs
 * Converts all *.md files inside docs/ to styled HTML.
 * Also generates docs/index.html navigation portal.
 *
 * Usage:  node docs/build.mjs
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync, statSync } from 'fs';
import { join, relative, basename, dirname } from 'path';
import { fileURLToPath } from 'url';

const DOCS_DIR = dirname(fileURLToPath(import.meta.url));

// ── Simple Markdown → HTML converter ─────────────────────────────────────────

function escape(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function inlineHtml(line) {
  return line
    // code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // bold+italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    // bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // strikethrough
    .replace(/~~(.+?)~~/g, '<del>$1</del>')
    // links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

function mdToHtml(md) {
  const lines = md.split('\n');
  const out = [];
  let inCode = false, codeLang = '', codeLines = [];
  let inTable = false, tableHead = false;
  let inBlockquote = false;
  let listStack = []; // [{type:'ul'|'ol', indent}]

  function flushList() {
    while (listStack.length) {
      out.push(`</${listStack.pop().type}>`);
    }
  }

  function flushBlockquote() {
    if (inBlockquote) { out.push('</blockquote>'); inBlockquote = false; }
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trimEnd();

    // ── Fenced code block ──
    if (line.startsWith('```')) {
      if (!inCode) {
        flushList(); flushBlockquote();
        codeLang = line.slice(3).trim();
        inCode = true; codeLines = [];
      } else {
        const lang = codeLang ? ` class="lang-${codeLang}"` : '';
        out.push(`<pre><code${lang}>${escape(codeLines.join('\n'))}</code></pre>`);
        inCode = false; codeLang = ''; codeLines = [];
      }
      continue;
    }
    if (inCode) { codeLines.push(raw); continue; }

    // ── Horizontal rule ──
    if (/^(-{3,}|_{3,}|\*{3,})$/.test(line.trim())) {
      flushList(); flushBlockquote();
      out.push('<hr>'); continue;
    }

    // ── Headings ──
    const hMatch = line.match(/^(#{1,6})\s+(.*)/);
    if (hMatch) {
      flushList(); flushBlockquote();
      const level = hMatch[1].length;
      const text  = inlineHtml(escape(hMatch[2]));
      const id    = hMatch[2].toLowerCase().replace(/[^a-z0-9一-鿿]+/g,'-').replace(/^-|-$/g,'');
      out.push(`<h${level} id="${id}">${text}</h${level}>`);
      continue;
    }

    // ── Blockquote ──
    if (line.startsWith('> ')) {
      flushList();
      if (!inBlockquote) { out.push('<blockquote>'); inBlockquote = true; }
      out.push(`<p>${inlineHtml(escape(line.slice(2)))}</p>`);
      continue;
    } else if (inBlockquote && line.trim() === '') {
      flushBlockquote();
    }

    // ── Tables ──
    if (line.includes('|') && line.trim().startsWith('|')) {
      const cells = line.split('|').slice(1,-1).map(c => c.trim());
      // separator row?
      if (cells.every(c => /^-+$/.test(c))) {
        tableHead = true; continue;
      }
      if (!inTable) {
        flushList(); flushBlockquote();
        out.push('<table>');
        inTable = true; tableHead = false;
      }
      const tag = tableHead ? 'th' : 'td';
      if (tableHead) { out.push('<thead>'); tableHead = false; }
      out.push(`<tr>${cells.map(c=>`<${tag}>${inlineHtml(escape(c))}</${tag}>`).join('')}</tr>`);
      continue;
    } else if (inTable) {
      out.push('</thead><tbody>'); // lazy but works for most tables
      // Actually close properly
      out.push('</table>');
      inTable = false;
    }

    // ── Lists ──
    const ulMatch = line.match(/^(\s*)([-*+])\s+(.*)/);
    const olMatch = line.match(/^(\s*)(\d+)\.\s+(.*)/);
    if (ulMatch || olMatch) {
      flushBlockquote();
      const indent = (ulMatch || olMatch)[1].length;
      const type   = ulMatch ? 'ul' : 'ol';
      const text   = inlineHtml(escape((ulMatch || olMatch)[3]));
      // open or close list levels
      const last = listStack[listStack.length-1];
      if (!last || indent > last.indent) {
        out.push(`<${type}>`);
        listStack.push({type, indent});
      } else if (indent < last.indent) {
        while (listStack.length && listStack[listStack.length-1].indent > indent) {
          out.push(`</${listStack.pop().type}>`);
        }
      }
      out.push(`<li>${text}</li>`);
      continue;
    } else if (listStack.length && line.trim() !== '') {
      // continuation inside list? treat as plain paragraph
      flushList();
    } else if (listStack.length && line.trim() === '') {
      // blank line ends list
      flushList();
    }

    // ── Empty line ──
    if (line.trim() === '') { out.push(''); continue; }

    // ── Plain paragraph ──
    out.push(`<p>${inlineHtml(escape(line))}</p>`);
  }

  flushList();
  flushBlockquote();
  if (inCode) out.push(`<pre><code>${escape(codeLines.join('\n'))}</code></pre>`);
  if (inTable) out.push('</table>');

  return out.join('\n');
}

// ── HTML shell ───────────────────────────────────────────────────────────────

const CSS = `
:root {
  --bg: #0f1117; --bg2: #1a1d2e; --bg3: #252840;
  --border: #2d3155; --accent: #6366f1; --accent2: #818cf8;
  --text: #e2e8f0; --muted: #94a3b8; --code-bg: #1e2235;
  --success: #22c55e; --warn: #f59e0b;
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
       background: var(--bg); color: var(--text); line-height: 1.7;
       display: flex; min-height: 100vh; }
nav { width: 240px; min-height: 100vh; background: var(--bg2);
      border-right: 1px solid var(--border); padding: 24px 0;
      position: sticky; top: 0; height: 100vh; overflow-y: auto;
      flex-shrink: 0; }
nav .logo { padding: 0 20px 20px; border-bottom: 1px solid var(--border); margin-bottom: 12px; }
nav .logo a { text-decoration: none; font-size: 15px; font-weight: 700;
              color: var(--accent2); }
nav .section { padding: 6px 20px 2px; font-size: 10px; font-weight: 700;
               text-transform: uppercase; letter-spacing: 1px; color: var(--muted);
               margin-top: 8px; }
nav a { display: block; padding: 5px 20px; font-size: 13px; color: var(--muted);
        text-decoration: none; border-left: 2px solid transparent;
        transition: all .15s; }
nav a:hover, nav a.active { color: var(--text); border-color: var(--accent);
                              background: rgba(99,102,241,.08); }
main { flex: 1; padding: 40px 48px; max-width: 900px; min-width: 0; }
h1 { font-size: 2rem; font-weight: 800; color: var(--text);
     border-bottom: 2px solid var(--accent); padding-bottom: 12px; margin-bottom: 24px; }
h2 { font-size: 1.4rem; font-weight: 700; color: var(--accent2);
     margin: 32px 0 12px; padding-top: 8px; }
h3 { font-size: 1.1rem; font-weight: 600; color: var(--text); margin: 20px 0 8px; }
h4, h5, h6 { font-size: 1rem; font-weight: 600; color: var(--muted); margin: 16px 0 6px; }
p { margin: 8px 0; color: var(--text); }
a { color: var(--accent2); }
a:hover { color: #a5b4fc; }
code { background: var(--code-bg); border: 1px solid var(--border);
       border-radius: 4px; padding: 1px 5px; font-size: .875em;
       font-family: 'JetBrains Mono', 'Fira Code', monospace; color: #a5b4fc; }
pre { background: var(--code-bg); border: 1px solid var(--border);
      border-radius: 8px; padding: 16px; overflow-x: auto; margin: 12px 0; }
pre code { background: none; border: none; padding: 0;
           font-size: .82rem; color: var(--text); }
blockquote { border-left: 3px solid var(--accent); padding: 8px 16px;
             background: rgba(99,102,241,.06); margin: 12px 0; border-radius: 0 6px 6px 0; }
ul, ol { padding-left: 24px; margin: 8px 0; }
li { margin: 3px 0; }
table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: .9rem; }
th { background: var(--bg3); color: var(--accent2); font-weight: 700;
     padding: 8px 12px; border: 1px solid var(--border); text-align: left; }
td { padding: 7px 12px; border: 1px solid var(--border); color: var(--text); }
tr:nth-child(even) td { background: rgba(255,255,255,.02); }
hr { border: none; border-top: 1px solid var(--border); margin: 24px 0; }
strong { color: #c7d2fe; }
del { color: var(--muted); }
.badge { display: inline-block; font-size: 10px; font-weight: 700; padding: 1px 6px;
         border-radius: 9px; border: 1px solid; margin: 0 2px; vertical-align: middle; }
.badge-green { color: var(--success); border-color: var(--success); }
.badge-warn  { color: var(--warn);    border-color: var(--warn); }
/* toc sidebar on large screens */
@media (max-width: 768px) { nav { display: none; } main { padding: 20px 16px; } }
`;

function htmlPage(title, body, navLinks, backPath = '') {
  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — NVIDIA OS Support Docs</title>
<style>${CSS}</style>
</head>
<body>
<nav>
  <div class="logo"><a href="${backPath}index.html">📁 NVIDIA OS Support</a></div>
  ${navLinks}
</nav>
<main>
${body}
</main>
</body>
</html>`;
}

// ── Navigation structure ──────────────────────────────────────────────────────

const NAV_SECTIONS = [
  {
    label: 'Agent 工作文件',
    files: [
      { path: 'agents/usage.md',        label: '使用指南',           wf: 'Agent 日常操作、CLI 命令' },
      { path: 'agents/continuation.md', label: '接手狀態',           wf: '切換 Agent / 上下文移交' },
      { path: 'agents/workflows.md',    label: 'Runnable Workflows', wf: 'NVIDIA workflow 執行方式' },
    ]
  },
  {
    label: 'ControlStudio',
    files: [
      { path: 'control-studio/roadmap.md',    label: 'Roadmap（主線）',  wf: 'Phase 狀態、下一步開發順序' },
      { path: 'control-studio/plan.md',       label: '開發計畫',         wf: 'MVP 範圍、架構決策' },
      { path: 'control-studio/backlog.md',    label: 'Backlog',          wf: 'Task ID、依賴、驗證證據' },
      { path: 'control-studio/scenarios.md',  label: '情境案例',         wf: '真實設計流程 end-to-end' },
      { path: 'control-studio/verification.md', label: '驗證案例',       wf: '數學推導 + 數值回歸基準' },
      { path: 'control-studio/skills.md',     label: 'Skill 規劃',       wf: 'Phase 18+ skill 邊界' },
      { path: 'control-studio/uiux-r1.md',    label: 'UI/UX Round 1',   wf: 'P34–P59 功能卡（已落地）' },
      { path: 'control-studio/uiux-r2.md',    label: 'UI/UX Round 2',   wf: 'P60–P65 功能卡（進行中）' },
      { path: 'control-studio/archive/phase10-plan.md',   label: '▸ Phase 10 計畫（封存）', wf: '' },
      { path: 'control-studio/archive/phase10-verify.md', label: '▸ Phase 10 驗證（封存）', wf: '' },
    ]
  },
  {
    label: 'NVIDIA 模型',
    files: [
      { path: 'nvidia/guide.md',         label: '落地操作指南',       wf: '模型功能、串接位置、步驟' },
      { path: 'nvidia/models-zh.md',     label: '模型分類表（中文）', wf: '模型能力速查' },
      { path: 'nvidia/models-en.md',     label: 'Model Summary (EN)', wf: 'English capability table' },
      { path: 'nvidia/selector-plan.md', label: 'Selector Skill 計畫', wf: 'Codex skill 建置規劃' },
    ]
  },
  {
    label: '案例輸出',
    files: [
      { path: 'cases/dc-motor.md',       label: 'DC Motor 速度控制',  wf: '設計 → 驗證完整流程' },
      { path: 'cases/precision-servo.md',label: 'Precision Servo',    wf: '精密定位案例' },
      { path: 'cases/regression.md',     label: 'Regression Dashboard', wf: '回歸測試結果' },
    ]
  },
];

function buildNavLinks(activePath = '', backPath = '') {
  return NAV_SECTIONS.map(sec => {
    const items = sec.files.map(f => {
      const href = backPath + f.path.replace(/\.md$/, '.html');
      const isActive = activePath.endsWith(f.path.replace(/\.md$/, '.html'));
      return `<a href="${href}"${isActive ? ' class="active"' : ''}>${f.label}</a>`;
    }).join('\n  ');
    return `<div class="section">${sec.label}</div>\n  ${items}`;
  }).join('\n');
}

// ── Convert all .md files ─────────────────────────────────────────────────────

function allMdFiles(dir, base = dir) {
  const result = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) result.push(...allMdFiles(full, base));
    else if (entry.endsWith('.md')) result.push(relative(base, full));
  }
  return result;
}

const mdFiles = allMdFiles(DOCS_DIR);
let converted = 0;

for (const rel of mdFiles) {
  if (rel === 'build.mjs') continue;
  const src  = join(DOCS_DIR, rel);
  const dest = join(DOCS_DIR, rel.replace(/\.md$/, '.html'));
  const md   = readFileSync(src, 'utf8');
  const body = mdToHtml(md);

  // Extract title from first H1
  const titleMatch = md.match(/^#\s+(.+)/m);
  const title = titleMatch ? titleMatch[1] : rel;

  // Calculate relative path back to docs root
  const depth = rel.split('/').length - 1;
  const backPath = depth > 0 ? '../'.repeat(depth) : '';

  const navLinks = buildNavLinks(rel.replace(/\.md$/, '.html'), backPath);
  const html = htmlPage(title, body, navLinks, backPath);
  writeFileSync(dest, html);
  converted++;
  console.log(`  ✓ ${rel} → ${rel.replace(/\.md$/, '.html')}`);
}

// ── Generate index.html ───────────────────────────────────────────────────────

const WORKFLOW_DIAGRAM = `
<div style="background:var(--bg3);border:1px solid var(--border);border-radius:12px;padding:24px;margin:24px 0;font-family:monospace;font-size:13px;line-height:1.9;white-space:pre;">
工作流與文件關係
═══════════════════════════════════════════════════════════════

  [ Agent 接手 ] ──▶ agents/continuation.md   （狀態 / git hash）
       │
       ▼
  [ 了解操作 ] ──▶ agents/usage.md             （CLI 命令 / API key）
       │
       ├──▶ [ NVIDIA 模型選型 ] ──▶ nvidia/guide.md
       │                            nvidia/models-zh.md
       │                            nvidia/selector-plan.md
       │
       └──▶ [ ControlStudio 開發 ]
               │
               ├── control-studio/roadmap.md   ← 主線狀態（必讀）
               ├── control-studio/plan.md      ← 架構 / MVP 決策
               ├── control-studio/backlog.md   ← Task ID / 驗證證據
               ├── control-studio/scenarios.md ← 真實設計情境
               ├── control-studio/verification.md ← 數值回歸基準
               └── control-studio/skills.md   ← Phase 18+ skill 邊界

  [ 執行 Workflow ] ──▶ agents/workflows.md
  [ 查看案例輸出 ] ──▶ cases/*.html
  [ UI/UX 功能卡 ] ──▶ control-studio/uiux-r1.html
                        control-studio/uiux-r2.html
</div>`;

const indexCards = NAV_SECTIONS.map(sec => {
  const cards = sec.files.filter(f => f.wf).map(f => {
    const href = f.path.replace(/\.md$/, '.html');
    return `<a href="${href}" style="display:block;background:var(--bg3);border:1px solid var(--border);
border-radius:8px;padding:14px 16px;text-decoration:none;color:var(--text);
transition:border-color .15s;" onmouseover="this.style.borderColor='var(--accent)'"
onmouseout="this.style.borderColor='var(--border)'">
  <div style="font-weight:600;font-size:14px;color:var(--accent2);margin-bottom:4px;">${f.label}</div>
  <div style="font-size:12px;color:var(--muted);">${f.wf}</div>
</a>`;
  }).join('\n');

  return `<h2>${sec.label}</h2>
<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;margin-bottom:24px;">
${cards}
</div>`;
}).join('\n');

const indexBody = `
<h1>📁 NVIDIA OS Support — Docs</h1>
<p style="color:var(--muted);margin-bottom:8px;">所有 <code>.md</code> 文件的 HTML 檢視入口。左側導覽列可直接跳轉。</p>

${WORKFLOW_DIAGRAM}

${indexCards}

<hr>
<p style="font-size:12px;color:var(--muted);">
  由 <code>docs/build.mjs</code> 自動生成 ·
  源碼 <a href="https://github.com/ccchen369/nvdiaOSsupport">GitHub</a>
</p>`;

const indexHtml = htmlPage(
  '文件入口',
  indexBody,
  buildNavLinks('index.html', '')
);
writeFileSync(join(DOCS_DIR, 'index.html'), indexHtml);

console.log(`\n✓ 共轉換 ${converted} 個 .md → .html`);
console.log('✓ docs/index.html 已生成');
