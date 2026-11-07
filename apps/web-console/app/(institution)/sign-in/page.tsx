import { connection } from 'next/server';
import { WalletSignIn } from '../../../components/wallet-signin';

// Rendered per request so the nonce-based Content-Security-Policy from proxy.ts applies.
export default async function Page() {
  await connection();
  return <WalletSignIn />;
}
