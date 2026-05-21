#!/usr/bin/env node
/**
 * generate_api_docs.mjs — P28-02: JSDoc API Documentation Generator
 *
 * Scans js/ for all .js files, extracts JSDoc comments and exported
 * symbols, and emits docs/api/index.html with a searchable API index.
 *
 * Usage:
 *   node scripts/generate_api_docs.mjs [--out docs/api/index.html] [--quiet]
 *
 * Output:
 *   docs/api/index.html   — single-file HTML API reference
 *   docs/api/symbols.json — machine-readable symbol list
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join, relative, basename, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..');

// ── CLI args ─────────────────────────────────────────────────────────────────
const args   = process.argv.slice(2);
const quiet  = args.includes('--quiet');
const outIdx = args.indexOf('--out');
const outPath = outIdx !== -1 ? args[outIdx + 1] : join(ROOT, 'docs', 'api', 'index.html');
const outDir  = dirname(outPath);

function log(...a) { if (!quiet) console.log(...a); }

// ── File scanner ──────────────────────────────────────────────────────────────
function walkJS(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue;
      walkJS(full, files);
    } else if (entry.endsWith('.js')) {
      files.push(full);
    }
  }
  return files;
}

// ── JSDoc parser ──────────────────────────────────────────────────────────────
/**
 * Extract JSDoc blocks from source text.
 * Returns array of { description, params, returns, example, rawLines }.
 */
function parseJSDoc(src) {
  const blocks = [];
  // Match /** ... */ blocks
  const re = /\/\*\*([\s\S]*?)\*\//g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const raw = m[1];
    const lines = raw.split('\n').map(l => l.replace(/^\s*\*\s?/, '').trimEnd());
    const block = { description: '', params: [], returns: null, example: '', tags: {}, rawLines: lines };
    let inExample = false;
    let descLines = [];

    for (const line of lines) {
      if (line.startsWith('@example')) { inExample = true; continue; }
      if (inExample) { block.example += line + '\n'; continue; }

      const tagMatch = line.match(/^@(\w+)\s*(.*)/);
      if (!tagMatch) {
        if (Object.keys(block.tags).length === 0) descLines.push(line);
        continue;
      }
      const [, tag, rest] = tagMatch;
      if (tag === 'param') {
        // {type} name  description
        const pm = rest.match(/^\{([^}]*)\}\s+(\[?[\w.]+\]?)\s*(.*)/);
        if (pm) block.params.push({ type: pm[1], name: pm[2], desc: pm[3] });
        else    block.params.push({ type: '', name: rest.split(/\s+/)[0], desc: rest });
      } else if (tag === 'returns' || tag === 'return') {
        const rm = rest.match(/^\{([^}]*)\}\s*(.*)/);
        block.returns = rm ? { type: rm[1], desc: rm[2] } : { type: '', desc: rest };
      } else {
        block.tags[tag] = (block.tags[tag] || []).concat(rest);
      }
    }
    block.description = descLines.filter(l => l.trim()).join(' ').trim();
    blocks.push(block);
  }
  return blocks;
}

/**
 * Find exported function/class/const declarations following a JSDoc block.
 * Returns array of { kind:'function'|'class'|'const', name, signature }.
 */
function findExports(src) {
  const exports_ = [];
  // Match export function/class/const/let
  const re = /export\s+((?:async\s+)?function|class|const|let|var)\s+(\w+)([^{;]*)/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const [, kind, name, rest] = m;
    exports_.push({
      kind:      kind.replace('async function', 'async function').replace('function', 'function'),
      name,
      signature: (name + rest.replace(/\s+/g, ' ')).trim().slice(0, 120),
    });
  }
  return exports_;
}

// ── Main extraction ───────────────────────────────────────────────────────────
log('\n📖  ControlStudio API Documentation Generator (P28-02)');
log('   Scanning js/ directory…\n');

const jsDir = join(ROOT, 'js');
const files = walkJS(jsDir);
log(`   Found ${files.length} JS files`);

/** @type {{ file:string, relPath:string, exports:{name,kind,signature,doc?}[] }[]} */
const modules = [];

for (const file of files) {
  const src     = readFileSync(file, 'utf8');
  const relPath = relative(ROOT, file);
  const jsdocs  = parseJSDoc(src);
  const exports_ = findExports(src);

  // Pair each export with preceding JSDoc (heuristic: within 5 lines)
  const docsByPos = [];
  const jsdocRe   = /\/\*\*([\s\S]*?)\*\//g;
  let dm;
  while ((dm = jsdocRe.exec(src)) !== null) {
    const endPos = dm.index + dm[0].length;
    // Find the next export after this JSDoc
    const after  = src.slice(endPos, endPos + 500);
    const expM   = after.match(/^\s*export\s+(?:async\s+)?(?:function|class|const|let|var)\s+(\w+)/);
    if (expM) {
      const raw   = dm[1];
      const lines = raw.split('\n').map(l => l.replace(/^\s*\*\s?/, '').trimEnd());
      let desc = lines.filter(l => !l.startsWith('@') && l.trim()).join(' ').trim();
      docsByPos.push({ name: expM[1], desc: desc.slice(0, 300) });
    }
  }

  const docMap = Object.fromEntries(docsByPos.map(d => [d.name, d.desc]));

  const enriched = exports_.map(e => ({
    ...e,
    doc: docMap[e.name] || '',
  }));

  if (enriched.length > 0) {
    modules.push({ file, relPath, exports: enriched });
    if (!quiet) process.stdout.write(`   ✓ ${relPath} (${enriched.length} exports)\n`);
  }
}

const totalExports = modules.reduce((s, m) => s + m.exports.length, 0);
log(`\n   Total: ${totalExports} exported symbols across ${modules.length} modules`);

// ── Build HTML ────────────────────────────────────────────────────────────────
const date = new Date().toISOString().slice(0, 10);

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function moduleSection(mod) {
  const title = basename(mod.relPath, '.js');
  const id    = mod.relPath.replace(/[^a-z0-9]/gi, '-');
  const rows  = mod.exports.map(e => {
    const kindBadge = `<span class="badge badge-${e.kind.includes('class') ? 'class' : e.kind.includes('const') ? 'const' : 'fn'}">${e.kind.replace('function', 'fn').replace('async fn', 'async')}</span>`;
    return (
      `<tr id="sym-${esc(e.name)}">` +
      `<td>${kindBadge}</td>` +
      `<td><code class="sym-name">${esc(e.name)}</code></td>` +
      `<td class="sym-desc">${esc(e.doc || '—')}</td>` +
      `</tr>`
    );
  }).join('\n');

  return `
<section class="module" id="${esc(id)}">
  <h3 class="module-title">
    <code>${esc(title)}</code>
    <span class="module-path">${esc(mod.relPath)}</span>
  </h3>
  <table class="sym-table">
    <thead><tr><th>Kind</th><th>Name</th><th>Description</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</section>`;
}

// Group modules by subdirectory
const groups = {};
for (const mod of modules) {
  const parts = mod.relPath.replace(/\\/g, '/').split('/');
  const group = parts.length > 2 ? parts.slice(0, -1).join('/') : parts[0];
  (groups[group] = groups[group] ?? []).push(mod);
}

const navItems = Object.keys(groups).sort().map(g =>
  `<li><a href="#${esc(g.replace(/[^a-z0-9]/gi, '-'))}">${esc(g)}</a></li>`
).join('\n');

const mainSections = Object.entries(groups).sort(([a],[b]) => a.localeCompare(b)).map(([g, mods]) => {
  const gid = g.replace(/[^a-z0-9]/gi, '-');
  return `<div class="group" id="${esc(gid)}">
  <h2 class="group-title">${esc(g)}</h2>
  ${mods.map(moduleSection).join('')}
</div>`;
}).join('\n\n');

// Symbol list for search
const allSymbols = modules.flatMap(m =>
  m.exports.map(e => ({ name: e.name, kind: e.kind, module: m.relPath, doc: e.doc }))
);

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ControlStudio API Reference — P28-02</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  background: #0d1117; color: #e6edf3;
  display: grid; grid-template-columns: 220px 1fr;
  min-height: 100vh; font-size: 14px;
}
nav {
  position: sticky; top: 0; height: 100vh; overflow-y: auto;
  background: #161b22; border-right: 1px solid #30363d;
  padding: 1.5rem 1rem;
}
nav h2 { font-size: 0.75rem; text-transform: uppercase; color: #8b949e;
  letter-spacing: .05em; margin-bottom: .75rem; }
nav ul { list-style: none; }
nav li a { display: block; padding: .25rem .5rem; border-radius: 4px;
  color: #8b949e; text-decoration: none; font-size: .85rem;
  transition: background .15s; }
nav li a:hover, nav li a:focus { background: #21262d; color: #e6edf3; }
main { padding: 2rem; overflow-x: auto; }
header { margin-bottom: 2rem; border-bottom: 1px solid #30363d; padding-bottom: 1rem; }
header h1 { font-size: 1.5rem; color: #3fb950; }
header p  { color: #8b949e; margin-top: .25rem; }
#search-wrap { margin: 1rem 0; }
#search {
  width: 100%; max-width: 400px; padding: .5rem .75rem;
  background: #21262d; border: 1px solid #30363d; border-radius: 6px;
  color: #e6edf3; font-size: .9rem; outline: none;
}
#search:focus { border-color: #3fb950; }
#search-results { margin-top: .5rem; }
.search-hit { padding: .25rem .5rem; border-radius: 4px; cursor: pointer; }
.search-hit:hover { background: #21262d; }
.search-hit code { color: #3fb950; }
.search-hit small { color: #8b949e; }
.group { margin-bottom: 2.5rem; }
.group-title { font-size: 1.1rem; color: #58a6ff; margin-bottom: 1rem;
  padding-bottom: .4rem; border-bottom: 1px solid #30363d; }
.module { margin-bottom: 1.5rem; }
.module-title {
  font-size: .9rem; background: #161b22; padding: .5rem .75rem;
  border-radius: 6px 6px 0 0; border: 1px solid #30363d; border-bottom: none;
  display: flex; align-items: baseline; gap: .5rem;
}
.module-title code { color: #e6edf3; }
.module-path { font-size: .75rem; color: #8b949e; font-weight: normal; }
.sym-table {
  width: 100%; border-collapse: collapse;
  border: 1px solid #30363d; border-radius: 0 0 6px 6px;
  overflow: hidden;
}
.sym-table th, .sym-table td {
  padding: .4rem .75rem; text-align: left; border-bottom: 1px solid #21262d;
  vertical-align: top;
}
.sym-table th { background: #161b22; color: #8b949e; font-size: .8rem;
  text-transform: uppercase; letter-spacing: .04em; }
.sym-table tr:last-child td { border-bottom: none; }
.sym-table tr:nth-child(even) td { background: #0d111788; }
.sym-name { color: #3fb950; font-size: .9rem; }
.sym-desc { color: #8b949e; font-size: .85rem; max-width: 600px; }
.badge { display: inline-block; padding: .1rem .35rem; border-radius: 3px;
  font-size: .72rem; font-weight: 700; white-space: nowrap; }
.badge-fn    { background: #1d4ed822; color: #60a5fa; }
.badge-async { background: #7c3aed22; color: #a78bfa; }
.badge-class { background: #065f4622; color: #34d399; }
.badge-const { background: #7c2d1222; color: #fb923c; }
footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #30363d;
  color: #8b949e; font-size: .8rem; text-align: center; }
:focus-visible { outline: 2px solid #58a6ff; outline-offset: 2px; }
</style>
</head>
<body>
<nav aria-label="Module navigation">
  <h2>Modules</h2>
  <ul id="nav-list">
    <li><a href="#top">↑ Top</a></li>
    ${navItems}
  </ul>
</nav>

<main id="top">
  <header>
    <h1>ControlStudio API Reference</h1>
    <p>Generated ${date} — ${totalExports} exported symbols across ${modules.length} modules (P28-02)</p>
  </header>

  <div id="search-wrap">
    <input id="search" type="search" placeholder="Search symbols…" aria-label="Search API symbols">
    <div id="search-results" role="region" aria-live="polite"></div>
  </div>

  ${mainSections}

  <footer>ControlStudio P28-02 — Auto-generated JSDoc API Reference</footer>
</main>

<script>
const symbols = ${JSON.stringify(allSymbols)};
const search  = document.getElementById('search');
const results = document.getElementById('search-results');

search.addEventListener('input', () => {
  const q = search.value.trim().toLowerCase();
  if (!q) { results.innerHTML = ''; return; }
  const hits = symbols.filter(s =>
    s.name.toLowerCase().includes(q) || s.doc.toLowerCase().includes(q)
  ).slice(0, 20);
  if (!hits.length) { results.innerHTML = '<p style="color:#8b949e;padding:.25rem .5rem">No results</p>'; return; }
  results.innerHTML = hits.map(s =>
    '<div class="search-hit" onclick="document.getElementById(\\'sym-' + s.name + '\\').scrollIntoView({behavior:\\'smooth\\'})">' +
    '<code>' + s.name + '</code> ' +
    '<small>' + s.module + '</small>' +
    (s.doc ? '<br><small style=\\"color:#8b949e\\">' + s.doc.slice(0,100) + '</small>' : '') +
    '</div>'
  ).join('');
});
</script>
</body>
</html>`;

// ── Write output ──────────────────────────────────────────────────────────────
mkdirSync(outDir, { recursive: true });
writeFileSync(outPath, html, 'utf8');

const symPath = join(outDir, 'symbols.json');
writeFileSync(symPath, JSON.stringify(allSymbols, null, 2), 'utf8');

log(`\n✅  HTML written to:    ${outPath}`);
log(`   JSON written to:    ${symPath}`);
log(`   Symbols indexed:    ${totalExports}\n`);
