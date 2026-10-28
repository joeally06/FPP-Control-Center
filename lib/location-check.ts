import { getDistanceInMiles } from './location-utils';

// The show's coordinates stay on the server. Visitors' phones send their own position and learn
// only whether they are in range and about how far away they are.

export interface ShowRestrictions {
  is_active: number | boolean | null;
  max_distance_miles: number | null;
  show_latitude: number | null;
  show_longitude: number | null;
}

export type LocationCheckResult =
  | { enabled: false }
  | { enabled: true; withinRange: boolean; distanceMiles: number; maxDistance: number };

/**
 * Distances are shown to 0.1 mile so a casual look at the traffic doesn't reveal the show's
 * position. This is not a defence against someone who sends many fake positions: each in/out
 * answer is an exact boundary test, so no range check can fully hide where the show is.
 */
export function roundMiles(miles: number): number {
  return Math.round(miles * 10) / 10;
}

/** A visitor's position from a request body, or null if it is not a real latitude/longitude */
export function parseUserCoordinates(body: unknown): { lat: number; lng: number } | null {
  if (!body || typeof body !== 'object') return null;
  const { lat, lng } = body as { lat?: unknown; lng?: unknown };
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

/** Whether the restriction applies at all (switched on and the show location is set) */
export function isRestrictionConfigured(restrictions: ShowRestrictions | undefined | null): boolean {
  return Boolean(
    restrictions?.is_active &&
    restrictions.show_latitude !== null && restrictions.show_latitude !== undefined &&
    restrictions.show_longitude !== null && restrictions.show_longitude !== undefined
  );
}

export function checkAgainstShow(
  user: { lat: number; lng: number },
  restrictions: ShowRestrictions | undefined | null
): LocationCheckResult {
  if (!restrictions || !isRestrictionConfigured(restrictions)) return { enabled: false };

  const maxDistance = restrictions.max_distance_miles ?? 1;
  const distance = getDistanceInMiles(user.lat, user.lng, restrictions.show_latitude as number, restrictions.show_longitude as number);
  return {
    enabled: true,
    withinRange: distance <= maxDistance,
    distanceMiles: roundMiles(distance),
    maxDistance,
  };
}
