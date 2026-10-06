#!/usr/bin/env node
// Minimal static server for the exported browser build (no dependencies). Local use only.
//   node scripts/serve-web.js [dir=dist-web] [--port 8090] [--lan]
// Default binds 127.0.0.1. --lan binds 0.0.0.0 so a tablet on the same network can open
// http://<this computer's LAN IP>:<port>. No special headers are needed by this build; .wasm is
// served as application/wasm. Unknown paths fall back to index.html.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ico': 'image/x-icon', '.ttf': 'font/ttf' };

/** Serve `dir` on host:port. Resolves with the server once listening. */
function serve(dir, port, host = '127.0.0.1') {
  if (!fs.existsSync(path.join(dir, 'index.html'))) throw new Error(`No index.html in ${dir}. Run: npm run web:export`);
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
    let file = path.normalize(path.join(dir, url));
    if (!file.startsWith(dir)) return void (res.writeHead(403), res.end());
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dir, 'index.html');
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve(server));
  });
}

module.exports = { serve };

if (require.main === module) {
  const args = process.argv.slice(2);
  const dir = path.resolve(args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--port') ?? path.join(__dirname, '..', 'dist-web'));
  const port = Number(args[args.indexOf('--port') + 1]) || 8090;
  const host = args.includes('--lan') ? '0.0.0.0' : '127.0.0.1';
  serve(dir, port, host).then(
    () => {
      console.log(`Serving ${dir}`);
      console.log(`  this computer: http://localhost:${port}/`);
      if (host === '0.0.0.0') {
        for (const nets of Object.values(os.networkInterfaces())) for (const n of nets ?? []) if (n.family === 'IPv4' && !n.internal) console.log(`  same network:  http://${n.address}:${port}/`);
      }
    },
    (e) => {
      console.error(e.message);
      process.exit(1);
    },
  );
}
