# Geolocation Feature Documentation

## Overview

The geolocation feature ensures a fair experience for on-site visitors by restricting song requests and votes to users who are physically present at your light show. Using **browser-based GPS** (not IP-based), the system accurately verifies that users are within your configured radius before allowing them to participate.

---

## Key Features

✅ **Browser GPS Location**: Accurate GPS coordinates from user's device (typically 5-50 meters)  
✅ **Lazy Permission Flow**: Location prompt only appears when user tries to request/vote  
✅ **Two-Stage UX**: Friendly explanation screen before browser permission dialog  
✅ **Device-Specific Instructions**: Tailored help for iOS, Android, and Desktop browsers  
✅ **Persistent Permission**: Uses localStorage to remember permission across sessions  
✅ **Location Status Badge**: Real-time indicator showing location status in header  
✅ **Privacy-First**: Location only used for distance check, not stored permanently  
✅ **Toast Notifications**: Clear feedback for success/error states

---

## How It Works

### User Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    User visits Jukebox page                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              User can browse queue, watch videos                 │
│                   (no location needed yet)                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│         User clicks "Request Song" or "Vote" button             │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
              ▼                               ▼
    ┌─────────────────┐           ┌─────────────────┐
    │ Location cached │           │ No location yet │
    │   (< 30 min)    │           │                 │
    └────────┬────────┘           └────────┬────────┘
             │                              │
             │                              ▼
             │                   ┌─────────────────────┐
             │                   │  Show Permission    │
             │                   │  Modal (explains    │
             │                   │  why we need GPS)   │
             │                   └────────┬────────────┘
             │                              │
             │              ┌───────────────┴───────────────┐
             │              │                               │
             │              ▼                               ▼
             │    ┌─────────────────┐           ┌─────────────────┐
             │    │ User taps Allow │           │ User taps Skip  │
             │    └────────┬────────┘           └────────┬────────┘
             │              │                            │
             │              ▼                            ▼
             │    ┌─────────────────┐           ┌─────────────────┐
             │    │ Browser shows   │           │ Action blocked  │
             │    │ native location │           │ (can try later) │
             │    │ permission      │           └─────────────────┘
             │    └────────┬────────┘
             │              │
             │    ┌────────┴────────┐
             │    │                 │
             │    ▼                 ▼
             │   Allow           Block
             │    │                 │
             │    ▼                 ▼
             │ ┌─────────┐   ┌──────────────┐
             │ │Location │   │Show device-  │
             │ │obtained!│   │specific help │
             │ └────┬────┘   │instructions  │
             │      │        └──────────────┘
             └──────┼──────────────┘
                    │
                    ▼
          ┌─────────────────┐
          │ Check distance  │
          │ from show       │
          └────────┬────────┘
                   │
        ┌──────────┴──────────┐
        │                     │
        ▼                     ▼
  ┌───────────┐        ┌─────────────┐
  │ Within    │        │ Too far     │
  │ range ✅  │        │ away ❌     │
  └─────┬─────┘        └──────┬──────┘
        │                     │
        ▼                     ▼
  ┌───────────┐        ┌─────────────┐
  │ Request   │        │ Show error  │
  │ allowed!  │        │ message     │
  └───────────┘        └─────────────┘
```

### Technical Flow

1. **User Interaction**: User taps "Request Song" or "Vote"
2. **Check Cache**: System checks for valid cached location (< 30 minutes old)
3. **Show Modal**: If no cached location, display friendly explanation modal
4. **Browser Permission**: After user taps "Allow", browser's native GPS dialog appears
5. **Get Coordinates**: Browser obtains GPS coordinates from device
6. **Distance Check**: System calculates distance from configured show location
7. **Allow/Block**: Request proceeds if within radius, or shows friendly error if too far

---

## User Interface Components

### 1. Location Permission Modal

A two-stage modal that appears only when needed:

**Stage 1: Explanation**
- Explains why location is needed (fair song requests)
- Privacy notice (location not stored)
- "Remember this device" checkbox
- Clear "Allow" and "Maybe Later" buttons

**Stage 2: Requesting** (after user taps Allow)
- Shows loading state with visual prompt
- Device-specific hint about what to tap
- Cancel button to abort

**Stage 3: Error** (if permission denied)
- Device-specific recovery instructions
- iOS: Settings app navigation
- Android: Browser permission reset
- Desktop: Address bar icon instructions
- "Try Again" and "Skip for Now" buttons

### 2. Location Status Badge

A small indicator in the jukebox header showing:
- ✅ **"X.X mi"** - Location verified, shows distance
- 📍 **"Too Far"** - Location verified but out of range
- 🚫 **"Blocked"** - Permission denied (clickable to fix)
- 📍 **"Checking..."** - Getting location (animated)
- 📍 **"Enable"** - No permission yet (clickable)

### 3. Toast Notifications

Non-blocking notifications for:
- ✅ "Location enabled! You can now request songs."
- 🎵 "Song added to queue!"
- 🚫 "Location access blocked. Enable it to request songs."
- 📍 "You're too far from the show to request songs."

---

## Device-Specific Instructions

### iOS (iPhone/iPad)

When permission is blocked, users see:
1. Open **Settings** app on your device
2. Scroll down and tap **Safari** (or your browser)
3. Tap **"Location"**
4. Select **"Ask"** or **"Allow"**
5. Come back here and tap **"Allow"** again

**Note**: iOS may also require Location Services to be enabled in:
Settings → Privacy & Security → Location Services

### Android

When permission is blocked, users see:
1. When the browser prompt appears, tap **"Allow"**
2. If you previously blocked it: tap the 🔒 icon in the address bar
3. Tap **"Permissions"** or **"Site settings"**
4. Find **"Location"** and change to **"Allow"**
5. Refresh the page and try again

**Tip**: Make sure Location is enabled in device settings (Settings → Location)

### Desktop (Chrome, Firefox, Safari, Edge)

When permission is blocked, users see:
1. Look for the 🔒 icon in your browser's address bar
2. Click it and find **"Site settings"** or **"Permissions"**
3. Find **"Location"** in the list
4. Change it from **"Block"** to **"Allow"**
5. Refresh the page and try again

---

## Admin Configuration

### Access Settings

1. Navigate to **Admin Panel** → **Settings**
2. Click **📍 Location** tab

### Setup Steps

#### 1. Enable Location Restrictions

Toggle **"Enable Location Restrictions"** checkbox.

#### 2. Set Show Location

**Option A: Use Browser Geolocation (Recommended)**
- Click **"📍 Use My Current Location"**
- Allow browser to access your location
- Coordinates auto-fill

**Option B: Manual Entry**
- Enter **Latitude** (e.g., 40.712776)
- Enter **Longitude** (e.g., -74.005974)
- Optionally add a **Location Name** for reference

**Option C: Use Google Maps**
1. Open Google Maps and find your show location
2. Right-click and select "What's here?"
3. Copy the coordinates shown at the bottom
4. Enter them in the admin panel

#### 3. Set Maximum Distance

Use the slider to set how far from the show users can request songs:
- **0.1 miles**: Very tight radius (show property only)
- **0.5 miles**: Close neighborhood
- **1 mile**: Recommended for most shows
- **3 miles**: Suburban area
- **5+ miles**: Wide area coverage

#### 4. Save Settings

Click **"💾 Save Settings"** to apply changes immediately.

---

## Storage & Caching

### localStorage (Persistent)

```javascript
// Permission status - persists across browser sessions
localStorage.getItem('fpp-location-permission-status')  // 'granted' | 'denied' | 'skipped'

// User location - cached for 30 minutes
localStorage.getItem('fpp-user-location')     // JSON: { lat, lng, accuracy, source }
localStorage.getItem('fpp-location-timestamp') // Unix timestamp

// Device preference
localStorage.getItem('fpp-remember-location-device')  // 'true' | 'false'
```

### sessionStorage (Fallback)

For backwards compatibility with existing sessions:
```javascript
sessionStorage.getItem('location-permission-requested')
sessionStorage.getItem('user-location')
sessionStorage.getItem('user-location-timestamp')
```

### Cache Behavior

- Location cached for **30 minutes** (typical show duration)
- Permission status persists **indefinitely** until cleared
- Users can reset via Location Status Badge or "Update Location" link

---

## Code Architecture

### Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `LocationPermissionModal` | `components/LocationPermissionModal.tsx` | Two-stage permission flow with device-specific help |
| `LocationStatusBadge` | `components/LocationStatusBadge.tsx` | Header indicator showing location status |
| `Toast` | `components/Toast.tsx` | Non-blocking notifications |

### Utilities

| Function | Location | Purpose |
|----------|----------|---------|
| `getBrowserLocation()` | `lib/location-utils.ts` | Wrapper for navigator.geolocation.getCurrentPosition |
| `getDistanceInMiles()` | `lib/location-utils.ts` | Haversine formula distance calculation |
| `getCachedLocation()` | `components/LocationPermissionModal.tsx` | Read cached location from localStorage |
| `getStoredPermissionStatus()` | `components/LocationPermissionModal.tsx` | Read permission status from localStorage |
| `clearLocationPermission()` | `components/LocationPermissionModal.tsx` | Reset all location data |

### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/location-restrictions` | GET | Settings. Public: on/off, `configured` and the allowed distance only. Admin: also the show's coordinates and location name |
| `/api/location-restrictions/check` | POST | Public, rate limited (30/min per IP). Body `{ lat, lng }`; replies whether the visitor is in range and how far away (to 0.1 mile). The show's coordinates never leave the server |
| `/api/location-restrictions` | PUT | Update settings (admin only) |
| `/api/jukebox/queue` | POST | Submit song request (validates location) |
| `/api/votes` | POST | Submit vote (validates location) |

---

## Database Schema

### Table: `location_restrictions`

```sql
CREATE TABLE location_restrictions (
  id INTEGER PRIMARY KEY CHECK (id = 1),  -- Single row
  is_active INTEGER NOT NULL DEFAULT 0,
  max_distance_miles REAL NOT NULL DEFAULT 1.0,
  show_latitude REAL,
  show_longitude REAL,
  show_location_name TEXT,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_by_admin TEXT
);
```

### Columns in `jukebox_queue`

```sql
latitude REAL,           -- User's GPS latitude
longitude REAL,          -- User's GPS longitude
city TEXT,               -- Derived from coordinates (optional)
distance_from_show REAL  -- Distance in miles at request time
```

---

## Privacy & Security

### What Data Is Collected

| Data | When | Retention |
|------|------|-----------|
| GPS coordinates | On request/vote | Cached 30 min client-side, stored with request server-side |
| Distance from show | On request/vote | Stored with request permanently |
| Permission status | On user decision | localStorage (indefinite until cleared) |

### What Is NOT Collected

- ❌ Precise address (never reverse geocoded automatically)
- ❌ Location history or tracking
- ❌ Location when browsing (only on interaction)
- ❌ IP-based location fallback

### User Control

Users can:
- Decline permission (can still browse queue/videos)
- Reset permission anytime via badge or browser settings
- Clear all data by clearing browser storage

---

## Troubleshooting

### "Location permission was denied"

**User action needed:**
1. Check the device-specific instructions in the error modal
2. For iOS: Enable in Settings → Safari → Location
3. For Android/Desktop: Click lock icon in address bar

**Admin check:**
- Ensure site is served over HTTPS (required for geolocation)
- localhost is an exception (works over HTTP)

### "You're too far from the show"

**Possible causes:**
1. User is genuinely too far away
2. GPS accuracy issue (indoor location)
3. Show coordinates incorrectly configured

**Admin check:**
1. Verify show coordinates in admin panel
2. Consider increasing radius temporarily
3. Check Google Maps visualization

### Location always shows "Checking..."

**Possible causes:**
1. GPS hardware disabled on device
2. Poor GPS signal (indoors)
3. Browser taking too long (15 second timeout)

**User action:**
- Step outside for better GPS signal
- Enable device location services
- Try again after refreshing page

### Badge shows "Enable" but user already allowed

**Possible causes:**
1. Location cache expired (> 30 min)
2. localStorage was cleared
3. Incognito/private browsing mode

**Solution:**
User just needs to click the badge to re-authorize.

---

## Testing Guide

### Test Locally

1. Run `npm run dev` (localhost works without HTTPS)
2. Enable location restrictions in admin panel
3. Set show location to your current coordinates
4. Set radius to 0.5 miles
5. Open jukebox page in new incognito window
6. Try requesting a song - should see permission modal
7. Allow location - should succeed

### Test Different Scenarios

| Scenario | Expected Behavior |
|----------|-------------------|
| First visit, click Request | Modal appears explaining location need |
| Allow permission | Toast: "Location enabled!", can request |
| Deny permission | Banner: "Location Access Denied", badge: "Blocked" |
| Skip modal | Can try again on next action |
| User too far away | Toast + message: "You're X miles away" |
| Cached location (< 30 min) | Immediate action, no modal |
| Cached location (> 30 min) | Re-requests location silently |

### Test on Mobile Devices

**iOS Testing:**
1. Use Safari (Chrome iOS has limitations)
2. Enable location services for Safari
3. Test both WiFi and cellular

**Android Testing:**
1. Use Chrome for best experience
2. Enable device location services
3. Test permission reset via site settings

---

## Migration from IP-Based Geolocation

If upgrading from the previous IP-based implementation:

### What Changed

| Before (IP-based) | After (GPS-based) |
|-------------------|-------------------|
| ip-api.com lookup | navigator.geolocation |
| ~3-50 mile accuracy | ~5-50 meter accuracy |
| Works without user action | Requires user permission |
| No mobile support | Excellent mobile support |
| VPN/proxy issues | No VPN issues |
| Server-side only | Client + server validation |

### Data Migration

No migration needed - the schema is compatible. New GPS coordinates will be stored in the same `latitude`/`longitude` columns.

### Breaking Changes

- Users must now grant browser permission
- Old sessions without permission will need to re-authorize
- `source` field now indicates `'gps'` instead of `'ip'`

---

## Future Enhancements

### Planned

- [ ] **Geofence polygons**: Complex boundaries instead of circular radius
- [ ] **Multiple show locations**: Support touring/multiple venues
- [ ] **Admin location dashboard**: Map visualization of user distribution
- [ ] **Accessibility improvements**: Screen reader announcements

### Considering

- [ ] **Background location updates**: Re-verify while on page
- [ ] **Altitude verification**: Prevent spoofing from different floors
- [ ] **Heading/movement detection**: Detect if user is moving toward show

---

## Support

For issues with the geolocation feature:

1. Check console logs (F12 → Console) for `[Location]` prefixed messages
2. Review this documentation for troubleshooting steps
3. Create issue on [GitHub](https://github.com/joeally06/FPP-Control-Center/issues)

Include in bug reports:
- Device type (iOS/Android/Desktop)
- Browser name and version
- Whether on HTTPS or localhost
- Console error messages
