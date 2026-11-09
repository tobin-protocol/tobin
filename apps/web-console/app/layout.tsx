import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = { title: 'Tobin Console (local sandbox)' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header>
          <h1>Tobin Console</h1>
          <p>Local sandbox console for the MVP-1 contracts. Everything on this page runs in a local sandbox on this machine; the institutional application is apps/web.</p>
        </header>
        {children}
      </body>
    </html>
  );
}
