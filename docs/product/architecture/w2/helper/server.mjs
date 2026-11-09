// W2 validation helper (disposable). Binds 127.0.0.1 only. Serves a fixed page, vendored browser bundles, the SDK prepare/intent output for two
// fixed operations, an allow-listed JSON-RPC proxy to the Stellar Testnet RPC, and an in-memory relay of PUBLIC authorization material.
// sendTransaction is REFUSED unless the process is started with W2_ALLOW_SUBMIT=<exact value in AUTHORIZED.txt>; it is not, at this checkpoint.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const ROOT = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const REPO = process.env.TOBIN_REPO;
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const prep = await import(pathToFileURL(path.join(REPO, 'packages/mvp1-sdk/src/sdk/prepare.ts')).href);
const intentMod = await import(pathToFileURL(path.join(REPO, 'packages/mvp1-sdk/src/sdk/intent.ts')).href);
const PORT = Number(process.env.PORT || 8799);
const HOST = '127.0.0.1';
const RPC_ALLOW = new Set(['getLatestLedger', 'getNetwork', 'getHealth', 'getLedgerEntries', 'simulateTransaction', 'getTransaction', 'sendTransaction']);
const submitAllowed = process.env.W2_ALLOW_SUBMIT && fs.existsSync(path.join(ROOT, 'AUTHORIZED.txt')) &&
  fs.readFileSync(path.join(ROOT, 'AUTHORIZED.txt'), 'utf8').trim() === process.env.W2_ALLOW_SUBMIT;
const dep = intentMod.parseDeploymentRecord(JSON.stringify({ version: 1, network_passphrase: cfg.passphrase, clearing: cfg.clearing, token: cfg.token }));
const MAX_PREPARE_ATTEMPTS = 3;
const attempts = {};
const relay = { pending: null }; // public data only
const log = (o) => fs.appendFileSync(path.join(ROOT, 'evidence', 'rpc-log.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...o }) + '\n');

const FIXED = {
  create: () => prep.prepareCreateSession(cfg.clearing, { creator: cfg.accounts.A, sessionId: cfg.sessionId, token: cfg.token, maxParticipants: cfg.maxParticipants, maxObligations: cfg.maxObligations }),
  join_B: () => prep.prepareJoin(cfg.clearing, { sessionId: cfg.sessionId, participant: cfg.accounts.B, creator: cfg.accounts.A }),
  join_C: () => prep.prepareJoin(cfg.clearing, { sessionId: cfg.sessionId, participant: cfg.accounts.C, creator: cfg.accounts.A }),
};

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const VENDOR = {
  '/vendor/freighter-api.js': path.join(ROOT, 'node_modules/@stellar/freighter-api/build/index.min.js'),
  '/vendor/stellar-sdk.js': path.join(ROOT, 'node_modules/@stellar/stellar-sdk/dist/stellar-sdk.min.js'),
};

function body(req, max = 262144) {
  return new Promise((res, rej) => {
    let n = 0; const chunks = [];
    req.on('data', (c) => { n += c.length; if (n > max) { rej(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => res(Buffer.concat(chunks).toString('utf8')));
  });
}
const send = (res, code, obj, type = 'application/json') => {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'self'; connect-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'" });
  res.end(typeof obj === 'string' || Buffer.isBuffer(obj) ? obj : JSON.stringify(obj));
};

const server = http.createServer(async (req, res) => {
  try {
    const host = req.headers.host || '';
    if (host !== `${HOST}:${PORT}` && host !== `localhost:${PORT}`) return send(res, 403, { error: 'bad host' });
    if (req.method === 'POST') {
      const o = req.headers.origin;
      if (o && o !== `http://${HOST}:${PORT}` && o !== `http://localhost:${PORT}`) return send(res, 403, { error: 'bad origin' });
      if (!String(req.headers['content-type'] || '').startsWith('application/json')) return send(res, 415, { error: 'json only' });
    }
    const u = new URL(req.url, `http://${HOST}:${PORT}`);
    if (req.method === 'GET' && u.pathname === '/api/config') {
      return send(res, 200, { ...cfg, submitEnabled: submitAllowed, maxAuthLifetimeLedgers: 10, ops: Object.keys(FIXED) });
    }
    if (req.method === 'POST' && u.pathname === '/api/prepare') {
      const { op } = JSON.parse(await body(req));
      if (op === 'read_session') {
        const call = prep.prepareQuery(cfg.clearing, 'get_session', [{ t: 'bytes32', v: cfg.sessionId }]);
        return send(res, 200, { op, call, intent: null });
      }
      if (!Object.hasOwn(FIXED, op)) return send(res, 400, { error: 'unknown operation (only create, join_B, join_C, read_session)' });
      // execution-record stop condition 6: at most three preparation attempts per operation per helper process
      attempts[op] = (attempts[op] || 0) + 1;
      if (attempts[op] > MAX_PREPARE_ATTEMPTS) {
        log({ dir: 'blocked', reason: 'prepare attempt limit', op });
        return send(res, 429, { error: `preparation attempt limit (${MAX_PREPARE_ATTEMPTS}) reached for ${op}: stop and report` });
      }
      const call = FIXED[op]();
      const intent = intentMod.intentFromRequirements(dep, call.auths);
      return send(res, 200, { op, call, intent });
    }
    if (req.method === 'POST' && u.pathname === '/api/rpc') {
      const rq = JSON.parse(await body(req));
      if (!rq || typeof rq.method !== 'string' || !RPC_ALLOW.has(rq.method)) return send(res, 403, { error: 'rpc method not allowed' });
      if (rq.method === 'sendTransaction' && !submitAllowed) {
        log({ dir: 'blocked', method: rq.method });
        return send(res, 403, { error: 'SUBMISSION DISABLED: no owner authorization for this process (W2 checkpoint)' });
      }
      const r = await fetch(cfg.rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(rq), signal: AbortSignal.timeout(20000) });
      const text = await r.text();
      log({ dir: 'rpc', method: rq.method, status: r.status, request: rq.method === 'sendTransaction' ? rq.params : undefined, bytes: text.length, sha256: crypto.createHash('sha256').update(text).digest('hex'), response: text.length < 20000 ? JSON.parse(text) : '[large]' });
      return send(res, r.status, text);
    }
    if (u.pathname === '/api/relay') {
      if (req.method === 'GET') return send(res, 200, relay.pending ?? { empty: true });
      const v = JSON.parse(await body(req, 65536));
      relay.pending = v; // public XDR only; never secrets
      return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && u.pathname === '/api/evidence') {
      const v = JSON.parse(await body(req, 65536));
      fs.appendFileSync(path.join(ROOT, 'evidence', 'client-log.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...v }) + '\n');
      return send(res, 200, { ok: true });
    }
    if (req.method === 'GET' && VENDOR[u.pathname]) return send(res, 200, fs.readFileSync(VENDOR[u.pathname]), 'text/javascript; charset=utf-8');
    if (req.method === 'GET') {
      const f = u.pathname === '/' ? 'index.html' : u.pathname.slice(1);
      if (!/^[a-z0-9.-]+$/i.test(f) || !fs.existsSync(path.join(ROOT, 'public', f))) return send(res, 404, { error: 'not found' });
      return send(res, 200, fs.readFileSync(path.join(ROOT, 'public', f)), MIME[path.extname(f)] || 'application/octet-stream');
    }
    return send(res, 405, { error: 'method not allowed' });
  } catch (e) {
    return send(res, 500, { error: String(e.message || e) });
  }
});
server.listen(PORT, HOST, () => console.log(`W2 helper on http://${HOST}:${PORT} (submission ${submitAllowed ? 'ENABLED' : 'DISABLED'})`));
