#!/usr/bin/env node
/**
 * docs/build.mjs
 *
 * Source : docs/src/**\/*.md
 * Output : docs/{agents,control-studio,nvidia,cases}/**\/*.html
 *          docs/index.html
 *
 * Usage  : node docs/build.mjs
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync, statSync, existsSync } from 'fs';
import { join, relative, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const DOCS_DIR = dirname(fileURLToPath(import.meta.url));
const SRC_DIR  = join(DOCS_DIR, 'src');

// ── Simple Markdown → HTML converter ─────────────────────────────────────────

function escape(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function inlineHtml(line) {
  return line
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/~~(.+?)~~/g, '<del>$1</del>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

function mdToHtml(md) {
  const lines = md.split('\n');
  const out = [];
  let inCode = false, codeLang = '', codeLines = [];
  let inTable = false, tableHeadDone = false;
  let inBlockquote = false;
  let listStack = [];

  function flushList() {
    while (listStack.length) out.push(`</${listStack.pop().type}>`);
  }
  function flushBlockquote() {
    if (inBlockquote) { out.push('</blockquote>'); inBlockquote = false; }
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trimEnd();

    // Fenced code block
    if (line.startsWith('```')) {
      if (!inCode) {
        flushList(); flushBlockquote();
        codeLang = line.slice(3).trim(); inCode = true; codeLines = [];
      } else {
        const lang = codeLang ? ` class="lang-${codeLang}"` : '';
        out.push(`<pre><code${lang}>${escape(codeLines.join('\n'))}</code></pre>`);
        inCode = false; codeLang = ''; codeLines = [];
      }
      continue;
    }
    if (inCode) { codeLines.push(raw); continue; }

    // HR
    if (/^(-{3,}|_{3,}|\*{3,})$/.test(line.trim())) {
      flushList(); flushBlockquote(); out.push('<hr>'); continue;
    }

    // Headings
    const hm = line.match(/^(#{1,6})\s+(.*)/);
    if (hm) {
      flushList(); flushBlockquote();
      const lvl = hm[1].length;
      const txt = inlineHtml(escape(hm[2]));
      const id  = hm[2].toLowerCase().replace(/[^a-z0-9一-鿿]+/g,'-').replace(/^-|-$/g,'');
      out.push(`<h${lvl} id="${id}">${txt}</h${lvl}>`);
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      flushList();
      if (!inBlockquote) { out.push('<blockquote>'); inBlockquote = true; }
      out.push(`<p>${inlineHtml(escape(line.slice(2)))}</p>`);
      continue;
    } else if (inBlockquote && line.trim() === '') { flushBlockquote(); }

    // Tables
    if (line.includes('|') && line.trim().startsWith('|')) {
      const cells = line.split('|').slice(1,-1).map(c => c.trim());
      if (cells.every(c => /^[-:]+$/.test(c))) { tableHeadDone = true; continue; }
      if (!inTable) { flushList(); flushBlockquote(); out.push('<table><thead>'); inTable = true; tableHeadDone = false; }
      const tag = tableHeadDone ? 'td' : 'th';
      if (tableHeadDone && !out.at(-1)?.includes('</thead>')) out.push('</thead><tbody>');
      out.push(`<tr>${cells.map(c=>`<${tag}>${inlineHtml(escape(c))}</${tag}>`).join('')}</tr>`);
      continue;
    } else if (inTable) { out.push('</tbody></table>'); inTable = false; tableHeadDone = false; }

    // Lists
    const ulm = line.match(/^(\s*)([-*+])\s+(.*)/);
    const olm = line.match(/^(\s*)(\d+)\.\s+(.*)/);
    if (ulm || olm) {
      flushBlockquote();
      const indent = (ulm||olm)[1].length;
      const type   = ulm ? 'ul' : 'ol';
      const text   = inlineHtml(escape((ulm||olm)[3]));
      const last   = listStack.at(-1);
      if (!last || indent > last.indent) {
        out.push(`<${type}>`); listStack.push({type, indent});
      } else if (indent < last.indent) {
        while (listStack.length && listStack.at(-1).indent > indent)
          out.push(`</${listStack.pop().type}>`);
      }
      out.push(`<li>${text}</li>`);
      continue;
    } else if (listStack.length && line.trim() === '') { flushList(); }
      else if (listStack.length && !line.match(/^\s/)) { flushList(); }

    if (line.trim() === '') { out.push(''); continue; }
    out.push(`<p>${inlineHtml(escape(line))}</p>`);
  }

  flushList(); flushBlockquote();
  if (inCode)  out.push(`<pre><code>${escape(codeLines.join('\n'))}</code></pre>`);
  if (inTable) out.push('</tbody></table>');
  return out.join('\n');
}

// ── HTML shell ───────────────────────────────────────────────────────────────

const CSS = `
:root {
  --bg:#0f1117;--bg2:#1a1d2e;--bg3:#252840;
  --border:#2d3155;--accent:#6366f1;--accent2:#818cf8;
  --text:#e2e8f0;--muted:#94a3b8;--code-bg:#1e2235;
  --ok:#22c55e;--warn:#f59e0b;
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
     background:var(--bg);color:var(--text);line-height:1.7;
     display:flex;min-height:100vh}
nav{width:240px;min-height:100vh;background:var(--bg2);
    border-right:1px solid var(--border);padding:24px 0;
    position:sticky;top:0;height:100vh;overflow-y:auto;flex-shrink:0}
nav .logo{padding:0 20px 20px;border-bottom:1px solid var(--border);margin-bottom:12px}
nav .logo a{text-decoration:none;font-size:15px;font-weight:700;color:var(--accent2)}
nav .section{padding:6px 20px 2px;font-size:10px;font-weight:700;
             text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin-top:8px}
nav a{display:block;padding:5px 20px;font-size:13px;color:var(--muted);
      text-decoration:none;border-left:2px solid transparent;transition:all .15s}
nav a:hover,nav a.active{color:var(--text);border-color:var(--accent);background:rgba(99,102,241,.08)}
main{flex:1;padding:40px 48px;max-width:900px;min-width:0}
h1{font-size:2rem;font-weight:800;color:var(--text);
   border-bottom:2px solid var(--accent);padding-bottom:12px;margin-bottom:24px}
h2{font-size:1.4rem;font-weight:700;color:var(--accent2);margin:32px 0 12px;padding-top:8px}
h3{font-size:1.1rem;font-weight:600;color:var(--text);margin:20px 0 8px}
h4,h5,h6{font-size:1rem;font-weight:600;color:var(--muted);margin:16px 0 6px}
p{margin:8px 0}
a{color:var(--accent2)}
a:hover{color:#a5b4fc}
code{background:var(--code-bg);border:1px solid var(--border);border-radius:4px;
     padding:1px 5px;font-size:.875em;font-family:'JetBrains Mono','Fira Code',monospace;color:#a5b4fc}
pre{background:var(--code-bg);border:1px solid var(--border);border-radius:8px;
    padding:16px;overflow-x:auto;margin:12px 0}
pre code{background:none;border:none;padding:0;font-size:.82rem;color:var(--text)}
blockquote{border-left:3px solid var(--accent);padding:8px 16px;
           background:rgba(99,102,241,.06);margin:12px 0;border-radius:0 6px 6px 0}
ul,ol{padding-left:24px;margin:8px 0}
li{margin:3px 0}
table{width:100%;border-collapse:collapse;margin:16px 0;font-size:.9rem}
th{background:var(--bg3);color:var(--accent2);font-weight:700;
   padding:8px 12px;border:1px solid var(--border);text-align:left}
td{padding:7px 12px;border:1px solid var(--border)}
tr:nth-child(even) td{background:rgba(255,255,255,.02)}
hr{border:none;border-top:1px solid var(--border);margin:24px 0}
strong{color:#c7d2fe}
del{color:var(--muted)}
@media(max-width:768px){nav{display:none}main{padding:20px 16px}}
`;

function htmlPage(title, body, navLinks, backPath='') {
  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — NVIDIA OS Support Docs</title>
<style>${CSS}</style>
</head>
<body>
<nav>
  <div class="logo"><a href="${backPath}index.html">📁 Docs</a></div>
  ${navLinks}
</nav>
<main>
${body}
</main>
</body>
</html>`;
}

// ── Navigation definition ─────────────────────────────────────────────────────

const NAV = [
  { label:'Agent 工作文件', files:[
    { src:'agents/usage.md',        out:'agents/usage.html',        label:'使用指南',            wf:'Agent 日常操作、CLI 命令' },
    { src:'agents/continuation.md', out:'agents/continuation.html', label:'接手狀態',            wf:'切換 Agent / 上下文移交' },
    { src:'agents/workflows.md',    out:'agents/workflows.html',    label:'Runnable Workflows',  wf:'NVIDIA workflow 執行方式' },
  ]},
  { label:'ControlStudio', files:[
    { src:'control-studio/roadmap.md',      out:'control-studio/roadmap.html',      label:'Roadmap（主線）',    wf:'Phase 狀態、下一步開發順序' },
    { src:'control-studio/plan.md',         out:'control-studio/plan.html',         label:'開發計畫',           wf:'MVP 範圍、架構決策' },
    { src:'control-studio/backlog.md',      out:'control-studio/backlog.html',      label:'Backlog',            wf:'Task ID、依賴、驗證證據' },
    { src:'control-studio/scenarios.md',    out:'control-studio/scenarios.html',    label:'情境案例',           wf:'真實設計流程 end-to-end' },
    { src:'control-studio/verification.md', out:'control-studio/verification.html', label:'驗證案例',           wf:'數學推導 + 數值回歸基準' },
    { src:'control-studio/skills.md',       out:'control-studio/skills.html',       label:'Skill 規劃',         wf:'Phase 18+ skill 邊界' },
    { src:'control-studio/uiux-r1.md',      out:'control-studio/uiux-r1.html',      label:'UI/UX Round 1',      wf:'P34–P59 功能卡（已落地）' },
    { src:'control-studio/uiux-r2.md',      out:'control-studio/uiux-r2.html',      label:'UI/UX Round 2',      wf:'P60–P65 功能卡（進行中）' },
    { src:'control-studio/archive/phase10-plan.md',   out:'control-studio/archive/phase10-plan.html',   label:'▸ Phase 10 計畫（封存）', wf:'' },
    { src:'control-studio/archive/phase10-verify.md', out:'control-studio/archive/phase10-verify.html', label:'▸ Phase 10 驗證（封存）', wf:'' },
  ]},
  { label:'NVIDIA 模型', files:[
    { src:'nvidia/guide.md',        out:'nvidia/guide.html',        label:'落地操作指南',        wf:'模型功能、串接位置、步驟' },
    { src:'nvidia/models-zh.md',    out:'nvidia/models-zh.html',    label:'模型分類表（中文）',  wf:'模型能力速查' },
    { src:'nvidia/models-en.md',    out:'nvidia/models-en.html',    label:'Model Summary (EN)',  wf:'English capability table' },
    { src:'nvidia/selector-plan.md',out:'nvidia/selector-plan.html',label:'Selector Skill 計畫', wf:'Codex skill 建置規劃' },
  ]},
  { label:'案例輸出', files:[
    { src:'cases/dc-motor.md',       out:'cases/dc-motor.html',       label:'DC Motor 速度控制',   wf:'設計 → 驗證完整流程' },
    { src:'cases/precision-servo.md',out:'cases/precision-servo.html',label:'Precision Servo',     wf:'精密定位案例' },
    { src:'cases/regression.md',     out:'cases/regression.html',     label:'Regression Dashboard',wf:'回歸測試結果' },
  ]},
];

function buildNav(activeOut='', backPath='') {
  return NAV.map(sec => {
    const items = sec.files.map(f => {
      const href   = backPath + f.out;
      const active = activeOut === f.out;
      return `<a href="${href}"${active?' class="active"':''}>${f.label}</a>`;
    }).join('\n  ');
    return `<div class="section">${sec.label}</div>\n  ${items}`;
  }).join('\n');
}

// ── Convert docs ──────────────────────────────────────────────────────────────

let converted = 0;
for (const sec of NAV) {
  for (const f of sec.files) {
    const srcPath = join(SRC_DIR, f.src);
    const outPath = join(DOCS_DIR, f.out);
    if (!existsSync(srcPath)) { console.warn(`  ⚠ 找不到 src/${f.src}`); continue; }

    mkdirSync(dirname(outPath), { recursive: true });
    const md    = readFileSync(srcPath, 'utf8');
    const body  = mdToHtml(md);
    const title = md.match(/^#\s+(.+)/m)?.[1] ?? f.label;
    const depth = f.out.split('/').length - 1;
    const back  = depth > 0 ? '../'.repeat(depth) : '';
    writeFileSync(outPath, htmlPage(title, body, buildNav(f.out, back), back));
    console.log(`  ✓ src/${f.src} → ${f.out}`);
    converted++;
  }
}

// ── index.html ────────────────────────────────────────────────────────────────

const FLOW = `<div style="background:var(--bg3);border:1px solid var(--border);border-radius:12px;
padding:24px;margin:24px 0;font-family:monospace;font-size:13px;line-height:2;white-space:pre;">
工作流與文件關係
═══════════════════════════════════════════════════════════════

  [ Agent 接手 ] ──▶ agents/continuation.html  （狀態 / git hash）
       │
       ▼
  [ 了解操作 ] ──▶ agents/usage.html            （CLI 命令 / API key）
       │
       ├──▶ [ NVIDIA 模型選型 ] ──▶ nvidia/guide.html
       │                            nvidia/models-zh.html
       │                            nvidia/selector-plan.html
       │
       └──▶ [ ControlStudio 開發 ]
               │
               ├── control-studio/roadmap.html    ← 主線狀態（必讀）
               ├── control-studio/plan.html        ← 架構 / MVP 決策
               ├── control-studio/backlog.html     ← Task ID / 驗證證據
               ├── control-studio/scenarios.html   ← 真實設計情境
               ├── control-studio/verification.html ← 數值回歸基準
               └── control-studio/skills.html      ← Phase 18+ skill 邊界

  [ 執行 Workflow ] ──▶ agents/workflows.html
  [ 查看案例輸出 ] ──▶ cases/*.html
  [ UI/UX 功能卡 ] ──▶ control-studio/uiux-r1.html
                        control-studio/uiux-r2.html

  編輯源碼 → docs/src/**\/*.md → node docs/build.mjs → 重新生成 HTML
</div>`;

const cards = NAV.map(sec => {
  const items = sec.files.filter(f => f.wf).map(f =>
    `<a href="${f.out}" style="display:block;background:var(--bg3);border:1px solid var(--border);
border-radius:8px;padding:14px 16px;text-decoration:none;color:var(--text);transition:border-color .15s"
onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">
  <div style="font-weight:600;font-size:14px;color:var(--accent2);margin-bottom:4px;">${f.label}</div>
  <div style="font-size:12px;color:var(--muted);">${f.wf}</div>
</a>`).join('\n');
  return `<h2>${sec.label}</h2>
<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;margin-bottom:24px;">\n${items}\n</div>`;
}).join('\n');

const indexBody = `<h1>📁 NVIDIA OS Support — Docs</h1>
<p style="color:var(--muted);margin-bottom:8px;">文件導覽入口。左側選單可快速跳轉。源碼在 <code>docs/src/</code>。</p>
${FLOW}
${cards}
<hr>
<p style="font-size:12px;color:var(--muted);">由 <code>docs/build.mjs</code> 從 <code>docs/src/</code> 自動生成</p>`;

writeFileSync(join(DOCS_DIR, 'index.html'), htmlPage('文件入口', indexBody, buildNav('index.html')));

console.log(`\n✓ 共轉換 ${converted} 份文件`);
console.log('✓ docs/index.html 已更新');
