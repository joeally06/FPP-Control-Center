'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { installSessionExpiryGuard, isAdminPath, signInUrl } from '@/lib/session-expiry';

/** Ask the server, not the browser's last guess: a dropped connection must not look like a sign-out */
async function sessionHasEnded(): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/session', { cache: 'no-store' });
    if (!res.ok) return false;
    const data = await res.json();
    return !data || Object.keys(data).length === 0;
  } catch {
    return false;
  }
}

async function goToSignIn(): Promise<boolean> {
  if (!(await sessionHasEnded())) return false;
  window.location.assign(signInUrl(window.location.pathname, window.location.search));
  return true;
}

/**
 * On admin pages, sends the admin to the sign-in page when their session has run out, instead of
 * leaving them with an error on their next save. Does nothing on visitor pages.
 */
export default function SessionExpiryGuard() {
  const pathname = usePathname();
  const { status } = useSession();
  const wasSignedIn = useRef(false);
  const onAdminPage = isAdminPath(pathname);

  useEffect(() => {
    if (!onAdminPage) return;
    return installSessionExpiryGuard(window, goToSignIn);
  }, [onAdminPage]);

  // Signed in a moment ago, signed out now (the tab was idle and the session ended)
  useEffect(() => {
    if (status === 'authenticated') wasSignedIn.current = true;
    if (status === 'unauthenticated' && wasSignedIn.current && onAdminPage) {
      wasSignedIn.current = false;
      void goToSignIn();
    }
  }, [status, onAdminPage]);

  return null;
}
