import { connection } from 'next/server';
import { AccountApp } from '../../../components/account-app';

// Rendered per request so the nonce-based Content-Security-Policy from proxy.ts applies.
export default async function Page() {
  await connection();
  return <AccountApp />;
}
