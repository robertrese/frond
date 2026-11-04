(() => {
  'use strict';

  const DATA = window.FROND_DATA;
  const PACKS = DATA.packs.map((p) => ({ ...p, words: p.words.split(/\s+/) }));
  const PACK = Object.fromEntries(PACKS.map((p) => [p.id, p]));
  const LAUNCH = '2026-11-02';
  const PER_PACK = 5;
  const HINTS = 3;

  const FWD = [[0, 1], [1, 0], [1, 1]];
  const MED = [...FWD, [-1, 1], [0, -1], [-1, 0]];
  const ALL = [...MED, [1, -1], [-1, -1]];
  const LEVELS = {
    easy: { label: 'Easy', n: 8, count: 8, dirs: FWD },
    medium: { label: 'Medium', n: 10, count: 10, dirs: MED },
    hard: { label: 'Hard', n: 12, count: 12, dirs: ALL }
  };
  const DAILY = { n: 8, count: 9, dirs: MED };
  // Difficulty rules from generator v3 (library puzzles only). Words never read right to left
  // on Easy or Medium: Medium's diagonals both run left to right (down-right and up-right).
  const HARD_WORDS = [15, 15]; // 14, 15 and 16 were compared on 360px and 390px phones
  const LEVELS3 = {
    easy: { n: 8, min: 6, max: 8, dirs: [[0, 1], [1, 0]] },
    medium: { n: 10, min: 10, max: 12, dirs: [[0, 1], [1, 0], [1, 1], [-1, 1]] },
    hard: { n: 12, min: HARD_WORDS[0], max: HARD_WORDS[1], dirs: ALL }
  };

  /* ---------- storage ---------- */
  const KEY = 'frond.v1';
  const fresh = () => ({
    settings: { theme: 'system', sound: true, haptics: true, large: false, strong: false, cb: false, motion: false, left: false },
    diff: 'easy', cat: 'all', solved: {}, progress: {}, last: null
  });
  let S = fresh();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const got = JSON.parse(raw);
      S = { ...S, ...got, settings: { ...S.settings, ...(got.settings || {}) } };
    }
  } catch (e) { /* storage unavailable: play without saving */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } };

  /* ---------- dates ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, k) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + k);
  const today = () => iso(new Date());
  const dayIndex = (s) => Math.round((parse(s) - parse(LAUNCH)) / 864e5);
  const longDate = (s) => parse(s).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const clock = (sec) => { sec = Math.max(0, Math.round(sec)); return Math.floor(sec / 60) + ':' + pad(sec % 60); };
  const clockLong = (sec) => { const m = Math.floor(sec / 60), s = sec % 60; return (m ? m + (m === 1 ? ' minute ' : ' minutes ') : '') + s + (s === 1 ? ' second' : ' seconds'); };

  /* ---------- puzzle generation ---------- */
  const hash = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const shuffle = (arr, rnd) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  function tryPlace(grid, word, cfg, rnd, wantOverlap) {
    const n = cfg.n;
    for (let t = 0; t < 300; t++) {
      const [dr, dc] = cfg.dirs[Math.floor(rnd() * cfg.dirs.length)];
      const r = Math.floor(rnd() * n), c = Math.floor(rnd() * n);
      const r1 = r + dr * (word.length - 1), c1 = c + dc * (word.length - 1);
      if (r1 < 0 || r1 >= n || c1 < 0 || c1 >= n) continue;
      let ok = true, overlap = 0;
      for (let k = 0; k < word.length; k++) {
        const ch = grid[r + dr * k][c + dc * k];
        if (ch && ch !== word[k]) { ok = false; break; }
        if (ch) overlap++;
      }
      if (!ok || overlap === word.length) continue;
      if (wantOverlap && !overlap && t < 150) continue;
      for (let k = 0; k < word.length; k++) grid[r + dr * k][c + dc * k] = word[k];
      return { word, r, c, dr, dc };
    }
    return null;
  }

  // v3: place one word in a given direction, trying random starting cells
  function tryDir(grid, word, n, [dr, dc], rnd, wantOverlap) {
    for (let t = 0; t < 160; t++) {
      const r = Math.floor(rnd() * n), c = Math.floor(rnd() * n);
      const r1 = r + dr * (word.length - 1), c1 = c + dc * (word.length - 1);
      if (r1 < 0 || r1 >= n || c1 < 0 || c1 >= n) continue;
      let ok = true, overlap = 0;
      for (let k = 0; k < word.length; k++) {
        const ch = grid[r + dr * k][c + dc * k];
        if (ch && ch !== word[k]) { ok = false; break; }
        if (ch) overlap++;
      }
      if (!ok || overlap === word.length) continue;
      if (wantOverlap && !overlap && t < 80) continue;
      for (let k = 0; k < word.length; k++) grid[r + dr * k][c + dc * k] = word[k];
      return { word, r, c, dr, dc };
    }
    return null;
  }
  // v3: each word goes in the least-used direction that fits, and never in one already used twice
  // more than the least-used, so every puzzle's directions differ by at most 2. If nothing fits,
  // the attempt fails and the generator starts again from the next seed.
  function tryPlaceEven(grid, word, cfg, rnd, wantOverlap, used) {
    const least = Math.min(...used);
    const order = cfg.dirs.map((d, i) => ({ d, i, tie: rnd() })).filter((o) => used[o.i] <= least + 1)
      .sort((a, b) => used[a.i] - used[b.i] || a.tie - b.tie);
    for (const { d, i } of order) {
      const spot = tryDir(grid, word, cfg.n, d, rnd, wantOverlap);
      if (spot) { used[i]++; return spot; }
    }
    return null;
  }

  function generate(words, cfg, seed, gv = 1) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const rnd = rng(hash(seed + '#' + attempt));
      // v3 picks a word count within the level's range; earlier versions use a fixed count
      const count = gv >= 3 ? cfg.min + Math.floor(rnd() * (cfg.max - cfg.min + 1)) : cfg.count;
      const pool = shuffle(words.filter((w) => w.length >= 3 && w.length <= cfg.n), rnd);
      const chosen = [];
      for (const w of pool) {
        if (chosen.length === count) break;
        if (chosen.some((x) => x.includes(w) || w.includes(x) || x.includes([...w].reverse().join('')))) continue;
        chosen.push(w);
      }
      chosen.sort((a, b) => b.length - a.length);
      const grid = Array.from({ length: cfg.n }, () => Array(cfg.n).fill(''));
      const placed = [];
      const used = cfg.dirs.map(() => 0);
      for (const w of chosen) {
        const overlapWanted = placed.length > 0 && rnd() < 0.45;
        const spot = gv >= 3 ? tryPlaceEven(grid, w, cfg, rnd, overlapWanted, used) : tryPlace(grid, w, cfg, rnd, overlapWanted);
        if (!spot) break;
        placed.push(spot);
      }
      if (placed.length !== count) continue;
      const theme = placed.map((p) => p.word).join('');
      const common = 'EEEAAIIOONNRRSSTTLLDDUCGHMPBYKFW';
      const filler = [];
      for (let r = 0; r < cfg.n; r++) for (let c = 0; c < cfg.n; c++) if (!grid[r][c]) filler.push([r, c]);
      const fill = () => filler.forEach(([r, c]) => { grid[r][c] = rnd() < 0.55 ? theme[Math.floor(rnd() * theme.length)] : common[Math.floor(rnd() * common.length)]; });
      fill();
      // v2: redraw only the filler letters until the grid is clean. A grid that is already clean
      // comes out exactly as v1 made it, because the same random numbers were used up to here.
      if (gv >= 2) {
        let tries = 0;
        while (problems(grid, placed) && tries < 60) { fill(); tries++; }
        if (tries === 60) continue;
      }
      return { n: cfg.n, rows: grid.map((row) => row.join('')), words: placed.sort((a, b) => a.word.localeCompare(b.word)) };
    }
    throw new Error('Could not build a grid for ' + seed);
  }

  // Strings the filler letters must never spell in any of the 8 directions, ROT13-encoded so the
  // source doesn't display them. A match that lies wholly inside a listed word (GRAPE) is allowed.
  const BLOCKED = 'SHPX FUVG PHAG GJNG QVPX PBPX CVFF JNAX FYHG JUBER OVGPU AVTT AVTN SNT NEFR GVGF ENCR ANMV PENC CBEA NAHF OBBO PHZ FRK NFF OHZ CBB CRAVF PYVG CEVPX XABO GHEQ WVMM QLXR UBZB CNXV PBBA XVXR FCVP PUVAX TBBX FCNM ERGNEQ ONFGNEQ OBYYBPX ORYYRAQ GBFFRE FUNT UBR XXX'
    .replace(/[A-Z]/g, (ch) => String.fromCharCode(((ch.charCodeAt(0) - 52) % 26) + 65)).split(' ');
  const DIRS8 = [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0], [1, -1], [-1, -1]];
  // every place a string occurs in the grid, as cell lists ("r,c")
  function findAll(grid, str) {
    const n = grid.length, hits = [];
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      if (grid[r][c] !== str[0]) continue;
      for (const [dr, dc] of DIRS8) {
        const r1 = r + dr * (str.length - 1), c1 = c + dc * (str.length - 1);
        if (r1 < 0 || c1 < 0 || r1 >= n || c1 >= n) continue;
        let k = 1;
        while (k < str.length && grid[r + dr * k][c + dc * k] === str[k]) k++;
        if (k === str.length) hits.push(Array.from({ length: k }, (_, j) => (r + dr * j) + ',' + (c + dc * j)));
      }
    }
    return hits;
  }
  // a listed word found more than once, or a blocked string made by filler letters
  function problems(grid, placed) {
    const paths = placed.map((p) => new Set(Array.from({ length: p.word.length }, (_, k) => (p.r + p.dr * k) + ',' + (p.c + p.dc * k))));
    for (const p of placed) {
      const spots = new Set(findAll(grid, p.word).map((cells) => cells.slice().sort().join('|')));
      if (spots.size > 1) return true;
    }
    for (const bad of BLOCKED) {
      for (const cells of findAll(grid, bad)) if (!paths.some((ps) => cells.every((x) => ps.has(x)))) return true;
    }
    return false;
  }

  // Generator versions. Puzzles already started or solved keep the version they were made with,
  // and dailies before GEN2_FROM stay on v1, so no saved game or past daily changes under a player.
  // v3 (difficulty rules) is for library puzzles only: dailies stay on v2.
  const GEN2_FROM = '2026-11-05';
  function versionOf(id) {
    const rec = typeof S !== 'undefined' && (S.progress[id] || S.solved[id]);
    if (rec) return rec.gv || 1;
    if (id.startsWith('d:')) return id.slice(2) < GEN2_FROM ? 1 : 2;
    return 3;
  }

  const cache = {};
  function puzzle(id, gv = versionOf(id)) {
    const key = id + '@' + gv;
    if (cache[key]) return cache[key];
    const parts = id.split(':');
    let out;
    if (parts[0] === 'd') {
      const k = dayIndex(parts[1]);
      const pack = PACKS[((k % PACKS.length) + PACKS.length) % PACKS.length];
      out = { ...build(pack.words, DAILY, 'daily:' + parts[1], gv), id, kind: 'daily', date: parts[1], pack, title: pack.name, number: k + 1 };
    } else {
      const pack = PACK[parts[1]], level = parts[2], idx = Number(parts[3]);
      out = { ...build(pack.words, gv >= 3 ? LEVELS3[level] : LEVELS[level], id, gv), id, kind: 'pack', pack, level, idx, title: pack.name };
    }
    out.gv = gv;
    cache[key] = out;
    return out;
  }
  // v2 never gives up: if the main seed can't make a clean grid, try numbered backup seeds
  function build(words, cfg, seed, gv) {
    if (gv < 2) return generate(words, cfg, seed, gv);
    for (let b = 0; b < 25; b++) {
      try { return generate(words, cfg, b ? seed + '~' + b : seed, gv); } catch (e) { /* next backup seed */ }
    }
    throw new Error('Could not build a grid for ' + seed);
  }
  const dailyId = (d) => 'd:' + d;
  const packId = (pack, level, idx) => 'p:' + pack + ':' + level + ':' + idx;
  const packDone = (pack, level) => Array.from({ length: PER_PACK }, (_, i) => S.solved[packId(pack, level, i)] ? 1 : 0).reduce((a, b) => a + b, 0);
  const nextInPack = (pack, level) => { for (let i = 0; i < PER_PACK; i++) if (!S.solved[packId(pack, level, i)]) return i; return -1; };

  /* ---------- streaks ---------- */
  const solvedOn = (d) => !!S.solved[dailyId(d)];
  function streaks() {
    const t = today();
    let cur = 0, d = parse(t);
    if (!solvedOn(t)) d = addDays(d, -1);
    while (solvedOn(iso(d))) { cur++; d = addDays(d, -1); }
    const days = Object.keys(S.solved).filter((k) => k.startsWith('d:')).map((k) => k.slice(2)).sort();
    let best = 0, run = 0, prev = null;
    for (const day of days) {
      run = prev && iso(addDays(parse(prev), 1)) === day ? run + 1 : 1;
      best = Math.max(best, run); prev = day;
    }
    return { cur, best: Math.max(best, cur) };
  }

  /* ---------- feedback: sound + haptics ---------- */
  let ac = null;
  function tone(freqs, dur = 0.09, gap = 0.07, vol = 0.05) {
    if (!S.settings.sound) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      const t0 = ac.currentTime;
      freqs.forEach((f, i) => {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = 'triangle'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0 + i * gap);
        g.gain.exponentialRampToValueAtTime(vol, t0 + i * gap + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * gap + dur);
        o.connect(g).connect(ac.destination);
        o.start(t0 + i * gap); o.stop(t0 + i * gap + dur + 0.02);
      });
    } catch (e) { /* no audio */ }
  }
  const buzz = (ms) => { if (S.settings.haptics) try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { /* ignore */ } };

  /* ---------- small helpers ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const title = (w) => w.charAt(0) + w.slice(1).toLowerCase();
  const TICK = '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M2.4 7.4l2.8 2.8 6.2-6.8"/></svg>';
  const tick = (on) => '<span class="tick' + (on ? ' on' : '') + '" aria-hidden="true">' + TICK + '</span>';
  const ICONS = {
    home: 'M3.5 11 12 4l8.5 7v9h-5.5v-6h-6v6H3.5z',
    library: 'M4 4.5h6v15H4zM14 4.5h6v15h-6z',
    stats: 'M4 20V11h4v9zM10 20V5h4v15zM16 20v-6h4v6z',
    settings: 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1',
    leaf: 'M5 19c0-8 5-14 14-14 0 9-6 14-14 14zM5 19l8-8',
    herb: 'M12 21V9M12 13c-3 0-5-2-5-5 3 0 5 2 5 5zM12 10c0-3 2-5 5-5 0 3-2 5-5 5z',
    flower: 'M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM12 9.5C10 6 10 3.5 12 3c2 .5 2 3 0 6.5M14.5 12c3.5-2 6-2 6.5 0-.5 2-3 2-6.5 0M12 14.5c2 3.5 2 6-0 6.5-2-.5-2-3 0-6.5M9.5 12C6 14 3.5 14 3 12c.5-2 3-2 6.5 0',
    tree: 'M12 22v-6M12 2.5l6.5 9h-4l4.5 5H5l4.5-5h-4z',
    bird: 'M3 15c4 0 6-3 8-6s5-4.5 10-3.5c-2.5 1-3.5 3-3.5 5.5 0 5-4.5 8.5-11.5 8.5l3-3c-2.5 0-4.5-.5-6-1.5zM16.5 7.5h.01',
    fish: 'M2.5 12c3-4 8-6 13-4l5.5-3v14L15.5 16c-5 2-10 0-13-4zM14.5 11h.01',
    bug: 'M12 7.5a3.5 3.5 0 0 1 3.5 3.5v4.5a3.5 3.5 0 0 1-7 0V11A3.5 3.5 0 0 1 12 7.5zM12 7.5V4M8.5 11.5H5M15.5 11.5H19M8.5 15.5H5M15.5 15.5H19M10 4l-1-1.5M14 4l1-1.5',
    apple: 'M12 7.5c-2-2-7.5-1.5-7.5 4S7.5 21 10 21c1 0 1.4-.5 2-.5s1 .5 2 .5c2.5 0 5.5-4 5.5-9.5s-5.5-6-7.5-4zM12 7.5c0-2 1-4 3-4.5',
    jar: 'M8 3h8v3.5H8zM6.5 6.5h11V21h-11zM6.5 11.5h11',
    bread: 'M5 20.5V11a4 4 0 0 1 0-8h14a4 4 0 0 1 0 8v9.5z',
    wave: 'M2 10c3-3 5-3 8 0s5 3 8 0c1.5-1.5 2.5-2 4-2M2 16c3-3 5-3 8 0s5 3 8 0c1.5-1.5 2.5-2 4-2',
    peak: 'M2 20.5 9 8l4 6 3-4 6 10.5z',
    cactus: 'M10 21V5a2 2 0 0 1 4 0v16M10 13H8a2 2 0 0 1-2-2V8M14 11h2a2 2 0 0 0 2-2V7M6.5 21h11'
  };
  const icon = (k) => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + ICONS[k] + '"/></svg>';
  const stampIcon = (k) => '<span class="stamp" aria-hidden="true">' + icon(k) + '</span>';
  const LEAVES = {
    corner: '<g class="lg"><use href="#lf-monstera" transform="translate(132 14) rotate(212) scale(0.46) translate(-100 -100)"/><use href="#lf-blade" transform="translate(150 70) rotate(-120) scale(0.3 0.42) translate(-30 -200)"/></g><g class="lp"><use href="#lf-monstera" transform="translate(137 18) rotate(212) scale(0.46) translate(-100 -100)"/></g>',
    sprig: '<g class="lg"><use href="#lf-blade" transform="translate(152 40) rotate(-96) scale(0.34 0.48) translate(-30 -200)"/><use href="#lf-blade" transform="translate(152 40) rotate(-126) scale(0.28 0.42) translate(-30 -200)"/></g><g class="lp"><use href="#lf-heart" transform="translate(96 -10) rotate(-170) scale(0.36)"/></g>',
    heart: '<g class="lg"><use href="#lf-heart" transform="translate(150 -6) rotate(150) scale(0.52)"/></g><g class="lp"><use href="#lf-blade" transform="translate(152 74) rotate(-110) scale(0.3 0.44) translate(-30 -200)"/></g>'
  };
  const leafArt = (k, w = 150, h = 96) => '<svg class="leafart" width="' + w + '" height="' + h + '" viewBox="0 0 150 96" aria-hidden="true" focusable="false"><g class="ink">' + LEAVES[k] + '</g></svg>';
  const leafStrip = () => '<div class="leafstrip" aria-hidden="true">' +
    '<svg class="leafart" width="170" height="90" viewBox="0 0 170 90" focusable="false"><g class="ink"><g class="lg"><use href="#lf-monstera" transform="translate(30 96) rotate(36) scale(0.48) translate(-100 -100)"/><use href="#lf-blade" transform="translate(118 112) rotate(24) scale(0.3 0.42) translate(-30 -200)"/></g><g class="lp"><use href="#lf-monstera" transform="translate(36 100) rotate(36) scale(0.48) translate(-100 -100)"/></g></g></svg>' +
    '<svg class="leafart" width="130" height="90" viewBox="0 0 130 90" focusable="false"><g class="ink"><g class="lg"><use href="#lf-blade" transform="translate(136 100) rotate(-34) scale(0.34 0.5) translate(-30 -200)"/><use href="#lf-blade" transform="translate(136 100) rotate(-64) scale(0.28 0.42) translate(-30 -200)"/></g></g></svg></div>';

  let toastTimer = 0;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  /* ---------- settings applied to the page ---------- */
  function applySettings() {
    const root = document.documentElement, s = S.settings;
    if (s.theme === 'system') delete root.dataset.frond; else root.dataset.frond = s.theme;
    root.classList.toggle('cb', s.cb);
    root.classList.toggle('strong', s.strong);
    root.classList.toggle('large', s.large);
    root.classList.toggle('calm', s.motion);
    root.classList.toggle('lefty', s.left);
    // the installed app's status bar follows the chosen theme
    const bar = getComputedStyle(document.body).backgroundColor;
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => { m.content = bar; });
  }
  const calm = () => S.settings.motion || matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- routing ---------- */
  const TABS = [['home', 'Home'], ['library', 'Library'], ['stats', 'Stats'], ['settings', 'Settings']];
  let route = { name: 'home' };
  function go(name, arg) {
    leavePuzzle();
    route = { name, arg };
    S.view = route; save();
    render();
    window.scrollTo(0, 0);
    const h = $('#screen h1');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  }
  function renderChrome() {
    const active = route.name === 'puzzle' || route.name === 'done' ? 'library' : route.name;
    const inPlay = route.name === 'puzzle' || route.name === 'done';
    $('#tabbar').hidden = inPlay;
    $('#tabbar').innerHTML = TABS.map(([k, label]) =>
      '<button class="tab" type="button" data-go="' + k + '"' + (k === active && !inPlay ? ' aria-current="page"' : '') + '>' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + ICONS[k] + '"/></svg><span>' + label + '</span></button>').join('');
    $('#topnav').innerHTML = '<div class="topnav-inner"><button type="button" class="brand" data-go="home" aria-label="Frond, home">' + brandMark() + '<b>Frond</b></button>' +
      '<nav aria-label="Main">' + TABS.map(([k, label]) => '<button type="button" data-go="' + k + '"' + (k === active ? ' aria-current="page"' : '') + '>' + label + '</button>').join('') + '</nav></div>';
  }
  const brandMark = () => '<svg width="24" height="28" viewBox="0 0 26 30" aria-hidden="true"><path d="M13 29 C 3 21, 2 9, 13 1 C 24 9, 23 21, 13 29 Z" fill="var(--green)"/><path d="M13 27 V 5 M13 12 L 8 8 M13 17 L 18 13 M13 22 L 8 18" stroke="var(--paper)" stroke-width="2" fill="none" stroke-linecap="round"/></svg>';

  function render() {
    renderChrome();
    const host = $('#screen');
    const view = { home: viewHome, library: viewLibrary, puzzle: viewPuzzle, done: viewDone, stats: viewStats, settings: viewSettings }[route.name];
    try {
      host.innerHTML = view();
      if (route.name === 'puzzle') mountPuzzle();
      document.title = route.name === 'puzzle' ? 'Frond · ' + puzzle(route.arg).title : 'Frond';
    } catch (err) {
      // never leave a half-built screen: say so and offer a way out
      P = null; S.view = { name: 'home' }; save();
      host.innerHTML = '<div class="screen no-tabs"><div class="head"><h1>This puzzle couldn’t be set up</h1></div>' +
        '<p class="fine">Nothing you’ve saved was lost. Try another puzzle from the library.</p>' +
        '<button class="btn primary wide" type="button" data-go="library">Open the library</button>' +
        '<button class="btn wide" type="button" data-go="home">Go home</button></div>';
      $('#tabbar').hidden = false;
    }
  }

  /* ---------- Home ---------- */
  function viewHome() {
    const t = today(), id = dailyId(t), p = puzzle(id);
    const solved = S.solved[id], prog = S.progress[id];
    const { cur, best } = streaks();
    const onPath = new Set();
    p.words.forEach((w) => { for (let k = 0; k < w.word.length; k++) onPath.add((w.r + w.dr * k) + ',' + (w.c + w.dc * k)); });
    let thumb = '';
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) thumb += '<span' + (onPath.has(r + ',' + c) && r === c ? ' class="on"' : '') + '>' + p.rows[r][c] + '</span>';
    const action = solved
      ? '<p class="solved-line">' + tick(true) + 'Solved in ' + clock(solved.time) + (solved.hints ? ' · ' + solved.hints + (solved.hints === 1 ? ' hint' : ' hints') : ' · no hints') + '</p>' +
        '<button class="btn wide" type="button" data-play="' + id + '">See today’s grid again</button>'
      : '<button class="btn primary wide" type="button" data-play="' + id + '">' + (prog && prog.found.length ? 'Continue · ' + prog.found.length + ' of ' + p.words.length + ' found' : 'Play today’s puzzle') + '</button>';
    const week = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(parse(t), i - 6), ds = iso(d), on = solvedOn(ds);
      const label = d.toLocaleDateString('en-GB', { weekday: 'short' });
      return '<li class="day' + (i === 6 ? ' today' : '') + '" aria-label="' + d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) + (on ? ', solved' : i === 6 ? ', not solved yet' : ', missed') + '">' + tick(on) + '<span aria-hidden="true">' + label + '</span></li>';
    }).join('');
    const going = Object.entries(S.progress)
      .filter(([, v]) => v.found.length || v.elapsed >= 3)
      .sort((a, b) => b[1].at - a[1].at);
    const cont = going.length
      ? '<ul class="cont">' + going.map(([k, v]) => {
          const q = puzzle(k);
          const sub = q.kind === 'daily'
            ? (q.date === t ? 'Today’s puzzle' : 'Daily · ' + parse(q.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }))
            : LEVELS[q.level].label + ' · puzzle ' + (q.idx + 1) + ' of ' + PER_PACK;
          return '<li><button class="contcard" type="button" data-play="' + k + '">' + stampIcon(q.pack.icon) +
            '<span class="info"><b>' + esc(q.title) + '</b><span>' + sub + ' · ' + clock(v.elapsed) + '</span>' +
            '<span class="controw"><span class="pbar" aria-hidden="true"><i style="width:' + (v.found.length / q.words.length * 100) + '%"></i></span><span class="found">' + v.found.length + ' of ' + q.words.length + ' found</span></span></span>' +
            '<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button></li>';
        }).join('') + '</ul>'
      : '<p class="empty-note">Nothing in progress. Any puzzle you start, including today’s, waits here until you finish it.</p>';
    return '<div class="screen">' +
      '<div class="head"><div><div class="brand">' + brandMark() + '<b>Frond</b></div><p class="eyebrow" style="margin-top:8px">' + longDate(t) + '</p></div>' + leafArt('corner') + '</div>' +
      '<div class="home-grid" style="display:grid;gap:22px">' +
        '<section class="card lift daily" aria-labelledby="h-daily"><div class="daily-top"><div><p class="eyebrow">Today’s puzzle · No. ' + p.number + '</p><h1 id="h-daily">' + esc(p.title) + '</h1><p class="meta">8 × 8 · ' + p.words.length + ' words · a new grid every day</p></div><div class="thumb" aria-hidden="true">' + thumb + '</div></div>' + action + '</section>' +
        '<section class="card streak" aria-labelledby="h-streak"><div class="streak-top"><div><p class="eyebrow" id="h-streak">Daily streak</p><b>' + cur + '</b> <span style="font-weight:700">' + (cur === 1 ? 'day' : 'days') + '</span></div><p class="eyebrow">Best ' + best + '</p></div>' +
          '<ol class="week" aria-label="Last seven days">' + week + '</ol>' +
          (cur === 0 ? '<p class="fine">Solve today’s puzzle to start a streak.</p>' : '') + '</section>' +
      '</div>' +
      '<section aria-labelledby="h-cont"><div class="section-title"><h2 id="h-cont">Continue playing</h2></div>' + cont + '</section>' +
    '</div>';
  }

  /* ---------- Library ---------- */
  function viewLibrary() {
    const cats = [{ id: 'all', name: 'All' }, ...DATA.categories];
    const list = PACKS.filter((p) => S.cat === 'all' || p.cat === S.cat);
    return '<div class="screen">' +
      '<div class="head"><div><h1>Library</h1><p class="eyebrow" style="margin-top:6px">' + PACKS.length + ' themes · ' + PER_PACK + ' puzzles each</p></div>' + leafArt('sprig') + '</div>' +
      '<section aria-label="Category"><div class="chips">' + cats.map((c) => '<button type="button" class="chip" data-cat="' + c.id + '" aria-pressed="' + (S.cat === c.id) + '">' + TICK.replace('aria-hidden="true"', 'aria-hidden="true" width="14" height="14"') + c.name + '</button>').join('') + '</div></section>' +
      '<section aria-labelledby="h-diff" style="display:grid;gap:8px"><h2 id="h-diff" class="eyebrow">Difficulty</h2><div class="seg" role="radiogroup" aria-labelledby="h-diff">' +
        Object.entries(LEVELS).map(([k, v]) => '<button type="button" role="radio" data-diff="' + k + '" aria-checked="' + (S.diff === k) + '" tabindex="' + (S.diff === k ? 0 : -1) + '">' + v.label + '<small>' + v.n + '×' + v.n + '</small></button>').join('') +
      '</div></section>' +
      '<section aria-label="Themes"><ul class="packs">' + list.map((p) => {
        const done = packDone(p.id, S.diff), complete = done === PER_PACK;
        return '<li style="display:grid"><button type="button" class="pack" data-pack="' + p.id + '" aria-label="' + esc(p.name) + ', ' + done + ' of ' + PER_PACK + ' solved' + (complete ? ', complete' : '') + '">' +
          stampIcon(p.icon) + '<b>' + esc(p.name) + '</b>' +
          '<span class="pbar" aria-hidden="true"><i style="width:' + (done / PER_PACK * 100) + '%"></i></span>' +
          '<span class="row" aria-hidden="true">' + (complete ? '<span class="done">' + tick(true) + 'Complete</span>' : '<span>' + done + ' / ' + PER_PACK + '</span>') + '</span>' +
        '</button></li>';
      }).join('') + '</ul></section>' +
    '</div>';
  }

  /* ---------- Puzzle ---------- */
  let P = null; // live puzzle state
  function progressFor(id) {
    return S.progress[id] || { found: [], elapsed: 0, hints: 0, hintCells: [], at: Date.now(), gv: versionOf(id) };
  }
  function capsule(n, r0, c0, r1, c1, thick) {
    const x0 = (c0 + 0.5) / n, y0 = (r0 + 0.5) / n, x1 = (c1 + 0.5) / n, y1 = (r1 + 0.5) / n;
    const len = Math.hypot(x1 - x0, y1 - y0) + 0.84 / n, h = thick / n;
    const ang = Math.atan2(y1 - y0, x1 - x0) * 180 / Math.PI;
    return 'left:' + (((x0 + x1) / 2 - len / 2) * 100).toFixed(3) + '%;top:' + (((y0 + y1) / 2 - h / 2) * 100).toFixed(3) + '%;width:' + (len * 100).toFixed(3) + '%;height:' + (h * 100).toFixed(3) + '%;--rot:rotate(' + ang.toFixed(2) + 'deg);transform:var(--rot)';
  }
  function boardHTML(p, found, opts = {}) {
    const n = p.n, onCells = new Set();
    found.forEach((f) => pathCells(f.a, f.b).forEach(([r, c]) => onCells.add(r + ',' + c)));
    let cells = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) cells += '<span data-r="' + r + '" data-c="' + c + '"' + (onCells.has(r + ',' + c) ? ' class="f"' : '') + '>' + p.rows[r][c] + '</span>';
    const hls = found.map((f, i) => '<span class="hl k' + (f.k ?? i % COLOURS) + '" style="' + capsule(n, f.a[0], f.a[1], f.b[0], f.b[1], 0.72) + '"></span>').join('');
    return '<div class="boardcard"><div class="board"' + (opts.interactive ? ' id="board" tabindex="0" role="application" aria-roledescription="word grid" aria-describedby="pz-help"' : '') + ' aria-label="' + (opts.label || 'Letter grid') + '" style="--n:' + n + '">' +
      '<div class="hls" aria-hidden="true">' + hls + (opts.interactive ? '<span class="hl sel" id="selhl" hidden></span>' : '') + '</div>' +
      '<div class="cells" aria-hidden="true">' + cells + '</div>' +
      (opts.interactive ? '<div class="pause-cover" id="pausecover" hidden><b>Paused</b><p class="fine">The grid is hidden while the clock is stopped.</p><button class="btn primary" type="button" data-act="resume">Resume</button></div>' : '') +
    '</div></div>';
  }
  // a new highlight never matches the colour of one it crosses or the one found just before
  const COLOURS = 6;
  function pickColour(found, cells) {
    const here = new Set(cells.map(([r, c]) => r + ',' + c));
    const avoid = new Set();
    found.forEach((f, i) => {
      const k = f.k ?? i % COLOURS;
      if (i === found.length - 1 || pathCells(f.a, f.b).some(([r, c]) => here.has(r + ',' + c))) avoid.add(k);
    });
    for (let j = 0; j < COLOURS; j++) { const k = (found.length + j) % COLOURS; if (!avoid.has(k)) return k; }
    return found.length % COLOURS;
  }
  function pathCells(a, b) {
    const dr = Math.sign(b[0] - a[0]), dc = Math.sign(b[1] - a[1]);
    const len = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
    return Array.from({ length: len + 1 }, (_, k) => [a[0] + dr * k, a[1] + dc * k]);
  }
  function wordListHTML(p, prog, fresh) {
    const done = new Set(prog.found.map((f) => f.w));
    return p.words.map((w) => '<li class="' + (done.has(w.word) ? 'done' : '') + (fresh === w.word ? ' new' : '') + '"><span class="sr">' + title(w.word) + (done.has(w.word) ? ', found' : ', not found yet') + '</span>' + tick(done.has(w.word)) + '<span aria-hidden="true">' + w.word + '</span></li>').join('');
  }

  function viewPuzzle() {
    const p = puzzle(route.arg), prog = progressFor(route.arg);
    const sub = p.kind === 'daily' ? 'Daily puzzle · ' + longDate(p.date) : LEVELS[p.level].label + ' · puzzle ' + (p.idx + 1) + ' of ' + PER_PACK;
    return '<div class="screen wide no-tabs"><div class="pz">' +
      '<div class="pz-bar"><button class="btn ghost" type="button" data-go="' + (p.kind === 'daily' ? 'home' : 'library') + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>' + (p.kind === 'daily' ? 'Home' : 'Library') + '</button>' +
        '<div class="timer" role="timer" id="timer" aria-label="Time"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2h6"/></svg><span id="clock">' + clock(prog.elapsed) + '</span></div></div>' +
      '<div class="pz-head"><p class="eyebrow">' + sub + '</p><h1>' + esc(p.title) + '</h1><div class="progress"><span class="mono" id="count" style="font-weight:500">' + prog.found.length + ' / ' + p.words.length + ' found</span><span class="blocks" id="blocks" aria-hidden="true">' + p.words.map((_, i) => '<i class="' + (i < prog.found.length ? 'on' : '') + '"></i>').join('') + '</span></div></div>' +
      '<div class="pz-sel" aria-live="polite" id="selbox"><span class="eyebrow">Drag across a word</span></div>' +
      '<div class="pz-board">' + boardHTML(p, prog.found, { interactive: true, label: 'Letter grid, ' + p.n + ' by ' + p.n }) + '</div>' +
      '<section class="pz-words" aria-labelledby="h-words"><div class="section-title"><h2 id="h-words">Find these</h2><span class="eyebrow" id="left">' + (p.words.length - prog.found.length) + ' left</span></div><ul class="words" id="words">' + wordListHTML(p, prog) + '</ul></section>' +
      '<div class="pz-tools" role="toolbar" aria-label="Puzzle controls" id="tools">' + toolsHTML(prog) + '</div>' +
      '<p class="pz-help" id="pz-help">Drag across letters, or tap the first letter and then the last. Words run ' + directionsText(p) + '. With a keyboard, move with the arrow keys and press Enter on the first and last letter.</p>' +
      leafStrip() +
    '</div></div>';
  }
  // how words can run, in the player's words (matches each generator version's rules)
  function directionsText(p) {
    if (p.kind === 'pack' && p.gv >= 3) return { easy: 'across and down only', medium: 'across, down and diagonally, always reading left to right', hard: 'in all 8 directions, including backwards' }[p.level];
    return 'across, down, diagonally' + (p.kind === 'daily' || p.level !== 'easy' ? ' and backwards' : '');
  }
  function toolsHTML(prog) {
    const left = HINTS - prog.hints;
    return '<button class="btn" type="button" data-act="restart"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5"/><path d="M4.5 4.5v4.5H9"/></svg>Restart</button>' +
      '<button class="btn" type="button" data-act="pause" aria-pressed="false"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></svg>Pause <kbd>P</kbd></button>' +
      '<button class="btn primary" type="button" data-act="hint"' + (left ? '' : ' disabled') + ' aria-label="Hint, ' + left + ' left"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21v-8"/><path d="M12 13c0-4 3-6.5 7.5-6.5 0 4-3 6.5-7.5 6.5z"/><path d="M12 15.5c0-3-2.4-5.5-6.5-5.5 0 3 2.4 5.5 6.5 5.5z"/></svg>Hint <span class="mono" style="font-size:14px">×' + left + '</span> <kbd>H</kbd></button>';
  }

  function mountPuzzle() {
    const id = route.arg, p = puzzle(id);
    const prog = progressFor(id);
    S.progress[id] = prog; prog.at = Date.now();
    P = { id, p, prog, paused: false, drag: null, anchor: null, cursor: null, kb: false, tick: 0 };
    const board = $('#board');
    paintHints();

    const cellAt = (e, clamp) => {
      const rect = board.getBoundingClientRect();
      let c = Math.floor((e.clientX - rect.left) / rect.width * p.n), r = Math.floor((e.clientY - rect.top) / rect.height * p.n);
      if (!clamp && (r < 0 || c < 0 || r >= p.n || c >= p.n)) return null;
      return [Math.min(p.n - 1, Math.max(0, r)), Math.min(p.n - 1, Math.max(0, c))];
    };
    board.addEventListener('pointerdown', (e) => {
      if (!P || P.paused) return;
      const cell = cellAt(e);
      if (!cell) return;
      e.preventDefault();
      try { board.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
      P.kb = false; setCursor(null);
      P.drag = { start: P.anchor || cell, end: cell, moved: false, fromAnchor: !!P.anchor, down: cell };
      if (!P.anchor) { P.drag.start = cell; showSel(cell, cell); buzz(6); tone([520], 0.05, 0, 0.025); }
      else showSel(P.anchor, snap(P.anchor, cell));
    });
    board.addEventListener('pointermove', (e) => {
      if (!P || !P.drag) return;
      const cell = cellAt(e, true);
      const end = snap(P.drag.start, cell);
      if (end[0] !== P.drag.end[0] || end[1] !== P.drag.end[1]) {
        P.drag.end = end;
        if (cell[0] !== P.drag.down[0] || cell[1] !== P.drag.down[1]) P.drag.moved = true;
        showSel(P.drag.start, end); buzz(4); tone([560 + 30 * pathCells(P.drag.start, end).length], 0.04, 0, 0.02);
      }
    });
    const up = (e) => {
      if (!P) return;
      const d = P.drag; P.drag = null;
      if (!d) return;
      const last = cellAt(e, true);
      if (last[0] !== d.down[0] || last[1] !== d.down[1]) { d.moved = true; d.end = snap(d.start, last); }
      if (d.fromAnchor) { P.anchor = null; finish(d.start, snap(d.start, d.down)); return; }
      if (d.moved && (d.end[0] !== d.start[0] || d.end[1] !== d.start[1])) { finish(d.start, d.end); return; }
      P.anchor = d.start; showSel(d.start, d.start);
      selText('Now tap the last letter');
    };
    board.addEventListener('pointerup', up);
    board.addEventListener('pointercancel', () => { if (P) P.drag = null; clearSel(); });
    board.addEventListener('keydown', onBoardKey);
    board.addEventListener('focus', () => { if (P && !P.cursor) P.cursor = [0, 0]; });
    board.addEventListener('blur', () => { if (P) setCursor(null, true); });
    startClock();
  }
  function snap(a, b) {
    const dr = b[0] - a[0], dc = b[1] - a[1];
    if (!dr && !dc) return a;
    const oct = Math.round(Math.atan2(dr, dc) / (Math.PI / 4));
    const sr = Math.round(Math.sin(oct * Math.PI / 4)), sc = Math.round(Math.cos(oct * Math.PI / 4));
    let k = sr && sc ? Math.round((Math.abs(dr) + Math.abs(dc)) / 2) : Math.max(Math.abs(dr), Math.abs(dc));
    const n = P.p.n;
    while (k > 0) {
      const r = a[0] + sr * k, c = a[1] + sc * k;
      if (r >= 0 && c >= 0 && r < n && c < n) break;
      k--;
    }
    return [a[0] + sr * k, a[1] + sc * k];
  }
  const cellEl = (r, c) => $('#board .cells span[data-r="' + r + '"][data-c="' + c + '"]');
  function showSel(a, b) {
    const hl = $('#selhl');
    hl.hidden = false;
    hl.setAttribute('style', capsule(P.p.n, a[0], a[1], b[0], b[1], 0.78));
    document.querySelectorAll('#board .cells span.s').forEach((el) => el.classList.remove('s'));
    const letters = pathCells(a, b).map(([r, c]) => { cellEl(r, c).classList.add('s'); return P.p.rows[r][c]; }).join('');
    $('#selbox').innerHTML = '<span class="eyebrow">Selecting</span><span class="sticker" aria-label="' + letters.split('').join(' ') + '">' + letters + '</span>';
  }
  function clearSel() {
    const hl = $('#selhl'); if (hl) hl.hidden = true;
    document.querySelectorAll('#board .cells span.s').forEach((el) => el.classList.remove('s'));
  }
  function selText(msg) { $('#selbox').innerHTML = '<span class="eyebrow">' + msg + '</span>'; }

  function finish(a, b) {
    const cells = pathCells(a, b);
    const s = cells.map(([r, c]) => P.p.rows[r][c]).join('');
    const rev = [...s].reverse().join('');
    const done = new Set(P.prog.found.map((f) => f.w));
    const hit = P.p.words.find((w) => !done.has(w.word) && (w.word === s || w.word === rev));
    clearSel();
    if (!hit) {
      if (cells.length > 1) {
        const already = P.p.words.find((w) => done.has(w.word) && (w.word === s || w.word === rev));
        $('#selbox').innerHTML = '<span class="eyebrow">' + (already ? 'Already found' : 'Not a word in this puzzle') + '</span><span class="sticker miss">' + s + '</span>';
        buzz(20);
      } else selText('Drag across a word');
      return;
    }
    P.prog.found.push({ w: hit.word, a, b, k: pickColour(P.prog.found, cells) });
    P.prog.hintCells = P.prog.hintCells.filter(([r, c]) => !(r === hit.r && c === hit.c));
    P.prog.at = Date.now();
    save();
    const i = P.prog.found.length - 1, n = P.p.n;
    const span = document.createElement('span');
    span.className = 'hl k' + P.prog.found[i].k + ' pop';
    span.setAttribute('style', capsule(n, a[0], a[1], b[0], b[1], 0.72));
    $('#selhl').before(span);
    cells.forEach(([r, c]) => cellEl(r, c).classList.add('f'));
    $('#selbox').innerHTML = '<span class="eyebrow">Found</span><span class="sticker found">' + hit.word + '</span>';
    $('#words').innerHTML = wordListHTML(P.p, P.prog, hit.word);
    $('#count').textContent = P.prog.found.length + ' / ' + P.p.words.length + ' found';
    $('#left').textContent = (P.p.words.length - P.prog.found.length) + ' left';
    const blocks = $('#blocks').children; blocks[i].classList.add('on', 'new');
    paintHints();
    buzz([12, 40, 12]);
    if (P.prog.found.length === P.p.words.length) {
      tone([523, 659, 784, 1047], 0.22, 0.11, 0.06);
      complete();
    } else tone([660, 880], 0.12, 0.08, 0.05);
  }

  function complete() {
    stopClock();
    const id = P.id, p = P.p, prog = P.prog;
    S.solved[id] = { time: Math.round(prog.elapsed), hints: prog.hints, at: Date.now(), found: prog.found, gv: P.p.gv };
    delete S.progress[id];
    S.last = id;
    save();
    $('#board').setAttribute('aria-disabled', 'true');
    const done = P; P = null;
    setTimeout(() => { if (route.name === 'puzzle' && route.arg === done.id) go('done', id); }, calm() ? 300 : 900);
  }

  function paintHints() {
    document.querySelectorAll('#board .cells span.hint').forEach((el) => el.classList.remove('hint'));
    P.prog.hintCells.forEach(([r, c]) => cellEl(r, c).classList.add('hint'));
  }
  function setCursor(cell, quiet) {
    document.querySelectorAll('#board .cells span.cur').forEach((el) => el.classList.remove('cur'));
    if (!cell) return;
    P.cursor = cell;
    cellEl(cell[0], cell[1]).classList.add('cur');
    if (!quiet) {
      const letter = P.p.rows[cell[0]][cell[1]];
      if (!P.anchor) selText(letter + ' · row ' + (cell[0] + 1) + ', column ' + (cell[1] + 1));
    }
  }
  function onBoardKey(e) {
    if (!P || P.paused) return;
    const moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    const cur = P.cursor || [0, 0];
    if (moves[e.key]) {
      e.preventDefault();
      const [dr, dc] = moves[e.key];
      const next = [Math.min(P.p.n - 1, Math.max(0, cur[0] + dr)), Math.min(P.p.n - 1, Math.max(0, cur[1] + dc))];
      setCursor(next);
      if (P.anchor) showSel(P.anchor, snap(P.anchor, next));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!P.cursor) { setCursor(cur); return; }
      if (!P.anchor) { P.anchor = cur; showSel(cur, cur); }
      else { const a = P.anchor; P.anchor = null; finish(a, snap(a, cur)); }
    } else if (e.key === 'Escape') {
      P.anchor = null; clearSel(); selText('Selection cleared');
    }
  }

  function startClock() {
    stopClock();
    let last = performance.now();
    P.tick = setInterval(() => {
      const now = performance.now();
      if (P && !P.paused && !document.hidden) {
        P.prog.elapsed += (now - last) / 1000;
        const el = $('#clock');
        if (el) el.textContent = clock(P.prog.elapsed);
        if (Math.floor(P.prog.elapsed) % 5 === 0) save();
      }
      last = now;
    }, 500);
  }
  function stopClock() { if (P && P.tick) clearInterval(P.tick); }
  function leavePuzzle() {
    if (!P) return;
    stopClock();
    if (!P.prog.found.length && P.prog.elapsed < 3) delete S.progress[P.id];
    save();
    P = null;
  }
  function setPaused(on) {
    if (!P) return;
    P.paused = on;
    $('#board').classList.toggle('paused', on);
    $('#pausecover').hidden = !on;
    const b = document.querySelector('[data-act="pause"]');
    b.setAttribute('aria-pressed', String(on));
    b.lastChild.previousSibling.textContent = on ? 'Paused ' : 'Pause ';
    $('#timer').setAttribute('aria-label', on ? 'Time, paused at ' + clockLong(Math.round(P.prog.elapsed)) : 'Time');
    if (on) { P.anchor = null; clearSel(); selText('Paused'); $('#pausecover button').focus(); }
    else { selText('Drag across a word'); $('#board').focus(); }
    save();
  }
  function useHint() {
    if (!P || P.prog.hints >= HINTS) return;
    const done = new Set(P.prog.found.map((f) => f.w));
    const shown = new Set(P.prog.hintCells.map(([r, c]) => r + ',' + c));
    const w = P.p.words.find((x) => !done.has(x.word) && !shown.has(x.r + ',' + x.c));
    if (!w) { toast('Every word left already has a hint showing'); return; }
    P.prog.hints++;
    P.prog.hintCells.push([w.r, w.c]);
    save();
    paintHints();
    $('#tools').innerHTML = toolsHTML(P.prog);
    selText(title(w.word) + ' starts at the circled ' + w.word[0] + ' · row ' + (w.r + 1) + ', column ' + (w.c + 1));
    tone([440, 554], 0.12, 0.08, 0.04);
  }
  function askRestart() {
    if (!P || $('#confirm')) return;
    $('#tools').insertAdjacentHTML('afterend', '<div class="confirm" id="confirm" role="group" aria-label="Restart puzzle" style="grid-area:tools"><p>Clear your found words and reset the clock?</p><button class="btn pink" type="button" data-act="restart-yes">Restart</button><button class="btn" type="button" data-act="restart-no">Keep playing</button></div>');
    $('#tools').hidden = true;
    $('#confirm .btn').focus();
  }
  function closeRestart(yes) {
    $('#confirm') && $('#confirm').remove();
    $('#tools').hidden = false;
    if (yes && P) {
      S.progress[P.id] = { found: [], elapsed: 0, hints: P.prog.hints, hintCells: [], at: Date.now(), gv: P.p.gv };
      save();
      const id = P.id; P = null; route = { name: 'puzzle', arg: id }; render();
      toast('Puzzle restarted');
    }
  }

  /* ---------- Completion ---------- */
  function viewDone() {
    const id = route.arg, p = puzzle(id), rec = S.solved[id];
    const { cur } = streaks();
    let nextLabel, nextId;
    if (p.kind === 'daily') {
      const i = nextInPack(p.pack.id, S.diff);
      if (i >= 0) { nextId = packId(p.pack.id, S.diff, i); nextLabel = p.pack.name + ' · ' + LEVELS[S.diff].label + ' ' + (i + 1); }
    } else {
      const i = nextInPack(p.pack.id, p.level);
      if (i >= 0) { nextId = packId(p.pack.id, p.level, i); nextLabel = p.pack.name + ' · puzzle ' + (i + 1); }
      else {
        const order = PACKS.map((x) => x.id), start = order.indexOf(p.pack.id);
        for (let k = 1; k <= order.length && !nextId; k++) {
          const other = order[(start + k) % order.length], j = nextInPack(other, p.level);
          if (j >= 0) { nextId = packId(other, p.level, j); nextLabel = PACK[other].name + ' · puzzle ' + (j + 1); }
        }
      }
    }
    const third = p.kind === 'daily'
      ? '<div><dt>Streak</dt><dd>' + cur + (cur === 1 ? ' day' : ' days') + '</dd></div>'
      : '<div><dt>Theme</dt><dd>' + packDone(p.pack.id, p.level) + ' / ' + PER_PACK + '</dd></div>';
    const share = 'Frond · ' + p.title + (p.kind === 'daily' ? ' · No. ' + p.number : ' · ' + LEVELS[p.level].label) + '\n' +
      clock(rec.time) + ' · ' + p.words.length + ' words · ' + (rec.hints ? rec.hints + (rec.hints === 1 ? ' hint' : ' hints') : 'no hints') + '\n' +
      p.words.map((_, i) => (i < rec.hints ? '□' : '■')).join('');
    return '<div class="screen no-tabs">' +
      '<div class="done-top"><button class="btn ghost" type="button" data-go="' + (p.kind === 'daily' ? 'home' : 'library') + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>Close</button>' + leafArt('heart', 110, 70) + '</div>' +
      '<h1 class="big-stamp">' + esc(p.pack.done) + '</h1>' +
      '<p class="done-sub">' + esc(p.title) + (p.kind === 'daily' ? ' · daily No. ' + p.number : ' · ' + LEVELS[p.level].label + ' puzzle ' + (p.idx + 1)) + '</p>' +
      '<div class="mini">' + boardHTML(p, rec.found || [], { label: 'Solved grid with all ' + p.words.length + ' words circled' }) + '</div>' +
      '<dl class="statrow"><div><dt>Time</dt><dd>' + clock(rec.time) + '</dd></div><div><dt>Hints</dt><dd>' + rec.hints + '</dd></div>' + third + '</dl>' +
      '<section class="card share" aria-labelledby="h-share"><h2 id="h-share" class="eyebrow">Share your result</h2><pre id="sharetext">' + esc(share) + '</pre><button class="btn primary" type="button" data-act="share"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>Copy result</button></section>' +
      '<div class="next">' + (nextId
        ? '<button class="btn primary wide" type="button" data-play="' + nextId + '">Next puzzle: ' + esc(nextLabel) + '</button>'
        : '<p class="fine">You’ve solved every ' + (p.level ? LEVELS[p.level].label.toLowerCase() : '') + ' puzzle. Try another difficulty in the library.</p>') +
        '<button class="btn wide" type="button" data-go="library">Browse the library</button></div>' +
    '</div>';
  }

  /* ---------- Stats ---------- */
  function viewStats() {
    const { cur, best } = streaks();
    const t = parse(today());
    const monday = addDays(t, -((t.getDay() + 6) % 7));
    const start = addDays(monday, -28);
    const days = [];
    for (let d = start; d <= t; d = addDays(d, 1)) {
      const ds = iso(d), on = solvedOn(ds), isToday = ds === iso(t);
      const before = ds < LAUNCH;
      days.push('<li class="c' + (on ? ' on' : '') + (isToday ? ' today' : '') + (before ? ' blank' : '') + '" aria-label="' + d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }) + (before ? ', before Frond' : on ? ', solved' : isToday ? ', today, not solved yet' : ', missed') + '">' + d.getDate() + '</li>');
    }
    const all = Object.values(S.solved);
    const times = all.map((r) => r.time);
    const avg = times.length ? clock(times.reduce((a, b) => a + b, 0) / times.length) : '–';
    const fast = times.length ? clock(Math.min(...times)) : '–';
    const clean = all.filter((r) => !r.hints).length;
    const toBeat = best - cur;
    return '<div class="screen">' +
      '<div class="head"><div><h1>Stats</h1><p class="eyebrow" style="margin-top:6px">Your puzzles on this device</p></div>' + leafArt('sprig') + '</div>' +
      '<section class="card lift bigstreak" aria-label="Streak"><div><p class="eyebrow">Current streak</p><p style="display:flex;align-items:baseline;gap:6px;margin-top:2px"><b>' + cur + '</b><span style="font-weight:700;font-size:18px">' + (cur === 1 ? 'day' : 'days') + '</span></p></div>' +
        '<div style="text-align:right"><p class="eyebrow">Best</p><p style="font-weight:800;font-size:26px;margin-top:2px">' + best + (best === 1 ? ' day' : ' days') + '</p><p class="fine" style="margin-top:4px">' + (cur === 0 ? 'Solve today’s puzzle to start' : toBeat > 0 ? toBeat + ' more to beat it' : 'This is your best yet') + '</p></div></section>' +
      '<section aria-labelledby="h-cal" style="display:grid;gap:10px"><div class="section-title"><h2 id="h-cal">Last five weeks</h2><span class="eyebrow">Daily puzzles</span></div>' +
        '<div class="cal" aria-hidden="true">' + ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d) => '<span class="dow">' + d + '</span>').join('') + '</div>' +
        '<ol class="cal" aria-label="Daily results">' + days.join('') + '</ol></section>' +
      '<dl class="totals"><div><dt>Puzzles solved</dt><dd>' + all.length + '</dd></div><div><dt>Average time</dt><dd>' + avg + '</dd></div><div><dt>Fastest</dt><dd>' + fast + '</dd></div><div><dt>Solved without hints</dt><dd>' + clean + '</dd></div></dl>' +
    '</div>';
  }

  /* ---------- Settings ---------- */
  function viewSettings() {
    const s = S.settings;
    const row = (k, label, note) => '<div class="setrow"><label for="set-' + k + '"><b>' + label + '</b><span>' + note + '</span></label>' +
      '<span class="sw"><input type="checkbox" role="switch" id="set-' + k + '" data-set="' + k + '"' + (s[k] ? ' checked' : '') + '><i aria-hidden="true"><svg viewBox="0 0 14 14"><path d="M2.4 7.4l2.8 2.8 6.2-6.8"/></svg></i></span></div>';
    return '<div class="screen">' +
      '<div class="head"><div><h1>Settings</h1></div>' + leafArt('corner') + '</div>' +
      '<section aria-labelledby="h-theme" style="display:grid;gap:8px"><h2 id="h-theme" style="font-weight:800;font-size:17px">Theme</h2>' +
        '<div class="seg theme" role="radiogroup" aria-labelledby="h-theme">' + [['light', 'Light'], ['dark', 'Dark'], ['system', 'Match device']].map(([k, l]) =>
          '<button type="button" role="radio" data-theme-set="' + k + '" aria-checked="' + (s.theme === k) + '" tabindex="' + (s.theme === k ? 0 : -1) + '">' + TICK + l + '</button>').join('') + '</div></section>' +
      '<section class="setgroup" aria-labelledby="h-sound"><div class="section-title"><h2 id="h-sound">Sound and touch</h2></div>' +
        row('sound', 'Sound effects', 'Soft taps as letters join, a chime when you find a word') +
        row('haptics', 'Haptics', 'A light buzz as each letter joins, on phones that support it') + '</section>' +
      '<section class="setgroup" aria-labelledby="h-a11y"><div class="section-title"><h2 id="h-a11y">Accessibility</h2></div>' +
        row('large', 'Larger letters', 'Bigger letters in every grid') +
        row('strong', 'Stronger highlights', 'Thicker outlines on found words') +
        row('cb', 'Colour-blind-safe palette', 'Highlight colours chosen to differ in lightness') +
        row('motion', 'Reduce motion', 'Turns off animations. Frond also follows your device setting') +
        row('left', 'Left-handed controls', 'Moves Hint to the left, under your thumb') + '</section>' +
      '<section class="setgroup" aria-labelledby="h-data"><div class="section-title"><h2 id="h-data">Your progress</h2></div>' +
        '<p class="fine" style="padding:12px 0">Streaks and solved puzzles are saved in this browser only. Clearing site data resets them.</p></section>' +
    '</div>';
  }

  /* ---------- events ---------- */
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-go],[data-play],[data-act],[data-cat],[data-diff],[data-pack],[data-theme-set]');
    if (!el) return;
    const d = el.dataset;
    if (d.go) go(d.go);
    else if (d.play) go(S.solved[d.play] && !S.progress[d.play] ? 'done' : 'puzzle', d.play);
    else if (d.cat) { S.cat = d.cat; save(); render(); $('[data-cat="' + d.cat + '"]').focus(); }
    else if (d.diff) { S.diff = d.diff; save(); render(); $('[data-diff="' + d.diff + '"]').focus(); }
    else if (d.pack) {
      const i = nextInPack(d.pack, S.diff);
      go('puzzle', packId(d.pack, S.diff, i < 0 ? 0 : i));
      if (i < 0) toast('Theme complete, replaying puzzle 1');
    }
    else if (d.themeSet) { S.settings.theme = d.themeSet; save(); applySettings(); render(); $('[data-theme-set="' + d.themeSet + '"]').focus(); }
    else if (d.act === 'hint') useHint();
    else if (d.act === 'pause') setPaused(!(P && P.paused));
    else if (d.act === 'resume') setPaused(false);
    else if (d.act === 'restart') askRestart();
    else if (d.act === 'restart-yes') closeRestart(true);
    else if (d.act === 'restart-no') closeRestart(false);
    else if (d.act === 'share') {
      const text = $('#sharetext').textContent;
      const fallback = () => { const r = document.createRange(); r.selectNodeContents($('#sharetext')); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); toast('Selected, copy it with your keyboard'); };
      try { navigator.clipboard.writeText(text).then(() => toast('Result copied'), fallback); } catch (err) { fallback(); }
    }
  });
  document.addEventListener('change', (e) => {
    const k = e.target.dataset && e.target.dataset.set;
    if (!k) return;
    S.settings[k] = e.target.checked; save(); applySettings();
    if (k === 'sound' && e.target.checked) tone([660, 880], 0.12, 0.08, 0.05);
  });
  document.addEventListener('keydown', (e) => {
    const radio = e.target.closest && e.target.closest('[role="radio"]');
    if (radio && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      e.preventDefault();
      const all = [...radio.parentElement.querySelectorAll('[role="radio"]')];
      const step = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1;
      all[(all.indexOf(radio) + step + all.length) % all.length].click();
      return;
    }
    if (route.name !== 'puzzle' || !P || e.target.matches('input, button, [role="radio"]')) {
      if (route.name === 'puzzle' && P && e.target.closest('#tools') && (e.key === 'h' || e.key === 'H')) useHint();
      return;
    }
    if ((e.key === 'h' || e.key === 'H') && !e.metaKey && !e.ctrlKey) useHint();
    else if (e.key === 'p' || e.key === 'P') setPaused(!P.paused);
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  window.addEventListener('pagehide', save);

  // reopen the screen that was showing before a refresh
  const v = S.view;
  if (v && v.name === 'puzzle' && v.arg) { try { puzzle(v.arg); route = v; } catch (e) { /* stale id */ } }
  else if (v && v.name === 'done' && S.solved[v.arg]) route = v;
  else if (v && ['library', 'stats', 'settings'].includes(v.name)) route = { name: v.name };
  applySettings();
  render();
})();
