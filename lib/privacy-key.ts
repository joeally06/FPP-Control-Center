import { createHmac } from 'crypto';

// Not secret; only used when neither IP_HASH_SALT nor NEXTAUTH_SECRET is set outside production
const DEV_ONLY_KEY = 'fpp-dev-only-privacy-key';

type Env = Record<string, string | undefined>;

/**
 * The secret behind every hash of an IP address or email address (visitor analytics, log lines).
 * A salt that is published in the repo would let anyone turn those hashes back into addresses,
 * so the key is IP_HASH_SALT if set, otherwise derived from NEXTAUTH_SECRET (which production
 * already requires). Read on every call so `next build` never needs it.
 */
export function getPrivacyKey(env: Env = process.env): string {
  const explicit = env.IP_HASH_SALT?.trim();
  if (explicit) return explicit;

  const secret = env.NEXTAUTH_SECRET;
  if (secret) return createHmac('sha256', secret).update('fpp-privacy-key-v1').digest('hex');

  if (env.NODE_ENV === 'production') {
    throw new Error('[SECURITY] Cannot hash visitor data: set IP_HASH_SALT or NEXTAUTH_SECRET');
  }
  return DEV_ONLY_KEY;
}

/** Keyed hash (first `length` hex chars). `purpose` keeps an IP hash and an email hash apart. */
export function keyedHash(value: string, purpose: string, env: Env = process.env, length = 16): string {
  return createHmac('sha256', getPrivacyKey(env))
    .update(`${purpose}:${value}`)
    .digest('hex')
    .substring(0, length);
}
