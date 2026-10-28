// Live-scroll check of the sticky "LOCAL SANDBOX" badge in a real browser (headless Chrome over CDP), at 420px and 1200px. A short viewport
// (height 500) makes the page genuinely scroll. Needs TOBIN_BRIDGE_EXE and the built page (console/dist). Local only.
//   node test/browser/badge.mjs
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Page, findBrowser, launchBrowser, sleep } from './cdp.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const PORT = 31000 + Math.floor(Math.random() * 3000);
const DEBUG = 34000 + Math.floor(Math.random() * 3000);
const server = spawn(process.execPath, [join(root, '..', '..', 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', '--hostname', '127.0.0.1', '--port', String(PORT)], { cwd: root, env: { ...process.env, PORT: String(PORT), NODE_ENV: 'production' }, stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('server did not start')), 20000);
  server.stdout.on('data', (d) => { if (String(d).includes('Ready')) { clearTimeout(t); res(); } });
});
const exe = findBrowser();
const browser = await launchBrowser({ exe, port: DEBUG, profileDir: join(root, 'test', 'browser', '.badge-profile') });
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ' :: ' + detail}`); if (!ok) failed++; };
try {
  for (const width of [420, 1200]) {
    const p = await Page.open(DEBUG, `http://127.0.0.1:${PORT}/`);
    await p.send('Emulation.setDeviceMetricsOverride', { width, height: 500, deviceScaleFactor: 1, mobile: false });
    await p.waitFor(`document.querySelector('.badge')`, { what: 'the badge' });
    // make the page long enough to scroll: select a session and create it with the page's own controls is unnecessary; the account table and banner already exceed 500px at both widths
    const tall = await p.ev(`document.documentElement.scrollHeight`);
    check(`[${width}px] the page is taller than the 500px viewport (scrollHeight ${tall}), so scrolling is real`, tall > 520, tall);
    const at = async (y) => {
      await p.ev(`window.scrollTo(0, ${y})`);
      await sleep(150);
      return p.ev(`(() => { const b = document.querySelector('.badge').getBoundingClientRect(); const bn = document.querySelector('.banner').getBoundingClientRect(); const cx = b.x + b.width / 2, cy = b.y + b.height / 2; const top = document.elementFromPoint(cx, cy); return { scrollY: Math.round(window.scrollY), badgeTop: Math.round(b.top), badgeH: Math.round(b.height), badgeVisible: b.top >= 0 && b.bottom <= window.innerHeight, badgeOnTop: top === document.querySelector('.badge'), bannerBottom: Math.round(bn.bottom), sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }; })()`);
    };
    const top = await at(0);
    const mid = await at(Math.floor((tall - 500) / 2));
    const bottom = await at(tall);
    check(`[${width}px] at the top the badge sits above the banner`, top.badgeTop >= 0 && top.badgeVisible, JSON.stringify(top));
    check(`[${width}px] after scrolling (scrollY ${mid.scrollY}) the badge stays pinned at the top of the viewport and is the topmost element at its position`, mid.scrollY > 100 && mid.badgeTop === 0 && mid.badgeVisible && mid.badgeOnTop, JSON.stringify(mid));
    check(`[${width}px] at the bottom (scrollY ${bottom.scrollY}) the badge is still pinned and visible`, bottom.badgeTop === 0 && bottom.badgeVisible && bottom.badgeOnTop, JSON.stringify(bottom));
    check(`[${width}px] the long banner scrolls away (it is not sticky), so it never covers content`, mid.bannerBottom < 0 || mid.bannerBottom < top.bannerBottom, JSON.stringify({ top, mid }));
    check(`[${width}px] no horizontal page overflow while scrolled (${bottom.sw} <= ${bottom.cw})`, bottom.sw <= bottom.cw);
    console.log(`        badge height ${top.badgeH}px of a 500px viewport (${Math.round((top.badgeH / 500) * 100)}% of the screen stays covered while scrolling)`);
    await p.close();
  }
} finally {
  browser.child.kill();
  server.kill();
  await sleep(500);
}
console.log(failed ? `${failed} FAILED` : 'all badge checks passed');
process.exit(failed ? 1 : 0);
