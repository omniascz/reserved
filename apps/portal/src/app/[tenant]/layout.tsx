import type { ReactNode } from 'react';
import { DevAutoLogin } from '@/components/DevAutoLogin';

export default function TenantLayout({ children }: { children: ReactNode }) {
  return <DevAutoLogin>{children}</DevAutoLogin>;
}
