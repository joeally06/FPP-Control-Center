import assert from 'assert';
import Database from 'better-sqlite3';
import sharp from 'sharp';
import {
  getSongArt,
  MAX_SONG_ART_BYTES,
  processSongArt,
  saveSongArt,
  SONG_ART_SIZE,
  SongArtError,
} from '../lib/song-art';
import { SONG_ART_PATH, songArtIdFromUrl, songArtUrl } from '../lib/song-art-url';

function print(msg: string) {
  console.log('[test-song-art] ' + msg);
}

const image = (width: number, height: number, format: 'png' | 'jpeg' | 'gif' | 'webp') =>
  sharp({ create: { width, height, channels: 3, background: { r: 200, g: 40, b: 60 } } }).toFormat(format).toBuffer();

const isWebp = (data: Buffer) => data.subarray(0, 4).toString() === 'RIFF' && data.subarray(8, 12).toString() === 'WEBP';

async function rejects(promise: Promise<unknown>, message: RegExp, why: string) {
  await assert.rejects(promise, (err: unknown) => err instanceof SongArtError && message.test(err.message), why);
}

(async () => {
  // Test 1: any accepted picture comes out as a 512 px square WebP
  print('Test 1: processSongArt output');
  for (const [format, width, height] of [['jpeg', 1000, 600], ['png', 300, 900], ['webp', 512, 512], ['png', 40, 30]] as const) {
    const art = await processSongArt(await image(width, height, format));
    assert.strictEqual(art.mimeType, 'image/webp');
    assert.ok(isWebp(art.data), `${format} ${width}x${height} is re-encoded to WebP`);
    assert.deepStrictEqual([art.width, art.height], [SONG_ART_SIZE, SONG_ART_SIZE], `${format} ${width}x${height} ends up square`);
  }
  print('Test 1 OK');

  // Test 2: a wide picture is cropped from the centre, not squashed
  print('Test 2: cropped from the centre');
  const wide = await sharp({
    create: { width: 300, height: 100, channels: 3, background: { r: 0, g: 0, b: 255 } },
  })
    .composite([{ input: await sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 0, b: 0 } } }).png().toBuffer(), left: 100, top: 0 }])
    .png()
    .toBuffer();
  const cropped = await processSongArt(wide);
  const { data: pixels, info } = await sharp(cropped.data).raw().toBuffer({ resolveWithObject: true });
  const at = (x: number, y: number) => [...pixels.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3)];
  const [r, , b] = at(SONG_ART_SIZE / 2, SONG_ART_SIZE / 2);
  assert.ok(r > 200 && b < 80, 'the middle third (red) fills the square');
  print('Test 2 OK');

  // Test 3: bad uploads are refused with a message the admin can read
  print('Test 3: refused files');
  await rejects(processSongArt(Buffer.alloc(0)), /empty/, 'empty file');
  await rejects(processSongArt(Buffer.alloc(MAX_SONG_ART_BYTES + 1)), /larger than 5 MB/, 'over the size limit');
  await rejects(processSongArt(Buffer.from('not an image at all')), /couldn't be read/, 'text');
  await rejects(processSongArt(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>')), /Use a JPEG, PNG or WebP|couldn't be read/, 'svg');
  await rejects(processSongArt(await image(50, 50, 'gif')), /Use a JPEG, PNG or WebP/, 'gif');
  print('Test 3 OK');

  // Test 4: stored pictures come back as they went in, and each upload gets its own address
  print('Test 4: save and read back');
  const db = new Database(':memory:');
  try {
    db.exec(`
      CREATE TABLE jukebox_song_art (
        id INTEGER PRIMARY KEY AUTOINCREMENT, mime_type TEXT NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL,
        data BLOB NOT NULL, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    const art = await processSongArt(await image(800, 800, 'jpeg'));
    const one = saveSongArt(db, art);
    const two = saveSongArt(db, art);
    assert.notStrictEqual(one, two, 'a new upload is a new address, so an address never changes content');
    const back = getSongArt(db, one);
    assert.strictEqual(back?.mimeType, 'image/webp');
    assert.ok(back && Buffer.compare(back.data, art.data) === 0, 'same bytes');
    assert.strictEqual(getSongArt(db, 9999), null);
  } finally {
    db.close();
  }
  print('Test 4 OK');

  // Test 5: only addresses of our own pictures are recognised
  print('Test 5: addresses');
  assert.strictEqual(songArtUrl(42), `${SONG_ART_PATH}42`);
  assert.strictEqual(songArtIdFromUrl(songArtUrl(42)), 42);
  for (const other of ['https://i.scdn.co/a.jpg', `${SONG_ART_PATH}`, `${SONG_ART_PATH}0`, `${SONG_ART_PATH}-1`, `${SONG_ART_PATH}1.5`, `${SONG_ART_PATH}99999999999`, `${SONG_ART_PATH}1?x=y`, undefined]) {
    assert.strictEqual(songArtIdFromUrl(other), null, `${String(other)} is not ours`);
  }
  print('Test 5 OK');

  print('All tests passed');
})().catch((err) => {
  console.error('[test-song-art] FAILED:', err);
  process.exitCode = 1;
});
