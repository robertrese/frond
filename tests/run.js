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
    'return { PACKS, LEVELS, LEVELS3, DAILY, PER_PACK, LAUNCH, GEN2_FROM, BLOCKED, DAILY_SCHEDULE, CONTENT4_FROM, dailyTheme, puzzle, versionOf, problems, packId, dailyId, iso, addDays, parse };';
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
  // ---- word packs: at least 20 packs of at least 30 valid words, each with a category and icon ----
  const RAW = sandbox.window.FROND_DATA;
  const iconKeys = new Set([...app.slice(app.indexOf('const ICONS'), app.indexOf('const icon =')).matchAll(/^\s+(\w+): '/gm)].map((m) => m[1]));
  ok(RAW.packs.length >= 20, 'only ' + RAW.packs.length + ' word packs, need at least 20');
  for (const raw of RAW.packs) {
    const pack = G.PACKS.find((x) => x.id === raw.id);
    ok(raw.words.length >= 30, raw.name + ' has ' + raw.words.length + ' words, needs at least 30');
    ok(RAW.categories.some((c) => c.id === raw.cat), raw.name + ' has an unknown category ' + raw.cat);
    ok(iconKeys.has(raw.icon), raw.name + ' has no icon called ' + raw.icon);
    ok(new Set(pack.words).size === pack.words.length, raw.name + ' repeats a word');
    raw.words.forEach((d, i) => {
      const g = pack.words[i];
      ok(/^[A-Z]{3,12}$/.test(g), raw.name + ': "' + d + '" becomes ' + g + ', which is not 3-12 letters A-Z');
      ok(d.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z]/g, '') === g, raw.name + ': grid spelling of "' + d + '" is wrong');
    });
    for (const [lv, cfg] of Object.entries(G.LEVELS3)) ok(pack.words.filter((wd) => wd.length <= cfg.n).length >= cfg.max * 1.5, raw.name + ': too few words fit the ' + lv + ' grid');
  }
  const legacyPrint = require('crypto').createHash('sha256').update(RAW.packs.filter((p) => p.legacy).map((p) => p.id + ':' + p.legacy).join('|')).digest('hex').slice(0, 16);
  ok(legacyPrint === '021965e73eef730f', 'a frozen legacy word list was edited (started puzzles and dailies before 6 Nov 2026 depend on them)');
  ok(RAW.packs.find((p) => p.id === 'farm').cat === 'places', 'Farmyard should be in Places');

  ok(G.BLOCKED.length >= 40 && G.BLOCKED.every((b) => /^[A-Z]{3,}$/.test(b)), 'blocked word list did not decode');
  let changed = 0, cleanV2 = 0, dirtyV1 = 0;
  const wordUse = {};
  const verify = (q, [min, max], label) => {
    // every puzzle a new player can reach (whatever its generator version) must be clean
    const bad = issues(q);
    ok(!bad.length, label + ' (v' + q.gv + ') has ' + bad.join(', '));
    q.words.forEach((w) => { wordUse[w.word] = (wordUse[w.word] || 0) + 1; });
    if (q.gv === 2) {
      cleanV2++;
      // a grid v1 already made cleanly must come out of v2 unchanged
      const old = G.puzzle(q.id, 1);
      const oldBad = issues(old);
      if (oldBad.length) dirtyV1++;
      else ok(JSON.stringify(old.rows) === JSON.stringify(q.rows), label + ': clean v1 grid changed in v2');
      if (JSON.stringify(old.rows) !== JSON.stringify(q.rows)) changed++;
    }
    ok(q.words.length >= min && q.words.length <= max, label + ' has ' + q.words.length + ' words, expected ' + (min === max ? min : min + '-' + max));
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
  const DAILY_DAYS = 10 * 365, SPARE_SEEDS = 25;
  const tally = {};
  const count = (k) => { tally[k] = (tally[k] || 0) + 1; };
  const t0 = Date.now();
  // difficulty rules (v3, library puzzles a player hasn't started): size, word count, directions, even mix
  const key = (d) => d[0] + ',' + d[1];
  const rules = {}, counts = {};
  for (const lv of Object.keys(G.LEVELS3)) { rules[lv] = { dirs: {}, spread: {}, counts: {} }; }
  const checkRules = (q, lv, label) => {
    const cfg = G.LEVELS3[lv], allowed = new Set(cfg.dirs.map(key)), r = rules[lv];
    ok(q.gv === 4, label + ' should be made by generator v4, got v' + q.gv);
    ok(q.n === cfg.n, label + ' is ' + q.n + 'x' + q.n + ', expected ' + cfg.n + 'x' + cfg.n);
    const per = Object.fromEntries(cfg.dirs.map((d) => [key(d), 0]));
    for (const w of q.words) {
      ok(allowed.has(key([w.dr, w.dc])), label + ': ' + w.word + ' runs in a direction ' + lv + ' does not allow (' + w.dr + ',' + w.dc + ')');
      // Easy and Medium: every word reads left to right, or top to bottom when it runs straight down
      if (lv !== 'hard') ok(w.dc > 0 || (w.dc === 0 && w.dr > 0), label + ': ' + w.word + ' reads backwards');
      per[key([w.dr, w.dc])]++;
      r.dirs[key([w.dr, w.dc])] = (r.dirs[key([w.dr, w.dc])] || 0) + 1;
    }
    const v = Object.values(per), spread = Math.max(...v) - Math.min(...v);
    r.spread[spread] = (r.spread[spread] || 0) + 1;
    r.counts[q.words.length] = (r.counts[q.words.length] || 0) + 1;
    ok(spread <= 2, label + ': directions are lopsided (' + JSON.stringify(per) + ')');
  };
  for (const p of G.PACKS) for (const lv of Object.keys(G.LEVELS3)) {
    const cfg = G.LEVELS3[lv];
    for (let i = 0; i < G.PER_PACK + SPARE_SEEDS; i++) {
      const id = G.packId(p.id, lv, i), label = p.id + ' ' + lv + ' ' + (i + 1);
      const q = G.puzzle(id);
      verify(q, [cfg.min, cfg.max], label);
      checkRules(q, lv, label);
      count(i < G.PER_PACK ? 'library ' + lv : 'spare ' + lv);
      // puzzles a player started under v2 or v3 keep that grid (made from the frozen legacy lists)
      if (i < G.PER_PACK && p.legacy) {
        verify(G.puzzle(id, 2), [G.LEVELS[lv].count, G.LEVELS[lv].count], label + ' (started under v2)'); count('v2 library');
        verify(G.puzzle(id, 3), [cfg.min, lv === 'hard' ? cfg.max : cfg.max], label + ' (started under v3)'); count('v3 library');
      }
    }
  }
  for (const [lv, r] of Object.entries(rules)) {
    const cfg = G.LEVELS3[lv], total = Object.values(r.dirs).reduce((a, b) => a + b, 0), even = 100 / cfg.dirs.length;
    for (const d of cfg.dirs) {
      const share = (r.dirs[key(d)] || 0) / total * 100;
      ok(Math.abs(share - even) <= 2.5, lv + ': direction ' + key(d) + ' gets ' + share.toFixed(1) + '% of words, expected about ' + even.toFixed(1) + '%');
    }
    for (let c = cfg.min; c <= cfg.max; c++) ok(r.counts[c] > 0, lv + ' never uses ' + c + ' words');
  }
  for (let k = 0; k < DAILY_DAYS; k++) {
    const d = G.iso(G.addDays(G.parse(G.LAUNCH), k)), q = G.puzzle(G.dailyId(d));
    verify(q, [9, 9], 'daily ' + d);
    const want = d < G.GEN2_FROM ? 1 : d < G.CONTENT4_FROM ? 2 : 4;
    ok(q.gv === want, 'daily ' + d + ' should use v' + want + ', got v' + q.gv);
    count('daily');
  }
  const again = new Function('window', code)(sandbox.window).puzzle('d:2026-11-02');
  ok(JSON.stringify(again.rows) === JSON.stringify(G.puzzle('d:2026-11-02').rows), 'the same day gives a different grid on a second run');
  // v1 must never change: puzzles already started, solved, or played as past dailies depend on it
  ok(G.puzzle('d:2026-11-02', 1).rows.join(' ') === 'LYCHEECA FAANMROI ANAIEECR LNLERGOE OALOMNNM ECLCRIUU MANGOGTL OOBMABOP', 'v1 daily for 2 Nov 2026 changed');
  ok(G.versionOf('d:2026-11-04') === 1 && G.puzzle('d:2026-11-04').gv === 1, 'today’s daily (4 Nov 2026) must stay on v1');
  ok(G.versionOf('d:' + G.GEN2_FROM) === 2, 'dailies from ' + G.GEN2_FROM + ' should use v2');
  ok(G.versionOf('p:herbs:easy:0') === 4 && G.versionOf('p:ghana:hard:0') === 4, 'new library puzzles should use v4');
  ok(G.versionOf('d:2026-11-04') === 1 && G.versionOf('d:2026-11-05') === 2 && G.versionOf('d:2026-11-06') === 4, 'dailies switch to the new word packs on 6 Nov 2026, not before');
  // v3 library grids are frozen for anyone who started one between the v3 and v4 releases
  ok(G.puzzle('p:ocean:hard:0', 3).rows.join('') === 'LEHFOSODOALSPBELTRUTOPSFMDIUQSEKTTMOIIRJUUETIEWLRNEREUKASBRTHSLLRLHRTBCMSAACOSLIAOOWWEHOITRYRHPLSIWHALRAFESSNLRJAELIIIEFLLACORCASTSTIWNIDOLPHINH', 'v3 library grid for ocean hard 1 changed');
  // v2 library grids are frozen for anyone who started one between 4 Nov and the v3 release
  ok(G.puzzle('p:baking:hard:2', 2).rows.join('') === 'WIGNICIAAADSCHOCESSHOIAKECIABATTACCRKHRSSCONECAOAAMUKYCEIANTCITEBETIWCEUDWETNASSIORCOEPLYSGEEFCBUTMWCTREPTRLGNUAASADLRUCHIRCRDTCTPSSYNCYRTSAPGTO', 'v2 library grid for baking hard 3 changed');
  ok(JSON.stringify(G.DAILY) === JSON.stringify({ n: 8, count: 9, dirs: [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0]] }), 'daily puzzle settings changed');
  const dec11 = G.puzzle('d:2026-12-11');
  ok(dec11.gv === 4 && !issues(dec11).length, 'the 11 Dec 2026 daily must be clean (it once contained a slur)');
  // the filter checks filler letters, never the answers: listed words that contain a blocked
  // string (GRAPE, COCKATOO, PASS...) must still be playable and still turn up in puzzles
  const allWords = [...new Set(G.PACKS.flatMap((p) => p.words))];
  const sensitive = allWords.filter((wd) => G.BLOCKED.some((b) => wd.includes(b) || [...wd].reverse().join('').includes(b)));
  for (const wd of sensitive) {
    const n = Math.max(wd.length, 3), g = Array.from({ length: n }, () => Array(n).fill('.'));
    [...wd].forEach((ch, k) => { g[0][k] = ch; });
    ok(!G.problems(g, [{ word: wd, r: 0, c: 0, dr: 0, dc: 1 }]), wd + ' is a listed word but the filter rejects it');
    ok(wordUse[wd] > 0, wd + ' never appears in any generated puzzle');
  }
  ok(allWords.every((wd) => wordUse[wd] > 0), 'some listed words never appear: ' + allWords.filter((wd) => !wordUse[wd]).join(' '));

  // the filter must see blocked strings in every direction and wherever filler meets an answer
  // '.' cells are empty, so only the letters shown can match
  const grid = (rows) => rows.map((r) => r.split(''));
  const oakLow = [{ word: 'OAK', r: 3, c: 0, dr: 0, dc: 1 }], oakHigh = [{ word: 'OAK', r: 0, c: 0, dr: 0, dc: 1 }];
  const pear = [{ word: 'PEAR', r: 0, c: 0, dr: 0, dc: 1 }], grape = [{ word: 'GRAPE', r: 0, c: 0, dr: 0, dc: 1 }];
  const cases = [
    ['clean grid', ['....', '....', '....', 'OAK.'], oakLow, false],
    ['filler spells it across', ['CRAP', '....', '....', 'OAK.'], oakLow, true],
    ['filler spells it backwards', ['PARC', '....', '....', 'OAK.'], oakLow, true],
    ['filler spells it down', ['...C', '...R', '...A', 'OAKP'], oakLow, true],
    ['filler spells it up', ['...P', '...A', '...R', 'OAKC'], oakLow, true],
    ['filler spells it diagonally down-right', ['C...', '.R..', '..A.', 'OAKP'], oakLow, true],
    ['filler spells it diagonally up-left', ['P...', '.A..', '..R.', 'OAKC'], oakLow, true],
    ['filler spells it diagonally up-right', ['OAKP', '..A.', '.R..', 'C...'], oakHigh, true],
    ['filler spells it diagonally down-left', ['OAKC', '..R.', '.A..', 'P...'], oakHigh, true],
    ['an answer letter joined to filler (P of PEAR + ISS below)', ['PEAR', 'I...', 'S...', 'S...'], pear, true],
    ['filler joined to the end of an answer (OAK + filler)', ['....', '....', '....', 'OAKS'].map((r, i) => (i === 3 ? 'ASS.' : r)), [{ word: 'AS', r: 3, c: 0, dr: 0, dc: 1 }], true],
    ['blocked string wholly inside an answer is allowed (GRAPE)', ['GRAPE', '.....', '.....', '.....', '.....'], grape, false],
    ['an answer appearing twice', ['OAK.', '....', '....', 'OAK.'], oakLow, true],
    ['an answer appearing twice, reversed', ['KAO.', '....', '....', 'OAK.'], oakLow, true],
  ];
  for (const [name, rows, placed, want] of cases) ok(G.problems(grid(rows), placed) === want, 'filter case "' + name + '" should be ' + (want ? 'rejected' : 'allowed'));
  // ---- daily schedule: a played daily never changes ----
  const crypto = require('crypto');
  const fingerprint = (q) => q.pack.id + ' v' + q.gv + ' ' + crypto.createHash('sha256').update(q.rows.join('')).digest('hex').slice(0, 16);
  const snapshot = JSON.parse(fs.readFileSync(path.join(root, 'tests/daily-snapshot.json'), 'utf8'));
  // "played" = every date up to today anywhere in the world (UTC+14 is the earliest time zone)
  const playedThrough = new Date(Date.now() + 14 * 3600e3).toISOString().slice(0, 10);
  let played = 0, futureChanged = 0;
  for (const [d, want] of Object.entries(snapshot)) {
    const got = fingerprint(G.puzzle(G.dailyId(d)));
    // every daily already played, and every daily before the new packs join on 6 Nov 2026, is fixed
    if (d <= playedThrough || d < G.CONTENT4_FROM) { played++; ok(got === want, 'daily ' + d + ' is fixed but changed: was ' + want + ', now ' + got); }
    else if (got !== want) futureChanged++;
  }
  ok(played >= 4, 'the daily snapshot should cover every daily before 6 Nov 2026');
  // the first 31 dailies of the new schedule: v4, rotating through the new list, clean and playable
  const firstNew = [];
  for (let k = 0; k < 31; k++) {
    const d = G.iso(G.addDays(G.parse('2026-11-06'), k)), q = G.puzzle(G.dailyId(d));
    const want = G.DAILY_SCHEDULE[1].themes[k % G.DAILY_SCHEDULE[1].themes.length];
    ok(q.gv === 4 && q.pack.id === want, 'daily ' + d + ' should be ' + want + ' on v4, got ' + q.pack.id + ' v' + q.gv);
    ok(q.words.length === 9 && !issues(q).length, 'daily ' + d + ' is not clean and playable');
    firstNew.push(d.slice(5) + ' ' + q.pack.id);
  }
  ok(G.puzzle('d:2026-11-05').pack.id === 'trees' && G.puzzle('d:2026-11-05').gv === 2, 'the 5 Nov daily must stay Woodland Trees on v2');
  const era2 = G.DAILY_SCHEDULE[1];
  ok(era2 && era2.from === '2026-11-06' && G.CONTENT4_FROM === '2026-11-06', 'the new daily schedule must start on 6 Nov 2026');
  ok(era2 && era2.themes.length === G.PACKS.length && new Set(era2.themes).size === G.PACKS.length, 'the new daily schedule must include every pack exactly once');
  ok(G.DAILY_SCHEDULE[0].from === G.LAUNCH, 'the first schedule era must start at launch');
  G.DAILY_SCHEDULE.forEach((era, i) => {
    ok(!i || era.from > G.DAILY_SCHEDULE[i - 1].from, 'schedule eras must be in date order');
    ok(era.themes.length > 0 && era.themes.every((id) => G.PACKS.some((p) => p.id === id)), 'schedule era ' + era.from + ' names a pack that does not exist');
  });
  // adding and reordering packs must not move any daily: rebuild with the packs reversed plus a new one
  const shuffled = {};
  new Function('window', fs.readFileSync(path.join(root, 'src/words.js'), 'utf8'))(shuffled);
  shuffled.FROND_DATA.packs.reverse().push({ id: 'zz-test', name: 'Test Pack', cat: 'places', icon: 'leaf', done: 'Done', words: ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india', 'juliet', 'kilo', 'lima'] });
  const G2 = new Function('window', code)(shuffled);
  let moved = 0;
  for (let k = 0; k < DAILY_DAYS; k++) {
    const d = G.iso(G.addDays(G.parse(G.LAUNCH), k));
    if (fingerprint(G2.puzzle(G2.dailyId(d))) !== fingerprint(G.puzzle(G.dailyId(d)))) moved++;
  }
  ok(moved === 0, moved + ' dailies changed when packs were reordered and one was added');
  // a new schedule era only affects dates from its start
  const G3 = new Function('window', code)(sandbox.window);
  G3.DAILY_SCHEDULE.push({ from: '2027-06-01', themes: ['desert', 'coast'] });
  let before = 0, after = 0;
  for (let k = 0; k < 2 * 365; k++) {
    const d = G.iso(G.addDays(G.parse(G.LAUNCH), k));
    const same = fingerprint(G3.puzzle(G3.dailyId(d))) === fingerprint(G.puzzle(G.dailyId(d)));
    if (d < '2027-06-01' && !same) before++;
    if (d >= '2027-06-01' && G3.puzzle(G3.dailyId(d)).pack.id !== (k % 2 === Math.round((G.parse('2027-06-01') - G.parse(G.LAUNCH)) / 864e5) % 2 ? 'desert' : 'coast')) after++;
  }
  ok(before === 0, before + ' dailies before a new schedule era changed');
  ok(after === 0, 'the new schedule era did not take effect from its start date');
  console.log('  new schedule from 6 Nov (31 dailies checked): ' + firstNew.join(', '));
  console.log('  daily schedule: ' + played + ' fixed dailies match the snapshot (everything before ' + G.CONTENT4_FROM + ', and played through ' + playedThrough + '); ' + futureChanged + ' future ones differ; reordering and adding packs moved ' + moved);

  const total = Object.values(tally).reduce((a, b) => a + b, 0);
  ok(total >= 1000, 'only ' + total + ' puzzles tested, the target is at least 1,000');
  const by = (lv) => (tally['library ' + lv] || 0) + (tally['spare ' + lv] || 0);
  console.log('  ' + total + ' puzzles generated and verified in ' + (Date.now() - t0) + ' ms');
  console.log('    easy 8x8: ' + by('easy') + ' · medium 10x10: ' + by('medium') + ' · hard 12x12: ' + by('hard') + ' · daily 8x8: ' + tally.daily + ' · frozen v2 and v3 library: ' + tally['v2 library'] + ' + ' + tally['v3 library']);
  console.log('    (' + G.PACKS.length * 3 * G.PER_PACK + ' are the puzzles players can open; the rest are spare seeds)');
  for (const [lv, r] of Object.entries(rules)) {
    const total = Object.values(r.dirs).reduce((a, b) => a + b, 0);
    console.log('  ' + lv + ' (v4 rules): words ' + Object.entries(r.counts).map(([c, n]) => c + '×' + n).join(' ') + ' | directions ' +
      Object.values(r.dirs).map((n) => (n / total * 100).toFixed(1) + '%').join(' ') + ' | spread per puzzle ' + JSON.stringify(r.spread));
  }
  console.log('  filler check (v2): ' + cleanV2 + ' puzzles clean; ' + dirtyV1 + ' had a problem in v1 and were fixed; ' + changed + ' grids differ from v1');
}

/* ---------- 1b. solve records: best time kept, older records carried over ---------- */
section('Solve records');
{
  const app = fs.readFileSync(path.join(root, 'src/app.js'), 'utf8');
  const body = app.slice(app.indexOf('/* ---------- solve records'), app.indexOf('/* ---------- feedback'));
  const mergeSolve = new Function(body + 'return mergeSolve;')();
  const run = (time, at, extra = {}) => ({ time, hints: 0, at, found: [{ w: 'NEW' }], gv: 4, ...extra });
  const first = mergeSolve(undefined, run(120, 1));
  ok(first.time === 120 && first.plays === 1 && first.last.time === 120, 'a first solve records its time as the best');
  const slower = mergeSolve(first, run(300, 2, { hints: 2 }));
  ok(slower.time === 120 && slower.at === 1 && slower.hints === 0, 'a slower replay overwrote the best time');
  ok(slower.plays === 2 && slower.last.time === 300 && slower.last.hints === 2, 'a slower replay should still be counted as the last play');
  const faster = mergeSolve(slower, run(90, 3));
  ok(faster.time === 90 && faster.at === 3 && faster.plays === 3, 'a faster replay should become the best time');
  const tie = mergeSolve(faster, run(90, 4));
  ok(tie.at === 3, 'an equal time should keep the date the best was first set');
  // shapes saved by earlier versions of the app
  const v1 = { time: 200, hints: 1, at: 5, found: [{ w: 'OLD', a: [0, 0], b: [0, 2] }] };
  const fromV1 = mergeSolve(v1, run(400, 6, { gv: 1 }));
  ok(fromV1.time === 200 && fromV1.hints === 1 && fromV1.at === 5, 'an older record lost its best time');
  ok(fromV1.plays === 2 && fromV1.found[0].w === 'OLD' && fromV1.gv === 1, 'an older record lost its grid or found words');
  const v2 = { time: 50, hints: 0, at: 7, found: [], gv: 2 };
  const fromV2 = mergeSolve(v2, run(30, 8, { gv: 2 }));
  ok(fromV2.time === 30 && fromV2.gv === 2 && fromV2.plays === 2, 'a v2 record did not take a faster replay');
  console.log('  best time kept, replays counted, and v1/v2 records carried over');
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
