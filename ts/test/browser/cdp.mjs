// A minimal, dependency-free Chrome DevTools Protocol driver (Node 24 has a built-in WebSocket client). It launches an installed Chrome or Edge in
// headless mode on a loopback-only debugging port with a throw-away profile, and offers just what the Console journey needs: navigate, evaluate,
// real mouse clicks, screenshots. Local only: the browser is only ever pointed at http://127.0.0.1.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function findBrowser() {
  const candidates = [
    process.env.TOBIN_BROWSER,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ].filter(Boolean);
  return candidates.find((p) => existsSync(p));
}

export async function launchBrowser({ exe, port, profileDir }) {
  rmSync(profileDir, { recursive: true, force: true });
  mkdirSync(profileDir, { recursive: true });
  const child = spawn(
    exe,
    [
      '--headless=new', `--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1', `--user-data-dir=${profileDir}`,
      '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-sync', '--disable-background-networking',
      '--disable-component-update', '--disable-default-apps', '--disable-gpu', '--hide-scrollbars', `--window-size=${process.env.TOBIN_WIDTH ?? 1200},1500`, 'about:blank',
    ],
    { stdio: 'ignore' },
  );
  for (let i = 0; i < 100; i++) {
    try {
      const v = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
      return { child, version: v.Browser, port };
    } catch {
      await sleep(150);
    }
  }
  child.kill();
  throw new Error('the browser did not start');
}

export class Page {
  constructor(ws, id, port) {
    this.ws = ws;
    this.id = id;
    this.port = port;
    this.n = 0;
    this.pending = new Map();
    this.listeners = [];
    this.errors = [];
    ws.addEventListener('message', (m) => {
      const msg = JSON.parse(String(m.data));
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(`${msg.error.message}`)) : resolve(msg.result);
      } else if (msg.method) {
        if (msg.method === 'Runtime.exceptionThrown') this.errors.push(`exception: ${msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text}`);
        if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') this.errors.push(`console.error: ${msg.params.args.map((a) => a.value ?? a.description).join(' ')}`);
        for (const l of this.listeners) l(msg);
      }
    });
  }

  static async open(port, url = 'about:blank') {
    const t = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json();
    const ws = new WebSocket(t.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.addEventListener('open', res, { once: true });
      ws.addEventListener('error', rej, { once: true });
    });
    const p = new Page(ws, t.id, port);
    await p.send('Page.enable');
    await p.send('Runtime.enable');
    await p.send('Emulation.setDeviceMetricsOverride', { width: Number(process.env.TOBIN_WIDTH ?? 1200), height: 1500, deviceScaleFactor: 1, mobile: false });
    return p;
  }

  send(method, params = {}) {
    const id = ++this.n;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async navigate(url) {
    const loaded = new Promise((res) => {
      const l = (m) => {
        if (m.method === 'Page.loadEventFired') {
          this.listeners = this.listeners.filter((x) => x !== l);
          res();
        }
      };
      this.listeners.push(l);
    });
    await this.send('Page.navigate', { url });
    await loaded;
  }

  async reload() {
    await this.send('Page.bringToFront');
    const loaded = new Promise((res) => {
      const l = (m) => {
        if (m.method === 'Page.loadEventFired') {
          this.listeners = this.listeners.filter((x) => x !== l);
          res();
        }
      };
      this.listeners.push(l);
    });
    await this.send('Page.reload', { ignoreCache: true });
    await loaded;
  }

  /** Evaluate an expression in the page; resolves promises; returns the JSON value. Throws on a page exception. */
  async ev(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(`page exception: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    return r.result.value;
  }

  async waitFor(expression, { timeout = 10000, what = expression } = {}) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      if (await this.ev(`Boolean(${expression})`)) return true;
      await sleep(80);
    }
    throw new Error(`timed out waiting for: ${what}`);
  }

  /** A real mouse click (move, press, release) at the centre of the element the expression returns, scrolled into view. */
  async click(elementExpression) {
    const pt = await this.ev(`(() => { const el = ${elementExpression}; if (!el) return null; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2, r.width, r.height]; })()`);
    if (!pt || pt[2] === 0) throw new Error(`nothing visible to click for: ${elementExpression}`);
    const [x, y] = pt;
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    await sleep(120);
  }

  async screenshot(path) {
    await this.send('Page.bringToFront');
    const m = await this.send('Page.getLayoutMetrics');
    const w = Math.ceil(m.cssContentSize?.width ?? 1200);
    const h = Math.min(Math.ceil(m.cssContentSize?.height ?? 1500), 6000);
    const r = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: w, height: h, scale: 1 } });
    writeFileSync(path, Buffer.from(r.data, 'base64'));
  }

  async close() {
    try {
      this.ws.close();
      await fetch(`http://127.0.0.1:${this.port}/json/close/${this.id}`);
    } catch {}
  }
}
