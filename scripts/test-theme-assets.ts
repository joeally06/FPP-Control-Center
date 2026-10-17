import assert from 'assert';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import sharp from 'sharp';
import {
  deleteThemeAsset,
  getThemeAsset,
  listThemeAssets,
  MAX_THEME_ASSET_BYTES,
  parseAssetTarget,
  processThemeAsset,
  saveThemeAsset,
  ThemeAssetError,
} from '../lib/theme-assets';
import { getThemeById, normalizeThemeId } from '../lib/themes/theme-config';

function print(msg: string) {
  console.log('[test-theme-assets] ' + msg);
}

const image = (width: number, height: number, format: 'png' | 'jpeg' | 'gif') =>
  sharp({ create: { width, height, channels: 3, background: { r: 120, g: 40, b: 200 } } }).toFormat(format).toBuffer();

const isWebp = (data: Buffer) => data.subarray(0, 4).toString() === 'RIFF' && data.subarray(8, 12).toString() === 'WEBP';

async function rejects(promise: Promise<unknown>, message: RegExp, why: string) {
  await assert.rejects(promise, (err: unknown) => err instanceof ThemeAssetError && message.test(err.message), why);
}

(async () => {
  // Test 1: only the two seasonal themes exist; anything else reads as Christmas
  print('Test 1: normalizeThemeId');
  assert.strictEqual(normalizeThemeId('halloween'), 'halloween');
  assert.strictEqual(normalizeThemeId('christmas'), 'christmas');
  for (const removed of ['default', 'valentines', 'summer', 'spring', 'fourthOfJuly', 'autumn', '', null, undefined, 42, '__proto__', 'toString']) {
    assert.strictEqual(normalizeThemeId(removed), 'christmas', `${String(removed)} → christmas`);
  }
  assert.strictEqual(getThemeById('valentines').id, 'christmas');
  print('Test 1 OK');

  // Test 2: upload targets are allow-listed
  print('Test 2: parseAssetTarget');
  assert.deepStrictEqual(parseAssetTarget('halloween', 'logo'), { theme: 'halloween', kind: 'logo' });
  assert.deepStrictEqual(parseAssetTarget('christmas', 'badge'), { theme: 'christmas', kind: 'badge' });
  assert.throws(() => parseAssetTarget('valentines', 'logo'), ThemeAssetError);
  assert.throws(() => parseAssetTarget('christmas', 'banner'), ThemeAssetError);
  assert.throws(() => parseAssetTarget('../etc', 'logo'), ThemeAssetError);
  assert.throws(() => parseAssetTarget(null, null), ThemeAssetError);
  print('Test 2 OK');

  // Test 3: logos are shrunk to 1600 px wide (never enlarged) and re-encoded to WebP
  print('Test 3: processThemeAsset logo');
  const big = await processThemeAsset(await image(2728, 1536, 'jpeg'), 'logo');
  assert.strictEqual(big.mimeType, 'image/webp');
  assert.ok(isWebp(big.data), 'output is WebP');
  assert.deepStrictEqual([big.width, big.height], [1600, 901], 'aspect ratio kept');
  const small = await processThemeAsset(await image(400, 200, 'png'), 'logo');
  assert.deepStrictEqual([small.width, small.height], [400, 200], 'small logos are not enlarged');
  print('Test 3 OK');

  // Test 4: badges are a 256 px square
  print('Test 4: processThemeAsset badge');
  const badge = await processThemeAsset(await image(500, 300, 'png'), 'badge');
  assert.deepStrictEqual([badge.width, badge.height], [256, 256]);
  assert.ok(isWebp(badge.data));
  print('Test 4 OK');

  // Test 5: anything that is not a JPEG/PNG/WebP picture is refused with a readable message
  print('Test 5: rejected files');
  await rejects(processThemeAsset(Buffer.alloc(0), 'logo'), /empty/, 'empty file');
  await rejects(processThemeAsset(Buffer.alloc(MAX_THEME_ASSET_BYTES + 1), 'logo'), /5 MB/, 'over the size limit');
  await rejects(processThemeAsset(Buffer.from('definitely not an image'), 'logo'), /couldn't be read/, 'garbage');
  await rejects(processThemeAsset(await image(40, 40, 'gif'), 'logo'), /JPEG, PNG or WebP/, 'GIF');
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>');
  await rejects(processThemeAsset(svg, 'logo'), /JPEG, PNG or WebP|couldn't be read/, 'SVG is never stored');
  print('Test 5 OK');

  // Test 6: storage - migration, save, replace, list, read, delete
  print('Test 6: database storage');
  const tmpDir = path.join(process.cwd(), 'tmp');
  fs.mkdirSync(tmpDir, { recursive: true });
  const dbPath = path.join(tmpDir, 'test-theme-assets.db');
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  const db = new Database(dbPath);
  try {
    const migration = fs.readFileSync(path.join(process.cwd(), 'migrations', '021_theme_assets.sql'), 'utf8');
    db.exec(migration);
    db.exec(migration); // idempotent

    assert.deepStrictEqual(listThemeAssets(db), {
      halloween: { logo: null, badge: null },
      christmas: { logo: null, badge: null },
    }, 'nothing uploaded yet');

    saveThemeAsset(db, 'christmas', 'logo', big);
    const listed = listThemeAssets(db);
    assert.strictEqual(listed.halloween.logo, null, 'themes are kept apart');
    assert.strictEqual(listed.christmas.badge, null);
    const logo = listed.christmas.logo;
    assert.ok(logo);
    assert.deepStrictEqual([logo.width, logo.height], [1600, 901]);
    assert.match(logo.url, /^\/api\/theme\/asset\?theme=christmas&kind=logo&v=\d+-\d+$/);

    const stored = getThemeAsset(db, 'christmas', 'logo');
    assert.ok(stored && stored.data.equals(big.data) && stored.mimeType === 'image/webp', 'bytes come back unchanged');
    assert.strictEqual(getThemeAsset(db, 'halloween', 'logo'), null);

    // Replacing changes the version in the url, so browsers fetch the new picture
    saveThemeAsset(db, 'christmas', 'logo', small);
    const replaced = listThemeAssets(db).christmas.logo;
    assert.ok(replaced && replaced.url !== logo.url && replaced.width === 400);
    assert.strictEqual((db.prepare('SELECT COUNT(*) AS n FROM theme_assets').get() as { n: number }).n, 1, 'replaced, not duplicated');

    // Rows for removed themes are ignored rather than breaking the listing
    db.prepare("INSERT INTO theme_assets (theme_id, kind, mime_type, width, height, data) VALUES ('valentines', 'logo', 'image/webp', 1, 1, x'00')").run();
    assert.deepStrictEqual(Object.keys(listThemeAssets(db)).sort(), ['christmas', 'halloween']);
    assert.throws(
      () => db.prepare("INSERT INTO theme_assets (theme_id, kind, mime_type, width, height, data) VALUES ('christmas', 'banner', 'image/webp', 1, 1, x'00')").run(),
      /CHECK constraint/,
      'the table only accepts logo and badge'
    );

    assert.strictEqual(deleteThemeAsset(db, 'christmas', 'logo'), true);
    assert.strictEqual(deleteThemeAsset(db, 'christmas', 'logo'), false, 'second delete finds nothing');
    assert.strictEqual(listThemeAssets(db).christmas.logo, null);
  } finally {
    db.close();
  }
  print('Test 6 OK');

  print('All tests passed.');
})().catch((err) => {
  console.error('[test-theme-assets] FAILED:', err);
  process.exit(1);
});
