import { connection } from 'next/server';
import { W0App } from '../../components/w0/w0-app';
import './w0.css';

// Rendered per request so the nonce-based Content-Security-Policy from proxy.ts applies.
export default async function Page() {
  await connection();
  return <W0App />;
}
