import { connection } from 'next/server';
import { Onboarding } from '../../../components/onboarding';

// Rendered per request so the nonce-based Content-Security-Policy from proxy.ts applies.
export default async function Page() {
  await connection();
  return <Onboarding />;
}
