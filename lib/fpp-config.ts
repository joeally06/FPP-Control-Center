/** One server-owned destination for every FPP request, including the standalone poller. */
const warned = new Set<string>();
function warnOnce(message: string) {
  if (!warned.has(message)) { warned.add(message); console.warn('[FPP config] ' + message); }
}

export function resolveFppUrl(env: Record<string, string | undefined>): string {
  let configured = env.FPP_URL;
  if (configured && (env.FPP_HOST || env.FPP_PORT || env.NEXT_PUBLIC_FPP_URL)) {
    warnOnce('FPP_URL takes precedence; remove legacy FPP_HOST, FPP_PORT and NEXT_PUBLIC_FPP_URL settings.');
  }
  if (!configured && env.NEXT_PUBLIC_FPP_URL) {
    warnOnce('NEXT_PUBLIC_FPP_URL is deprecated. Set server-side FPP_URL instead.');
    configured = env.NEXT_PUBLIC_FPP_URL;
  }
  if (!configured && (env.FPP_HOST || env.FPP_PORT)) {
    warnOnce('FPP_HOST/FPP_PORT are deprecated. Set FPP_URL including the scheme and port instead.');
    const host = env.FPP_HOST || 'fpp.local';
    if (!/^[a-zA-Z0-9.\-\[\]:]+$/.test(host)) throw new Error('Invalid FPP_HOST; use FPP_URL');
    const port = env.FPP_PORT || '80';
    if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new Error('Invalid FPP_PORT');
    configured = 'http://' + host + ':' + port;
  }
  let url: URL;
  try { url = new URL(configured || 'http://fpp.local'); }
  catch { throw new Error('Invalid FPP_URL. Set an HTTP(S) origin such as http://fpp.local:80.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('FPP_URL must be an HTTP(S) origin without credentials, path, query or fragment.');
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host === 'metadata.google.internal' || host === 'instance-data' ||
      /^(0\.|127\.|169\.254\.)/.test(host) || /^(22[4-9]|23\d|24\d|25[0-5])\./.test(host) ||
      ['[::]', '[::1]'].includes(host) || host.startsWith('[::ffff:') || /^\[fe[89ab]/.test(host)) {
    throw new Error('FPP_URL cannot target a loopback, unspecified, link-local, multicast or metadata address.');
  }
  return url.origin;
}

export function getFppUrl(): string { return resolveFppUrl(process.env); }
export function getFppHost(): string { return new URL(getFppUrl()).hostname; }
export function getFppPort(): number {
  const url = new URL(getFppUrl());
  return Number(url.port || (url.protocol === 'https:' ? 443 : 80));
}

/** Only the configured origin is reachable. Redirects are refused, even to the same host. */
export async function fetchFpp(input: string, options: RequestInit = {}, fetcher: typeof fetch = fetch): Promise<Response> {
  const origin = getFppUrl();
  const url = new URL(input, origin);
  if (url.origin !== origin || url.username || url.password || !url.pathname.startsWith('/api/')) {
    throw new Error('FPP request must stay within the configured origin and API path.');
  }
  const response = await fetcher(url.href, { ...options, redirect: 'error' });
  if (response.status >= 300 && response.status < 400) throw new Error('FPP redirects are not allowed');
  return response;
}

export const FPP_DEFAULTS = { host: 'fpp.local', port: 80, url: 'http://fpp.local' } as const;
