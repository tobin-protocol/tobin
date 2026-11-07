import { connection } from 'next/server';
import { AuthPanel } from '../../../components/auth-panel';

// Rendered per request so the nonce-based Content-Security-Policy from proxy.ts applies.
export default async function Page() {
  await connection();
  return <AuthPanel />;
}
