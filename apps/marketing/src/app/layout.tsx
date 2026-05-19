import './globals.css';
import type { ReactNode } from 'react';

// Root layout je minimální — skutečný layout (Header + Footer + NextIntlProvider)
// je v app/[locale]/layout.tsx, protoze potrebuje i18n kontext.
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
