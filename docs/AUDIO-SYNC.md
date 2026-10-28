# Audio Sync Implementation

## Overview

The FPP Control Center now includes a **mobile audio sync system** that allows visitors to listen to show music synchronized with the light display on their mobile devices.

## Architecture

This implementation uses a three-component architecture:

### 1. **Admin Media Manager** (`/admin/media`) ✅ Complete
- Download audio files from FPP to local storage (`public/audio/`)
- Create sequence → audio file mappings
- Filter by playlist for easy management
- Secure admin-only access

### 2. **Audio Sync Server** (`/api/audio/sync`) ✅ Complete
- Server-Sent Events (SSE) for real-time sync
- Polls FPP status every 2 seconds while at least one listener is connected (it stops when the last one leaves)
- Broadcasts current sequence + position to all connected clients
- Uses audio mappings to determine which file to play

### 3. **Audio Sync Player** (`AudioSyncPlayer` component) ✅ Complete
- Mobile-friendly audio player
- Auto-syncs with FPP timing (corrects drift > 1 second)
- Volume controls with mute
- Connection status indicator
- Auto-reconnect on disconnect

---

## How It Works

### Admin Setup Flow

1. **Admin goes to `/admin/media`**
2. **Selects a playlist** (e.g., "Christmas 2023")
3. **Downloads audio files** from FPP to local storage
4. **Creates mappings** linking sequences to audio files
5. **Audio files are saved** to `public/audio/` directory
6. **Mappings are saved** to `data/audio-mapping.json` (local to each install, not in git — include it in your own backups)

### Visitor Experience Flow

1. **Visitor goes to `/jukebox`**
2. **AudioSyncPlayer loads** (below "Now Playing")
3. **Connects to `/api/audio/sync`** via EventSource
4. **Receives real-time updates** every 2 seconds:
   - Current sequence name
   - Audio file to play
   - Playback position (seconds)
   - Timestamp for sync calculation
5. **Player loads audio** from `/audio/FILENAME`
6. **Syncs playback** with FPP timing:
   - Detects drift > 1 second
   - Seeks to correct position
   - Plays/pauses based on FPP status

### Sync Algorithm

```javascript
// Calculate target position accounting for network latency
const targetPosition = data.position + (Date.now() - data.timestamp) / 1000;
const currentPosition = audioRef.current.currentTime;
const drift = Math.abs(targetPosition - currentPosition);

// If drift > 1 second, seek to correct position
if (drift > 1.0) {
  audioRef.current.currentTime = targetPosition;
}
```

---

## File Structure

```
FPP-Control-Center/
├── app/
│   ├── admin/
│   │   └── media/
│   │       └── page.tsx              # Admin media manager UI
│   ├── api/
│   │   ├── audio/
│   │   │   ├── mapping/
│   │   │   │   └── route.ts          # CRUD for sequence mappings
│   │   │   └── sync/
│   │   │       └── route.ts          # SSE server for audio sync
│   │   └── fpp/
│   │       └── media/
│   │           ├── download/
│   │           │   └── route.ts      # Download audio from FPP
│   │           ├── list/
│   │           │   └── route.ts      # List FPP audio files
│   │           └── local/
│   │               └── route.ts      # List/delete local audio
│   └── jukebox/
│       └── page.tsx                  # Visitor jukebox (includes player)
├── components/
│   ├── admin/
│   │   └── MediaManager.tsx          # Admin media management UI
│   └── AudioSyncPlayer.tsx           # Mobile audio player component
├── data/
│   └── audio-mapping.json            # Sequence → audio file mappings
└── public/
    └── audio/                        # Local audio storage
        ├── song1.mp3
        ├── song2.mp3
        └── ...
```

---

## API Endpoints

### Audio Sync

#### `GET /api/audio/sync`
**Server-Sent Events (SSE)** - Real-time audio sync stream

**Response Format:**
```javascript
data: {
  "isPlaying": true,
  "currentSequence": "Jingle Bells",
  "audioFile": "jingle-bells.mp3",
  "position": 12.5,
  "timestamp": 1704123456789
}
```

**Events:**
- Sent every 2 seconds while sequence is playing
- Sent immediately on sequence change
- Keep-alive ping every 30 seconds

#### `POST /api/audio/sync`
**Reload Mappings** (Admin only)

Forces reload of `audio-mapping.json` without restarting server.

**Response:**
```json
{
  "success": true,
  "mappings": 15
}
```

### Audio Mappings

#### `GET /api/audio/mapping`
Get all sequence → audio mappings (public)

**Response:**
```json
{
  "Jingle Bells": "jingle-bells.mp3",
  "Silent Night": "silent-night.mp3"
}
```

#### `POST /api/audio/mapping`
Create/update mapping (admin only)

**Request:**
```json
{
  "sequenceName": "Jingle Bells",
  "audioFile": "jingle-bells.mp3"
}
```

#### `DELETE /api/audio/mapping`
Delete mapping (admin only)

**Request:**
```json
{
  "sequenceName": "Jingle Bells"
}
```

### FPP Media

#### `GET /api/fpp/media/list`
List all audio files on FPP server

**Response:**
```json
{
  "files": ["song1.mp3", "song2.mp3"]
}
```

#### `GET /api/fpp/media/download?filename=song.mp3`
Download audio file from FPP (admin only)

Downloads file from FPP and saves to `public/audio/`

**Security Features:**
- Magic bytes validation (MP3, WAV, OGG, etc.)
- 50MB file size limit
- Path traversal prevention
- SHA256 integrity hashing

#### `GET /api/fpp/media/local`
List local audio files

**Response:**
```json
{
  "files": [
    {
      "name": "song.mp3",
      "size": 5242880,
      "modified": "2024-01-01T12:00:00Z"
    }
  ]
}
```

#### `DELETE /api/fpp/media/local?filename=song.mp3`
Delete local audio file (admin only)

---

## Security Considerations

### Authentication & Authorization
- ✅ All admin operations require authenticated session
- ✅ Role check: `session?.user?.role === 'admin'`
- ✅ Public endpoints: `/api/audio/sync`, `/api/audio/mapping` (GET only)

### File Upload/Download Security
- ✅ **Path Traversal Prevention**: Blocks `..`, `/`, `\` in filenames
- ✅ **Magic Bytes Validation**: Verifies file type from content (not just extension)
- ✅ **File Size Limits**: 50MB maximum for downloads
- ✅ **Filename Sanitization**: `[^a-zA-Z0-9.\s_()-]` → `_`
- ✅ **Content-Type Validation**: Blocks HTML/JSON/text responses
- ✅ **SHA256 Hashing**: Integrity verification for downloads

### Storage Security
- ✅ Files stored in `public/audio/` (served by Next.js static handler)
- ✅ Mappings stored in `data/audio-mapping.json` (server-side only)
- ✅ File permissions: 644 (readable, not executable)

### Rate Limiting
- ⚠️ **TODO**: Add rate limiting to SSE connections (prevent abuse)
- ⚠️ **TODO**: Add rate limiting to download endpoint (prevent hammering FPP)

---

## Performance Considerations

### Server-Side
- **SSE over WebSocket**: Better Next.js compatibility, simpler implementation
- **2-second polling**: Balance between responsiveness and FPP load
- **Broadcast optimization**: Only send updates when state changes
- **Dead client cleanup**: Automatically removes disconnected clients

### Client-Side
- **Audio pre-loading**: `preload="auto"` for instant playback
- **Drift detection**: Only seeks if > 1 second drift (prevents jitter)
- **Auto-reconnect**: 5-second delay after disconnect
- **Keep-alive pings**: Prevents connection timeout (30s interval)

### Bandwidth Usage
- **SSE overhead**: ~100 bytes per update (2 seconds = ~50 bytes/s per client)
- **Audio files**: Served from local storage (no FPP bandwidth)
- **One-time download**: Admin downloads once, all visitors stream from local

---

## Mobile Considerations

### Browser Compatibility
- ✅ **EventSource**: Supported in all modern mobile browsers
- ✅ **HTML5 Audio**: Universal support (iOS, Android)
- ✅ **Auto-play Policy**: Requires user interaction (handled by component)

### UI/UX
- ✅ **Volume controls**: Large, touch-friendly buttons
- ✅ **Connection status**: Clear indicator (green pulse when connected)
- ✅ **Error messages**: User-friendly explanations
- ✅ **Responsive layout**: Card-based design, mobile-first

### iOS Specific
- ⚠️ **Auto-play Restrictions**: User must interact before audio plays
  - Component handles this with "tap to retry" message
- ⚠️ **Background Playback**: Audio pauses when app backgrounded
  - Resumes sync when returning to app
- ⚠️ **Lock Screen Controls**: Not implemented (could be added with Media Session API)

---

## Testing Checklist

### Admin Setup
- [ ] Go to `/admin/media`
- [ ] Select a playlist (e.g., "Christmas 2023")
- [ ] Download an audio file from FPP
- [ ] Verify file appears in "Local Audio Files"
- [ ] Create a sequence mapping
- [ ] Verify mapping appears in table

### Visitor Experience
- [ ] Go to `/jukebox`
- [ ] Verify AudioSyncPlayer shows "Connected"
- [ ] Start a sequence on FPP
- [ ] Verify player loads correct audio file
- [ ] Verify audio plays in sync with lights
- [ ] Test volume controls (up/down/mute)
- [ ] Disconnect WiFi → reconnect → verify auto-reconnect
- [ ] Test on iOS device
- [ ] Test on Android device

### Edge Cases
- [ ] No audio mapping for current sequence (should show "waiting for show")
- [ ] Audio file missing from `public/audio/` (should show error)
- [ ] FPP offline (should maintain connection, show "waiting")
- [ ] Multiple clients (should all sync correctly)
- [ ] Sequence changes mid-play (should switch audio files)

---

## Troubleshooting

### "Connection error" message
**Cause**: SSE connection failed

**Solutions:**
1. Check server is running: `npm run dev`
2. Check `/api/audio/sync` endpoint accessible
3. Check browser console for errors
4. Try refreshing page

### Audio not playing
**Cause**: Auto-play policy or missing file

**Solutions:**
1. Tap the screen (iOS auto-play restriction)
2. Check audio mapping exists for current sequence
3. Check audio file exists in `public/audio/`
4. Check browser console for errors

### Audio out of sync
**Cause**: Network latency or drift detection disabled

**Solutions:**
1. Check network connection quality
2. Verify FPP status polling is active (server logs)
3. Check drift > 1 second (component auto-corrects)

### "Failed to load mappings" error (server logs)
**Cause**: `data/audio-mapping.json` missing

**Solution:**
```bash
echo "{}" > data/audio-mapping.json
```

---

## Future Enhancements

### High Priority
- [ ] **Rate limiting** on SSE connections
- [ ] **Admin dashboard** showing connected clients
- [ ] **Batch download** multiple audio files at once
- [ ] **Playlist auto-mapping** (auto-create mappings from playlist)

### Medium Priority
- [ ] **Audio pre-caching** (download next sequence in playlist)
- [ ] **Waveform visualization** (show audio waveform on player)
- [ ] **Media Session API** (lock screen controls on mobile)
- [ ] **Quality settings** (different bitrates for mobile data)

### Low Priority
- [ ] **Standalone `/listen` page** (audio-only, no requests)
- [ ] **Chromecast support** (cast audio to speakers)
- [ ] **Multi-language support** (i18n for UI)
- [ ] **Analytics** (track audio sync usage, errors)

---

## Development Notes

### Why SSE over WebSocket?
- **Next.js Compatibility**: App Router doesn't support WebSocket upgrades natively
- **Simpler Implementation**: No need for custom server or Socket.io
- **Browser Support**: EventSource universally supported
- **Unidirectional**: Perfect for broadcast (server → clients only)

### Why 2-second polling?
- **FPP Load**: Balance between responsiveness and server load
- **Drift Tolerance**: 1-second drift threshold means 2s polling is acceptable
- **Bandwidth**: 50 bytes/s per client is negligible

### Why local storage over streaming?
- **FPP Bandwidth**: Protects FPP from handling many concurrent audio streams
- **Reliability**: Local files never have network issues
- **Quality**: Consistent audio quality, no buffering
- **Control**: Admin chooses exactly which files are available

---

## Credits

- **FPP (Falcon Player)**: https://github.com/FalconChristmas/fpp
- **Next.js**: https://nextjs.org/
- **Server-Sent Events**: https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events

---

## Support

For issues or questions:
1. Check [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
2. Review server logs for errors
3. Check browser console for client-side errors
4. Create GitHub issue with:
   - Browser/device info
   - Error messages
   - Steps to reproduce
