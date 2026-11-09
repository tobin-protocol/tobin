// Starts the production server. Defaults are the local ones (127.0.0.1:3000), so `npm start` behaves as it always did. A hosted deployment sets:
//   PORT            the port the platform assigns (digits only, 1 to 65535)
//   TOBIN_BIND_HOST the interface to listen on (an IP address or host name, for example `::` or `0.0.0.0`)
// Nothing here widens access by itself: the request guards (lib/server/guards.ts) still refuse every Host that is not configured, and hosted mode refuses to
// start without its security configuration (instrumentation.ts). The same launcher exists in apps/web-console/scripts/start.mjs with port 8787.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const DEFAULT_PORT = 3000;
const host = process.env.TOBIN_BIND_HOST ?? '127.0.0.1';
const port = process.env.PORT ?? String(DEFAULT_PORT);
if (!/^[0-9a-fA-F:.]+$|^[A-Za-z0-9.-]+$/.test(host)) { console.error('TOBIN_BIND_HOST must be an IP address or a host name'); process.exit(1); }
if (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) { console.error('PORT must be a number from 1 to 65535'); process.exit(1); }

const next = createRequire(import.meta.url).resolve('next/dist/bin/next');
const child = spawn(process.execPath, [next, 'start', '--hostname', host, '--port', port], { stdio: 'inherit' });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
