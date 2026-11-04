// Records every daily's theme and grid so tests can prove a played daily never changes.
// Usage: node tools/snapshot-dailies.js [app.js path] [--keep-through YYYY-MM-DD]
//   app.js path      which game code to snapshot (default src/app.js); pass the deployed version
//   --keep-through   keep existing entries up to this date unchanged and only refresh later ones
// Writes tests/daily-snapshot.json: { "YYYY-MM-DD": "theme-id gv sha" } for two years from launch.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const keepAt = args.indexOf('--keep-through');
const keep = keepAt >= 0 ? args[keepAt + 1] : null;
const appPath = args.find((a, i) => !a.startsWith('--') && i !== keepAt + 1) || path.join(root, 'src/app.js');
const out = path.join(root, 'tests/daily-snapshot.json');

const win = {};
new Function('window', fs.readFileSync(path.join(root, 'src/words.js'), 'utf8'))(win);
const app = fs.readFileSync(appPath, 'utf8');
const cut = (a, b) => app.slice(app.indexOf(a), app.indexOf(b));
const G = new Function('window', cut('const DATA', '/* ---------- storage') + cut('const pad =', '/* ---------- puzzle generation') +
  cut('/* ---------- puzzle generation', '/* ---------- streaks') + 'return { LAUNCH, puzzle, dailyId, iso, addDays, parse };')(win);

const old = keep && fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : {};
const snap = {};
for (let k = 0; k < 731; k++) {
  const d = G.iso(G.addDays(G.parse(G.LAUNCH), k));
  if (keep && d <= keep && old[d]) { snap[d] = old[d]; continue; }
  const q = G.puzzle(G.dailyId(d));
  snap[d] = q.pack.id + ' v' + q.gv + ' ' + crypto.createHash('sha256').update(q.rows.join('')).digest('hex').slice(0, 16);
}
fs.writeFileSync(out, JSON.stringify(snap, null, 0).replace(/,"/g, ',\n"') + '\n');
console.log('wrote ' + Object.keys(snap).length + ' dailies to ' + path.relative(root, out) + (keep ? ' (kept entries through ' + keep + ')' : ''));
