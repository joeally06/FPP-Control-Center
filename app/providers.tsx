'use client';

import { SessionProvider } from 'next-auth/react';
import { ThemeProvider } from '@/lib/themes/theme-context';
import { FPPConnectionProvider } from '@/contexts/FPPConnectionContext';
import SessionExpiryGuard from '@/components/SessionExpiryGuard';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <SessionExpiryGuard />
      <ThemeProvider>
        <FPPConnectionProvider>
          {children}
        </FPPConnectionProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
