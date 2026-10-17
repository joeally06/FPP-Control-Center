# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-10-17

### Visitor Jukebox Redesign - Seasonal Halloween & Christmas 🎃🎄

#### ⚠️ Breaking changes

- **Only two themes remain: Halloween and Christmas.** Default, Valentine's, Summer, Spring, 4th of July and Autumn are removed, along with the particle-effect picker. A site still set to a removed theme shows Christmas.
- **The three jukebox banners are now one optional off-season message.** The Countdown and Offline banners and the banner colour presets are removed; the page shows show times, the countdown and live/offline status itself. Saved off-season text carries over.

#### 🎉 Added

- **Redesigned visitor page** shared by both seasons: top bar with a round badge and FM frequency, string lights, a hero with the show logo and a live-status pill ("Live now · until 10 PM"), a glowing Now Playing card, and Up Next with wait estimates
- **Logo and badge uploads** per theme on Theme Settings, stored in the database (resized to WebP) and served with long-lived caching
- **Show name** setting (Settings → Visitor Page) for the name in the top bar and footer
- **Song details**: titles, artist, length and admin-set categories in the song list, with search and category filters
- **Behind the Pixels** display facts and an **"N watching now"** counter, both optional
- **Request confirmation** with your place in line and an estimated wait
- Christmas only: **Write to Santa** card and a **Christmas trivia** card; falling snow. Halloween: starry night sky

#### 🔧 Changed

- Each season uses lettering that matches its logo (Rye for Halloween, Oswald with a script accent for Christmas)
- Theme Settings is now two cards (make active, logo, badge) instead of a grid of eight themes
- The schedule status API also returns the end time of the show that is on now

#### 🐛 Fixed

- Clearing a visitor's request limit now gives back the full allowance, even while one of their songs is playing
- Top bar buttons no longer overlap on phones, and the "requests left" message is no longer hidden under the bar
- Long song titles no longer push the Request buttons off narrow screens
- The jukebox queue transaction test passes again

#### 🔒 Security

- Public queue endpoints no longer expose requester IP addresses and other visitor data
- The settings API, slideshow deletes, theme switching and banner saving now verify the admin email list instead of trusting the session's role claim
- Banner saving only accepts its own fields, with length limits; logo uploads accept JPEG, PNG and WebP only and are always re-encoded
- Dependency updates for nodemailer and sharp

#### 🗄️ Upgrade notes

- Migrations `019_jukebox_song_details`, `020_jukebox_rate_limit_resets` and `021_theme_assets` run automatically during the update; all are additive
- After updating: upload each season's logo (and optional badge) in Theme Settings, and set the Show name under Settings → Visitor Page
- Versions 1.6.1–1.8.0 (digital signage display, slideshow, countdown timer and display profiles) shipped without changelog entries; see the git history for details

## [1.6.0] - 2025-12-10

### Santa Letters - Ollama Model Management 🎅🤖

#### 🎉 Added

- **Model Installation from UI**
  - Install Ollama models directly from settings page
  - New "Install New Model" section with one-click model pulling
  - Link to ollama.com/library to browse available models
  - Progress feedback during model downloads

- **Enhanced Model Selection**
  - Models now display with size information in dropdown
  - Real-time model metadata (size, family, parameters)
  - "Refresh Models" button to fetch latest installed models

- **Performance Warnings**
  - Color-coded warnings based on model size (green/blue/yellow/red)
  - Special warning for large models like DeepSeek R1 (47GB)
  - Estimated response times displayed for each model
  - RAM requirement recommendations
  - Confirmation modal for models >10GB

- **Model Validation**
  - Automatic validation that selected model exists before use
  - Fallback to llama3.2:latest if selected model unavailable
  - Error handling with graceful degradation

#### 🔧 Changed

- **Default Model**: Changed from deepseek-r1:latest to llama3.2:latest (lighter, faster)
- **Model Display**: Dropdown now shows model size alongside name
- **Fallback Options**: Updated hardcoded fallback list with :latest tags

#### 🔒 Security

- **Input Sanitization**: Model names validated with strict regex (prevents command injection)
- **Admin Authentication**: All model management endpoints require admin access
- **Length Limits**: Model names capped at 100 characters
- **Path Traversal Prevention**: Only alphanumeric, dots, colons, hyphens allowed

#### 🐛 Fixed

- **Settings Persistence**: Fixed updateSettings() to preserve category column
- Models now correctly save and load from database with proper category
- Model selection persists across page reloads

#### 📁 New Files

- `app/api/ollama/pull/route.ts` - Model installation endpoint
- `lib/model-warnings.ts` - Warning system for model sizes

#### 🔄 Modified Files

- `app/settings/page.tsx` - Added model installation UI and warnings
- `lib/ollama-client.ts` - Added model availability validation
- `app/api/ollama/models/route.ts` - Enhanced with metadata
- `lib/settings.ts` - Fixed category preservation on update

---

## [1.5.0] - 2025-12-04

### Lazy Location Permission Flow 📍

#### 🎉 Added

- **Lazy Location Checking**
  - Location permission is now requested only when users try to vote or request songs
  - No upfront location prompts - users can browse freely without interruption
  - Pending actions (vote/request) automatically execute after granting permission

#### 🔧 Changed

- **Removed Intrusive Location UI**
  - Removed large "Location Access Denied" warning banner from page top
  - Location status badge now only shows distance when location is available
  - Badge hidden entirely when geo-tracking is disabled in admin settings

- **Improved User Experience**
  - Streamlined inline location error messages (compact single-line format)
  - Friendlier toast notifications for location states
  - "Maybe Later" option in modal lets users skip without feeling blocked

- **Cleaner Badge Behavior**
  - Badge only displays when restrictions are enabled AND location is available
  - Shows distance in miles (green when in range, yellow when out of range)
  - No more "Enable Location", "Blocked", or "Checking" badge states

#### 🐛 Fixed

- Location errors now clear when opening the permission modal
- Pending vote/request actions properly execute after permission granted

---

## [Unreleased]

### Planned Features
- Advanced theme builder with custom gradients
- Multi-admin user management
- Automated backup/restore system
- Enhanced analytics dashboard with charts
- Mobile app companion
- Playlist scheduling system
- Weather-based show automation
- Admin monitoring dashboard for FPP poller health

---

## [1.3.0] - 2025-11-27

### Unified Media Center & Audio Sync Improvements 🎵

#### 🎉 Added

- **Unified Media Center**
  - Combined Media Library and Media Manager into single tabbed interface
  - Three tabs: Library (Spotify/FPP sync), Audio Sync (sequence mapping), Local Files
  - Independent playlist selection per tab for better workflow
  - Consolidated navigation with single "Media Center" menu item

- **New Audio Sync APIs**
  - `/api/audio/playlist-status` - Get sequence status with audio file info from cached playlists
  - `/api/audio/download` - Download audio files directly from FPP with correct endpoint (`/api/file/music/`)
  - `/api/audio/mappings` - Manage sequence-to-audio file mappings
  - `/api/audio/local-files` - List and manage local audio files

- **Automatic Audio Mapping**
  - Downloads now auto-create mappings (sequence → audio file)
  - Reads `mediaName` directly from FPP playlist data for accurate downloads
  - No more 502/404 errors - uses correct FPP `/api/file/music/{filename}` endpoint

- **Manual Mapping UI**
  - "Map Audio" button for sequences needing manual linking
  - "Remap" button to change existing mappings
  - Dropdown selector shows all available local audio files
  - Shows FPP `mediaName` in yellow when available but not yet downloaded

#### 🔧 Changed

- Audio Sync tab no longer shows FPP sync/Spotify refresh banner (Library tab only)
- Improved status logic: sequences with `mediaName` show "needs-download", those without show "needs-mapping"
- Better error messages with URL details for debugging FPP connection issues

#### 🗑️ Removed

- Deleted separate `/app/admin/media/page.tsx` (merged into unified Media Center)
- Deleted `components/admin/MediaManager.tsx` (functionality integrated)

---

## [1.2.0] - 2025-11-25

### Media Manager UI Redesign & Build System Fixes 🎨

#### 🎉 Added

- **Complete Media Manager Redesign**
  - Workflow-centric UI: Select Playlist → Review Status → Fix Issues
  - Clean dark theme matching admin panel (`bg-gray-800`, `border-gray-700`)
  - Inline action buttons (Download, Map) directly in sequence rows
  - Status badges: ✅ Ready (green), ⚠️ Needs Mapping (yellow), ❌ Missing (red)
  - Progress summary showing Ready/Needs Mapping/Missing counts
  - Quick action buttons for batch operations (Download All Missing, Fix All Mappings)
  - Collapsible manual mapping sections with sequence-specific file selection
  - Real-time status updates after downloads/mappings

- **New Admin API Endpoint (`/api/admin/playlist-status`)**
  - Aggregates playlist sequence status in one request
  - Admin-only with session validation
  - Returns status for each sequence: `ready`, `missing_local`, `needs_mapping`
  - Identifies matched local files for each sequence
  - Efficient database queries with proper error handling

- **Next.js Instrumentation System (`instrumentation.ts`)**
  - Centralized background service initialization
  - Prevents service startup during build phase
  - Starts Santa Queue Processor, Device Monitor, and DB Scheduler on runtime only
  - Uses Next.js official lifecycle hook for proper server startup

- **Implementation Documentation**
  - `docs/HYBRID-AUDIO-SYNC-IMPLEMENTATION.md` - Complete technical documentation
  - Covers architecture, sync algorithm, mapping priority, and troubleshooting

#### 🐛 Fixed

- **Build Process Crashes (ECONNREFUSED)**
  - Background services (queue processor, device monitor, db-scheduler) no longer auto-start during `npm run build`
  - Services now use `instrumentation.ts` instead of module-level auto-start
  - Eliminates "ECONNREFUSED 127.0.0.1:3000" errors during static generation

- **Audio Mapping Not Working for Special Characters**
  - Updated sanitization regex from `/[^a-zA-Z0-9._-]/g` to `/[^a-zA-Z0-9._\-\s'()]/g`
  - Now properly handles filenames with spaces, apostrophes, and parentheses
  - Fixes issue where manually mapped sequences wouldn't match

- **Audio Sync Algorithm Improvements**
  - Simplified drift correction logic
  - Tiered sync behavior: <5s ignore, 5-10s gradual, >10s immediate seek
  - Prevents audio skipping on periodic server broadcasts
  - Improved auto-advance to next sequence

#### 🔧 Changed

- **Service Architecture**
  - `lib/santa-queue-processor.ts` - Removed auto-start, exported `startSantaQueueProcessor()`
  - `lib/device-monitor.ts` - Removed auto-start, exported `startDeviceMonitor()`
  - `lib/db-scheduler.ts` - Removed auto-start, exported `startDBScheduler()`
  - All services now initialized in `instrumentation.ts` during server runtime

- **Audio Sync Priority**
  - Manual mappings now take precedence over fuzzy matching
  - Match order: Exact filename → Manual mapping → Partial match → Normalized match
  - Improved reliability for custom sequence names

- **UI/UX Improvements**
  - Replaced complex tabbed interface with streamlined workflow
  - Removed card-based layout in favor of clean table view
  - Added playlist selector dropdown with sequence counts
  - Simplified local audio file management

#### 📊 Technical Details

- **Files Changed**: 11 files modified/added
- **New Files**: `instrumentation.ts`, `app/api/admin/playlist-status/route.ts`
- **Backup Created**: `components/AudioSyncPlayer.tsx.backup`
- **Build Verified**: ✅ All 84 routes compile successfully

#### 🚀 Migration Notes

- No database migrations required
- Fully backward compatible
- Existing audio mappings preserved
- No manual configuration changes needed

---

## [1.1.0] - 2025-11-25

### Visitor Audio Sync System Release 🎵

#### 🎉 Added

- **Audio Sync System**
  - Real-time audio playback synchronized with FPP light shows
  - Server-Sent Events (SSE) architecture for efficient streaming
  - Automatic audio file detection and matching (no manual mapping required)
  - Smart filename matching algorithm (exact match → partial match → normalized match)
  - Support for MP3, WAV, OGG, M4A, FLAC, and AAC formats
  - Visitor-facing audio player with manual controls
  - Play/Pause/Stop controls with proper sync behavior
  - Volume controls with mute functionality
  - Connection status indicator
  - Auto-reconnect on disconnect (5-second retry)
  - Keep-alive ping system (30-second intervals)

- **Admin Media Manager**
  - Download audio files from FPP server
  - Playlist-based filtering for organized downloads
  - Local file management (view, delete)
  - File size and modification date tracking
  - Playlist details viewer (songs, duration, count)
  - Usage indicators (files used in active playlists)
  - Batch operations support

- **Audio Sync Server (`/api/audio/sync`)**
  - SSE endpoint with ReadableStream
  - FPP status polling every 2 seconds
  - Conditional broadcast (20-second interval or state change)
  - Position calculation with timestamp interpolation
  - Automatic audio file scanning from `public/audio/`
  - Multi-client support with broadcast tracking
  - Graceful error handling and client cleanup

#### 🎨 UI/UX Improvements

- **Unified Theme**
  - Consistent purple/blue gradient cards across jukebox and admin
  - `bg-gradient-to-br from-purple-600/20 to-blue-600/20 border-purple-500/30`
  - Inner sections: `bg-white/5 border border-white/20`
  - Backdrop blur effects for modern glass morphism
  - Mobile-responsive design

- **AudioSyncPlayer Component**
  - Clean, minimalist interface
  - Prominent connection status
  - User-controlled playback (no auto-play on page load)
  - Real-time status updates
  - Smooth transitions and animations
  - Error handling without user-facing messages

#### ⚙️ Performance Optimizations

- **Smart Sync Logic**
  - 10-second drift tolerance (prevents micro-adjustments)
  - Only syncs when drift is significant (>10 seconds)
  - Natural catch-up for moderate drift (5-10 seconds)
  - Position updates during pause (ready for resume)
  - Minimized audio seeking operations
  - Eliminated skipping on periodic broadcasts

- **Broadcast Optimization**
  - Conditional broadcasting (state change OR 20-second interval)
  - Last broadcast timestamp tracking
  - Prevents excessive position updates
  - Efficient client notification system
  - Immediate broadcast on sequence changes

#### 🔧 Technical Details

- **Auto-Detection Algorithm**
  - Scans `public/audio/` directory on server start
  - Normalizes filenames: lowercase, remove apostrophes, replace `_`/`-` with spaces
  - Matching priority:
    1. Exact match (case-insensitive)
    2. Partial match (filename contains sequence name)
    3. Normalized match (handles special characters)
  - Successfully matches 15+ audio files automatically

- **Sync Calculation**
  - Position: `base_position + (Date.now() - timestamp) / 1000`
  - Client-side drift detection
  - Server-side position tracking
  - Timestamp-based interpolation for accuracy

#### 🐛 Fixed

- Audio skipping on periodic server broadcasts
- Excessive position resyncs causing audio interruptions
- Browser autoplay policy handling
- Connection state management
- Build cache issues with Next.js
- Error message display (removed user-facing errors)

#### 📝 Documentation

- Complete audio sync implementation guide
- Admin media manager usage instructions
- Technical architecture documentation
- Troubleshooting guide for common issues
- Browser compatibility notes

#### 🚀 Migration Notes

- No database migrations required
- Backward compatible with existing installations
- Audio files must be placed in `public/audio/`
- No manual mapping file needed (auto-detection replaces manual mapping)
- Works with existing FPP integration

---

## [1.0.2-rc.1] - 2025-11-10

### Schedule-Aware Jukebox & Service Management Release

#### 🎉 Added

- **Schedule-Aware Jukebox**
  - New `/api/jukebox/schedule-status` endpoint detects active show times
  - Themed banners for off-season messaging (Christmas 🎄, Halloween 🎃, Default ⏰)
  - Countdown timer showing time until next show ("in 5h 30m", "in 15 minutes!")
  - Conditional rendering: hides requests/voting/queue when show is inactive (admins always see features)
  - Three-source active detection: schedule time windows, playing status, current playlist
  - Auto-refresh every 30 seconds to stay synchronized with FPP scheduler

- **Enhanced Service Management**
  - `install.sh` now starts both PM2 services: `fpp-control` (main app) + `fpp-poller` (background service)
  - Automatic PM2 installation if missing
  - Service verification checks both processes are online before completion
  - Helpful post-install commands displayed (pm2 logs, pm2 status, pm2 restart)

#### 🐛 Fixed

- **Schedule Detection**: Now correctly detects shows running via FPP scheduler (which doesn't set `current_playlist` field)
  - Parses schedule `startDate`/`endDate` ranges
  - Checks if current time is within `startTime` to `endTime` window
  - Handles day-of-week restrictions (e.g., only Monday/Wednesday)

- **Now Playing Display**: Fixed status not showing when cache is stale
  - Detects stale cache (>60 seconds old or status='unknown')
  - Automatically falls back to direct FPP API query
  - Prevents double returns with `usedCache` flag

- **Service Startup**: Fixed `install.sh` only starting `fpp-control`, missing `fpp-poller`
  - Now uses `pm2 start ecosystem.config.js` to start both services from configuration
  - Verifies both services are running before declaring success

#### 🔧 Changed

- Jukebox UI now dynamically shows/hides interactive features based on schedule
- Non-admin users see friendly off-season messages instead of broken UI
- Schedule check integrated with existing theme system for consistent styling

---

## [1.0.1-rc.2] - 2025-11-09

### Performance & Architecture Release

#### 🚀 Added

- **FPP State Caching System**
  - Background polling service (`lib/fpp-poller.ts`) eliminates redundant frontend requests
  - Database caching tables: `fpp_state`, `fpp_cached_playlists`, `fpp_cached_playlist_sequences`, `fpp_poll_log`
  - `/api/fpp/cached-status` endpoint with sub-millisecond response times
  - Exponential backoff on FPP connection failures (5s → 60s max)
  - Auto-cleanup trigger keeps last 1000 poll logs
  - Health monitoring view (`fpp_health_summary`)
  - Graceful error handling and automatic retry logic
  - PM2 dual-process architecture (Next.js app + FPP poller)

- **Spotify Integration**
  - "Listen on Spotify" button in jukebox Now Playing section
  - Auto-fetch Spotify URLs when metadata is updated
  - Bulk refresh button in Media Library
  - Spotify URL caching in database
  - Helper scripts for backfilling existing sequences

- **Database Normalization (Migration 011)**
  - Unified `sequences` table eliminates duplication
  - Foreign key constraints on `jukebox_queue.sequence_id`
  - Migrated 32 sequences (29 custom + 3 auto) with zero data loss
  - Backward compatibility view for legacy queries
  - Play statistics preserved during migration

#### 🔧 Changed

- **Jukebox UI**
  - Now uses cached FPP status (faster, more scalable)
  - Stale data indicator (yellow banner after 30 seconds)
  - Removed direct FPP polling from frontend
  - Improved performance with database-backed status

- **API Routes**
  - `/api/jukebox/status` now reads from database cache
  - All FPP operations use prepared statements (security)
  - Rate limiting preparation for FPP endpoints

- **PM2 Configuration**
  - Updated `ecosystem.config.js` with fpp-poller process
  - 256MB memory limit for poller
  - Separate log files for each process
  - Auto-restart on crashes
  - Environment variable support (FPP_POLL_INTERVAL)

#### 🔐 Security

- Input validation on all FPP responses
- Prepared statements for all database operations
- 5-second timeout on FPP requests (prevents hanging)
- String sanitization (belt-and-suspenders approach)
- Transaction-based atomic updates
- Graceful error handling (no crashes on malformed data)

#### 📊 Database Migrations

- **Migration 010**: Added `spotify_url` columns to metadata tables
- **Migration 011**: Normalized sequences table with foreign keys
- **Migration 012**: FPP state caching infrastructure

#### 🐛 Fixed

- Redundant FPP polling from multiple users (now single backend poller)
- Database duplication between `spotify_metadata` and `sequence_metadata`
- Missing foreign key constraints on `jukebox_queue`
- Frontend performance issues from excessive FPP requests
- Scalability limitations with direct FPP polling

#### 📈 Performance Improvements

- **99% reduction** in FPP API calls (single poller vs per-user polling)
- Sub-millisecond cached status API responses
- Database-backed status supports unlimited concurrent users
- WAL mode + 64MB cache + prepared statements
- Memory-mapped I/O for faster database reads

#### 🧪 Testing & Validation

- Zero data loss verification for migration 011 (32 sequences preserved)
- Comprehensive validation scripts for all migrations
- Poller tested with offline FPP (graceful degradation)
- Build successful with all new routes
- Database integrity checks passed

---

## [1.0.0-rc.1] - 2025-11-05

### Initial Release Candidate

#### Added
- **Jukebox System**
  - Song request interface with search/filtering
  - Real-time queue management
  - Vote tracking for popular songs
  - Rate limiting to prevent spam
  - FPP integration with automatic playback

- **Admin Dashboard**
  - Real-time status monitoring
  - Live update system with progress tracking
  - Device health monitoring
  - Analytics overview
  - System configuration panel

- **Device Monitoring**
  - Automated health checks (configurable schedule)
  - Email alerts for offline devices
  - Device management (add/edit/delete)
  - Network device types (FPP, Falcon, projectors, switches, etc.)
  - Status dashboard with visual indicators

- **Santa Letter System**
  - Public form for children to write letters
  - AI-powered responses using Ollama
  - Email delivery of responses
  - Admin panel to view/manage letters
  - Rate limiting per IP address
  - Queue-based processing

- **Authentication & Security**
  - Google OAuth integration for admin login
  - Session-based authentication with NextAuth
  - Admin-only routes protection
  - CSRF protection
  - Rate limiting on all public endpoints
  - SQL injection prevention (parameterized queries)
  - XSS protection (React + sanitization)
  - Content Security Policy headers

- **Privacy & Compliance**
  - Cookie consent banner (GDPR/CCPA compliant)
  - Comprehensive privacy policy page
  - Granular cookie preferences (necessary, analytics, functional)
  - Privacy-respecting analytics tracking
  - User data rights documentation

- **Database Management**
  - Automated maintenance scheduler (daily quick, weekly full)
  - WAL mode for better concurrency
  - Automatic VACUUM and ANALYZE
  - Database optimization with indexes
  - 64MB cache size for performance
  - Manual maintenance triggers via admin panel

- **Models Library**
  - Import xLights models from FPP
  - View model details (channels, nodes, controllers)
  - Collapsible card interface
  - Export models as CSV/JSON
  - Edit model metadata
  - Delete unused models

- **Theme System**
  - Customizable color themes
  - Preset themes (default, neon, forest, ocean, sunset, midnight)
  - Live theme preview
  - Per-user theme persistence
  - Smooth transitions between themes

- **System Updates**
  - Web-based update interface
  - Real-time update progress tracking
  - Detached update process (survives server restart)
  - Live log streaming
  - Automatic rollback on failure
  - Backup before updates

- **FPP Integration**
  - Proxy API for all FPP endpoints
  - Sequence playback control
  - Playlist management
  - Status monitoring
  - Health checks

- **Cloudflare Tunnel Support**
  - Headless server setup script
  - Public HTTPS access without port forwarding
  - Cross-device authentication flow
  - Comprehensive documentation

- **Developer Experience**
  - TypeScript throughout
  - ESLint configuration
  - Semantic versioning system
  - Version bump automation
  - Git hooks for pre-commit checks
  - Automated scripts for setup/deployment

#### Security
- Admin authentication required for all management endpoints
- Rate limiting: 10 requests per 15 minutes on sensitive endpoints
- Session timeout after 30 days of inactivity
- Secure cookie handling
- Environment variable protection
- Input sanitization on all user inputs
- Email validation with comprehensive regex
- IP-based rate limiting for jukebox and Santa letters

#### Performance
- Database indexing on frequently queried columns
- SQLite performance optimizations (WAL, memory-mapped I/O)
- Edge-optimized with Next.js 16
- Server-side rendering for fast initial loads
- Client-side caching where appropriate
- Efficient query patterns

#### Documentation
- Complete installation guide (INSTALLATION.md)
- Quick start guide
- Security implementation details (SECURITY.md)
- Cloudflare Tunnel guide (CLOUDFLARE-TUNNEL.md)
- Santa letter system documentation
- Device monitoring guide
- API endpoint documentation
- Troubleshooting guides

---

## Version Format

**Semantic Versioning (SemVer)**: `MAJOR.MINOR.PATCH[-PRERELEASE][+BUILD]`

- **MAJOR**: Breaking changes that require manual intervention (incompatible API changes)
- **MINOR**: New features added in a backward-compatible manner
- **PATCH**: Backward-compatible bug fixes
- **PRERELEASE**: Pre-release versions (alpha, beta, rc.1, rc.2, etc.)
- **BUILD**: Build metadata (git commit hash)

### Examples
- `1.0.0` - First stable release
- `1.0.0-rc.1` - Release candidate 1
- `1.1.0` - New features added
- `1.1.1` - Bug fixes
- `2.0.0` - Breaking changes
- `1.0.0-rc.1+a3f2b1c` - RC with build hash

---

## Release Process

1. Update VERSION_HISTORY in `lib/version.ts`
2. Update this CHANGELOG.md
3. Run `npm run version:bump [type]`
4. Commit changes: `git commit -m "chore: bump version to X.X.X"`
5. Create tag: `git tag vX.X.X`
6. Push: `git push origin master --tags`
7. Create GitHub release with changelog

---

[Unreleased]: https://github.com/joeally06/FPP-Control-Center/compare/v1.0.0-rc.1...HEAD
[1.0.0-rc.1]: https://github.com/joeally06/FPP-Control-Center/releases/tag/v1.0.0-rc.1
