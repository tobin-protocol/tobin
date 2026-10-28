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
          <p>MVP-1, experimental. Everything here runs in a local sandbox on this machine.</p>
        </header>
        {children}
      </body>
    </html>
  );
}
