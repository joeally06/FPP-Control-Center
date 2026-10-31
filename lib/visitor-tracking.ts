import { keyedHash } from './privacy-key';

// Anonymize IP address with a keyed hash (the key is never in the repo, see lib/privacy-key.ts)
export function anonymizeIP(ip: string): string {
  return keyedHash(ip, 'ip'); // first 16 hex chars, enough for storage
}

// One shared implementation (see lib/rate-limit.ts and server.js)
export { getClientIP } from './rate-limit';

/** True for addresses on this machine or its own network, which are never looked up */
export function isLocalAddress(ip: string): boolean {
  return ip === '127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.');
}

// Simple geolocation lookup (you could integrate with a real IP geolocation service)
export async function getGeolocation(ip: string): Promise<{
  city: string | null;
  region: string | null;
  country: string | null;
}> {
  // Skip geolocation for local IPs
  if (isLocalAddress(ip)) {
    return {
      city: 'Local Network',
      region: null,
      country: 'Local'
    };
  }

  try {
    // Using ip-api.com free tier (45 requests/minute limit)
    const response = await fetch(`http://ip-api.com/json/${ip}?fields=city,regionName,country`, {
      signal: AbortSignal.timeout(2000) // 2 second timeout
    });
    
    if (response.ok) {
      const data = await response.json();
      return {
        city: data.city || null,
        region: data.regionName || null,
        country: data.country || null
      };
    }
  } catch (error) {
    // Silently fail - geolocation is optional
    console.log('Geolocation lookup failed:', error);
  }

  return {
    city: null,
    region: null,
    country: null
  };
}
