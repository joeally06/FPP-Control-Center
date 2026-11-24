import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { isSafeAudioFileName } from '../lib/audio-files';

function print(msg: string) {
  console.log('[test-audio-files] ' + msg);
}

print('Test 1: a plain audio file name is accepted');
for (const name of ['Song.mp3', 'Some Song (1).FLAC', "Rudolph's Run.m4a", 'a.wav', 'b.ogg', 'c.aac', 'two.dots.mp3']) {
  assert.strictEqual(isSafeAudioFileName(name), true, name);
}

print('Test 2: anything that is not a plain audio file name is refused');
// A name that reaches public/audio is served as a web page address: no folders, no other file types
for (const name of ['x.html', 'x', 'x.mp3.html', 'x.mp3 ', '../x.mp3', '..\\x.mp3', 'a/b.mp3', 'a\\b.mp3', '/x.mp3', '', '.mp3', ' .mp3', 'x.exe', 'x.svg', 'x.js']) {
  assert.strictEqual(isSafeAudioFileName(name), false, JSON.stringify(name));
}
for (const value of [undefined, null, 5, {}, []] as unknown[]) {
  assert.strictEqual(isSafeAudioFileName(value as string), false, `not a string: ${JSON.stringify(value)}`);
}

print('Test 3: audio/download checks the name before it fetches or writes anything');
const route = fs.readFileSync(path.join(process.cwd(), 'app', 'api', 'audio', 'download', 'route.ts'), 'utf-8');
const checkAt = route.indexOf('isSafeAudioFileName(audioFileName)');
const fetchAt = route.indexOf('fetchFpp(audioUrl');
const writeAt = route.indexOf('await writeFile(');
assert.ok(checkAt > 0, 'the route checks the name it is about to save');
assert.ok(fetchAt > checkAt && writeAt > checkAt, 'and does so before the download and before the write');
assert.ok(/status: 400/.test(route.slice(checkAt, checkAt + 300)), 'a refused name answers 400');

print('All tests passed');
