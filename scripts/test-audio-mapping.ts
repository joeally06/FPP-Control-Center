import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { updateAudioMappings } from '../lib/audio-mapping';

function print(msg: string) {
  console.log('[test-audio-mapping] ' + msg);
}

const root = path.join(process.cwd(), 'tmp', 'test-audio-mapping');
fs.rmSync(root, { recursive: true, force: true });
fs.mkdirSync(root, { recursive: true });

// A fresh folder and file for every test
let counter = 0;
function fresh() {
  const dir = path.join(root, `case-${++counter}`);
  fs.mkdirSync(dir, { recursive: true });
  return { dir, file: path.join(dir, 'audio-mapping.json') };
}
const readJson = (file: string) => JSON.parse(fs.readFileSync(file, 'utf-8')) as Record<string, string>;

async function main() {
  print('Test 1: fifty updates started at the same moment all survive');
  {
    const { file } = fresh();
    await Promise.all(Array.from({ length: 50 }, (_, i) => updateAudioMappings((m) => ({ ...m, [`song-${i}.fseq`]: `audio-${i}.mp3` }), file)));
    const saved = readJson(file);
    assert.strictEqual(Object.keys(saved).length, 50, 'no update was lost');
    assert.strictEqual(saved['song-7.fseq'], 'audio-7.mp3');
  }

  print('Test 2: a change that throws leaves the file alone and does not block the next update');
  {
    const { file } = fresh();
    await updateAudioMappings(() => ({ 'a.fseq': 'a.mp3' }), file);
    const before = fs.readFileSync(file, 'utf-8');
    await assert.rejects(updateAudioMappings(() => { throw new Error('boom'); }, file), /boom/);
    assert.strictEqual(fs.readFileSync(file, 'utf-8'), before);
    await updateAudioMappings((m) => ({ ...m, 'b.fseq': 'b.mp3' }), file);
    assert.deepStrictEqual(readJson(file), { 'a.fseq': 'a.mp3', 'b.fseq': 'b.mp3' });
  }

  print('Test 3: returning null means "nothing to change" and writes nothing');
  {
    const { file } = fresh();
    assert.strictEqual(await updateAudioMappings(() => null, file), null);
    assert.ok(!fs.existsSync(file), 'no file was created');
    await updateAudioMappings(() => ({ 'a.fseq': 'a.mp3' }), file);
    const before = fs.readFileSync(file, 'utf-8');
    assert.strictEqual(await updateAudioMappings(() => null, file), null);
    assert.strictEqual(fs.readFileSync(file, 'utf-8'), before);
  }

  print('Test 4: a damaged file is copied aside, not destroyed, and the update goes on from empty');
  for (const [label, content] of [['broken json', 'not json{'], ['an array', '[]'], ['null', 'null'], ['a string', '"x"']] as const) {
    const { dir, file } = fresh();
    fs.writeFileSync(file, content);
    const result = await updateAudioMappings((m) => ({ ...m, 'a.fseq': 'a.mp3' }), file);
    assert.deepStrictEqual(result, { 'a.fseq': 'a.mp3' }, label);
    assert.deepStrictEqual(readJson(file), { 'a.fseq': 'a.mp3' }, label);
    const backups = fs.readdirSync(dir).filter((name) => name.includes('.corrupt-'));
    assert.strictEqual(backups.length, 1, `${label}: one backup`);
    assert.strictEqual(fs.readFileSync(path.join(dir, backups[0]), 'utf-8'), content, `${label}: the old bytes are kept`);
  }

  print('Test 5: the change function gets a copy, and the data folder is created when missing');
  {
    const { dir } = fresh();
    const file = path.join(dir, 'nested', 'deeper', 'audio-mapping.json');
    let seen: Record<string, string> | undefined;
    await updateAudioMappings((m) => { seen = m; m['mutated.fseq'] = 'x.mp3'; return null; }, file);
    assert.ok(seen && !fs.existsSync(file), 'changing the copy without returning it saves nothing');
    await updateAudioMappings((m) => ({ ...m, 'a.fseq': 'a.mp3' }), file);
    assert.deepStrictEqual(readJson(file), { 'a.fseq': 'a.mp3' });
  }

  print('Test 6: nothing but the mapping file is left behind');
  {
    const { dir, file } = fresh();
    await Promise.all(Array.from({ length: 10 }, (_, i) => updateAudioMappings((m) => ({ ...m, [`s${i}.fseq`]: 'a.mp3' }), file)));
    assert.deepStrictEqual(fs.readdirSync(dir), ['audio-mapping.json'], 'no temp files');
  }

  print('Test 7: a reader that keeps looking during a burst of updates never sees a half-written file');
  {
    const { file } = fresh();
    await updateAudioMappings(() => ({ 'start.fseq': 'start.mp3' }), file);
    let writing = true;
    let reads = 0;
    const reader = (async () => {
      while (writing) {
        const text = fs.readFileSync(file, 'utf-8'); // the file always exists once the first update is done
        JSON.parse(text); // throws on a half-written file
        reads++;
        await new Promise((resolve) => setTimeout(resolve, 2)); // like the visitor sync: reads often, not without a pause
      }
    })();
    try {
      for (let round = 0; round < 5; round++) {
        await Promise.all(Array.from({ length: 20 }, (_, i) => updateAudioMappings((m) => ({ ...m, [`r${round}-${i}.fseq`]: 'a.mp3' }), file)));
      }
    } finally {
      writing = false; // stop the reader even if an update failed, so the test ends
    }
    await reader;
    assert.ok(reads > 5, `the reader really read during the writes (${reads} reads)`);
    assert.strictEqual(Object.keys(readJson(file)).length, 101);
  }

  print('Test 8: every route that changes the mappings goes through updateAudioMappings');
  const routes = [
    ['app', 'api', 'audio', 'mappings', 'route.ts'],
    ['app', 'api', 'audio', 'download', 'route.ts'],
  ];
  // The old singular route had no callers and is gone; /audio/mappings (the one the UI uses) and /audio/download remain
  assert.ok(!fs.existsSync(path.join(process.cwd(), 'app', 'api', 'audio', 'mapping')), 'app/api/audio/mapping is gone');
  for (const parts of routes) {
    const source = fs.readFileSync(path.join(process.cwd(), ...parts), 'utf-8');
    const name = parts.slice(2, 4).join('/');
    assert.ok(source.includes('updateAudioMappings('), `${name} uses updateAudioMappings`);
    assert.ok(!/writeFile\(\s*MAPPING_FILE/.test(source), `${name} no longer writes the file by itself`);
  }

  print('All tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
