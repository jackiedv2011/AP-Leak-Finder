// Tiny static server for the Reclaim site (no dependencies).
// Clean URLs: /platform/upload serves platform/upload/index.html.
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const port = Number(process.env.PORT) || 5510;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
};

const resolve = url => {
  const file = path.normalize(path.join(root, url));
  if (!file.startsWith(root)) return null;
  try {
    if (fs.statSync(file).isDirectory()) return path.join(file, 'index.html');
  } catch (e) { /* not found: fall through */ }
  return file;
};

http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
  // source files are not part of the site
  if (/^\/(src|blender)(\/|$)/.test(url)) { res.writeHead(404); return res.end('Not found'); }
  const file = resolve(url);
  if (!file) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    const type = types[path.extname(file)] || 'application/octet-stream';
    // byte ranges, so <video loop> can seek like it would on a real host
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (m) {
      const start = m[1] ? Number(m[1]) : Math.max(0, buf.length - Number(m[2]));
      const end = m[1] && m[2] ? Math.min(Number(m[2]), buf.length - 1) : buf.length - 1;
      if (start > end || start >= buf.length) { res.writeHead(416, { 'Content-Range': `bytes */${buf.length}` }); return res.end(); }
      res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${buf.length}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, 'Cache-Control': 'no-store' });
      return res.end(buf.subarray(start, end + 1));
    }
    res.writeHead(200, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': buf.length, 'Cache-Control': 'no-store' });
    res.end(buf);
  });
}).listen(port, () => console.log(`Reclaim site on http://localhost:${port}`));
