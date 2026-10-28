// Local server for the Tobin Console. LOCAL ONLY: binds to 127.0.0.1, talks to no Stellar network, holds no keys, signs nothing.
// It serves the page and forwards the Console's prepared calls to the LOCAL SANDBOX: the real TobinClearingV1 and TobinTestToken running in the
// Soroban test host through the Rust development bridge (core/clearing/examples/bridge.rs).
//
//   cd core && cargo build --offline -p tobin-clearing-v1 --example bridge
//   cd ts   && npm ci && npm run build:console
//   TOBIN_BRIDGE_EXE=<target>/debug/examples/bridge.exe node console/server.mjs         then open http://127.0.0.1:8787/
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startSandbox } from '../src/local/bridge.ts';
import { toHex } from '../src/amount.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const exe = process.env.TOBIN_BRIDGE_EXE;
const port = Number(process.env.PORT ?? 8787);
if (!exe) {
  console.error('TOBIN_BRIDGE_EXE is not set: build the Rust development bridge first (see the header of this file).');
  process.exit(1);
}

const ALLOWED_HOSTS = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
const ALLOWED_ORIGINS = new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`]);

const NAMES = ['Alice', 'Bob', 'Carol', 'Dave', 'Erin'];
let sandboxPromise;

async function boot() {
  const sb = await startSandbox(exe, { actors: [...NAMES, 'Minter'], minter: 'Minter', cap: 1_000_000n });
  const second = String((await sb.bridge.request({ cmd: 'token', minter: sb.actors.Minter, cap: '500000' })).address);
  return {
    sb,
    info: {
      description: sb.transport.description,
      clearing: sb.clearing,
      networkId: toHex(sb.networkId),
      personas: NAMES.map((name) => ({ name, address: sb.actors[name] })),
      tokens: [
        { name: 'TTT-A', address: sb.token, cap: '1000000' },
        { name: 'TTT-B', address: second, cap: '500000' },
      ],
    },
  };
}

const sandbox = () => (sandboxPromise ??= boot());

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.map': 'application/json' };

async function body(req) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > 1_000_000) throw new Error('request too large');
    chunks.push(c);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    // Defence in depth for a local sandbox page: it may not be framed by another site, sniffed, or load anything but its own files.
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('referrer-policy', 'no-referrer');
    res.setHeader('x-frame-options', 'DENY');
    res.setHeader('content-security-policy', "default-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'");
    // A web page in the user's browser must not be able to drive this local sandbox: only this server's own names are accepted as Host (DNS
    // rebinding), a foreign Origin is refused on the API (cross-site requests), and writes must be JSON (a text/plain POST needs no CORS
    // preflight, so the server itself has to refuse it). No CORS header is ever sent.
    if (!ALLOWED_HOSTS.has(String(req.headers.host))) {
      res.writeHead(403, { 'content-type': 'text/plain' }).end('forbidden host');
      return;
    }
    const origin = req.headers.origin;
    if (origin !== undefined && !ALLOWED_ORIGINS.has(String(origin)) && url.pathname.startsWith('/api/')) {
      res.writeHead(403, { 'content-type': 'text/plain' }).end('forbidden origin');
      return;
    }
    if (req.method === 'POST' && !String(req.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) {
      res.writeHead(415, { 'content-type': 'text/plain' }).end('application/json required');
      return;
    }
    if (url.pathname === '/api/bootstrap') {
      const { info } = await sandbox();
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(info));
      return;
    }
    if (url.pathname === '/api/rpc' && req.method === 'POST') {
      const { sb, info } = await sandbox();
      const { call, authorize } = await body(req);
      const known = new Set([info.clearing, ...info.tokens.map((t) => t.address)]);
      if (!call || !known.has(call.contract)) {
        res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: false, errorType: 'Protocol', code: null, detail: 'unknown contract' }));
        return;
      }
      const result = await sb.transport.invoke(call, authorize ? { authorize } : undefined);
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(result));
      return;
    }
    // static files: the page, its stylesheet and the compiled scripts only
    const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const file = resolve(join(here, normalize(rel)));
    const dist = resolve(here, 'dist') + sep;
    if (!(file === resolve(here, 'index.html') || file === resolve(here, 'styles.css') || file.startsWith(dist))) {
      res.writeHead(404).end('not found');
      return;
    }
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' }).end(data);
  } catch (e) {
    res.writeHead(500, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: false, errorType: 'Server', code: null, detail: String(e) }));
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Tobin Console (LOCAL SANDBOX; no network, no wallet) on http://127.0.0.1:${port}/`);
});
