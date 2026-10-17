// Production server: does what `next start` does, plus one thing. Before Next.js sees a request it
// records the visitor's real address in the `x-fpp-client-ip` header, which the app's rate limits
// use (lib/rate-limit.ts getClientIP). Inside Next.js the connection address isn't available, and
// headers like CF-Connecting-IP or X-Forwarded-For can be sent by anyone who reaches port 3000
// directly (home network, port forwarding), so they are only believed when the connection comes
// from cloudflared on this machine (or an address listed in TRUSTED_PROXY_IPS).
//
// Plain CommonJS: Next.js doesn't compile this file. Based on
// https://nextjs.org/docs/app/guides/custom-server

/* eslint-disable @typescript-eslint/no-require-imports -- plain CommonJS run directly by Node */
const http = require('http');
const net = require('net');

const CLIENT_IP_HEADER = 'x-fpp-client-ip';

/** "::ffff:192.168.1.5" → "192.168.1.5" */
function normalizeAddress(address) {
  if (typeof address !== 'string') return '';
  return address.startsWith('::ffff:') ? address.slice(7) : address;
}

function parseTrustedProxies(value) {
  return (value || '').split(',').map((entry) => normalizeAddress(entry.trim())).filter(Boolean);
}

function isTrustedProxy(address, trustedProxies) {
  return address === '127.0.0.1' || address === '::1' || trustedProxies.includes(address);
}

/** The visitor's address for one request */
function clientIpFor(req, trustedProxies) {
  const peer = normalizeAddress(req.socket && req.socket.remoteAddress);
  const forwarded = req.headers['cf-connecting-ip'];
  if (isTrustedProxy(peer, trustedProxies) && typeof forwarded === 'string' && net.isIP(forwarded.trim())) {
    return forwarded.trim();
  }
  return peer || 'unknown';
}

/** Wraps Next's request handler; any copy of the header a visitor sent is replaced */
function createRequestListener(handle, trustedProxies) {
  return (req, res) => {
    req.headers[CLIENT_IP_HEADER] = clientIpFor(req, trustedProxies);
    return handle(req, res);
  };
}

module.exports = { CLIENT_IP_HEADER, clientIpFor, createRequestListener, normalizeAddress, parseTrustedProxies };

if (require.main === module) {
  // `next start` runs in production mode
  if (!process.env.NODE_ENV) process.env.NODE_ENV = 'production';

  const next = require('next');
  const port = parseInt(process.env.PORT || '3000', 10);
  const app = next({ dev: false, port });
  const handle = app.getRequestHandler();
  const trustedProxies = parseTrustedProxies(process.env.TRUSTED_PROXY_IPS);

  app.prepare().then(() => {
    http.createServer(createRequestListener(handle, trustedProxies)).listen(port, () => {
      console.log(`> Ready on port ${port} (client IPs: connection address; CF-Connecting-IP trusted from this machine${trustedProxies.length ? ` and ${trustedProxies.join(', ')}` : ''})`);
    });
  }).catch((error) => {
    console.error('Failed to start the server:', error);
    process.exit(1);
  });
}
