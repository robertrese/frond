// Shared steps for the end-to-end tests: open puzzles, read the grid, and select words by
// finger (real touch events) on phone projects or by mouse on desktop.
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
    // the list shows display names (PASSION FRUIT, CÔTE D'IVOIRE); the grid uses plain A-Z
    const toGrid = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z]/g, '');
    const words = [...document.querySelectorAll('#words li')].map((li) => ({ word: toGrid(li.lastElementChild.textContent), shown: li.lastElementChild.textContent, done: li.classList.contains('done') }));
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

const seconds = (text) => { const [m, s] = text.split(':').map(Number); return m * 60 + s; };

module.exports = { DIRS, isTouch, openDaily, readPuzzle, locate, point, touchDrag, mouseDrag, drag, tapEnds, seconds };
