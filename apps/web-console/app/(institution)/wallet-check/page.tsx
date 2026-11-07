import { connection } from 'next/server';
import { WalletCheck } from '../../../components/wallet-check';

// Owner-run Freighter validation page (MVP-1.5). Rendered per request so the nonce-based Content-Security-Policy from proxy.ts applies.
export default async function Page() {
  await connection();
  return <WalletCheck />;
}
