import type Database from 'better-sqlite3';
import { addMissingColumns } from './db-columns';

/**
 * Creates every table and index the app needs, adds columns that older databases lack, and seeds the
 * default rows and settings. Safe to run on every start: everything is IF NOT EXISTS / INSERT OR IGNORE.
 * The numbered migrations remain the main source of the schema (npm run setup / the updater); this tops it up,
 * and it is why `next build`, which imports lib/database.ts before the updater runs migrations, finds its tables.
 * Order matters: later statements use tables, columns and settings created by earlier ones.
 */
export function applySchema(db: Database.Database): void {
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
    
    // Jukebox queue - 'song' or 'playlist' (a playlist row keeps the playlist name in sequence_name)
    { table: 'jukebox_queue', column: 'request_kind', definition: "TEXT DEFAULT 'song'" },

    // Queue processor - when a request sent to FPP must have started by (epoch ms)
    { table: 'queue_processor_state', column: 'start_deadline', definition: 'INTEGER' },
    
    // Votes - Geolocation for access control
    { table: 'votes', column: 'latitude', definition: 'REAL' },
    { table: 'votes', column: 'longitude', definition: 'REAL' },
    { table: 'votes', column: 'city', definition: 'TEXT' },
    { table: 'votes', column: 'region', definition: 'TEXT' },
    { table: 'votes', column: 'country_code', definition: 'TEXT' },
    { table: 'votes', column: 'distance_from_show', definition: 'REAL' },
  ];

  // Add any column that is missing; real failures are thrown, not swallowed
  const columnResult = addMissingColumns(db, migrations);
  if (columnResult.skippedTables.length > 0) {
    console.warn(`[Database] Skipped columns for tables that don't exist yet: ${columnResult.skippedTables.join(', ')}`);
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

  // Per-song details for the jukebox catalog (also migration 019; created here too because
  // `next build` imports this file before the updater runs migrations)
  db.exec(`
    CREATE TABLE IF NOT EXISTS jukebox_song_details (
      sequence_name TEXT PRIMARY KEY,
      duration_seconds REAL,
      category TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // FPP playlists visitors can request, tagged with a theme by the admin (also migration 023)
  db.exec(`
    CREATE TABLE IF NOT EXISTS jukebox_playlists (
      name TEXT PRIMARY KEY,
      theme TEXT CHECK (theme IN ('christmas', 'halloween')),
      item_count INTEGER NOT NULL DEFAULT 0,
      duration_seconds REAL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // When an admin last cleared a visitor's song-request limit (also migration 020)
  db.exec(`
    CREATE TABLE IF NOT EXISTS jukebox_rate_limit_resets (
      requester_ip TEXT PRIMARY KEY,
      reset_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Seasonal logo and badge uploaded on Theme Settings (also migration 021)
  db.exec(`
    CREATE TABLE IF NOT EXISTS theme_assets (
      theme_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('logo', 'badge')),
      mime_type TEXT NOT NULL,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      data BLOB NOT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (theme_id, kind)
    );
  `);

  // Parent email confirmation for Santa letters (also migration 022)
  db.exec(`
    CREATE TABLE IF NOT EXISTS santa_letter_confirmations (
      letter_id INTEGER PRIMARY KEY REFERENCES santa_letters(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      confirmed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Solo trivia games played on visitors' phones (also migration 024)
  db.exec(`
    CREATE TABLE IF NOT EXISTS trivia_games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      question_ids TEXT NOT NULL,
      seconds_per_question INTEGER NOT NULL,
      current_index INTEGER NOT NULL DEFAULT 0,
      question_started_at TEXT,
      score INTEGER NOT NULL DEFAULT 0,
      correct_count INTEGER NOT NULL DEFAULT 0,
      finished_at TEXT,
      ip_address TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_trivia_games_ip ON trivia_games(ip_address, created_at);
    CREATE INDEX IF NOT EXISTS idx_trivia_games_finished ON trivia_games(finished_at, score);
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
      ('display_announcement_expires', '0',                   'Announcement expiry (unix timestamp)',        'display'),
      ('display_zone_config',       '{"enabled":false,"template":"two-column","slots":{}}', 'Zone layout JSON config', 'display'),
      ('display_idle_mode',         '',     'Idle screen: info/photos/slides (empty = not chosen yet)', 'display'),
      ('display_slideshow_images',  '[]',   'Local image slideshow JSON array of URLs', 'display'),
      ('display_slideshow_interval','8',    'Seconds between slideshow images (3-30)',   'display'),
      ('display_countdown_enabled', 'false','Show countdown timer on idle screen',       'display'),
      ('display_countdown_time',    '20:00','Show start time for countdown HH:MM',       'display'),
      ('display_countdown_label',   'Next show starts in', 'Countdown label text',       'display');
  `);

  // Create display profiles table (Option 4)
  db.exec(`
    CREATE TABLE IF NOT EXISTS display_profiles (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL,
      is_active  INTEGER NOT NULL DEFAULT 0,
      config_json TEXT   NOT NULL DEFAULT '{}',
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Create display schedule table (Plan B)
  db.exec(`
    CREATE TABLE IF NOT EXISTS display_schedule (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT    NOT NULL,
      enabled      INTEGER NOT NULL DEFAULT 1,
      days         TEXT    NOT NULL DEFAULT '0,1,2,3,4,5,6',
      start_time   TEXT    NOT NULL DEFAULT '00:00',
      end_time     TEXT    NOT NULL DEFAULT '23:59',
      action_type  TEXT    NOT NULL CHECK (action_type IN ('slideshow','theme','announcement','custom_display')),
      action_payload TEXT  NOT NULL DEFAULT '{}',
      priority     INTEGER NOT NULL DEFAULT 10,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);
}
