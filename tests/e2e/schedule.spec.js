// End-to-end: the new daily schedule starts at local midnight on 6 Nov 2026 in every time zone,
// nothing before it changes, and the first 31 new dailies open and can be solved.
// The browser clock is pinned with Playwright's clock; timers keep running.
const { test, expect } = require('@playwright/test');
const { readPuzzle, drag, tapEnds } = require('./helpers');

const NAMES = {
  countries: 'Countries', tropical: 'Tropical Garden', sports: 'Sports Day', ocean: 'Ocean Life', ghana: 'Ghana', fruit: 'Fruit Bowl',
  music: 'Music Room', birds: 'Rainforest Birds', nature: 'Nature Walk', baking: 'Baker’s Shelf', sky: 'Night Sky', herbs: 'Herb Garden',
  vegetables: 'Vegetable Patch', coast: 'Coastline', farm: 'Farmyard', insects: 'Meadow Insects', spices: 'Spice Rack',
  mountain: 'Mountain Trail', wildflowers: 'Wildflowers', desert: 'Desert Bloom', trees: 'Woodland Trees',
};
// the new rotation, in schedule order from 6 Nov 2026
const ROTATION = ['countries', 'tropical', 'sports', 'ocean', 'ghana', 'fruit', 'music', 'birds', 'nature', 'baking', 'sky', 'herbs',
  'vegetables', 'coast', 'farm', 'insects', 'spices', 'mountain', 'wildflowers', 'desert', 'trees'];

async function solveAll(page) {
  const p = await readPuzzle(page);
  for (const [i, w] of p.words.map((x) => x.word).entries()) { if (i % 2) await tapEnds(page, p, w); else await drag(page, p, w); }
  await expect(page.locator('.big-stamp')).toBeVisible({ timeout: 5000 });
  return p;
}

test('the earliest and latest time zones switch to the new schedule at their own midnight on 6 Nov', async ({ browser }) => {
  test.skip(test.info().project.name !== 'desktop', 'time zones are independent of screen size');
  const cases = [
    // [UTC instant, time zone, local date there, theme expected]
    ['2026-11-04T19:00:00Z', 'Europe/London', '4 Nov', 'Wildflowers'],
    ['2026-11-05T09:59:00Z', 'Pacific/Kiritimati', '5 Nov 23:59 (UTC+14, first to 6 Nov)', 'Woodland Trees'],
    ['2026-11-05T10:00:00Z', 'Pacific/Kiritimati', '6 Nov 00:00 (UTC+14)', 'Countries'],
    ['2026-11-06T10:59:00Z', 'Pacific/Pago_Pago', '5 Nov 23:59 (UTC-11, among the last)', 'Woodland Trees'],
    ['2026-11-06T11:00:00Z', 'Pacific/Pago_Pago', '6 Nov 00:00 (UTC-11)', 'Countries'],
  ];
  for (const [instant, timezoneId, label, theme] of cases) {
    const ctx = await browser.newContext({ timezoneId });
    const page = await ctx.newPage();
    await page.clock.setFixedTime(new Date(instant));
    await page.goto('./');
    await expect(page.locator('#h-daily'), timezoneId + ' at ' + label).toHaveText(theme);
    await ctx.close();
  }
});

test('the 6 Nov daily is Countries and plays to the end', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-06T12:00:00'));
  await page.goto('./');
  await expect(page.locator('#h-daily')).toHaveText('Countries');
  await page.getByRole('button', { name: /Play today/ }).click();
  const p = await solveAll(page);
  expect(p.words).toHaveLength(9);
  await expect(page.locator('.big-stamp')).toHaveText('World tour done');
  await expect(page.locator('.mini .hls .hl')).toHaveCount(9);
  const save = await page.evaluate(() => JSON.parse(localStorage.getItem('frond.v1')));
  expect(save.solved['d:2026-11-06'].gv).toBe(4);
});

test('the 30 dailies after 6 Nov open on the right theme and can all be solved', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop', 'one full sweep is enough; the 6 Nov test runs on every phone setup');
  test.setTimeout(240_000);
  for (let k = 1; k <= 30; k++) {
    const day = new Date(2026, 10, 6 + k, 12);
    await page.clock.setFixedTime(day);
    await page.goto('./');
    const label = day.toDateString();
    await expect(page.locator('#h-daily'), label).toHaveText(NAMES[ROTATION[k % ROTATION.length]]);
    await page.getByRole('button', { name: /Play today/ }).click();
    const p = await solveAll(page);
    expect(p.words, label).toHaveLength(9);
    await page.locator('.done-top [data-go]').click(); // back to Home (the app reopens the last screen after a reload)
  }
});

test('the dailies before 6 Nov keep their original themes', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop', 'dates are independent of screen size');
  for (const [day, theme] of [['2026-11-02', 'Tropical Garden'], ['2026-11-03', 'Herb Garden'], ['2026-11-04', 'Wildflowers'], ['2026-11-05', 'Woodland Trees']]) {
    await page.clock.setFixedTime(new Date(day + 'T12:00:00'));
    await page.goto('./');
    await expect(page.locator('#h-daily'), day).toHaveText(theme);
  }
});

// Past dailies from before the v5 rules (14 Nov 2026): a player who never started one gets it on the
// current generator; anyone who started or solved it keeps the grid they had. Seen on 23 Nov 2026.
const NOV7 = 'd:2026-11-07';
const NOV7_V4 = 'JDMLAPIEJASMINEAAIREMULPNADNAPOTOALLINAVMEOLAOCLUILIMEAOTUNOCOCI'; // as released (v4)
const NOV7_V5 = 'PSECFERNAWLAENALPORCHIDJAAIAEMRAYENOVSLIAALDAAOOBANOAJUCBANYANFG'; // current rules (v5)
async function openOld(page, save) {
  await page.clock.setFixedTime(new Date('2026-11-23T12:00:00'));
  await page.goto('./manifest.webmanifest');
  await page.evaluate((d) => localStorage.setItem('frond.v1', JSON.stringify(d)), { solved: {}, progress: {}, ...save, view: { name: 'puzzle', arg: NOV7 } });
  await page.goto('./');
  await expect(page.locator('#board .cells span')).toHaveCount(64);
  return page.locator('#board .cells span').evaluateAll((els) => els.map((e) => e.textContent).join(''));
}
const savedGv = (page) => page.evaluate((id) => { const s = JSON.parse(localStorage.getItem('frond.v1')); return (s.progress[id] || s.solved[id]).gv; }, NOV7);

test('an unstarted past daily from before 14 Nov opens on the current rules', async ({ page }) => {
  expect(await openOld(page, {})).toBe(NOV7_V5);
  await expect(page.locator('.pz-help, #pz-help').first()).toContainText('all 8 directions');
  const p = await readPuzzle(page);
  await drag(page, p, p.words[0].word);
  await expect(page.locator('#words li.done')).toHaveCount(1);
  await page.evaluate(() => dispatchEvent(new Event('pagehide')));
  expect(await savedGv(page)).toBe(5);
});

test('a past daily that was only opened before (nothing found) also moves to the current rules', async ({ page }) => {
  const opened = { found: [], elapsed: 40, hints: 0, hintCells: [], at: Date.now(), gv: 4 };
  expect(await openOld(page, { progress: { [NOV7]: opened } })).toBe(NOV7_V5);
  await expect(page.locator('#clock')).toHaveText(/^0:0\d$/);
  await page.evaluate(() => dispatchEvent(new Event('pagehide')));
  expect(await savedGv(page)).toBe(5);
});

test('a started past daily keeps its original grid and progress', async ({ page }) => {
  const started = { found: [{ w: 'ALOE', a: [5, 4], b: [5, 1] }], elapsed: 95, hints: 0, hintCells: [], at: Date.now(), gv: 4 };
  expect(await openOld(page, { progress: { [NOV7]: started } })).toBe(NOV7_V4);
  await expect(page.locator('#words li.done')).toHaveCount(1);
  await expect(page.locator('#count')).toHaveText('1 / 9 found');
  await expect(page.locator('#clock')).toHaveText(/^1:3\d$/);
  await page.evaluate(() => dispatchEvent(new Event('pagehide')));
  expect(await savedGv(page)).toBe(4);
});

test('a solved past daily keeps its original grid and record', async ({ page }) => {
  const rec = { time: 210, hints: 0, at: new Date('2026-11-07T10:00:00').getTime(), found: [], gv: 4 };
  expect(await openOld(page, { solved: { [NOV7]: rec } })).toBe(NOV7_V4);
  const s = await page.evaluate(() => JSON.parse(localStorage.getItem('frond.v1')));
  expect(s.solved[NOV7]).toMatchObject({ time: 210, gv: 4 });
});
