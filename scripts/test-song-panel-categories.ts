import assert from 'assert';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SongPanel from '../components/admin/songs/SongPanel';
import type { ListedSong } from '../components/admin/songs/song-ui';

function print(msg: string) {
  console.log('[test-song-panel-categories] ' + msg);
}

const song: ListedSong = {
  name: 'carol', title: 'Carol', artist: 'Choir', album: null, albumArt: null, category: 'Classics',
  durationSeconds: 100, mediaName: null, audioFile: null, audioStatus: 'ready',
};
const render = (categories: string[]) =>
  renderToStaticMarkup(createElement(SongPanel, { song, playlist: null, categories, onClose: () => {}, onChanged: async () => {} }));

print('Test 1: every suggested category is a visible button that fills the field (a native dropdown can be unreadable on the dark admin theme)');
const html = render(['Classics', 'Rock', 'Kids']);
for (const name of ['Classics', 'Rock', 'Kids']) {
  assert.ok(new RegExp(`<button[^>]*type="button"[^>]*>${name}</button>`).test(html), name);
}
assert.ok(!html.includes('<datalist') && !/\blist="/.test(html), 'no native datalist');

print('Test 2: the song\'s own category is marked as chosen');
assert.ok(/<button[^>]*aria-pressed="true"[^>]*>Classics</.test(html));
assert.ok(/<button[^>]*aria-pressed="false"[^>]*>Rock</.test(html));

print('Test 3: with no suggestions the field still works');
assert.ok(render([]).includes('id="song-category"'));

print('All tests passed');
