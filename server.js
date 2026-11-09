// Ahmet Sancaktutan — statik site sunucusu (Firebase App Hosting / Cloud Run)
// Bağımlılıksız: önbellek başlıkları, gzip, video byte-range, güvenli yol çözümleme.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, 'site');
const PORT = Number(process.env.PORT) || 8080;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif',
  '.ico': 'image/x-icon', '.mp4': 'video/mp4', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};
const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.mjs', '.json', '.svg', '.txt']);
const BLOCKED = /^\/(src|\.)|\/\.|manifest\.json$/; // derleme araçları ve gizli dosyalar dışarı kapalı

function cacheControl(ext, urlPath) {
  if (ext === '.html') return 'public, max-age=0, must-revalidate';
  if (urlPath.startsWith('/vendor/') || urlPath.startsWith('/img/') || urlPath.startsWith('/brand/') || urlPath.startsWith('/media/')) {
    return 'public, max-age=2592000, stale-while-revalidate=86400';
  }
  return 'public, max-age=3600'; // css/js — sürüm parametresiyle çağrılıyor
}

const SECURITY = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY, 'Content-Type': 'text/plain; charset=utf-8', ...headers });
  res.end(body);
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method Not Allowed', { Allow: 'GET, HEAD' });

  let urlPath;
  try { urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { return send(res, 400, 'Bad Request'); }
  if (urlPath === '/' || urlPath === '') urlPath = '/index.html';
  if (urlPath.endsWith('/')) urlPath += 'index.html';
  if (BLOCKED.test(urlPath)) return send(res, 404, 'Not Found');

  const filePath = path.normalize(path.join(ROOT, urlPath));
  if (!filePath.startsWith(ROOT + path.sep)) return send(res, 403, 'Forbidden');

  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Not Found');
    const ext = path.extname(filePath).toLowerCase();
    const etag = `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
    const base = {
      ...SECURITY,
      'Content-Type': TYPES[ext] || 'application/octet-stream',
      'Cache-Control': cacheControl(ext, urlPath),
      'Last-Modified': st.mtime.toUTCString(),
      ETag: etag,
      Vary: 'Accept-Encoding',
    };
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, base); return res.end(); }

    // Video ve büyük dosyalar için byte-range (Safari video oynatımı için gerekli)
    const range = req.headers.range;
    if (range && /^bytes=\d*-\d*$/.test(range)) {
      let [s, e] = range.slice(6).split('-');
      let start = s === '' ? st.size - Number(e) : Number(s);
      let end = s === '' || e === '' ? st.size - 1 : Number(e);
      if (Number.isNaN(start) || start < 0 || start >= st.size || end < start) {
        res.writeHead(416, { ...base, 'Content-Range': `bytes */${st.size}` }); return res.end();
      }
      end = Math.min(end, st.size - 1);
      res.writeHead(206, { ...base, 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
      if (req.method === 'HEAD') return res.end();
      return fs.createReadStream(filePath, { start, end }).pipe(res);
    }

    const accepts = String(req.headers['accept-encoding'] || '');
    if (COMPRESSIBLE.has(ext) && st.size > 1024 && /\b(br|gzip)\b/.test(accepts)) {
      const useBr = /\bbr\b/.test(accepts);
      res.writeHead(200, { ...base, 'Content-Encoding': useBr ? 'br' : 'gzip' });
      if (req.method === 'HEAD') return res.end();
      const enc = useBr ? zlib.createBrotliCompress({ params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } }) : zlib.createGzip({ level: 6 });
      return fs.createReadStream(filePath).pipe(enc).pipe(res);
    }

    res.writeHead(200, { ...base, 'Accept-Ranges': 'bytes', 'Content-Length': st.size });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => console.log(`Ahmet Sancaktutan sitesi :${PORT} üzerinde yayında`));
