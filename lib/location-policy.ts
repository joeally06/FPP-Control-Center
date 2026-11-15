import { getDistanceInMiles } from './location-utils';
import { checkAgainstShow, isRestrictionConfigured, parseUserCoordinates, type ShowRestrictions } from './location-check';

type Rejection = { allowed: false; status: number; body: { error: string; requiresLocation?: boolean; distanceMiles?: number; maxDistance?: number } };
type Permission = { allowed: true; distanceFromShow: number | null; locationDetails: { latitude: number | null; longitude: number | null } };

/** No writes: callers must obtain permission before recording votes/requests. */
export function authorizeLocation(raw: unknown, readRestrictions: () => ShowRestrictions | undefined, action = 'to take part'): Permission | Rejection {
  let restrictions: ShowRestrictions | undefined;
  try { restrictions = readRestrictions(); } catch { return unavailable(); }
  if (!restrictions || ![0, 1, false, true].includes(restrictions.is_active as number | boolean)) return unavailable();
  const coords = raw == null ? null : parseUserCoordinates(raw);
  if (raw != null && !coords) return { allowed: false, status: 400, body: { error: 'A valid latitude and longitude are required.' } };
  if (!restrictions.is_active) return { allowed: true, distanceFromShow: null, locationDetails: { latitude: null, longitude: null } };
  if (!isRestrictionConfigured(restrictions)) return unavailable();
  if (!coords) return { allowed: false, status: 403, body: { error: 'Location access required. Enable location permissions and try again.', requiresLocation: true } };
  const result = checkAgainstShow(coords, restrictions);
  if (!result.enabled) return unavailable();
  if (!result.withinRange) return { allowed: false, status: 403, body: {
    error: `You must be within ${result.maxDistance} mile(s) of the light show ${action}. You are ${result.distanceMiles.toFixed(1)} miles away.`,
    distanceMiles: result.distanceMiles, maxDistance: result.maxDistance,
  } };
  return { allowed: true, distanceFromShow: getDistanceInMiles(coords.lat, coords.lng, restrictions.show_latitude as number, restrictions.show_longitude as number), locationDetails: { latitude: coords.lat, longitude: coords.lng } };
}

function unavailable(): Rejection {
  return { allowed: false, status: 503, body: { error: 'Location verification is temporarily unavailable. Please try again shortly.' } };
}

export function validLocationSettings(body: unknown): body is {
  enabled: boolean; max_distance_miles: number; show_latitude: number | null; show_longitude: number | null; location_name: string | null;
} {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  if (typeof b.enabled !== 'boolean' || typeof b.max_distance_miles !== 'number' || !Number.isFinite(b.max_distance_miles) || b.max_distance_miles <= 0) return false;
  if (b.location_name !== null && (typeof b.location_name !== 'string' || b.location_name.length > 200)) return false;
  const coords = parseUserCoordinates({ lat: b.show_latitude, lng: b.show_longitude });
  return !!coords || (!b.enabled && b.show_latitude === null && b.show_longitude === null);
}
