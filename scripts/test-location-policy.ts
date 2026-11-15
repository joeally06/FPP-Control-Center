import assert from 'assert';
import { authorizeLocation, validLocationSettings } from '../lib/location-policy';
import { getDistanceInMiles } from '../lib/location-utils';

const show = { is_active: 1, show_latitude: 0, show_longitude: 0, max_distance_miles: 1 };
const evaluate = (coords: unknown, settings = show) => authorizeLocation(coords, () => settings);
console.log('[test-location-policy] zero coordinates, missing/malformed input, disabled restrictions');
assert.strictEqual(evaluate({ lat: 0, lng: 0 }).allowed, true);
assert.deepStrictEqual(evaluate(null), { allowed: false, status: 403, body: { error: 'Location access required. Enable location permissions and try again.', requiresLocation: true } });
for (const coords of [{}, { lat: 0 }, { lat: '0', lng: 0 }, { lat: NaN, lng: 0 }, { lat: Infinity, lng: 0 }, { lat: 91, lng: 0 }, { lat: 0, lng: 181 }]) {
  const result = evaluate(coords);
  assert.ok(!result.allowed && result.status === 400);
}
assert.strictEqual(evaluate(null, { ...show, is_active: 0 }).allowed, true);
console.log('[test-location-policy] exact boundary uses full precision before rounding');
const boundary = { lat: 0.01, lng: 0 };
const radius = getDistanceInMiles(0, 0, boundary.lat, boundary.lng);
assert.strictEqual(evaluate(boundary, { ...show, max_distance_miles: radius }).allowed, true);
assert.strictEqual(evaluate(boundary, { ...show, max_distance_miles: radius - 0.00001 }).allowed, false);
console.log('[test-location-policy] the exact distance is kept for the record; visitors see the old wording and a rounded distance');
const near = evaluate(boundary, { ...show, max_distance_miles: radius + 1 });
assert.ok(near.allowed && near.distanceFromShow === radius, 'stored distance is not rounded');
const far = authorizeLocation({ lat: 1, lng: 0 }, () => show, 'to vote');
assert.ok(!far.allowed && far.status === 403);
assert.strictEqual(far.body.error, 'You must be within 1 mile(s) of the light show to vote. You are ' + far.body.distanceMiles!.toFixed(1) + ' miles away.');
console.log('[test-location-policy] unknown, corrupt and unreadable settings fail closed');
for (const read of [() => undefined, () => { throw new Error('database locked'); }, () => ({ ...show, max_distance_miles: NaN }), () => ({ ...show, show_latitude: 100 }), () => ({ ...show, is_active: 2 })]) {
  const result = authorizeLocation({ lat: 0, lng: 0 }, read);
  assert.ok(!result.allowed && result.status === 503);
}
console.log('[test-location-policy] administrator settings are validated');
const settings = { enabled: true, max_distance_miles: 1, show_latitude: 0, show_longitude: 0, location_name: 'Show' };
assert.ok(validLocationSettings(settings));
assert.ok(validLocationSettings({ ...settings, enabled: false, show_latitude: null, show_longitude: null }));
for (const bad of [{ ...settings, enabled: 'false' }, { ...settings, show_latitude: null }, { ...settings, max_distance_miles: 0 }, { ...settings, max_distance_miles: Infinity }, { ...settings, location_name: 'x'.repeat(201) }]) assert.ok(!validLocationSettings(bad));
console.log('[test-location-policy] All tests passed');
