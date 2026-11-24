import assert from 'assert';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { isAllowedImage, slideshowFilename } from '../lib/display-uploads';

function print(msg: string) {
  console.log('[test-display-uploads] ' + msg);
}

const read = (...parts: string[]) => fs.readFileSync(path.join(process.cwd(), ...parts), 'utf-8');

async function main() {
  print('Test 1: every slideshow photo gets its own file name');
  const names = new Set<string>();
  for (let i = 0; i < 1000; i++) names.add(slideshowFilename());
  assert.strictEqual(names.size, 1000, 'no two names are the same');
  for (const name of names) assert.match(name, /^display-slideshow-[0-9a-f-]{36}\.jpg$/);

  print('Test 2: the upload route does not name a photo from how many already exist');
  // Photos used to be named by position, so after deleting one photo the next upload overwrote another
  const route = read('app', 'api', 'display', 'upload', 'route.ts');
  assert.ok(route.includes('slideshowFilename()'), 'the slideshow branch uses slideshowFilename()');
  assert.ok(!/display-slideshow-\$\{/.test(route), 'no template-built slideshow name in the route');
  assert.ok(!/const idx = existing\.length/.test(route), 'the file name no longer comes from existing.length');

  print('Test 3: real JPEG, PNG, WebP and GIF files are accepted');
  const blank = { create: { width: 4, height: 4, channels: 3 as const, background: '#cc0000' } };
  assert.strictEqual(await isAllowedImage(await sharp(blank).png().toBuffer()), true, 'png');
  assert.strictEqual(await isAllowedImage(await sharp(blank).jpeg().toBuffer()), true, 'jpeg');
  assert.strictEqual(await isAllowedImage(await sharp(blank).webp().toBuffer()), true, 'webp');
  assert.strictEqual(await isAllowedImage(await sharp(blank).gif().toBuffer()), true, 'gif');

  print('Test 4: anything else is refused, whatever type the browser claimed');
  // An SVG can carry a script that runs when its address is opened directly
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>');
  assert.strictEqual(await isAllowedImage(svg), false, 'svg with a script');
  assert.strictEqual(await isAllowedImage(Buffer.from('<!doctype html><script>alert(1)</script>')), false, 'html');
  assert.strictEqual(await isAllowedImage(Buffer.alloc(0)), false, 'empty file');
  assert.strictEqual(await isAllowedImage(Buffer.from('definitely not an image')), false, 'plain text');
  assert.strictEqual(await isAllowedImage(Buffer.from([0x00, 0xff, 0x10, 0x80, 0x42, 0x13, 0x37])), false, 'random bytes');

  print('Test 5: the upload route no longer accepts SVG and checks the real format');
  const allowed = route.match(/const ALLOWED_TYPES = \[([^\]]*)\]/)?.[1] ?? '';
  assert.ok(allowed.includes('image/png') && !/svg/i.test(allowed), `ALLOWED_TYPES has no svg: ${allowed}`);
  assert.ok(route.includes('isAllowedImage('), 'the route looks at the file itself, not only the claimed type');
  // The check must come before anything is written, and a refusal must answer 400
  const guardAt = route.indexOf('if (!(await isAllowedImage(');
  const firstWriteAt = route.indexOf('await writeFile(');
  assert.ok(guardAt > 0 && firstWriteAt > 0 && guardAt < firstWriteAt, 'the format check runs before the first write');
  assert.ok(/status: 400/.test(route.slice(guardAt, guardAt + 250)), 'a refused file answers 400');
  assert.ok(!route.includes("'image/svg+xml'"), 'no SVG branch left in the route');
  assert.ok(route.includes('display-${slot}.svg'), 'an SVG uploaded earlier is removed when its slot is replaced');

  print('Test 6: the uploader no longer offers SVG');
  const uploader = read('components', 'admin', 'display', 'ImageUpload.tsx');
  assert.ok(!/svg/i.test(uploader), 'no SVG in the picker or the hint text');

  print('All tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
