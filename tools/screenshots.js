// Captures every screen at 360px, 390px and desktop, in light and dark, with realistic saved data.
// Usage: node tools/screenshots.js <out dir> [base url]   (default base: http://127.0.0.1:4173/frond/, see tests/e2e/serve.js)
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium, devices } = require('@playwright/test');

const out = path.resolve(process.argv[2] || 'screenshots');
const base = process.argv[3] || 'http://127.0.0.1:4173/frond/';
fs.mkdirSync(out, { recursive: true });
const DIRS = [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0], [1, -1], [-1, -1]];
const isoDay = (o) => { const d = new Date(); d.setDate(d.getDate() + o); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const dayAt = (o) => new Date(isoDay(o) + 'T10:00:00').getTime();

function seed() {
  const solved = {};
  for (let k = 1; k <= 6; k++) solved['d:' + isoDay(-k)] = { time: 150 + k * 17, hints: k % 3 === 0 ? 1 : 0, at: dayAt(-k), found: [], gv: 5 };
  solved['p:herbs:easy:0'] = { time: 95, hints: 0, at: dayAt(-2), found: [], gv: 5 };
  solved['p:ghana:medium:0'] = { time: 268, hints: 1, at: dayAt(-3), found: [], gv: 5, plays: 2 };
  return { solved, progress: { 'p:countries:hard:1': { found: [], elapsed: 252, hints: 0, hintCells: [], at: Date.now() - 3600e3, gv: 5 } } };
}

async function readGrid(page) {
  return page.evaluate(() => {
    const rows = [];
    document.querySelectorAll('#board .cells span').forEach((s) => { (rows[+s.dataset.r] ||= [])[+s.dataset.c] = s.textContent; });
    const toGrid = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z]/g, '');
    return { n: rows.length, rows, words: [...document.querySelectorAll('#words li:not(.done)')].map((li) => toGrid(li.lastElementChild.textContent)) };
  });
}
function locate(p, w) {
  for (let r = 0; r < p.n; r++) for (let c = 0; c < p.n; c++) for (const [dr, dc] of DIRS) {
    let k = 0;
    while (k < w.length && (p.rows[r + dr * k] || [])[c + dc * k] === w[k]) k++;
    if (k === w.length) return [[r, c], [r + dr * (k - 1), c + dc * (k - 1)]];
  }
}
async function find(page, words) {
  const p = await readGrid(page), box = await page.locator('#board').boundingBox();
  for (const w of words) {
    const [a, b] = locate(p, w);
    const pt = ([r, c]) => [box.x + (c + 0.5) * box.width / p.n, box.y + (r + 0.5) * box.height / p.n];
    await page.mouse.move(...pt(a)); await page.mouse.down(); await page.mouse.move(...pt(b), { steps: 6 }); await page.mouse.up();
  }
  return p;
}

(async () => {
  const browser = await chromium.launch();
  const sizes = [['360', { ...devices['Pixel 7'], viewport: { width: 360, height: 780 } }], ['390', { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } }], ['desktop', { viewport: { width: 1440, height: 900 } }]];
  for (const [size, opts] of sizes) for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ ...opts, colorScheme: scheme, hasTouch: false, isMobile: false });
    const page = await ctx.newPage();
    await page.goto(base + 'manifest.webmanifest');
    await page.evaluate((d) => localStorage.setItem('frond.v1', JSON.stringify(d)), seed());
    await page.goto(base);
    const shot = async (name) => { await page.waitForTimeout(450); await page.screenshot({ path: path.join(out, size + '-' + scheme + '-' + name + '.png'), fullPage: size !== 'desktop' }); };
    await shot('1-home');
    for (const [i, k] of [['2', 'library'], ['5', 'stats'], ['6', 'settings']]) {
      await page.locator('[data-go="' + k + '"]:visible').first().click();
      await shot(i + '-' + k);
    }
    await page.locator('[data-go="home"]:visible').first().click();
    await page.locator('.daily [data-play]').click();
    const p = await readGrid(page);
    await find(page, p.words.slice(0, 3));
    await shot('3-puzzle');
    await find(page, p.words.slice(3));
    await page.waitForSelector('.big-stamp');
    await page.waitForTimeout(500);
    await shot('4-completion');
    await ctx.close();
    console.log('captured', size, scheme);
  }
  await browser.close();
})();
