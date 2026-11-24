/**
 * What the admin pages do when the sign-in has run out (it lasts 30 minutes): the next save would
 * only fail with an error, so send the admin to the sign-in page instead, which returns them to
 * the page they were on. The admin page list is shared with proxy.ts, which sends strangers to sign in;
 * the API routes still check the session themselves.
 */

const ADMIN_PAGES = ['/dashboard', '/settings', '/admin', '/analytics', '/models', '/device-status', '/theme-settings', '/santa-letters'];

/**
 * The path as the router would read it: percent-encoding decoded (/%61nalytics is /analytics), repeated slashes
 * collapsed, and letter case ignored, so a differently written address can't slip past the admin check.
 */
function normalizedPath(pathname: string): string {
  let path = pathname;
  try {
    path = decodeURIComponent(path);
  } catch {
    // Not valid percent-encoding: judge it as written
  }
  return path.replace(/\/{2,}/g, '/').toLowerCase();
}

export function isAdminPath(pathname: string): boolean {
  const path = normalizedPath(pathname);
  return ADMIN_PAGES.some((page) => path === page || path.startsWith(`${page}/`));
}

/**
 * A return address that stays on this site; anything else becomes the home page. Judged the way the
 * browser reads it (tabs and newlines are dropped, so "/<tab>/evil.com" points at another site), and
 * an address on this same site written out in full is accepted, which is what next-auth sends.
 */
export function safeCallbackUrl(raw: string | null | undefined, origin: string): string {
  if (!raw) return '/';
  try {
    const url = new URL(raw, origin);
    if (url.origin !== origin) return '/';
    return url.pathname + url.search + url.hash;
  } catch {
    return '/';
  }
}

export function signInUrl(pathname: string, search: string): string {
  return `/auth/signin?callbackUrl=${encodeURIComponent(pathname + search)}`;
}

interface FetchHost {
  fetch: typeof fetch;
  location: { origin: string };
}

/** Our own API (not the sign-in calls, which answer 401 for other reasons) */
function isAdminApiCall(input: Parameters<typeof fetch>[0], origin: string): boolean {
  try {
    const url = new URL(input instanceof Request ? input.url : String(input), origin);
    return url.origin === origin && url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/auth/');
  } catch {
    return false;
  }
}

async function isSignInFailure(res: Response): Promise<boolean> {
  if (res.status === 401) return true;
  if (res.ok) return false;
  // A few routes wrap the same failure in a 500
  try {
    return /authentication required/i.test(await res.clone().text());
  } catch {
    return false;
  }
}

/**
 * Wraps fetch so that an "authentication required" answer from our API calls `onExpired` (once, unless it
 * answers false).
 * The page still gets the response. Returns a function that puts the real fetch back.
 */
export function installSessionExpiryGuard(host: FetchHost, onExpired: () => void | boolean | Promise<void | boolean>): () => void {
  const original = host.fetch;
  let fired = false;

  host.fetch = async (...args: Parameters<typeof fetch>) => {
    // Called on the window itself: a detached fetch throws "Illegal invocation" in browsers
    const res = await original.apply(host, args);
    if (!fired && isAdminApiCall(args[0], host.location.origin) && (await isSignInFailure(res))) {
      fired = true;
      // false means "the session is fine after all": watch for the next failure
      void Promise.resolve(onExpired()).then((handled) => { if (handled === false) fired = false; }, () => { fired = false; });
    }
    return res;
  };

  return () => {
    host.fetch = original;
  };
}
