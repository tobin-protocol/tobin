import type { NextConfig } from 'next';
import { SECURITY_HEADERS } from './lib/server/guards.ts';

const config: NextConfig = {
  // The SDK is a workspace package that ships TypeScript source.
  transpilePackages: ['tobin-mvp1-sdk'],
  poweredByHeader: false,
  reactStrictMode: true,
  // Static security headers for every response; the nonce-based Content-Security-Policy is added per request in proxy.ts.
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS.map((h) => ({ ...h })) }];
  },
};

export default config;
