import { connection } from 'next/server';
import { SessionsApp } from '../../../components/sessions/sessions-app';

// Rendered per request so the nonce-based Content-Security-Policy from proxy.ts applies.
export default async function Page() {
  await connection();
  return <SessionsApp />;
}
