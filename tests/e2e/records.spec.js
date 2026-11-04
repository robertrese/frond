// End-to-end: a manual pause survives a reload, replays keep the best time, Stats lists past
// solves, and data saved by older versions of the app carries over. Runs on 390px and 360px
// phones in light and dark mode, and on desktop.
const { test, expect } = require('@playwright/test');
const { openDaily, readPuzzle, drag, tapEnds, seconds } = require('./helpers');

// write a save from a page on the same site where the app isn't running (the app saves its own state as it unloads)
async function plantSave(page, data) {
  await page.goto('./manifest.webmanifest');
  await page.evaluate((d) => localStorage.setItem('frond.v1', JSON.stringify(d)), data);
  await page.goto('./');
}
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('frond.v1')));
const isoDay = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const dayAt = (offset, hour = 12) => new Date(isoDay(offset) + 'T' + String(hour).padStart(2, '0') + ':00:00').getTime();
const clockText = (s) => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');

// nothing on screen may stick out sideways, and the page must be in the project's theme
async function checkLayout(page) {
  const r = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - innerWidth,
    outside: [...document.querySelectorAll('#screen *')].filter((el) => {
      const b = el.getBoundingClientRect();
      return b.width && (b.right > innerWidth + 0.5 || b.left < -0.5) && !el.closest('.leafart, .leafstrip, .sr, .big-stamp');
    }).map((el) => el.className || el.tagName),
    bg: getComputedStyle(document.body).backgroundColor,
  }));
  expect(r.overflow, 'page scrolls sideways').toBe(0);
  expect(r.outside, 'elements outside the screen').toEqual([]);
  expect(r.bg).toBe(test.info().project.name.endsWith('dark') ? 'rgb(25, 23, 20)' : 'rgb(242, 235, 221)');
}

test('a paused puzzle stays paused after a reload, with the clock stopped', async ({ page }) => {
  await openDaily(page);
  const p = await readPuzzle(page);
  await drag(page, p, p.words[0].word);
  await expect(page.locator('#words li.done')).toHaveCount(1);
  await page.waitForTimeout(1200);
  await page.locator('[data-act="pause"]').click();
  await expect(page.locator('#pausecover')).toBeVisible();
  const at = await page.locator('#clock').textContent();
  const save = await stored(page);
  expect(Object.values(save.progress)[0].paused).toBe(true);

  await page.reload();
  await expect(page.locator('#board')).toHaveClass(/paused/);
  await expect(page.locator('#pausecover')).toBeVisible();
  await expect(page.locator('[data-act="pause"]')).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(2200);
  await expect(page.locator('#clock')).toHaveText(at);
  await expect(page.locator('#words li.done')).toHaveCount(1);
  await checkLayout(page);

  // Home shows it as paused, and it is still paused when reopened
  await page.locator('.pz-bar [data-go]').click();
  await expect(page.locator('.contcard')).toContainText('paused');
  await checkLayout(page);
  await page.locator('.contcard').click();
  await expect(page.locator('#pausecover')).toBeVisible();

  // Resume starts the clock again and clears the saved pause
  await page.locator('#pausecover [data-act="resume"]').click();
  await expect(page.locator('#pausecover')).toBeHidden();
  await page.waitForTimeout(2200);
  expect(seconds(await page.locator('#clock').textContent())).toBeGreaterThan(seconds(at));
  await page.reload();
  await expect(page.locator('#pausecover')).toBeHidden();
  expect(Object.values((await stored(page)).progress)[0].paused).toBeUndefined();
});

// a finished Ocean Life Easy theme replays puzzle 1, whose planted best time is `best` seconds
async function replayOceanEasy(page, best) {
  const solved = {};
  for (let i = 0; i < 5; i++) solved['p:ocean:easy:' + i] = { time: i ? 200 : best, hints: 0, at: dayAt(-6 + i), found: [], gv: 4 };
  await plantSave(page, { solved, progress: {} });
  await page.locator('[data-go="library"]:visible').first().click();
  await page.locator('[data-diff="easy"]').click();
  await page.locator('[data-pack="ocean"]').click();
  const p = await readPuzzle(page);
  const words = p.words.map((x) => x.word);
  for (const [i, w] of words.entries()) {
    if (i === words.length - 1) await page.waitForTimeout(2100); // a replay always takes at least 2 seconds
    if (i % 2) await tapEnds(page, p, w); else await drag(page, p, w);
  }
  await expect(page.locator('.big-stamp')).toBeVisible({ timeout: 5000 });
  return (await stored(page)).solved['p:ocean:easy:0'];
}

test('a slower replay keeps the best time; a faster one replaces it', async ({ page }) => {
  // best planted at 0:01, so any real replay is slower and must not overwrite it
  const slow = await replayOceanEasy(page, 1);
  expect(slow.time).toBe(1);
  expect(slow.plays).toBe(2);
  expect(slow.last.time).toBeGreaterThan(1);
  await expect(page.locator('.statrow div').first()).toContainText(clockText(slow.last.time));
  await expect(page.locator('.best-note')).toHaveText('Your best for this puzzle is 0:01');
  await checkLayout(page);

  // best planted at 99:59, so a real replay is faster and becomes the best
  const fast = await replayOceanEasy(page, 5999);
  expect(fast.time).toBeLessThan(5999);
  expect(fast.time).toBe(fast.last.time);
  expect(fast.plays).toBe(2);
  await expect(page.locator('.best-note')).toHaveText('New best time for this puzzle');
});

test('Stats lists past solves with name, difficulty, best time and date', async ({ page }) => {
  const solved = {
    ['d:' + isoDay(-1)]: { time: 192, hints: 0, at: dayAt(-1), found: [], gv: 2 },
    'p:ghana:hard:1': { time: 431, hints: 1, at: dayAt(0, 8), found: [], gv: 4, plays: 3, last: { time: 500, hints: 0, at: dayAt(0, 8) } },
    'p:herbs:medium:0': { time: 65, hints: 0, at: dayAt(-3), found: [], gv: 3 },
  };
  for (let i = 0; i < 5; i++) solved['p:farm:easy:' + i] = { time: 100 + i, hints: 0, at: dayAt(-10 - i), found: [], gv: 4 };
  for (let i = 0; i < 5; i++) solved['p:sky:easy:' + i] = { time: 150 + i, hints: 0, at: dayAt(-20 - i), found: [], gv: 4 };
  const total = Object.keys(solved).length;
  await plantSave(page, { solved, progress: {} });
  await page.locator('[data-go="stats"]:visible').first().click();
  await expect(page.locator('#h-hist')).toHaveText('Past solves');
  await expect(page.locator('.hist-wrap .section-title .eyebrow')).toHaveText(total + ' puzzles');
  const rows = page.locator('.hist li');
  await expect(rows).toHaveCount(10);
  // newest first: Ghana today, yesterday's daily, then Herb Garden three days ago
  await expect(rows.nth(0)).toContainText('Ghana');
  await expect(rows.nth(0)).toContainText('Hard · puzzle 2');
  await expect(rows.nth(0)).toContainText('7:11');
  await expect(rows.nth(0)).toContainText('3 plays');
  await expect(rows.nth(1)).toContainText(/Daily · No\. \d+/);
  await expect(rows.nth(1)).toContainText('3:12');
  await expect(rows.nth(2)).toContainText('Herb Garden');
  await expect(rows.nth(2)).toContainText('Medium · puzzle 1');
  await expect(rows.nth(2)).toContainText('1:05');
  await expect(rows.nth(2)).toContainText(new Date(dayAt(-3)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }));
  await checkLayout(page);
  // a longer history folds away behind a button at least 44px tall
  const more = page.locator('[data-act="all-solves"]');
  await expect(more).toHaveText('Show all ' + total);
  expect((await more.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await more.click();
  await expect(rows).toHaveCount(total);
  await checkLayout(page);
});

test('progress, streaks and solves saved by older versions carry over', async ({ page }) => {
  // the shape the first release saved: no generator versions, plays, pause flags or best/last fields
  const v1HerbsEasy = 'RDFENNELTARRAGONROSEMARYORLOVAGELAVENDERLHYSSOPRRPARSLEYDSNMINTG';
  await plantSave(page, {
    settings: { theme: 'system', sound: false, haptics: true },
    diff: 'easy', cat: 'all', last: 'd:' + isoDay(-1),
    solved: {
      ['d:' + isoDay(-1)]: { time: 140, hints: 0, at: dayAt(-1, 9), found: [] },
      ['d:' + isoDay(-2)]: { time: 260, hints: 2, at: dayAt(-2, 9), found: [] },
      'p:spices:easy:0': { time: 95, hints: 0, at: dayAt(-2, 8), found: [] },
    },
    progress: { 'p:herbs:easy:0': { found: [{ w: 'FENNEL', a: [0, 2], b: [0, 7] }], elapsed: 47, hints: 1, hintCells: [[2, 0]], at: dayAt(0, 9) } },
  });
  // the 2-day streak and the unfinished puzzle on Home
  await expect(page.locator('.streak')).toContainText('2');
  const card = page.locator('.contcard');
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('Herb Garden');
  await expect(card).toContainText('1 of 8 found');
  await checkLayout(page);
  // the puzzle reopens on its original grid with its found word, hint and time
  await card.click();
  const p = await readPuzzle(page);
  expect(p.rows.map((r) => r.join('')).join('')).toBe(v1HerbsEasy);
  await expect(page.locator('#words li.done')).toHaveCount(1);
  await expect(page.locator('#words li.done')).toContainText('FENNEL');
  await expect(page.locator('.cells span.hint')).toHaveCount(1);
  await expect(page.locator('#clock')).toHaveText(/^0:4\d$/);
  await expect(page.locator('#pausecover')).toBeHidden();
  // Stats and the past solves list read the old records
  await page.locator('.pz-bar [data-go]').click();
  await page.locator('[data-go="stats"]:visible').first().click();
  await expect(page.locator('.totals div').first()).toContainText('3');
  await expect(page.locator('.bigstreak')).toContainText('2');
  await expect(page.locator('.hist li')).toHaveCount(3);
  await expect(page.locator('.hist li').first()).toContainText('2:20');
  await checkLayout(page);
  // nothing was dropped when the app saved again
  const after = await stored(page);
  expect(Object.keys(after.solved).sort()).toEqual(['d:' + isoDay(-1), 'd:' + isoDay(-2), 'p:spices:easy:0'].sort());
  expect(after.solved['p:spices:easy:0'].time).toBe(95);
  expect(after.progress['p:herbs:easy:0'].found[0].w).toBe('FENNEL');
});
