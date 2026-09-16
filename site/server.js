/* InSign — zero-dependency static server (Node built-ins only).
   Usage: node server.js [port]   (default 4173) */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const BASE_PORT = Number(process.argv[2] || process.env.PORT || 4173);
const MAX_TRIES = 10;
let PORT = BASE_PORT;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath.endsWith('/')) urlPath += 'index.html';

  // resolve within site root only
  const filePath = path.normalize(path.join(ROOT, urlPath));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 — This page has not learned to exist yet.');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

// if the port is busy (e.g. InSign is already running), quietly try the next one
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE' && PORT < BASE_PORT + MAX_TRIES) {
    console.log(`  Port ${PORT} is busy — trying ${PORT + 1}...`);
    PORT += 1;
    server.listen(PORT);
  } else {
    console.error('  Could not start the server:', err.message);
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log('');
  console.log('  InSign is running locally.');
  console.log(`  Open http://localhost:${PORT} in your browser.`);
  if (PORT !== BASE_PORT) console.log(`  (Port ${BASE_PORT} was busy, so we picked ${PORT}.)`);
  console.log('  Press Ctrl+C to stop.');
  console.log('');
});
