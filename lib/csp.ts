// The one Content-Security-Policy for every page. proxy.ts sets it; next.config.js must not set its own
// (when both did, the proxy's copy replaced the other, and the two had drifted apart).
// Every call to FPP and Ollama is made by the server, so no LAN address belongs in here.
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://www.youtube.com https://*.youtube.com",
  "script-src-elem 'self' 'unsafe-inline' https://www.youtube.com https://*.youtube.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: https: https://img.youtube.com https://*.youtube.com https://*.googlevideo.com",
  "connect-src 'self' https://www.youtube.com https://*.youtube.com https://*.googlevideo.com https://www.googleapis.com",
  "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://*.youtube.com https://docs.google.com https://slides.google.com",
  "media-src 'self' https://*.googlevideo.com",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

// Pages shown in a frame on another page of this site: the visitor-page preview (Settings -> Jukebox) and
// the digital sign preview (Settings -> Digital Sign). Everything else sends X-Frame-Options: DENY.
// next.config.js repeats this list for the build-time headers (it cannot import TypeScript).
export const FRAMEABLE_PATHS: readonly string[] = ['/settings/jukebox/preview', '/settings/display/preview'];

export function isFrameablePath(pathname: string): boolean {
  return FRAMEABLE_PATHS.includes(pathname);
}
