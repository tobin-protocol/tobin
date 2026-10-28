import { connection } from 'next/server';
import { ConsoleApp } from '../components/console-app';

// Rendered per request: the nonce-based Content-Security-Policy set in proxy.ts only applies to dynamically rendered pages.
export default async function Page() {
  await connection();
  return <ConsoleApp />;
}
