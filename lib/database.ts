import Database from 'better-sqlite3';
import { DateTime } from 'luxon';
import { NEXT_QUEUED_LETTER_SQL } from './santa-confirmation';
import { isInDailyWindow } from './show-schedule';
import { APP_TIMEZONE } from './time-utils';
import { applySchema } from './db-schema';
import { getVotesDbPath } from './db-path';

// Initialize database
const dbPath = getVotesDbPath();
const db = new Database(dbPath);

// The schema comes from migrations (npm run setup / the updater); applySchema() only tops it up.
// Fail with a clear message instead of a cryptic "no such table" further down.
if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'settings'").get()) {
  db.close();
  throw new Error(
    `[Database] ${dbPath} has not been set up yet (it has no settings table). ` +
    'Run "node scripts/init-database.js" first. It sets up ./votes.db (the setup scripts ignore VOTES_DB_PATH).'
  );
}

// ========================================
// SQLite Performance Optimizations
// ========================================

// Enable Write-Ahead Logging (WAL) mode for better concurrent performance
// - Readers don't block writers
// - Writers don't block readers
// - Better for web applications with mixed read/write workloads
db.pragma('journal_mode = WAL');

// Set synchronous mode to NORMAL for faster writes while maintaining safety
// - Faster than FULL on Windows
// - Still safe for most use cases (survives OS crashes, not disk failures)
db.pragma('synchronous = NORMAL');

// Increase cache size to 64MB for better read performance
// - Negative value means size in KB
// - More cache = fewer disk reads
db.pragma('cache_size = -64000');

// Set temp_store to memory for faster temporary operations
db.pragma('temp_store = MEMORY');

// Enable memory-mapped I/O for faster reads (64MB)
db.pragma('mmap_size = 67108864');

console.log('✅ SQLite performance optimizations enabled (WAL mode, 64MB cache, memory-mapped I/O)');

applySchema(db);

/** Returns the singleton better-sqlite3 instance for routes that need raw queries. */
export function getDb() { return db; }

// One shared read-only connection for public endpoints that only read. SQLite itself refuses
// writes on it, so a bug in those routes can't change data. (Don't set query_only on getDb():
// that connection is shared by the whole app.)
let readOnlyDb: Database.Database | null = null;
export function getReadOnlyDb() {
  if (!readOnlyDb) readOnlyDb = new Database(dbPath, { readonly: true, fileMustExist: true });
  return readOnlyDb;
}

/** Returns the highest-priority schedule rule whose time window is currently active, or null. */
export function getActiveScheduleRule(): import('@/types/display').ScheduleRule | null {
  // Rule times are entered in the show's local time, so compare with the show's clock, not the server's
  const now = DateTime.now().setZone(APP_TIMEZONE);

  const rows = db.prepare(
    `SELECT * FROM display_schedule WHERE enabled = 1 ORDER BY priority ASC, created_at ASC`
  ).all() as Record<string, unknown>[];

  for (const row of rows) {
    if (isInDailyWindow({ days: String(row.days), startTime: String(row.start_time), endTime: String(row.end_time) }, now)) {
      return {
        id:            row.id as number,
        name:          row.name as string,
        enabled:       row.enabled === 1,
        days:          row.days as string,
        startTime:     row.start_time as string,
        endTime:       row.end_time as string,
        actionType:    row.action_type as import('@/types/display').ScheduleActionType,
        actionPayload: row.action_payload as string,
        priority:      row.priority as number,
        createdAt:     row.created_at as string,
      };
    }
  }
  return null;
}

// Voting prepared statements
export const insertVote = db.prepare(`
  INSERT OR REPLACE INTO votes (sequence_name, vote_type, user_ip)
  VALUES (?, ?, ?)
`);

export const getVoteCounts = db.prepare(`
  SELECT
    sequence_name,
    SUM(CASE WHEN vote_type = 'up' THEN 1 ELSE 0 END) as upvotes,
    SUM(CASE WHEN vote_type = 'down' THEN 1 ELSE 0 END) as downvotes
  FROM votes
  GROUP BY sequence_name
`);

export const getUserVote = db.prepare(`
  SELECT vote_type FROM votes WHERE sequence_name = ? AND user_ip = ?
`);

// Jukebox prepared statements
export const addToQueue = db.prepare(`
  INSERT INTO jukebox_queue (sequence_name, media_name, requester_name, requester_ip)
  VALUES (?, ?, ?, ?)
`);

export const getQueue = db.prepare(`
  SELECT * FROM jukebox_queue 
  WHERE status = 'pending' 
  ORDER BY priority DESC, created_at ASC
`);

export const getCurrentlyPlaying = db.prepare(`
  SELECT * FROM jukebox_queue 
  WHERE status = 'playing' 
  ORDER BY played_at DESC 
  LIMIT 1
`);

export const updateQueueStatus = db.prepare(`
  UPDATE jukebox_queue 
  SET status = ?, played_at = CURRENT_TIMESTAMP 
  WHERE id = ?
`);

export const storeInterruptedPlaylist = db.prepare(`
  UPDATE jukebox_queue 
  SET original_playlist = ?, original_item_index = ? 
  WHERE id = ?
`);

export const getInterruptedPlaylistInfo = db.prepare(`
  SELECT id, sequence_name, original_playlist, original_item_index 
  FROM jukebox_queue 
  WHERE status = 'completed' AND was_resumed = 0 AND original_playlist IS NOT NULL
  ORDER BY played_at DESC
  LIMIT 1
`);

export const markPlaylistAsResumed = db.prepare(`
  UPDATE jukebox_queue 
  SET was_resumed = 1 
  WHERE id = ?
`);

export const updateStartTimeAndDuration = db.prepare(`
  UPDATE jukebox_queue 
  SET started_at = CURRENT_TIMESTAMP, duration_ms = ? 
  WHERE id = ?
`);

export const removeFromQueue = db.prepare(`
  DELETE FROM jukebox_queue WHERE id = ?
`);

export const getQueuePosition = db.prepare(`
  SELECT COUNT(*) + 1 as position
  FROM jukebox_queue 
  WHERE status = 'pending' 
  AND (priority > (SELECT priority FROM jukebox_queue WHERE id = ?) 
       OR (priority = (SELECT priority FROM jukebox_queue WHERE id = ?) 
           AND created_at < (SELECT created_at FROM jukebox_queue WHERE id = ?)))
`);

// Queue processor state prepared statements (for distributed locking)
export const getProcessorState = db.prepare(`
  SELECT * FROM queue_processor_state WHERE id = 1
`);

export const updateProcessorState = db.prepare(`
  UPDATE queue_processor_state 
  SET processing_state = ?, 
      sequence_start_time = ?, 
      current_queue_item_id = ?,
      start_deadline = ?,
      last_updated = CURRENT_TIMESTAMP
  WHERE id = 1
`);

export const resetProcessorState = db.prepare(`
  UPDATE queue_processor_state 
  SET processing_state = 'IDLE', 
      sequence_start_time = NULL, 
      current_queue_item_id = NULL,
      start_deadline = NULL,
      last_updated = CURRENT_TIMESTAMP
  WHERE id = 1
`);

// Sequence requests prepared statements
export const incrementSequenceRequests = db.prepare(`
  INSERT INTO sequence_requests (sequence_name, total_requests, last_requested)
  VALUES (?, 1, CURRENT_TIMESTAMP)
  ON CONFLICT(sequence_name) DO UPDATE SET
    total_requests = total_requests + 1,
    last_requested = CURRENT_TIMESTAMP
`);

// Legacy popular sequences query (uses old tables - kept for backward compatibility)
export const getPopularSequencesLegacy = db.prepare(`
  SELECT 
    sr.sequence_name,
    sr.total_requests,
    COALESCE(v.upvotes, 0) as upvotes,
    COALESCE(v.downvotes, 0) as downvotes,
    (COALESCE(v.upvotes, 0) + sr.total_requests) as popularity_score
  FROM sequence_requests sr
  LEFT JOIN (
    SELECT 
      sequence_name,
      SUM(CASE WHEN vote_type = 'up' THEN 1 ELSE 0 END) as upvotes,
      SUM(CASE WHEN vote_type = 'down' THEN 1 ELSE 0 END) as downvotes
    FROM votes 
    GROUP BY sequence_name
  ) v ON sr.sequence_name = v.sequence_name
  ORDER BY popularity_score DESC
  LIMIT ?
`);

// Cached sequences prepared statements (stores sequence names from FPP playlists)
export const clearCachedSequences = db.prepare(`
  DELETE FROM cached_sequences
`);

export const insertCachedSequence = db.prepare(`
  INSERT INTO cached_sequences (sequence_name, playlist_order, last_updated)
  VALUES (?, ?, CURRENT_TIMESTAMP)
`);

export const getCachedSequences = db.prepare(`
  SELECT sequence_name FROM cached_sequences 
  ORDER BY playlist_order ASC, sequence_name ASC
`);

export const getMediaNameForSequence = db.prepare(`
  SELECT sequence_name as media_name FROM cached_sequences 
  WHERE sequence_name = ? 
  LIMIT 1
`);

export const getCacheAge = db.prepare(`
  SELECT MAX(last_updated) as last_updated FROM cached_sequences
`);

// Cached songs with Media Library title/artist and jukebox song details, in playlist order
export const getCachedSongDetails = db.prepare(`
  SELECT cs.sequence_name, sm.track_name, sm.artist_name, d.duration_seconds, d.category
  FROM cached_sequences cs
  LEFT JOIN spotify_metadata sm ON sm.sequence_name = cs.sequence_name
  LEFT JOIN jukebox_song_details d ON d.sequence_name = cs.sequence_name
  ORDER BY cs.playlist_order ASC, cs.sequence_name ASC
`);

export const upsertSongDuration = db.prepare(`
  INSERT INTO jukebox_song_details (sequence_name, duration_seconds, updated_at)
  VALUES (?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT(sequence_name) DO UPDATE SET
    duration_seconds = excluded.duration_seconds,
    updated_at = CURRENT_TIMESTAMP
`);

export const upsertSongCategory = db.prepare(`
  INSERT INTO jukebox_song_details (sequence_name, category, updated_at)
  VALUES (?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT(sequence_name) DO UPDATE SET
    category = excluded.category,
    updated_at = CURRENT_TIMESTAMP
`);

// Sequence metadata prepared statements
export const getSequenceMetadata = db.prepare(`
  SELECT * FROM sequence_metadata WHERE sequence_name = ?
`);

export const upsertSequenceMetadata = db.prepare(`
  INSERT INTO sequence_metadata (sequence_name, song_title, artist, album, release_year, album_cover_url, spotify_id, spotify_url, last_updated)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT(sequence_name) DO UPDATE SET
    song_title = excluded.song_title,
    artist = excluded.artist,
    album = excluded.album,
    release_year = excluded.release_year,
    album_cover_url = excluded.album_cover_url,
    spotify_id = excluded.spotify_id,
    spotify_url = excluded.spotify_url,
    last_updated = CURRENT_TIMESTAMP
`);

export const getAllSequenceMetadata = db.prepare(`
  SELECT * FROM sequence_metadata ORDER BY last_updated DESC
`);

// Media Library (spotify_metadata) prepared statements
export const getMediaLibraryMetadata = db.prepare(`
  SELECT * FROM spotify_metadata WHERE sequence_name = ?
`);

// ========================================
// Sequences Table (Normalized Metadata)
// ========================================

// Get sequence by name
export const getSequenceByName = db.prepare(`
  SELECT * FROM sequences WHERE sequence_name = ?
`);

// Get sequence by ID
export const getSequenceById = db.prepare(`
  SELECT * FROM sequences WHERE id = ?
`);

// Insert or update sequence metadata
export const upsertSequence = db.prepare(`
  INSERT INTO sequences (
    sequence_name, title, artist, album, album_art_url, 
    spotify_url, spotify_id, spotify_uri, preview_url, year,
    is_custom_metadata, metadata_source, last_metadata_update,
    updated_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  ON CONFLICT(sequence_name) DO UPDATE SET
    title = excluded.title,
    artist = excluded.artist,
    album = excluded.album,
    album_art_url = excluded.album_art_url,
    spotify_url = excluded.spotify_url,
    spotify_id = excluded.spotify_id,
    spotify_uri = excluded.spotify_uri,
    preview_url = excluded.preview_url,
    year = excluded.year,
    is_custom_metadata = excluded.is_custom_metadata,
    metadata_source = excluded.metadata_source,
    last_metadata_update = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
`);

// Update play statistics
export const incrementPlayCount = db.prepare(`
  UPDATE sequences 
  SET play_count = play_count + 1,
      last_played_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`);

// Update request statistics
export const incrementRequestCount = db.prepare(`
  UPDATE sequences 
  SET request_count = request_count + 1,
      last_requested_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`);

// Get popular sequences
export const getPopularSequences = db.prepare(`
  SELECT * FROM sequences 
  WHERE play_count > 0 
  ORDER BY play_count DESC, request_count DESC 
  LIMIT ?
`);

// Get recently played sequences
export const getRecentlyPlayedSequences = db.prepare(`
  SELECT * FROM sequences 
  WHERE last_played_at IS NOT NULL 
  ORDER BY last_played_at DESC 
  LIMIT ?
`);

// Get all sequences with metadata
export const getAllSequencesWithMetadata = db.prepare(`
  SELECT * FROM sequences 
  WHERE title IS NOT NULL 
  ORDER BY sequence_name ASC
`);

// Get custom metadata sequences (user edited)
export const getCustomMetadataSequences = db.prepare(`
  SELECT * FROM sequences 
  WHERE is_custom_metadata = 1 
  ORDER BY updated_at DESC
`);

// ========================================
// FPP State Caching Prepared Statements
// ========================================

// Get current FPP state
export const getFPPState = db.prepare(`
  SELECT * FROM fpp_state WHERE id = 1
`);

// Update FPP state (successful poll)
export const updateFPPState = db.prepare(`
  UPDATE fpp_state 
  SET status = ?,
      current_sequence = ?,
      current_playlist = ?,
      current_playlist_index = ?,
      current_playlist_count = ?,
      seconds_played = ?,
      seconds_remaining = ?,
      volume = ?,
      mode = ?,
      uptime = ?,
      last_updated = CURRENT_TIMESTAMP,
      last_poll_success = 1,
      last_error = NULL,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = 1
`);

// Update FPP state (failed poll)
export const updateFPPStateError = db.prepare(`
  UPDATE fpp_state 
  SET last_poll_success = 0,
      last_error = ?,
      last_updated = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = 1
`);

// Log poll attempt
export const logFPPPoll = db.prepare(`
  INSERT INTO fpp_poll_log (success, response_time_ms, error_message, status, current_sequence)
  VALUES (?, ?, ?, ?, ?)
`);

// Upsert cached playlist
export const upsertCachedPlaylist = db.prepare(`
  INSERT INTO fpp_cached_playlists (name, sequence_count, is_active, last_synced)
  VALUES (?, ?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT(name) DO UPDATE SET
    sequence_count = excluded.sequence_count,
    is_active = excluded.is_active,
    last_synced = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
`);

// Clear active playlist flags
export const clearActivePlaylistFlags = db.prepare(`
  UPDATE fpp_cached_playlists SET is_active = 0
`);

// Get active playlist
export const getActivePlaylist = db.prepare(`
  SELECT * FROM fpp_cached_playlists WHERE is_active = 1 LIMIT 1
`);

// Get cached playlist by name
export const getCachedPlaylist = db.prepare(`
  SELECT * FROM fpp_cached_playlists WHERE name = ?
`);

// Delete playlist sequences
export const deleteCachedPlaylistSequences = db.prepare(`
  DELETE FROM fpp_cached_playlist_sequences WHERE playlist_name = ?
`);

// Insert playlist sequence
export const insertCachedPlaylistSequence = db.prepare(`
  INSERT INTO fpp_cached_playlist_sequences 
  (playlist_name, sequence_name, position, duration, enabled, last_synced)
  VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
`);

// Get playlist sequences
export const getCachedPlaylistSequences = db.prepare(`
  SELECT * FROM fpp_cached_playlist_sequences 
  WHERE playlist_name = ? 
  ORDER BY position ASC
`);

// Get health summary
export const getFPPHealthSummary = db.prepare(`
  SELECT * FROM fpp_health_summary
`);

// Theme prepared statements
export const getActiveTheme = db.prepare(`
  SELECT active_theme_id, custom_particles FROM theme_settings WHERE id = 1
`);

export const setActiveTheme = db.prepare(`
  UPDATE theme_settings SET active_theme_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1
`);

// Santa letters prepared statements
export const insertSantaLetter = db.prepare(`
  INSERT INTO santa_letters (child_name, child_age, parent_email, letter_content, ip_address)
  VALUES (?, ?, ?, ?, ?)
`);

export const getSantaLetter = db.prepare(`
  SELECT * FROM santa_letters WHERE id = ?
`);

export const getAllSantaLetters = db.prepare(`
  SELECT l.*,
    (c.letter_id IS NOT NULL AND c.confirmed_at IS NULL) AS awaiting_confirmation,
    c.expires_at AS confirm_expires_at
  FROM santa_letters l
  LEFT JOIN santa_letter_confirmations c ON c.letter_id = l.id
  ORDER BY l.created_at DESC
`);

// Admin edit of Santa's reply text; sending it again is a separate "Resend Email" step
export const updateSantaReply = db.prepare(`
  UPDATE santa_letters SET santa_reply = ? WHERE id = ?
`);

export const updateSantaLetterStatus = db.prepare(`
  UPDATE santa_letters SET status = ?, admin_notes = ? WHERE id = ?
`);

// Queue management prepared statements
export const getNextQueuedLetter = db.prepare(NEXT_QUEUED_LETTER_SQL);

export const markLetterProcessing = db.prepare(`
  UPDATE santa_letters 
  SET queue_status = 'processing', 
      processing_started_at = CURRENT_TIMESTAMP 
  WHERE id = ?
`);

export const markLetterCompleted = db.prepare(`
  UPDATE santa_letters 
  SET queue_status = 'completed',
      santa_reply = ?,
      status = 'sent',
      processing_completed_at = CURRENT_TIMESTAMP,
      sent_at = CURRENT_TIMESTAMP
  WHERE id = ?
`);

export const markLetterFailed = db.prepare(`
  UPDATE santa_letters 
  SET queue_status = 'failed',
      last_error = ?,
      retry_count = ?
  WHERE id = ?
`);

export const requeueLetter = db.prepare(`
  UPDATE santa_letters 
  SET queue_status = 'queued',
      last_error = ?,
      retry_count = ?,
      processing_started_at = NULL
  WHERE id = ?
`);

export const getQueueStats = db.prepare(`
  SELECT 
    queue_status,
    COUNT(*) as count
  FROM santa_letters
  WHERE queue_status IN ('queued', 'processing', 'failed')
  GROUP BY queue_status
`);

// Device monitoring prepared statements
export const getAllDeviceStatuses = db.prepare(`
  SELECT * FROM device_status ORDER BY device_id
`);

// Device management prepared statements
export const insertDevice = db.prepare(`
  INSERT INTO devices (id, name, type, ip, enabled, description)
  VALUES (?, ?, ?, ?, ?, ?)
`);

export const updateDevice = db.prepare(`
  UPDATE devices 
  SET name = ?, type = ?, ip = ?, enabled = ?, description = ?, updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`);

export const deleteDevice = db.prepare(`
  DELETE FROM devices WHERE id = ?
`);

export const getDeviceById = db.prepare(`
  SELECT * FROM devices WHERE id = ?
`);

export const getAllDevices = db.prepare(`
  SELECT * FROM devices ORDER BY name
`);

// Monitoring schedule prepared statements
export const getMonitoringSchedule = db.prepare(`
  SELECT * FROM monitoring_schedule WHERE id = 1
`);

export const updateMonitoringSchedule = db.prepare(`
  UPDATE monitoring_schedule 
  SET enabled = ?, start_time = ?, end_time = ?, timezone = ?, updated_at = CURRENT_TIMESTAMP
  WHERE id = 1
`);

// YouTube videos prepared statements
export const insertYouTubeVideo = db.prepare(`
  INSERT INTO youtube_videos (title, youtube_id, description, thumbnail_url, duration_seconds, theme)
  VALUES (?, ?, ?, ?, ?, ?)
`);

export const getAllYouTubeVideos = db.prepare(`
  SELECT id, title, youtube_id, description, thumbnail_url, duration_seconds, theme, created_at, updated_at 
  FROM youtube_videos 
  ORDER BY created_at DESC
`);

export const getYouTubeVideosByTheme = db.prepare(`
  SELECT id, title, youtube_id, description, thumbnail_url, duration_seconds, theme, created_at, updated_at 
  FROM youtube_videos 
  WHERE theme = ?
  ORDER BY created_at DESC
`);

export const getYouTubeVideoById = db.prepare(`
  SELECT * FROM youtube_videos WHERE id = ?
`);

export const updateYouTubeVideo = db.prepare(`
  UPDATE youtube_videos 
  SET title = ?, description = ?, thumbnail_url = ?, duration_seconds = ?, theme = ?, updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`);

export const deleteYouTubeVideo = db.prepare(`
  DELETE FROM youtube_videos WHERE id = ?
`);

export const getYouTubeVideoByYouTubeId = db.prepare(`
  SELECT * FROM youtube_videos WHERE youtube_id = ?
`);

export default db;