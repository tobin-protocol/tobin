import { connection } from 'next/server';
import { CosignCheck } from '../../../components/cosign-check';

// Owner-run co-signing validation page (MVP-1.5 stage 4). Rendered per request so the nonce-based Content-Security-Policy from proxy.ts applies.
export default async function Page() {
  await connection();
  return <CosignCheck />;
}
