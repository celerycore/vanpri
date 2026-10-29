import http from 'node:http';
import { createReadStream } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webp': 'image/webp', '.ogg': 'audio/ogg', '.txt': 'text/plain; charset=utf-8', '.zip': 'application/zip' };

export function createGameServer({ root = projectRoot, basePath = '' } = {}) {
  root = path.resolve(root);
  const prefix = basePath.replace(/^\/+|\/+$/g, '');
  if (prefix.split('/').some(part => part === '.' || part === '..') || /[?#\\]/.test(prefix)) throw new Error('BASE_PATH must be a plain URL path.');
  const mount = prefix ? '/' + prefix + '/' : '/';
  return http.createServer(async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }).end('Method not allowed'); return; }
    let url, pathname;
    try { url = new URL(req.url, 'http://localhost'); pathname = decodeURIComponent(url.pathname); }
    catch { res.writeHead(400).end('Bad request'); return; }
    if (prefix) {
      if (pathname === '/' || pathname === mount.slice(0, -1)) { res.writeHead(308, { Location: mount + url.search }).end(); return; }
      if (!pathname.startsWith(mount)) { res.writeHead(404).end('Not found'); return; }
      pathname = '/' + pathname.slice(mount.length);
    }
    // The public entry is the complete game. Keep the modular source available
    // under /dev/ so a restored server never exposes a partial game by default.
    if (pathname === '/dev') { res.writeHead(308, { Location: mount + 'dev/' + url.search }).end(); return; }
    const development = pathname.startsWith('/dev/');
    if (development) pathname = pathname.slice(4);
    let entry = development ? '/src/page.html' : '/index.html';
    if (!development && (pathname === '/' || pathname === '/index.html')) {
      try { await access(path.join(root, 'dist/index.html')); entry = '/dist/index.html'; } catch { /* Plain static website folders use their own index.html. */ }
    }
    const target = path.resolve(root, '.' + (pathname === '/' || pathname === '/index.html' ? entry : pathname));
    if (!target.startsWith(root + path.sep) || pathname.includes('\0') || pathname.split('/').some(part => part.startsWith('.'))) {
      res.writeHead(403).end('Forbidden'); return;
    }
    try {
      const info = await stat(target);
      if (!info.isFile()) throw new Error('Not a file');
      const headers = { 'Content-Type': types[path.extname(target)] || 'application/octet-stream', 'Content-Length': info.size, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' };
      if (path.extname(target) === '.zip' || url.searchParams.get('download') === '1') {
        const filename = path.basename(target).replace(/["\r\n]/g, '_');
        headers['Content-Disposition'] = `attachment; filename="${filename}"`;
        headers['Cache-Control'] = 'no-store';
      }
      res.writeHead(200, headers);
      if (req.method === 'HEAD') res.end();
      else createReadStream(target).on('error', () => res.destroy()).pipe(res);
    } catch { res.writeHead(404).end('Not found'); }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // Fresh source ZIPs omit generated files. Prepare downloads on the first start.
  try { await Promise.all(['dist/index.html', 'dist/downloads/Vanguard-Princess-Playable.zip'].map(file => access(path.join(projectRoot, file)))); }
  catch { const { buildDistribution } = await import('./tools/build-standalone.mjs'); await buildDistribution(); }
  const server = createGameServer({ basePath: process.env.BASE_PATH || '' });
  server.listen(Number(process.env.PORT || 3000), '0.0.0.0', () => console.log(`Vanguard Princess server listening on port ${server.address().port}${process.env.BASE_PATH ? ' under ' + process.env.BASE_PATH : ''}`));
}
