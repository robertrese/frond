// Frond tests. Run after the build:  node tests/run.js
// 1. every library puzzle and a year of dailies generate, with each word really in its grid
// 2. the site folder is installable, offline-ready and uses only relative URLs
// 3. colour tokens meet WCAG AA in light and dark, with both highlight palettes
// 4. nothing private ends up in the published files
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const site = path.join(root, 'site');
let failures = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { failures++; console.log('  FAIL ' + msg); } };
const section = (name) => console.log('\n' + name);

/* ---------- 1. puzzle generation ---------- */
section('Puzzles');
{
  const sandbox = { window: {} };
  new Function('window', fs.readFileSync(path.join(root, 'src/words.js'), 'utf8'))(sandbox.window);
  const app = fs.readFileSync(path.join(root, 'src/app.js'), 'utf8');
  const cut = (from, to) => app.slice(app.indexOf(from), app.indexOf(to));
  const code = cut('const DATA', '/* ---------- storage') + cut('const pad =', '/* ---------- puzzle generation') +
    cut('/* ---------- puzzle generation', '/* ---------- streaks') +
    'return { PACKS, LEVELS, PER_PACK, LAUNCH, GEN2_FROM, BLOCKED, puzzle, versionOf, packId, dailyId, iso, addDays, parse };';
  const G = new Function('window', code)(sandbox.window);
  // independent scan (not the generator's own check): every place `str` reads in 8 directions
  const DIRS = [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0], [1, -1], [-1, -1]];
  const spots = (q, str) => {
    const out = [];
    for (let r = 0; r < q.n; r++) for (let c = 0; c < q.n; c++) for (const [dr, dc] of DIRS) {
      const cells = [];
      for (let k = 0; k < str.length; k++) { const ch = (q.rows[r + dr * k] || '')[c + dc * k]; if (ch !== str[k]) break; cells.push((r + dr * k) + ',' + (c + dc * k)); }
      if (cells.length === str.length) out.push(cells);
    }
    return out;
  };
  const issues = (q) => {
    const paths = q.words.map((w) => new Set(Array.from({ length: w.word.length }, (_, k) => (w.r + w.dr * k) + ',' + (w.c + w.dc * k))));
    const found = [];
    for (const w of q.words) if (new Set(spots(q, w.word).map((c) => c.slice().sort().join('|'))).size > 1) found.push(w.word + ' twice');
    for (const bad of G.BLOCKED) for (const cells of spots(q, bad)) if (!paths.some((ps) => cells.every((x) => ps.has(x)))) found.push('blocked string');
    return found;
  };
  ok(G.BLOCKED.length >= 40 && G.BLOCKED.every((b) => /^[A-Z]{3,}$/.test(b)), 'blocked word list did not decode');
  let changed = 0, cleanV2 = 0, dirtyV1 = 0;
  const verify = (q, count, label) => {
    if (q.gv >= 2) {
      const bad = issues(q);
      ok(!bad.length, label + ' (v2) has ' + bad.join(', '));
      cleanV2++;
      // a grid v1 already made cleanly must come out of v2 unchanged
      const old = G.puzzle(q.id, 1);
      const oldBad = issues(old);
      if (oldBad.length) dirtyV1++;
      else ok(JSON.stringify(old.rows) === JSON.stringify(q.rows), label + ': clean v1 grid changed in v2');
      if (JSON.stringify(old.rows) !== JSON.stringify(q.rows)) changed++;
    }
    ok(q.words.length === count, label + ' has ' + q.words.length + ' words, expected ' + count);
    ok(q.rows.length === q.n && q.rows.every((r) => r.length === q.n && /^[A-Z]+$/.test(r)), label + ' grid is not ' + q.n + 'x' + q.n + ' capital letters');
    for (const w of q.words) {
      let s = '';
      for (let k = 0; k < w.word.length; k++) s += (q.rows[w.r + w.dr * k] || '')[w.c + w.dc * k] || '';
      ok(s === w.word, label + ': ' + w.word + ' is not where the puzzle says');
    }
    const ws = q.words.map((w) => w.word);
    ok(new Set(ws).size === ws.length, label + ' repeats a word');
    ok(!ws.some((a) => ws.some((b) => a !== b && b.includes(a))), label + ' has a word inside another word');
  };
  // every puzzle players can open, three years of dailies, and 25 spare seeds per theme and
  // difficulty so each grid size is exercised well beyond the shipped set
  const DAILY_DAYS = 3 * 365, SPARE_SEEDS = 25;
  const tally = {};
  const count = (k) => { tally[k] = (tally[k] || 0) + 1; };
  const t0 = Date.now();
  for (const p of G.PACKS) for (const lv of Object.keys(G.LEVELS)) {
    for (let i = 0; i < G.PER_PACK + SPARE_SEEDS; i++) {
      verify(G.puzzle(G.packId(p.id, lv, i)), G.LEVELS[lv].count, p.id + ' ' + lv + ' ' + (i + 1));
      count(i < G.PER_PACK ? 'library ' + lv : 'spare ' + lv);
    }
  }
  for (let k = 0; k < DAILY_DAYS; k++) { const d = G.iso(G.addDays(G.parse(G.LAUNCH), k)); verify(G.puzzle(G.dailyId(d)), 9, 'daily ' + d); count('daily'); }
  const again = new Function('window', code)(sandbox.window).puzzle('d:2026-11-02');
  ok(JSON.stringify(again.rows) === JSON.stringify(G.puzzle('d:2026-11-02').rows), 'the same day gives a different grid on a second run');
  // v1 must never change: puzzles already started, solved, or played as past dailies depend on it
  ok(G.puzzle('d:2026-11-02', 1).rows.join(' ') === 'LYCHEECA FAANMROI ANAIEECR LNLERGOE OALOMNNM ECLCRIUU MANGOGTL OOBMABOP', 'v1 daily for 2 Nov 2026 changed');
  ok(G.versionOf('d:2026-11-04') === 1 && G.puzzle('d:2026-11-04').gv === 1, 'today’s daily (4 Nov 2026) must stay on v1');
  ok(G.versionOf('d:' + G.GEN2_FROM) === 2, 'dailies from ' + G.GEN2_FROM + ' should use v2');
  ok(G.versionOf('p:herbs:easy:0') === 2, 'new library puzzles should use v2');
  const dec11 = G.puzzle('d:2026-12-11');
  ok(dec11.gv === 2 && !issues(dec11).length, 'the 11 Dec 2026 daily still contains a blocked string');
  const total = Object.values(tally).reduce((a, b) => a + b, 0);
  ok(total >= 1000, 'only ' + total + ' puzzles tested, the target is at least 1,000');
  const by = (lv) => (tally['library ' + lv] || 0) + (tally['spare ' + lv] || 0);
  console.log('  ' + total + ' puzzles generated and verified in ' + (Date.now() - t0) + ' ms');
  console.log('    easy 8x8: ' + by('easy') + ' · medium 10x10: ' + by('medium') + ' · hard 12x12: ' + by('hard') + ' · daily 8x8: ' + tally.daily);
  console.log('    (' + G.PACKS.length * 3 * G.PER_PACK + ' are the puzzles players can open; the rest are spare seeds)');
  console.log('  filler check (v2): ' + cleanV2 + ' puzzles clean; ' + dirtyV1 + ' had a problem in v1 and were fixed; ' + changed + ' grids differ from v1');
}

/* ---------- 2. site files ---------- */
section('Site (GitHub Pages build)');
{
  ok(fs.existsSync(site), 'site/ is missing: run python tools/build.py . first');
  const read = (f) => fs.readFileSync(path.join(site, f), 'utf8');
  const html = read('index.html');
  ok(html.startsWith('<!doctype html>'), 'index.html has no doctype');
  ok(/<meta name="viewport"[^>]*width=device-width/.test(html), 'index.html has no mobile viewport tag');
  ok(html.includes('<link rel="manifest" href="manifest.webmanifest">'), 'index.html does not link the manifest');
  ok(html.includes("register('sw.js')"), 'index.html does not register the service worker with a relative path');
  const urls = [...html.matchAll(/(?:href|src)="([^"#][^"]*)"/g)].map((m) => m[1]).concat([...html.matchAll(/url\("?([^")]+)"?\)/g)].map((m) => m[1]));
  for (const u of urls) {
    if (u.startsWith('data:') || u.startsWith('#')) continue;
    ok(!u.startsWith('/'), 'root-relative URL breaks in a subfolder: ' + u);
    ok(!/^https?:/.test(u), 'external resource will not work offline: ' + u);
    if (!/^https?:|^\//.test(u)) ok(fs.existsSync(path.join(site, u)), 'linked file is missing: ' + u);
  }
  const m = JSON.parse(read('manifest.webmanifest'));
  for (const k of ['name', 'short_name', 'start_url', 'scope', 'display', 'icons', 'background_color', 'theme_color']) ok(m[k], 'manifest has no ' + k);
  ok(m.start_url === './' && m.scope === './' && m.id === './', 'manifest start_url, scope and id must be ./ for a subfolder');
  ok(['standalone', 'fullscreen', 'minimal-ui'].includes(m.display), 'manifest display is not installable');
  const png = (f) => { const b = fs.readFileSync(path.join(site, f)); return b.toString('ascii', 1, 4) === 'PNG' ? [b.readUInt32BE(16), b.readUInt32BE(20)] : null; };
  for (const icon of m.icons) {
    ok(!icon.src.startsWith('/'), 'icon path is root-relative: ' + icon.src);
    const size = fs.existsSync(path.join(site, icon.src)) ? png(icon.src) : null;
    ok(size && size.join('x') === icon.sizes, 'icon ' + icon.src + ' is not a ' + icon.sizes + ' PNG');
  }
  ok(m.icons.some((i) => i.sizes === '192x192') && m.icons.some((i) => i.sizes === '512x512'), 'manifest needs 192 and 512 icons');
  ok(m.icons.some((i) => i.purpose === 'maskable'), 'manifest has no maskable icon');
  ok(png('icons/apple-touch-icon.png')?.join('x') === '180x180', 'apple-touch-icon is not 180x180');
  const sw = read('sw.js');
  ok(!sw.includes('@@'), 'sw.js still has template markers');
  const pre = JSON.parse(sw.match(/const PRECACHE = (\[.*\]);/)[1]);
  ok(pre[0] === './', 'service worker does not cache the start page');
  for (const f of pre.slice(1)) {
    ok(!f.startsWith('/'), 'precache path is root-relative: ' + f);
    ok(fs.existsSync(path.join(site, f)), 'precached file is missing: ' + f);
  }
  const all = [];
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => e.isDirectory() ? walk(path.join(d, e.name)) : all.push(path.relative(site, path.join(d, e.name)).split(path.sep).join('/')));
  walk(site);
  for (const f of all) if (!['index.html', 'sw.js', '.nojekyll'].includes(f)) ok(pre.includes(f), 'file not cached for offline: ' + f);
  for (const f of m.icons.map((i) => i.src).concat(['manifest.webmanifest', 'fonts/bricolage-grotesque-latin.woff2'])) ok(pre.includes(f), 'not precached: ' + f);
  console.log('  ' + all.length + ' files checked, ' + urls.length + ' URLs in index.html');
}

/* ---------- 3. contrast ---------- */
section('Contrast (WCAG AA)');
{
  const css = fs.readFileSync(path.join(root, 'src/style.css'), 'utf8');
  const block = (start) => { const i = css.indexOf(start); return css.slice(i, css.indexOf('}', i)); };
  const tokens = (text) => Object.fromEntries([...text.matchAll(/--([\w-]+):\s*(#[0-9A-Fa-f]{6})/g)].map((m) => [m[1], m[2]]));
  const light = tokens(block(':root {'));
  const dark = { ...light, ...tokens(block(':root[data-theme="dark"], html:root[data-frond="dark"] {')) };
  const lum = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const text = [['ink', 'paper'], ['ink', 'card'], ['ink2', 'paper'], ['ink2', 'card'], ['on-green', 'green'], ['on-pink', 'pink'], ['pink', 'sel'], ['paper', 'ink']];
  const ui = [['line', 'card'], ['line', 'paper'], ['soft', 'paper'], ['soft', 'card'], ['green', 'card'], ['green', 'paper'], ['pink', 'card']];
  let lowest = 99;
  for (const [mode, t] of [['light', light], ['dark', dark]]) {
    const check = (fg, bg, min, what) => { const r = ratio(t[fg], t[bg]); lowest = Math.min(lowest, r); ok(r >= min, mode + ' ' + what + ' ' + fg + ' on ' + bg + ' is ' + r.toFixed(2) + ', needs ' + min); };
    text.forEach(([a, b]) => check(a, b, 4.5, 'text'));
    ui.forEach(([a, b]) => check(a, b, 3, 'control'));
    for (let i = 1; i <= 6; i++) {
      for (const [fill, line] of [['n' + i, 'nl' + i], ['c' + i, 'cl' + i]]) {
        ok(t[fill] && t[line], mode + ' highlight token ' + fill + ' or ' + line + ' is missing');
        if (!t[fill] || !t[line]) continue;
        check('ink', fill, 4.5, 'grid letter');
        check(line, 'card', 3, 'highlight outline');
      }
    }
  }
  console.log('  lowest ratio ' + lowest.toFixed(2));
}

/* ---------- 4. privacy ---------- */
section('Privacy scan');
{
  // scan exactly what git would publish (tracked + untracked, minus .gitignore), plus the built site
  let files = [];
  try {
    files = require('child_process').execSync('git ls-files --cached --others --exclude-standard', { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .split('\n').filter(Boolean).map((f) => path.join(root, f));
  } catch (e) {
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((x) => {
      if (['.git', '.claude', 'node_modules', 'dist', 'site'].includes(x.name)) return;
      const p = path.join(d, x.name);
      if (x.isDirectory()) walk(p); else files.push(p);
    });
    walk(root);
  }
  const walkSite = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((x) => { const p = path.join(d, x.name); if (x.isDirectory()) walkSite(p); else files.push(p); });
  if (fs.existsSync(site)) walkSite(site);
  files = [...new Set(files)].filter((f) => fs.existsSync(f) && !/\.(woff2|png)$/.test(f));
  const self = path.join(root, 'tests', 'run.js');
  const rules = [
    [/[A-Za-z0-9._%+-]+@(?!example\.)[A-Za-z0-9.-]+\.[a-z]{2,}/, 'email address'],
    [/[A-Z]:(\\+|\/)Users(\\+|\/)|\/Users\/[a-z]|\/home\/[a-z]|OneDrive/i, 'personal file path'],
    [/gh[pousr]_[A-Za-z0-9]{20,}|github_pat_|sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-/, 'access token'],
    [/(api[_-]?key|secret|password|passwd|token)\s*[:=]\s*['"][^'"]{6,}/i, 'credential-looking value'],
    [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key'],
  ];
  for (const f of files) {
    if (f === self) continue;
    const body = fs.readFileSync(f, 'utf8');
    for (const [re, what] of rules) {
      const hit = body.match(re);
      ok(!hit, what + ' in ' + path.relative(root, f) + ': ' + (hit ? hit[0].slice(0, 40) : ''));
    }
  }
  console.log('  ' + files.length + ' text files scanned');
}

console.log('\n' + (checks - failures) + ' of ' + checks + ' checks passed' + (failures ? ', ' + failures + ' FAILED' : ''));
process.exit(failures ? 1 : 0);
