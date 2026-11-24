'use client';

import { SessionProvider } from 'next-auth/react';
import { ThemeProvider } from '@/lib/themes/theme-context';
import { FPPConnectionProvider } from '@/contexts/FPPConnectionContext';
import SessionExpiryGuard from '@/components/SessionExpiryGuard';
import { AdminFeedbackProvider } from '@/components/admin/AdminFeedback';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <SessionExpiryGuard />
      <ThemeProvider>
        <FPPConnectionProvider>
          {/* Above every page, so a page that renders <AdminLayout> itself can still use the admin dialogs and messages */}
          <AdminFeedbackProvider>
            {children}
          </AdminFeedbackProvider>
        </FPPConnectionProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
