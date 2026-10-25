'use client';

import { useState, useEffect } from 'react';
import { LocateFixed, MapPin, TriangleAlert } from 'lucide-react';
import {
  AdminH2,
  AdminH3,
  AdminTextMuted,
  AdminLabel,
} from '@/components/admin/Typography';
import { card, button, accentButton, field, choiceCard, checkInput, notice } from '@/components/admin/ui-classes';

export default function LocationRestrictions() {
  const [enabled, setEnabled] = useState(false);
  const [maxDistance, setMaxDistance] = useState(1);
  const [showLat, setShowLat] = useState('');
  const [showLng, setShowLng] = useState('');
  const [locationName, setLocationName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    try {
      setLoading(true);
      const response = await fetch('/api/location-restrictions');
      if (!response.ok) throw new Error('Failed to fetch location restrictions');
      
      const data = await response.json();
      setEnabled(data.enabled);
      setMaxDistance(data.max_distance_miles || 1);
      setShowLat(data.show_latitude?.toString() || '');
      setShowLng(data.show_longitude?.toString() || '');
      setLocationName(data.location_name || '');
    } catch (err) {
      console.error('Error fetching location restrictions:', err);
      setError('Failed to load location settings');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSuccess('');
    setError('');
    setSaving(true);

    try {
      // Validate coordinates if enabled
      if (enabled && (!showLat || !showLng)) {
        throw new Error('Show location coordinates are required when restrictions are enabled');
      }

      const lat = parseFloat(showLat);
      const lng = parseFloat(showLng);

      if (enabled && (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180)) {
        throw new Error('Invalid coordinates. Latitude must be -90 to 90, Longitude must be -180 to 180');
      }

      const response = await fetch('/api/location-restrictions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled,
          max_distance_miles: maxDistance,
          show_latitude: lat || null,
          show_longitude: lng || null,
          location_name: locationName || null,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save settings');
      }

      setSuccess('✅ Location restrictions updated successfully!');
      setTimeout(() => setSuccess(''), 5000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  function handleUseCurrentLocation() {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      return;
    }

    setError('');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setShowLat(position.coords.latitude.toFixed(6));
        setShowLng(position.coords.longitude.toFixed(6));
        setSuccess('📍 Location captured! Don\'t forget to save.');
        setTimeout(() => setSuccess(''), 3000);
      },
      (err) => {
        setError(`Failed to get location: ${err.message}`);
      }
    );
  }

  if (loading) {
    return (
      <div className={card}>
        <AdminH2>Location Restrictions</AdminH2>
        <AdminTextMuted>Loading...</AdminTextMuted>
      </div>
    );
  }

  const mapsUrl = showLat && showLng
    ? `https://www.google.com/maps?q=${showLat},${showLng}`
    : null;

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className={card}>
        <AdminH2 className="mb-1">Location Restrictions</AdminH2>
        <AdminTextMuted>
          Prevent remote users from disrupting your light show by restricting song requests to on-site visitors
        </AdminTextMuted>

        {success && <p className={`${notice.ok} mt-4`}>{success}</p>}
        {error && <p className={`${notice.danger} mt-4`}>{error}</p>}

        {/* Enable/Disable Section */}
        <div className="mt-6 space-y-3">
          <label className={choiceCard}>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className={checkInput}
            />
            <div className="flex-1">
              <p className="text-sm font-medium text-adm-text">Enable Location Restrictions</p>
              <p className="mt-0.5 text-[13px] text-adm-muted">
                When enabled, only users within the specified distance can request songs
              </p>
            </div>
          </label>

          {enabled && (
            <p className={notice.warn}>
              Make sure to configure your show location below before enabling
            </p>
          )}
        </div>

        {/* Show Location Section */}
        <section className="mt-6 border-t border-adm-line pt-5">
          <AdminH3 className="mb-0.5">Show Location</AdminH3>
          <AdminTextMuted>
            Set the GPS coordinates of your light show
          </AdminTextMuted>

          <div className="mt-4 space-y-4">
            <div>
              <AdminLabel htmlFor="location-name">Location Name (Optional)</AdminLabel>
              <input
                id="location-name"
                type="text"
                value={locationName}
                onChange={(e) => setLocationName(e.target.value)}
                placeholder="e.g., 123 Main Street, Anytown USA"
                className={field}
              />
              <p className="mt-1 text-xs text-adm-muted">
                Friendly name to help you remember this location
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <AdminLabel htmlFor="location-lat">Latitude *</AdminLabel>
                <input
                  id="location-lat"
                  type="number"
                  step="0.000001"
                  value={showLat}
                  onChange={(e) => setShowLat(e.target.value)}
                  placeholder="40.712776"
                  className={field}
                />
              </div>

              <div>
                <AdminLabel htmlFor="location-lng">Longitude *</AdminLabel>
                <input
                  id="location-lng"
                  type="number"
                  step="0.000001"
                  value={showLng}
                  onChange={(e) => setShowLng(e.target.value)}
                  placeholder="-74.005974"
                  className={field}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2.5">
              <button
                onClick={handleUseCurrentLocation}
                className={button}
              >
                <LocateFixed className="h-4 w-4" aria-hidden="true" />
                Use My Current Location
              </button>

              {mapsUrl && (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={button}
                >
                  <MapPin className="h-4 w-4" aria-hidden="true" />
                  View on Google Maps
                </a>
              )}
            </div>
          </div>
        </section>

        {/* Distance Restriction Section */}
        <section className="mt-6 border-t border-adm-line pt-5">
          <AdminH3 className="mb-0.5">Maximum Distance</AdminH3>
          <AdminTextMuted>
            How far from the show location can users request songs
          </AdminTextMuted>

          <div className="mt-4 flex items-center gap-4">
            <input
              type="range"
              min="0.1"
              max="10"
              step="0.1"
              value={maxDistance}
              onChange={(e) => setMaxDistance(parseFloat(e.target.value))}
              aria-label="Maximum distance in miles"
              className="h-7 flex-1 cursor-pointer accent-adm-accent"
            />
            <span className="w-24 text-center font-mono text-2xl font-semibold text-adm-text">
              {maxDistance.toFixed(1)} <span className="text-sm text-adm-muted">mi</span>
            </span>
          </div>

          <div className="mt-1 flex justify-between text-xs">
            <span className="text-adm-muted">0.1 mi (Very Close)</span>
            <span className="text-adm-muted">5 mi (Moderate)</span>
            <span className="text-adm-muted">10 mi (Wide Area)</span>
          </div>
        </section>

        {/* Save Button */}
        <div className="mt-6 border-t border-adm-line pt-5">
          <button
            onClick={handleSave}
            disabled={saving}
            className={accentButton}
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>

      {/* Info Section */}
      <div className={card}>
        <AdminH3>How It Works</AdminH3>
        <ul className="list-disc space-y-1.5 pl-5 text-sm">
          <li className="text-adm-soft"><strong className="text-adm-text">Geolocation:</strong> User&apos;s location is determined from their IP address when they request a song</li>
          <li className="text-adm-soft"><strong className="text-adm-text">Distance Check:</strong> System calculates the distance between the user and your show location</li>
          <li className="text-adm-soft"><strong className="text-adm-text">Blocking:</strong> Requests from users outside the radius are blocked with a friendly message</li>
          <li className="text-adm-soft"><strong className="text-adm-text">Accuracy:</strong> IP-based geolocation is typically accurate to within 3-10 miles in urban areas</li>
          <li className="text-adm-soft"><strong className="text-adm-text">Graceful Degradation:</strong> If location lookup fails, the request is allowed (don&apos;t punish users for API issues)</li>
          <li className="text-adm-soft"><strong className="text-adm-text">Privacy:</strong> Location data is stored only for analytics and troubleshooting</li>
        </ul>
      </div>

      {/* Security Notice */}
      <div className={`${notice.warn} flex items-start gap-3`}>
        <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div className="flex-1">
          <p className="mb-2 font-semibold text-adm-warn">Important Notes</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li className="text-adm-soft"><strong className="text-adm-warn">VPN/Proxy Users:</strong> Users on VPNs or proxies may be blocked if their apparent location is outside the radius</li>
            <li className="text-adm-soft"><strong className="text-adm-warn">Mobile Data:</strong> Cell phone IP addresses may show locations near cell towers, not the actual user location</li>
            <li className="text-adm-soft"><strong className="text-adm-warn">Testing:</strong> Test with your own device first to ensure the radius is appropriate</li>
            <li className="text-adm-soft"><strong className="text-adm-warn">Local Networks:</strong> Users on the same local network (192.168.x.x, 10.x.x.x) are not subject to location checks</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
