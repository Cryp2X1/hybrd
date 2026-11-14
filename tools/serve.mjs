// Mimics GitHub Pages for a project site: serves dist/ under /<base>/ and falls back to 404.html.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const base = process.env.BASE || '/hybrd/';
const port = +(process.env.PORT || 4173);
const root = new URL('../dist/', import.meta.url).pathname;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.webmanifest': 'application/manifest+json' };
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (!url.pathname.startsWith(base)) { res.writeHead(404); return res.end('not found'); }
  let p = normalize(join(root, decodeURIComponent(url.pathname.slice(base.length))));
  try { const s = await stat(p); if (s.isDirectory()) p = join(p, 'index.html'); const b = await readFile(p); res.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream' }); return res.end(b); }
  catch { const b = await readFile(join(root, '404.html')); res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' }); res.end(b); }
}).listen(port, () => console.log(`serving http://localhost:${port}${base}`));
