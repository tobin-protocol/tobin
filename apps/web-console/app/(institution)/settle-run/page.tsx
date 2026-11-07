import { connection } from 'next/server';
import { SettleRun } from '../../../components/settle-run';

// Owner-run one-unit settlement (MVP-1.5 stage 5). Rendered per request so the nonce-based Content-Security-Policy from proxy.ts applies.
export default async function Page() {
  await connection();
  return <SettleRun />;
}
