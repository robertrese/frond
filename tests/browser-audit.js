// Browser checks for the running app, on a phone-sized window. Load it in the page:
//   eval(await (await fetch('../tests/browser-audit.js')).text())
// audit(label)       -> anything off-screen, a clipped label, or a tap target under 44px on the current screen
// play(word, mode)   -> selects a word with touch-style pointer events ('drag' or 'tap') and reports the result
window.audit = function (label) {
  const W = innerWidth, out = { label, width: W, offscreen: [], clipped: [], smallTargets: [] };
  const name = (el) => (el.id ? '#' + el.id : el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.split(' ')[0] : '')) +
    ' "' + (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 24) + '"';
  for (const el of document.querySelectorAll('#screen *, #tabbar *')) {
    if (el.closest('svg.leafart, .leafstrip, .sprite') || el.matches('.sr')) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || getComputedStyle(el).visibility === 'hidden') continue;
    if (r.right > W + 0.5 || r.left < -0.5) out.offscreen.push(name(el) + ' ' + Math.round(r.left) + '..' + Math.round(r.right));
    if (el.children.length === 0 && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'visible') out.clipped.push(name(el));
    if (el.matches('button, a, input, [role="radio"]') && !el.closest('.sw') && (r.width < 44 || r.height < 44)) out.smallTargets.push(name(el) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
    if (el.matches('.sw') && (r.width < 44 || r.height < 34)) out.smallTargets.push('switch ' + Math.round(r.width) + 'x' + Math.round(r.height));
  }
  for (const el of document.querySelectorAll('.words li')) if (el.getBoundingClientRect().height > 46) out.clipped.push('word wraps: ' + el.innerText.trim());
  const week = document.querySelector('.week');
  if (week) {
    const card = week.closest('.card').getBoundingClientRect();
    out.week = [...week.children].every((d) => { const r = d.getBoundingClientRect(); return r.left >= card.left && r.right <= card.right; }) ? 'all 7 days inside card' : 'DAY CUT OFF';
  }
  out.pageScrollX = document.documentElement.scrollWidth - W;
  for (const k of ['offscreen', 'clipped', 'smallTargets']) if (!out[k].length) delete out[k];
  return out;
};

window.play = function (word, mode) {
  const cells = [...document.querySelectorAll('#board .cells span')], n = Math.sqrt(cells.length), g = [];
  cells.forEach((s) => { (g[+s.dataset.r] ||= [])[+s.dataset.c] = s.textContent; });
  const dirs = [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0], [1, -1], [-1, -1]];
  let hit;
  for (let r = 0; r < n && !hit; r++) for (let c = 0; c < n && !hit; c++) for (const [dr, dc] of dirs) {
    let found = true;
    for (let k = 0; k < word.length; k++) { const rr = r + dr * k, cc = c + dc * k; if (rr < 0 || cc < 0 || rr >= n || cc >= n || g[rr][cc] !== word[k]) { found = false; break; } }
    if (found) { hit = [[r, c], [r + dr * (word.length - 1), c + dc * (word.length - 1)]]; break; }
  }
  if (!hit) return { word, result: 'not in grid' };
  const b = document.getElementById('board'), R = b.getBoundingClientRect();
  const pt = ([r, c]) => ({ clientX: R.left + (c + 0.5) * R.width / n, clientY: R.top + (r + 0.5) * R.height / n, pointerId: 9, pointerType: 'touch', bubbles: true, cancelable: true });
  const fire = (t, p) => b.dispatchEvent(new PointerEvent(t, pt(p)));
  const y0 = scrollY;
  if (mode === 'tap') { fire('pointerdown', hit[0]); fire('pointerup', hit[0]); fire('pointerdown', hit[1]); fire('pointerup', hit[1]); }
  else {
    const steps = word.length - 1, [a, z] = hit;
    fire('pointerdown', a);
    for (let k = 1; k <= steps; k++) fire('pointermove', [a[0] + (z[0] - a[0]) * k / steps, a[1] + (z[1] - a[1]) * k / steps]);
    fire('pointerup', z);
  }
  return { word, mode: mode || 'drag', result: document.getElementById('selbox').innerText.replace(/\n/g, ' '), scrolled: scrollY - y0 };
};
