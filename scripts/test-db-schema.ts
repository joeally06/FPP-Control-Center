import assert from 'assert';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { applySchema } from '../lib/db-schema';

function print(msg: string) {
  console.log('[test-db-schema] ' + msg);
}

const root = process.cwd();
const migrationsDir = path.join(root, 'migrations');
const schemaSource = fs.readFileSync(path.join(root, 'lib', 'db-schema.ts'), 'utf-8');

// What the real setup creates first: the settings table (applySchema seeds rows into it)
function databaseWithSettings(): Database.Database {
  const db = new Database(':memory:');
  db.exec(fs.readFileSync(path.join(migrationsDir, '004_settings_table.sql'), 'utf-8'));
  return db;
}

const names = (db: Database.Database, type: 'table' | 'index') =>
  (db.prepare('SELECT name FROM sqlite_master WHERE type = ?').all(type) as Array<{ name: string }>).map((r) => r.name);

print('Test 1: every table and index written in db-schema.ts exists afterwards');
const db = databaseWithSettings();
applySchema(db);
const tables = names(db, 'table');
const indexes = names(db, 'index');
const declaredTables = [...schemaSource.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map((m) => m[1]);
const declaredIndexes = [...schemaSource.matchAll(/CREATE INDEX IF NOT EXISTS (\w+)/g)].map((m) => m[1]);
// Pinned, so deleting a block from db-schema.ts fails here instead of quietly shrinking the list above.
// Adding or removing a table or index on purpose means updating these.
assert.deepStrictEqual([...declaredTables].sort(), [
  'cached_sequences', 'device_status', 'devices', 'display_profiles', 'display_schedule', 'fpp_models',
  'jukebox_playlists', 'jukebox_queue', 'jukebox_rate_limit_resets', 'jukebox_song_details', 'location_restrictions',
  'model_photos', 'monitoring_schedule', 'page_views', 'queue_processor_state', 'santa_letter_confirmations',
  'santa_letters', 'sequence_metadata', 'sequence_requests', 'sessions', 'setup_checklist', 'theme_assets',
  'theme_settings', 'trivia_games', 'visitors', 'votes', 'youtube_videos',
]);
assert.strictEqual(declaredIndexes.length, 41, 'indexes declared in db-schema.ts');
for (const table of declaredTables) assert.ok(tables.includes(table), `table ${table} missing`);
for (const index of declaredIndexes) assert.ok(indexes.includes(index), `index ${index} missing`);

print('Test 2: the default rows and settings are seeded');
const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
assert.strictEqual(count('SELECT COUNT(*) AS n FROM theme_settings WHERE id = 1'), 1);
assert.strictEqual(count("SELECT COUNT(*) AS n FROM queue_processor_state WHERE id = 1 AND processing_state = 'IDLE'"), 1);
assert.strictEqual(count('SELECT COUNT(*) AS n FROM location_restrictions WHERE id = 1 AND is_active = 0'), 1);
assert.strictEqual(count('SELECT COUNT(*) AS n FROM monitoring_schedule WHERE id = 1'), 1);
assert.strictEqual(count("SELECT COUNT(*) AS n FROM settings WHERE key = 'ollama_model'"), 1);
assert.ok(count("SELECT COUNT(*) AS n FROM settings WHERE key LIKE 'display_%'") >= 28);

print('Test 3: running it again changes nothing and does not fail');
const before = JSON.stringify(db.prepare('SELECT type, name, sql FROM sqlite_master ORDER BY type, name').all());
const settingsBefore = count('SELECT COUNT(*) AS n FROM settings');
applySchema(db);
assert.strictEqual(JSON.stringify(db.prepare('SELECT type, name, sql FROM sqlite_master ORDER BY type, name').all()), before);
assert.strictEqual(count('SELECT COUNT(*) AS n FROM settings'), settingsBefore);

print('Test 4: an admin\'s changed setting survives a restart');
db.prepare("UPDATE settings SET value = 'My Show' WHERE key = 'display_show_name'").run();
applySchema(db);
assert.strictEqual((db.prepare("SELECT value FROM settings WHERE key = 'display_show_name'").get() as { value: string }).value, 'My Show');
db.close();

print('Test 5: a database from before the geolocation columns gets them added');
const old = databaseWithSettings();
old.exec('CREATE TABLE votes (id INTEGER PRIMARY KEY AUTOINCREMENT, sequence_name TEXT NOT NULL, vote_type TEXT NOT NULL, user_ip TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)');
old.prepare("INSERT INTO votes (sequence_name, vote_type, user_ip) VALUES ('Song', 'up', '203.0.113.7')").run();
applySchema(old);
const columns = (old.prepare('PRAGMA table_info(votes)').all() as Array<{ name: string }>).map((c) => c.name);
for (const added of ['latitude', 'longitude', 'city', 'region', 'country_code', 'distance_from_show']) assert.ok(columns.includes(added), added);
assert.strictEqual((old.prepare('SELECT COUNT(*) AS n FROM votes').get() as { n: number }).n, 1, 'existing votes are kept');
old.close();

print('Test 6: lib/database.ts opens the connection and calls applySchema; it holds no table definitions');
const databaseSource = fs.readFileSync(path.join(root, 'lib', 'database.ts'), 'utf-8');
assert.ok(/applySchema\(db\);/.test(databaseSource));
assert.ok(!/CREATE TABLE|CREATE INDEX/i.test(databaseSource), 'table definitions belong in lib/db-schema.ts');
assert.ok(databaseSource.indexOf("db.pragma('journal_mode = WAL')") < databaseSource.indexOf('applySchema(db);'), 'WAL is set before the schema runs');

print('All tests passed');
