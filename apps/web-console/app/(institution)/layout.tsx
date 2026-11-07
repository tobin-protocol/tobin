import type { ReactNode } from 'react';
import { InstitutionNav } from '../../components/institution-nav';
import './institution.css';
import './sessions/sessions.css';

// Institutional application area (MVP-1.2). Deliberately separate from the signer console (/w0) and the local sandbox console (/): neither is linked here.
export default function InstitutionLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <InstitutionNav />
      {children}
    </>
  );
}
