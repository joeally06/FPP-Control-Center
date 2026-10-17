// CSRF defense for state-changing /api requests (used by proxy.ts).
//
// Decision order follows OWASP's CSRF cheat sheet and Go's net/http CrossOriginProtection:
// browsers always send Sec-Fetch-Site and/or Origin on cross-origin requests and on same-origin
// non-GET requests, and scripts cannot forge either header. The request's own Host header is the
// *target*, so it is only ever compared against the Origin's host, never trusted by itself.

export interface CsrfEnv {
  nextAuthUrl?: string;
  appUrl?: string;
  /** Comma-separated hostnames (TRUSTED_DOMAINS), matched against the browser-supplied Origin. */
  trustedDomains?: string;
}

interface HeaderReader {
  get(name: string): string | null;
}

function parseHttpUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

/**
 * Returns true if the request may proceed, false if it looks cross-origin.
 * Scheme is deliberately not compared (matches Go's stdlib); host:port must match exactly.
 */
export function isSameOriginRequest(headers: HeaderReader, env: CsrfEnv): boolean {
  const fetchSite = headers.get('sec-fetch-site');
  if (fetchSite === 'same-origin' || fetchSite === 'none') return true;

  // Origin takes precedence; fall back to Referer for browsers that omit Origin.
  const claimed = headers.get('origin') || headers.get('referer');
  if (!claimed) {
    // No Sec-Fetch-Site, Origin or Referer: not a browser, so no victim cookies to ride on.
    // A browser that sent Sec-Fetch-Site (same-site/cross-site) but no Origin/Referer is rejected.
    return !fetchSite;
  }

  // Unparseable values, including the literal "null", fail closed.
  const source = parseHttpUrl(claimed);
  if (!source) return false;

  const requestHost = headers.get('host')?.toLowerCase();
  if (requestHost && source.host === requestHost) return true;

  const allowedHosts = new Set<string>();
  for (const configured of [env.nextAuthUrl, env.appUrl]) {
    const host = configured ? parseHttpUrl(configured)?.host : undefined;
    if (host) allowedHosts.add(host);
  }
  for (const domain of (env.trustedDomains || '').split(',')) {
    const trimmed = domain.trim().toLowerCase();
    if (trimmed) allowedHosts.add(trimmed);
  }
  return allowedHosts.has(source.host);
}
