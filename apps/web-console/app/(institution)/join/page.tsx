import { connection } from 'next/server';
import { JoinApp } from '../../../components/join-app';

// Rendered per request so the nonce-based Content-Security-Policy from proxy.ts applies.
export default async function Page() {
  await connection();
  return <JoinApp />;
}
