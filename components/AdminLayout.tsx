'use client';

import { ReactNode } from 'react';
import AdminNavigation from './AdminNavigation';

interface AdminLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
}

export default function AdminLayout({ children, title, subtitle }: AdminLayoutProps) {
  return (
    <div className="min-h-screen bg-adm-bg font-sans text-adm-text lg:grid lg:grid-cols-[248px_minmax(0,1fr)] lg:grid-rows-[auto_1fr]">
      <AdminNavigation />

      {/* admin-content keeps the light-on-dark text the pages were written for (see globals.css) */}
      <div className="admin-content min-w-0 lg:col-start-2 lg:row-start-2">
        {/* Extra bottom padding below lg clears the fixed bottom bar */}
        <div className="mx-auto max-w-7xl px-4 pt-6 pb-28 sm:px-6 sm:pt-8 lg:px-8 lg:pb-8">
          {(title || subtitle) && (
            <div className="mb-6 sm:mb-8">
              {title && (
                <h1 className="mb-1.5 text-2xl font-semibold tracking-tight text-adm-text sm:text-3xl wrap-break-word">
                  {title}
                </h1>
              )}
              {subtitle && (
                <p className="text-sm text-adm-muted sm:text-base">
                  {subtitle}
                </p>
              )}
            </div>
          )}

          {children}
        </div>
      </div>
    </div>
  );
}
