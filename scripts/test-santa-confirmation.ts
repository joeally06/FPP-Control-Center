import assert from 'assert';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import {
  allowConfirmAttempt,
  confirmationUrl,
  confirmLetter,
  createLetterConfirmation,
  deleteUnconfirmedLetter,
  isConfirmTokenShape,
  lettersToday,
  NEXT_QUEUED_LETTER_SQL,
  parseSantaDailyCap,
} from '../lib/santa-confirmation';
import { createConfirmationEmail } from '../lib/email-service';

function print(msg: string) {
  console.log('[test-santa-confirmation] ' + msg);
}

const tmpDir = path.join(process.cwd(), 'tmp');
fs.mkdirSync(tmpDir, { recursive: true });
const dbPath = path.join(tmpDir, `test-santa-confirmation-${process.pid}.db`);
if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
const db = new Database(dbPath);

try {
  // Tables the migration builds on (settings from 004, santa_letters as created by lib/database.ts)
  db.exec(`
    CREATE TABLE settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL UNIQUE, value TEXT NOT NULL,
      description TEXT, category TEXT DEFAULT 'general', updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE santa_letters (
      id INTEGER PRIMARY KEY AUTOINCREMENT, child_name TEXT NOT NULL, child_age INTEGER,
      parent_email TEXT NOT NULL, letter_content TEXT NOT NULL, santa_reply TEXT,
      status TEXT DEFAULT 'pending', ip_address TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      sent_at DATETIME, admin_notes TEXT, queue_status TEXT DEFAULT 'queued'
    );
  `);

  // Test 1: migration 022 applies cleanly twice and seeds the cap without overwriting it
  print('Test 1: migration 022');
  const migration = fs.readFileSync(path.join(process.cwd(), 'migrations', '022_santa_letter_confirmations.sql'), 'utf8');
  db.exec(migration);
  db.prepare(`UPDATE settings SET value = '75' WHERE key = 'santa_daily_cap'`).run();
  db.exec(migration);
  const cap = db.prepare(`SELECT value, category FROM settings WHERE key = 'santa_daily_cap'`).get() as { value: string; category: string };
  assert.deepStrictEqual({ ...cap }, { value: '75', category: 'santa' }, 'cap seeded once, admin value kept on re-run');
  print('Test 1 OK');

  const addLetter = (createdAt: string) =>
    Number(db.prepare(`INSERT INTO santa_letters (child_name, parent_email, letter_content, created_at) VALUES ('Kid', 'p@example.com', 'Hi', ${createdAt})`).run().lastInsertRowid);

  // Test 2: tokens are random base64url, only their hash is stored, 72 h expiry
  print('Test 2: createLetterConfirmation');
  const now = new Date('2026-12-01T18:00:00Z');
  const letterA = addLetter(`'2026-12-01 17:00:00'`);
  const tokenA = createLetterConfirmation(db, letterA, now);
  assert.ok(isConfirmTokenShape(tokenA), 'token is 43 chars of base64url');
  const rowA = db.prepare('SELECT * FROM santa_letter_confirmations WHERE letter_id = ?').get(letterA) as Record<string, string>;
  assert.strictEqual(rowA.token_hash, crypto.createHash('sha256').update(tokenA).digest('hex'), 'SHA-256 stored');
  assert.ok(!JSON.stringify(rowA).includes(tokenA), 'raw token not stored');
  assert.strictEqual(rowA.expires_at, '2026-12-04 18:00:00', 'expires 72 h later, SQLite UTC format');
  assert.strictEqual(rowA.confirmed_at, null);
  assert.notStrictEqual(createLetterConfirmation(db, addLetter(`'2026-12-01 17:01:00'`), now), tokenA, 'tokens differ');
  print('Test 2 OK');

  // Test 3: confirm results
  print('Test 3: confirmLetter');
  const later = new Date('2026-12-02T09:00:00Z');
  assert.strictEqual(confirmLetter(db, 'not-a-token', later), 'invalid', 'malformed');
  assert.strictEqual(confirmLetter(db, crypto.randomBytes(32).toString('base64url'), later), 'invalid', 'unknown token');
  assert.strictEqual(confirmLetter(db, tokenA, later), 'confirmed');
  assert.strictEqual(confirmLetter(db, tokenA, later), 'already_confirmed', 'works once');
  assert.strictEqual((db.prepare('SELECT confirmed_at FROM santa_letter_confirmations WHERE letter_id = ?').get(letterA) as { confirmed_at: string }).confirmed_at, '2026-12-02 09:00:00');
  const letterB = addLetter(`'2026-12-01 17:02:00'`);
  const tokenB = createLetterConfirmation(db, letterB, now);
  assert.strictEqual(confirmLetter(db, tokenB, new Date('2026-12-04T18:00:00Z')), 'expired', 'expired at exactly 72 h');
  assert.strictEqual((db.prepare('SELECT confirmed_at FROM santa_letter_confirmations WHERE letter_id = ?').get(letterB) as { confirmed_at: string | null }).confirmed_at, null);
  print('Test 3 OK');

  // Test 4: the processor's query skips letters still waiting for their parent
  print('Test 4: NEXT_QUEUED_LETTER_SQL');
  db.exec('DELETE FROM santa_letter_confirmations; DELETE FROM santa_letters;');
  const next = () => (db.prepare(NEXT_QUEUED_LETTER_SQL).get() as { id: number } | undefined)?.id;
  const waiting = addLetter(`'2026-12-01 10:00:00'`);
  const tokenWaiting = createLetterConfirmation(db, waiting, now);
  assert.strictEqual(next(), undefined, 'unconfirmed letter is not answered');
  const legacy = addLetter(`'2026-12-01 11:00:00'`);
  assert.strictEqual(next(), legacy, 'letter from before confirmation existed is answered');
  confirmLetter(db, tokenWaiting, later);
  assert.strictEqual(next(), waiting, 'confirmed letter is answered, oldest first');
  db.prepare(`UPDATE santa_letters SET status = 'rejected' WHERE id = ?`).run(waiting);
  assert.strictEqual(next(), legacy, 'rejected confirmed letter is not answered');
  db.prepare(`UPDATE santa_letters SET status = 'rejected' WHERE id = ?`).run(legacy);
  assert.strictEqual(next(), undefined, 'rejected legacy letter is not answered');
  db.prepare(`UPDATE santa_letters SET status = 'pending' WHERE id = ?`).run(waiting);
  assert.strictEqual(next(), waiting, 'restored letter is answered again');
  db.prepare(`UPDATE santa_letters SET status = 'approved' WHERE id = ?`).run(waiting);
  assert.strictEqual(next(), waiting, 'letters approved before this change are still answered');
  db.prepare(`UPDATE santa_letters SET queue_status = 'completed' WHERE id = ?`).run(waiting);
  db.prepare(`UPDATE santa_letters SET status = 'pending' WHERE id = ?`).run(legacy);
  assert.strictEqual(next(), legacy);
  print('Test 4 OK');

  // Test 5: a letter whose confirmation email failed is removed with its confirmation
  print('Test 5: deleteUnconfirmedLetter');
  const failed = addLetter(`'2026-12-01 12:00:00'`);
  createLetterConfirmation(db, failed, now);
  deleteUnconfirmedLetter(db, failed);
  assert.strictEqual((db.prepare('SELECT COUNT(*) AS n FROM santa_letters WHERE id = ?').get(failed) as { n: number }).n, 0);
  assert.strictEqual((db.prepare('SELECT COUNT(*) AS n FROM santa_letter_confirmations WHERE letter_id = ?').get(failed) as { n: number }).n, 0);
  print('Test 5 OK');

  // Test 6: the daily cap counts every letter from today (UTC), confirmed or not
  print('Test 6: lettersToday');
  db.exec('DELETE FROM santa_letter_confirmations; DELETE FROM santa_letters;');
  addLetter(`datetime('now')`);
  createLetterConfirmation(db, addLetter(`datetime('now')`));
  addLetter(`datetime('now', '-1 day')`);
  assert.strictEqual(lettersToday(db), 2);
  print('Test 6 OK');

  // Test 7: cap setting parsing
  print('Test 7: parseSantaDailyCap');
  assert.strictEqual(parseSantaDailyCap('50'), 50);
  assert.strictEqual(parseSantaDailyCap('1'), 1);
  assert.strictEqual(parseSantaDailyCap('1000'), 1000);
  for (const bad of ['0', '1001', '-5', '12.5', 'abc', '', null, undefined]) {
    assert.strictEqual(parseSantaDailyCap(bad), null, `${String(bad)} rejected`);
  }
  print('Test 7 OK');

  // Test 8: confirm attempts are limited per IP in a 10-minute window
  print('Test 8: allowConfirmAttempt');
  const t0 = 1_000_000;
  for (let i = 0; i < 10; i++) assert.strictEqual(allowConfirmAttempt('198.51.100.1', t0 + i), true, `attempt ${i + 1}`);
  assert.strictEqual(allowConfirmAttempt('198.51.100.1', t0 + 20), false, '11th refused');
  assert.strictEqual(allowConfirmAttempt('198.51.100.2', t0 + 20), true, 'other IPs unaffected');
  assert.strictEqual(allowConfirmAttempt('198.51.100.1', t0 + 10 * 60 * 1000), true, 'allowed again after the window');
  print('Test 8 OK');

  // Test 9: the confirmation email carries the link and only fixed wording
  print('Test 9: createConfirmationEmail');
  const url = confirmationUrl('https://show.example.com/', tokenA);
  assert.strictEqual(url, `https://show.example.com/santa/confirm?token=${tokenA}`);
  const email = createConfirmationEmail('Lewis <b>"Show"</b>\r\nBcc: x@example.com', url);
  assert.ok(!/[\r\n]/.test(email.subject), 'no line breaks in the subject');
  assert.ok(email.text.includes(url) && email.html.includes(`href="${url}"`), 'link in text and HTML');
  assert.ok(!email.html.includes('<b>') && email.html.includes('Lewis &lt;b&gt;&quot;Show&quot;&lt;/b&gt;'), 'site name escaped');
  assert.strictEqual(createConfirmationEmail('', url).subject, 'Please confirm your letter to Santa - our light show');
  print('Test 9 OK');

  print('All tests passed');
} catch (err) {
  console.error('[test-santa-confirmation] FAILED:', err);
  process.exitCode = 1;
} finally {
  db.close();
  for (const suffix of ['', '-wal', '-shm']) {
    if (fs.existsSync(dbPath + suffix)) fs.unlinkSync(dbPath + suffix);
  }
}
