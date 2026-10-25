'use client';

import { useState, useEffect } from 'react';
import {
  AdminH2,
  AdminH3,
  AdminH4,
  AdminTextMuted,
  AdminTextSmall,
  AdminLabel,
  AdminSuccess,
  AdminError,
  AdminInfo,
} from '@/components/admin/Typography';

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
      <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
        <AdminH2>📍 Location Restrictions</AdminH2>
        <AdminTextMuted>Loading...</AdminTextMuted>
      </div>
    );
  }

  const mapsUrl = showLat && showLng 
    ? `https://www.google.com/maps?q=${showLat},${showLng}` 
    : null;

  return (
    <div className="space-y-6">
      <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
        <AdminH2>📍 Location Restrictions</AdminH2>
        <AdminTextMuted>
          Prevent remote users from disrupting your light show by restricting song requests to on-site visitors
        </AdminTextMuted>

        {success && <AdminSuccess className="mt-4">{success}</AdminSuccess>}
        {error && <AdminError className="mt-4">{error}</AdminError>}

        {/* Enable/Disable Section */}
        <div className="mt-6 space-y-4">
          <div className="flex items-center gap-4 p-4 bg-white/5 rounded-lg border border-white/20">
            <input
              type="checkbox"
              id="locationEnabled"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="w-5 h-5 cursor-pointer"
            />
            <label htmlFor="locationEnabled" className="flex-1 cursor-pointer">
              <AdminLabel>Enable Location Restrictions</AdminLabel>
              <AdminTextSmall className="text-white/60">
                When enabled, only users within the specified distance can request songs
              </AdminTextSmall>
            </label>
          </div>

          {enabled && (
            <AdminInfo>
              ⚠️ Make sure to configure your show location below before enabling
            </AdminInfo>
          )}
        </div>

        {/* Show Location Section */}
        <div className="mt-8 space-y-4">
          <div>
            <AdminH3>📍 Show Location</AdminH3>
            <AdminTextMuted>
              Set the GPS coordinates of your light show
            </AdminTextMuted>
          </div>

          <div className="space-y-4">
            <div>
              <AdminLabel>Location Name (Optional)</AdminLabel>
              <input
                type="text"
                value={locationName}
                onChange={(e) => setLocationName(e.target.value)}
                placeholder="e.g., 123 Main Street, Anytown USA"
                className="w-full mt-2 px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-blue-400"
              />
              <AdminTextSmall className="text-white/60 mt-1">
                Friendly name to help you remember this location
              </AdminTextSmall>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <AdminLabel>Latitude *</AdminLabel>
                <input
                  type="number"
                  step="0.000001"
                  value={showLat}
                  onChange={(e) => setShowLat(e.target.value)}
                  placeholder="40.712776"
                  className="w-full mt-2 px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-blue-400"
                />
              </div>

              <div>
                <AdminLabel>Longitude *</AdminLabel>
                <input
                  type="number"
                  step="0.000001"
                  value={showLng}
                  onChange={(e) => setShowLng(e.target.value)}
                  placeholder="-74.005974"
                  className="w-full mt-2 px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-blue-400"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleUseCurrentLocation}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-lg transition-all shadow-lg"
              >
                📍 Use My Current Location
              </button>

              {mapsUrl && (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-lg transition-all shadow-lg"
                >
                  🗺️ View on Google Maps
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Distance Restriction Section */}
        <div className="mt-8 space-y-4">
          <div>
            <AdminH3>🎯 Maximum Distance</AdminH3>
            <AdminTextMuted>
              How far from the show location can users request songs
            </AdminTextMuted>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <input
                type="range"
                min="0.1"
                max="10"
                step="0.1"
                value={maxDistance}
                onChange={(e) => setMaxDistance(parseFloat(e.target.value))}
                className="flex-1 h-2 bg-white/20 rounded-lg appearance-none cursor-pointer slider"
                style={{
                  background: `linear-gradient(to right, #10b981 0%, #10b981 ${((maxDistance - 0.1) / 9.9) * 100}%, rgba(255,255,255,0.2) ${((maxDistance - 0.1) / 9.9) * 100}%, rgba(255,255,255,0.2) 100%)`
                }}
              />
              <div className="text-white font-bold text-2xl w-20 text-center">
                {maxDistance.toFixed(1)}
              </div>
            </div>

            <div className="flex justify-between text-sm text-white/60">
              <span>0.1 mi (Very Close)</span>
              <span>5 mi (Moderate)</span>
              <span>10 mi (Wide Area)</span>
            </div>

            <AdminInfo>
              Current setting: Users must be within <strong>{maxDistance.toFixed(1)} miles</strong> of the show location
            </AdminInfo>
          </div>
        </div>

        {/* Save Button */}
        <div className="mt-8 flex gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-3 bg-green-500 hover:bg-green-600 text-white font-bold rounded-xl shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? '⏳ Saving...' : '💾 Save Settings'}
          </button>
        </div>
      </div>

      {/* Info Section */}
      <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
        <AdminH3>ℹ️ How It Works</AdminH3>
        <ul className="space-y-2 mt-4">
          <li><AdminTextSmall>• <strong>Geolocation:</strong> User's location is determined from their IP address when they request a song</AdminTextSmall></li>
          <li><AdminTextSmall>• <strong>Distance Check:</strong> System calculates the distance between the user and your show location</AdminTextSmall></li>
          <li><AdminTextSmall>• <strong>Blocking:</strong> Requests from users outside the radius are blocked with a friendly message</AdminTextSmall></li>
          <li><AdminTextSmall>• <strong>Accuracy:</strong> IP-based geolocation is typically accurate to within 3-10 miles in urban areas</AdminTextSmall></li>
          <li><AdminTextSmall>• <strong>Graceful Degradation:</strong> If location lookup fails, the request is allowed (don't punish users for API issues)</AdminTextSmall></li>
          <li><AdminTextSmall>• <strong>Privacy:</strong> Location data is stored only for analytics and troubleshooting</AdminTextSmall></li>
        </ul>
      </div>

      {/* Security Notice */}
      <div className="bg-yellow-500/10 backdrop-blur-md rounded-xl p-6 border border-yellow-500/30">
        <div className="flex items-start gap-3">
          <span className="text-yellow-400 text-2xl">⚠️</span>
          <div className="flex-1">
            <AdminH4 className="text-yellow-200 mb-2">Important Notes</AdminH4>
            <ul className="space-y-2">
              <li><AdminTextSmall className="text-yellow-100">• <strong>VPN/Proxy Users:</strong> Users on VPNs or proxies may be blocked if their apparent location is outside the radius</AdminTextSmall></li>
              <li><AdminTextSmall className="text-yellow-100">• <strong>Mobile Data:</strong> Cell phone IP addresses may show locations near cell towers, not the actual user location</AdminTextSmall></li>
              <li><AdminTextSmall className="text-yellow-100">• <strong>Testing:</strong> Test with your own device first to ensure the radius is appropriate</AdminTextSmall></li>
              <li><AdminTextSmall className="text-yellow-100">• <strong>Local Networks:</strong> Users on the same local network (192.168.x.x, 10.x.x.x) are not subject to location checks</AdminTextSmall></li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
