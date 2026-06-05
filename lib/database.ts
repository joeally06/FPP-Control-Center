import Database from 'better-sqlite3';
import path from 'path';

// Initialize database
const dbPath = process.env.VOTES_DB_PATH || path.join(process.cwd(), 'votes.db');
const db = new Database(dbPath);

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

// Create votes table
db.exec(`
  CREATE TABLE IF NOT EXISTS votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sequence_name TEXT NOT NULL,
    vote_type TEXT NOT NULL CHECK (vote_type IN ('up', 'down')),
    user_ip TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(sequence_name, user_ip)
  );
`);

// Create jukebox queue table
db.exec(`
  CREATE TABLE IF NOT EXISTS jukebox_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sequence_name TEXT NOT NULL,
    media_name TEXT,  -- MP3/media filename for better Spotify matching
    requester_name TEXT,
    requester_ip TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'playing', 'completed', 'skipped')),
    priority INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    played_at DATETIME,
    original_playlist TEXT,  -- Playlist that was interrupted
    original_item_index INTEGER,  -- Item index in the interrupted playlist
    was_resumed BOOLEAN DEFAULT 0,  -- Track if we've already resumed
    started_at DATETIME,  -- When the sequence started playing
    duration_ms INTEGER  -- Duration of the sequence in milliseconds
  );
`);

// Create theme settings table
db.exec(`
  CREATE TABLE IF NOT EXISTS theme_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    active_theme_id TEXT NOT NULL DEFAULT 'default',
    custom_particles TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Insert default theme if not exists
db.exec(`
  INSERT OR IGNORE INTO theme_settings (id, active_theme_id) VALUES (1, 'default');
`);

// Create queue processor state table (for distributed lock and state management)
db.exec(`
  CREATE TABLE IF NOT EXISTS queue_processor_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    processing_state TEXT DEFAULT 'IDLE' CHECK (processing_state IN ('IDLE', 'MONITORING_SEQUENCE')),
    sequence_start_time INTEGER,
    current_queue_item_id INTEGER,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Insert default processor state if not exists
db.exec(`
  INSERT OR IGNORE INTO queue_processor_state (id, processing_state) VALUES (1, 'IDLE');
`);

// Create Santa letters table
db.exec(`
  CREATE TABLE IF NOT EXISTS santa_letters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    child_name TEXT NOT NULL,
    child_age INTEGER,
    parent_email TEXT NOT NULL,
    letter_content TEXT NOT NULL,
    santa_reply TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'sent', 'rejected')),
    ip_address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    sent_at DATETIME,
    admin_notes TEXT
  );
`);

// ✅ Database migrations - Add columns if they don't exist (for existing databases)
// Refactored from 24 individual try-catch blocks to loop-based approach
const migrations: Array<{ table: string; column: string; definition: string }> = [
  // Santa Letters queue processing
  { table: 'santa_letters', column: 'queue_status', definition: "TEXT DEFAULT 'queued' CHECK (queue_status IN ('queued', 'processing', 'completed', 'failed'))" },
  { table: 'santa_letters', column: 'processing_started_at', definition: 'DATETIME' },
  { table: 'santa_letters', column: 'processing_completed_at', definition: 'DATETIME' },
  { table: 'santa_letters', column: 'retry_count', definition: 'INTEGER DEFAULT 0' },
  { table: 'santa_letters', column: 'last_error', definition: 'TEXT' },
  
  // Theme settings
  { table: 'theme_settings', column: 'custom_particles', definition: 'TEXT' },
  
  // Jukebox queue - Media and playlist tracking
  { table: 'jukebox_queue', column: 'media_name', definition: 'TEXT' },
  { table: 'jukebox_queue', column: 'original_playlist', definition: 'TEXT' },
  { table: 'jukebox_queue', column: 'original_item_index', definition: 'INTEGER' },
  { table: 'jukebox_queue', column: 'was_resumed', definition: 'BOOLEAN DEFAULT 0' },
  { table: 'jukebox_queue', column: 'started_at', definition: 'DATETIME' },
  { table: 'jukebox_queue', column: 'duration_ms', definition: 'INTEGER' },
  
  // Jukebox queue - Geolocation for access control
  { table: 'jukebox_queue', column: 'latitude', definition: 'REAL' },
  { table: 'jukebox_queue', column: 'longitude', definition: 'REAL' },
  { table: 'jukebox_queue', column: 'city', definition: 'TEXT' },
  { table: 'jukebox_queue', column: 'region', definition: 'TEXT' },
  { table: 'jukebox_queue', column: 'country_code', definition: 'TEXT' },
  { table: 'jukebox_queue', column: 'distance_from_show', definition: 'REAL' },
  
  // Votes - Geolocation for access control
  { table: 'votes', column: 'latitude', definition: 'REAL' },
  { table: 'votes', column: 'longitude', definition: 'REAL' },
  { table: 'votes', column: 'city', definition: 'TEXT' },
  { table: 'votes', column: 'region', definition: 'TEXT' },
  { table: 'votes', column: 'country_code', definition: 'TEXT' },
  { table: 'votes', column: 'distance_from_show', definition: 'REAL' },
];

// Apply all migrations
for (const migration of migrations) {
  try {
    db.exec(`ALTER TABLE ${migration.table} ADD COLUMN ${migration.column} ${migration.definition};`);
  } catch (error) {
    // Column already exists, continue
  }
}

// Create location restrictions table for geolocation-based access control
db.exec(`
  CREATE TABLE IF NOT EXISTS location_restrictions (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    is_active BOOLEAN DEFAULT 0,
    max_distance_miles INTEGER DEFAULT 1,
    show_latitude REAL,
    show_longitude REAL,
    show_location_name TEXT,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_by_admin TEXT
  );
`);

// Insert default location restriction settings if not exists (disabled by default)
db.exec(`
  INSERT OR IGNORE INTO location_restrictions (id, is_active, max_distance_miles)
  VALUES (1, 0, 1);
`);

// Create sequence requests tracking table
db.exec(`
  CREATE TABLE IF NOT EXISTS sequence_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sequence_name TEXT NOT NULL UNIQUE,
    total_requests INTEGER DEFAULT 0,
    last_requested DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Create cached media table for performance (stores sequence names from FPP playlists)
db.exec(`
  CREATE TABLE IF NOT EXISTS cached_sequences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sequence_name TEXT NOT NULL UNIQUE,  -- Now stores sequence names without .fseq extension
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Create sequence metadata table
db.exec(`
  CREATE TABLE IF NOT EXISTS sequence_metadata (
    sequence_name TEXT PRIMARY KEY,
    song_title TEXT,
    artist TEXT,
    album TEXT,
    release_year INTEGER,
    album_cover_url TEXT,
    spotify_id TEXT,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Create visitor tracking table
db.exec(`
  CREATE TABLE IF NOT EXISTS visitors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    visitor_hash TEXT NOT NULL UNIQUE,  -- Anonymized hash of IP
    first_visit DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_visit DATETIME DEFAULT CURRENT_TIMESTAMP,
    total_visits INTEGER DEFAULT 1,
    city TEXT,
    region TEXT,
    country TEXT
  );
`);

// Create session tracking table
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    visitor_hash TEXT NOT NULL,
    session_start DATETIME DEFAULT CURRENT_TIMESTAMP,
    session_end DATETIME,
    page_views INTEGER DEFAULT 1,
    duration_seconds INTEGER,
    user_agent TEXT,
    FOREIGN KEY (visitor_hash) REFERENCES visitors(visitor_hash)
  );
`);

// Create page view tracking table
db.exec(`
  CREATE TABLE IF NOT EXISTS page_views (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    page_path TEXT NOT NULL,
    view_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  );
`);

// Create device status tracking table for monitoring
db.exec(`
  CREATE TABLE IF NOT EXISTS device_status (
    device_id TEXT PRIMARY KEY,
    is_online BOOLEAN NOT NULL DEFAULT 0,
    last_checked DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen_online DATETIME,
    consecutive_failures INTEGER DEFAULT 0,
    last_notified DATETIME
  );
`);

// Create devices configuration table for dynamic device management
db.exec(`
  CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    ip TEXT NOT NULL,
    enabled BOOLEAN DEFAULT 1,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Create monitoring schedule configuration table
db.exec(`
  CREATE TABLE IF NOT EXISTS monitoring_schedule (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    enabled BOOLEAN DEFAULT 1,
    start_time TEXT NOT NULL DEFAULT '16:00',
    end_time TEXT NOT NULL DEFAULT '22:00',
    timezone TEXT DEFAULT 'America/Chicago',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Insert default monitoring schedule if not exists
db.exec(`
  INSERT OR IGNORE INTO monitoring_schedule (id, enabled, start_time, end_time, timezone)
  VALUES (1, 1, '16:00', '22:00', 'America/Chicago');
`);

// ========================================
// FPP Models Configuration Tables
// ========================================

// Create FPP models table for yearly setup reference
db.exec(`
  CREATE TABLE IF NOT EXISTS fpp_models (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    model_name TEXT NOT NULL,
    display_as TEXT,
    description TEXT,
    string_type TEXT,
    string_count INTEGER,
    node_count INTEGER,
    light_count INTEGER,
    channels_per_node INTEGER,
    channel_count INTEGER,
    start_channel TEXT,
    start_channel_no INTEGER,
    end_channel_no INTEGER,
    universe_start_channel TEXT,
    controller_name TEXT,
    controller_type TEXT,
    controller_ip TEXT,
    controller_ports TEXT,
    protocol TEXT,
    universe_id TEXT,
    universe_channel INTEGER,
    controller_channel INTEGER,
    connection_protocol TEXT,
    connection_attributes TEXT,
    est_current_amps REAL,
    buffer_dimensions TEXT,
    notes TEXT,
    physical_location TEXT,
    last_tested DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Create model photos table
db.exec(`
  CREATE TABLE IF NOT EXISTS model_photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    model_id INTEGER NOT NULL,
    photo_url TEXT NOT NULL,
    caption TEXT,
    photo_type TEXT CHECK (photo_type IN ('setup', 'wiring', 'controller', 'installed')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (model_id) REFERENCES fpp_models(id) ON DELETE CASCADE
  );
`);

// Create setup checklist table for yearly setup tracking
db.exec(`
  CREATE TABLE IF NOT EXISTS setup_checklist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    model_id INTEGER NOT NULL,
    task TEXT NOT NULL,
    completed BOOLEAN DEFAULT 0,
    completed_at DATETIME,
    notes TEXT,
    year INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (model_id) REFERENCES fpp_models(id) ON DELETE CASCADE
  );
`);

// Create YouTube videos table for light show videos
db.exec(`
  CREATE TABLE IF NOT EXISTS youtube_videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    youtube_id TEXT NOT NULL UNIQUE,
    description TEXT,
    thumbnail_url TEXT,
    duration_seconds INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ========================================
// Database Indexes for Performance
// ========================================

console.log('🔍 Creating database indexes for optimal performance...');

// Votes indexes
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_votes_sequence 
  ON votes(sequence_name);
  
  CREATE INDEX IF NOT EXISTS idx_votes_user_sequence 
  ON votes(user_ip, sequence_name);
  
  CREATE INDEX IF NOT EXISTS idx_votes_ip_created 
  ON votes(user_ip, created_at DESC);
`);

// Jukebox queue indexes
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_jukebox_status 
  ON jukebox_queue(status);
  
  CREATE INDEX IF NOT EXISTS idx_jukebox_priority 
  ON jukebox_queue(priority DESC, created_at ASC);
  
  CREATE INDEX IF NOT EXISTS idx_jukebox_played_at 
  ON jukebox_queue(played_at DESC);
  
  CREATE INDEX IF NOT EXISTS idx_jukebox_resume 
  ON jukebox_queue(status, was_resumed, original_playlist);
  
  CREATE INDEX IF NOT EXISTS idx_jukebox_requester_ip_created 
  ON jukebox_queue(requester_ip, created_at DESC);
  
  CREATE INDEX IF NOT EXISTS idx_jukebox_status_created 
  ON jukebox_queue(status, created_at ASC);
  
  CREATE INDEX IF NOT EXISTS idx_jukebox_duplicate_check 
  ON jukebox_queue(requester_ip, sequence_name, created_at DESC);
`);

// Sequence requests indexes
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_sequence_requests_popularity 
  ON sequence_requests(total_requests DESC);
  
  CREATE INDEX IF NOT EXISTS idx_sequence_requests_last 
  ON sequence_requests(last_requested DESC);
`);

// Cached sequences indexes
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_cached_sequences_updated 
  ON cached_sequences(last_updated DESC);
`);

// Sequence metadata indexes
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_metadata_updated 
  ON sequence_metadata(last_updated DESC);
`);

// Santa letters indexes
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_santa_created 
  ON santa_letters(created_at DESC);
  
  CREATE INDEX IF NOT EXISTS idx_santa_status 
  ON santa_letters(status);
  
  CREATE INDEX IF NOT EXISTS idx_santa_queue_status 
  ON santa_letters(queue_status, created_at ASC);
  
  CREATE INDEX IF NOT EXISTS idx_santa_ip_date 
  ON santa_letters(ip_address, created_at);
`);

// Visitor tracking indexes
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_visitors_hash 
  ON visitors(visitor_hash);
  
  CREATE INDEX IF NOT EXISTS idx_visitors_last_visit 
  ON visitors(last_visit DESC);
`);

// Session tracking indexes
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_sessions_visitor 
  ON sessions(visitor_hash);
  
  CREATE INDEX IF NOT EXISTS idx_sessions_start 
  ON sessions(session_start DESC);
`);

// Page views indexes
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_page_views_session 
  ON page_views(session_id);
  
  CREATE INDEX IF NOT EXISTS idx_page_views_time 
  ON page_views(view_time DESC);
  
  CREATE INDEX IF NOT EXISTS idx_page_views_path 
  ON page_views(page_path, view_time DESC);
`);

// Device status indexes
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_device_status_online 
  ON device_status(is_online, last_checked DESC);
  
  CREATE INDEX IF NOT EXISTS idx_device_status_checked 
  ON device_status(last_checked DESC);
  
  CREATE INDEX IF NOT EXISTS idx_device_status_failures 
  ON device_status(consecutive_failures DESC);
`);

// Devices indexes
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_devices_enabled 
  ON devices(enabled);
  
  CREATE INDEX IF NOT EXISTS idx_devices_type 
  ON devices(type);
`);

// FPP Models indexes
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_models_name 
  ON fpp_models(model_name);
  
  CREATE INDEX IF NOT EXISTS idx_models_controller 
  ON fpp_models(controller_name);
  
  CREATE INDEX IF NOT EXISTS idx_models_display_as 
  ON fpp_models(display_as);
  
  CREATE INDEX IF NOT EXISTS idx_models_channel_range 
  ON fpp_models(start_channel_no, end_channel_no);
`);

// Setup checklist indexes
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_checklist_year 
  ON setup_checklist(year);
  
  CREATE INDEX IF NOT EXISTS idx_checklist_model 
  ON setup_checklist(model_id);
  
  CREATE INDEX IF NOT EXISTS idx_checklist_completed 
  ON setup_checklist(completed, year);
`);

// YouTube videos indexes
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_youtube_created 
  ON youtube_videos(created_at);
  
  CREATE INDEX IF NOT EXISTS idx_youtube_youtube_id 
  ON youtube_videos(youtube_id);
`);

console.log('✅ All database indexes created successfully');

// ========================================
// Ensure Critical Settings Exist
// ========================================

// Ensure ollama_model setting exists (for Santa letter AI replies)
db.exec(`
  INSERT OR IGNORE INTO settings (key, value, description, category) 
  VALUES ('ollama_model', 'llama3.2:latest', 'AI model for Santa letter replies', 'santa');
`);

// Ensure display (digital sign) settings exist
db.exec(`
  INSERT OR IGNORE INTO settings (key, value, description, category) VALUES
    ('display_show_name',         'Christmas Light Show',    'Show name shown on the idle screen',         'display'),
    ('display_show_qr',           'true',                    'Show QR code on the display',                'display'),
    ('display_queue_count',       '4',                       'Number of upcoming songs to show (1-5)',      'display'),
    ('display_enabled',           'true',                    'Enable the /display page (digital sign)',     'display'),
    ('display_color_theme',       'christmas',               'Color theme preset',                         'display'),
    ('display_accent_color',      '#ef4444',                 'Custom accent color (hex)',                   'display'),
    ('display_background_style',  'gradient',                'Background style: solid/gradient/particles',  'display'),
    ('display_font_style',        'modern',                  'Font style: modern/display/serif',            'display'),
    ('display_font_scale',        '100',                     'Global font scale percentage (75-150)',        'display'),
    ('display_layout_variant',    'sidebar',                 'Layout: sidebar/centered/minimal',            'display'),
    ('display_album_art_size',    '34',                      'Album art column width percent (20-50)',       'display'),
    ('display_queue_position',    'bottom',                  'Queue position: bottom/right/hidden',         'display'),
    ('display_idle_message',      'The show will begin shortly', 'Subtitle on idle screen',                'display'),
    ('display_logo_url',          '',                        'URL of logo image (replaces tree emoji)',     'display'),
    ('display_sponsor_text',      '',                        'Sponsor or attribution text at bottom',      'display'),
    ('display_fm_frequency',      '',                        'FM radio frequency badge (e.g. 90.1)',        'display'),
    ('display_idle_animation',    'snowflakes',              'Idle animation: snowflakes/notes/stars/none', 'display'),
    ('display_show_clock',        'true',                    'Show large clock on idle screen',             'display'),
    ('display_idle_background_url', '',                      'URL for idle screen background image',       'display'),
    ('display_ticker_text',       '',                        'Scrolling ticker text at the bottom',        'display'),
    ('display_announcement_text', '',                        'Active announcement text',                    'display'),
    ('display_announcement_expires', '0',                   'Announcement expiry (unix timestamp)',        'display');
`);

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
      last_updated = CURRENT_TIMESTAMP
  WHERE id = 1
`);

export const resetProcessorState = db.prepare(`
  UPDATE queue_processor_state 
  SET processing_state = 'IDLE', 
      sequence_start_time = NULL, 
      current_queue_item_id = NULL,
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
  UPDATE theme_settings SET active_theme_id = ?, custom_particles = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1
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
  SELECT * FROM santa_letters ORDER BY created_at DESC
`);

export const updateSantaReply = db.prepare(`
  UPDATE santa_letters SET santa_reply = ?, status = ?, sent_at = CURRENT_TIMESTAMP WHERE id = ?
`);

export const updateSantaLetterStatus = db.prepare(`
  UPDATE santa_letters SET status = ?, admin_notes = ? WHERE id = ?
`);

// Queue management prepared statements
export const getNextQueuedLetter = db.prepare(`
  SELECT * FROM santa_letters 
  WHERE queue_status = 'queued' 
  ORDER BY created_at ASC 
  LIMIT 1
`);

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
export const upsertDeviceStatus = db.prepare(`
  INSERT INTO device_status (device_id, is_online, last_checked, last_seen_online, consecutive_failures, last_notified)
  VALUES (?, ?, CURRENT_TIMESTAMP, ?, ?, ?)
  ON CONFLICT(device_id) DO UPDATE SET
    is_online = excluded.is_online,
    last_checked = CURRENT_TIMESTAMP,
    last_seen_online = excluded.last_seen_online,
    consecutive_failures = excluded.consecutive_failures,
    last_notified = excluded.last_notified
`);

export const getDeviceStatus = db.prepare(`
  SELECT * FROM device_status WHERE device_id = ?
`);

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

export const getEnabledDevices = db.prepare(`
  SELECT * FROM devices WHERE enabled = 1 ORDER BY name
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