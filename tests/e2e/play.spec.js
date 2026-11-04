// End-to-end: drag, tap, save, restore and complete today's daily puzzle in a real browser.
// Each test starts with empty storage. Word positions are read from the grid on screen, so the
// tests work for whatever the daily puzzle is on the day they run.
const { test, expect } = require('@playwright/test');

const DIRS = [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0], [1, -1], [-1, -1]];
const isTouch = () => test.info().project.name.startsWith('phone');

async function openDaily(page) {
  await page.goto('./');
  await page.getByRole('button', { name: /Play today/ }).click();
  await expect(page.locator('#board')).toBeVisible();
}

async function readPuzzle(page) {
  return page.evaluate(() => {
    const cells = [...document.querySelectorAll('#board .cells span')];
    const rows = [];
    cells.forEach((s) => { (rows[+s.dataset.r] ||= [])[+s.dataset.c] = s.textContent; });
    const words = [...document.querySelectorAll('#words li')].map((li) => ({ word: li.lastElementChild.textContent, done: li.classList.contains('done') }));
    return { n: rows.length, rows, words };
  });
}

// where a word sits in the grid (either reading direction counts, as in the game)
function locate(p, word) {
  for (let r = 0; r < p.n; r++) for (let c = 0; c < p.n; c++) for (const [dr, dc] of DIRS) {
    let k = 0;
    while (k < word.length && (p.rows[r + dr * k] || [])[c + dc * k] === word[k]) k++;
    if (k === word.length) return { a: [r, c], b: [r + dr * (k - 1), c + dc * (k - 1)], dr, dc };
  }
  throw new Error(word + ' is not in the grid');
}

async function point(page, n, [r, c]) {
  const box = await page.locator('#board').boundingBox();
  return { x: box.x + (c + 0.5) * box.width / n, y: box.y + (r + 0.5) * box.height / n };
}

// a finger drag: real touch events through Chrome DevTools, which the page receives as touch pointer events
async function touchDrag(page, from, to, steps = 10) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + (to.x - from.x) * i / steps, y: from.y + (to.y - from.y) * i / steps }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

async function mouseDrag(page, from, to, steps = 10) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up();
}

async function drag(page, p, word) {
  const { a, b } = locate(p, word);
  const from = await point(page, p.n, a), to = await point(page, p.n, b);
  if (isTouch()) await touchDrag(page, from, to); else await mouseDrag(page, from, to);
}

async function tapEnds(page, p, word) {
  const { a, b } = locate(p, word);
  for (const cell of [a, b]) {
    const at = await point(page, p.n, cell);
    if (isTouch()) await page.touchscreen.tap(at.x, at.y); else await page.mouse.click(at.x, at.y);
  }
}

const foundCount = (page) => page.locator('#words li.done').count();
const seconds = (text) => { const [m, s] = text.split(':').map(Number); return m * 60 + s; };

test('dragging across a word finds it, from either end, without scrolling the page', async ({ page }) => {
  await openDaily(page);
  const p = await readPuzzle(page);
  // prefer a word that runs down or diagonally: a vertical finger drag is what would scroll a page
  const vertical = p.words.map((w) => w.word).find((w) => locate(p, w).dr !== 0) || p.words[0].word;
  await page.evaluate(() => window.scrollTo(0, 0));
  await drag(page, p, vertical);
  await expect(page.locator('#selbox')).toContainText('Found');
  await expect(page.locator('#words li.done')).toHaveCount(1);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);

  // the same word dragged backwards (last letter to first) also counts
  const other = p.words.map((w) => w.word).find((w) => w !== vertical);
  const { a, b } = locate(p, other);
  const from = await point(page, p.n, b), to = await point(page, p.n, a);
  if (isTouch()) await touchDrag(page, from, to); else await mouseDrag(page, from, to);
  await expect(page.locator('#words li.done')).toHaveCount(2);
  await expect(page.locator('.hls .hl:not(.sel)')).toHaveCount(2);
});

test('a finger drag outside the grid still scrolls the page (proves the no-scroll check can fail)', async ({ page }) => {
  test.skip(!isTouch(), 'touch only');
  await openDaily(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  const vh = page.viewportSize().height;
  const list = await page.locator('.pz-words').boundingBox();
  const x = list.x + 20, y = Math.min(list.y + 30, vh - 20);
  await touchDrag(page, { x, y }, { x, y: y - 300 }, 12);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
});

test('tapping the first and last letters finds a word; a wrong pair does not', async ({ page }) => {
  await openDaily(page);
  const p = await readPuzzle(page);
  await tapEnds(page, p, p.words[0].word);
  await expect(page.locator('#words li.done')).toHaveCount(1);
  await expect(page.locator('#selbox')).toContainText(p.words[0].word);

  // first letter of one word, last letter of a different direction: nothing is found
  const w = locate(p, p.words[1].word);
  const at = await point(page, p.n, w.a);
  const wrong = [w.a[0], Math.min(p.n - 1, w.a[1] + 1)];
  const at2 = await point(page, p.n, wrong[0] === w.b[0] && wrong[1] === w.b[1] ? [w.a[0], Math.max(0, w.a[1] - 1)] : wrong);
  if (isTouch()) { await page.touchscreen.tap(at.x, at.y); await page.touchscreen.tap(at2.x, at2.y); } else { await page.mouse.click(at.x, at.y); await page.mouse.click(at2.x, at2.y); }
  await expect(page.locator('#words li.done')).toHaveCount(1);
});

test('progress is saved after every word and restored exactly after a reload', async ({ page }) => {
  await openDaily(page);
  const p = await readPuzzle(page);
  const [w1, w2] = p.words.map((w) => w.word);
  await drag(page, p, w1);
  await expect(page.locator('#words li.done')).toHaveCount(1);
  await tapEnds(page, p, w2);
  await expect(page.locator('#words li.done')).toHaveCount(2);

  // saved straight away, without waiting for the timer's periodic save
  const saved = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('frond.v1'));
    const id = Object.keys(s.progress)[0];
    return { id, found: s.progress[id].found.map((f) => f.w), gv: s.progress[id].gv };
  });
  expect(saved.found.sort()).toEqual([w1, w2].sort());
  expect(saved.gv).toBeGreaterThanOrEqual(1);

  await page.locator('[data-act="hint"]').click();
  await expect(page.locator('.cells span.hint')).toHaveCount(1);
  await page.waitForTimeout(2200);
  const before = seconds(await page.locator('#clock').textContent());
  expect(before).toBeGreaterThanOrEqual(2);

  await page.reload();
  // same screen, same grid, same found words, highlights, hint and clock
  await expect(page.locator('#board')).toBeVisible();
  expect((await readPuzzle(page)).rows).toEqual(p.rows);
  await expect(page.locator('#count')).toHaveText('2 / ' + p.words.length + ' found');
  await expect(page.locator('#words li.done')).toHaveCount(2);
  await expect(page.locator('.hls .hl:not(.sel)')).toHaveCount(2);
  await expect(page.locator('.cells span.hint')).toHaveCount(1);
  await expect(page.locator('[data-act="hint"]')).toContainText('×2');
  expect(seconds(await page.locator('#clock').textContent())).toBeGreaterThanOrEqual(before - 1);

  // and it waits on Home under Continue playing, which reopens it
  await page.locator('.pz-bar [data-go]').click();
  const card = page.locator('.contcard');
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('2 of ' + p.words.length + ' found');
  await card.click();
  await expect(page.locator('#words li.done')).toHaveCount(2);
});

test('finding every word completes the puzzle, records it, and survives a reload', async ({ page }) => {
  await openDaily(page);
  const p = await readPuzzle(page);
  for (const [i, w] of p.words.map((x) => x.word).entries()) {
    if (i % 2) await tapEnds(page, p, w); else await drag(page, p, w);
    await expect(page.locator('#words li.done, .big-stamp')).not.toHaveCount(i);
  }
  const stamp = page.locator('.big-stamp');
  await expect(stamp).toBeVisible({ timeout: 5000 });
  await expect(page.locator('.statrow')).toContainText('Time');
  await expect(page.locator('.statrow')).toContainText('1 day');
  await expect(page.locator('.mini .hls .hl')).toHaveCount(p.words.length);
  await expect(page.locator('#sharetext')).not.toContainText(p.words[0].word);

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('frond.v1')));
  expect(Object.keys(stored.solved)).toHaveLength(1);
  expect(Object.keys(stored.progress)).toHaveLength(0);

  await page.reload();
  await expect(page.locator('.big-stamp')).toBeVisible();

  await page.locator('.done-top [data-go]').click();
  await expect(page.locator('.daily')).toContainText('Solved in');
  await expect(page.locator('.contcard')).toHaveCount(0);
  await expect(page.locator('.streak')).toContainText('1');
  await page.locator('[data-go="stats"]:visible').first().click();
  await expect(page.locator('.totals')).toContainText('Puzzles solved');
  await expect(page.locator('.totals div').first()).toContainText('1');
});
