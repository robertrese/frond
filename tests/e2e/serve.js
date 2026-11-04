// Serves site/ at http://127.0.0.1:4173/frond/ so tests run under the same subfolder as GitHub Pages.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const site = path.resolve(__dirname, '..', '..', 'site');
const PORT = Number(process.env.PORT || 4173);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (!url.pathname.startsWith('/frond/')) { res.writeHead(url.pathname === '/frond' ? 301 : 404, { Location: '/frond/' }); return res.end(); }
  let file = path.join(site, decodeURIComponent(url.pathname.slice('/frond/'.length)));
  if (!file.startsWith(site)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  fs.readFile(file, (err, body) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(body);
  });
}).listen(PORT, '127.0.0.1', () => console.log('serving ' + site + ' at http://127.0.0.1:' + PORT + '/frond/'));
