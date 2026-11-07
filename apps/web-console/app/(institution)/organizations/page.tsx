import { connection } from 'next/server';
import { OrganizationsApp } from '../../../components/organizations-app';

// Rendered per request so the nonce-based Content-Security-Policy from proxy.ts applies.
export default async function Page() {
  await connection();
  return <OrganizationsApp />;
}
