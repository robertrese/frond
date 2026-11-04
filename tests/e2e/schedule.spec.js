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
