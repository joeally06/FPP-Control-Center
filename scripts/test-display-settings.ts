import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import BetweenSongsTab from '../components/admin/display/BetweenSongsTab';
import DisplayPreview from '../components/admin/display/DisplayPreview';
import LookTab from '../components/admin/display/LookTab';
import ShowInfoTab from '../components/admin/display/ShowInfoTab';
import { DEFAULT_DISPLAY_CONFIG } from '../lib/display-defaults';
import { discarded, formFrom, isDirty, withEdit, withPhotosSaved } from '../lib/display-form';
import { DISPLAY_PRESETS } from '../lib/display-presets';
import { parsePreviewMessage, sampleNowPlaying, sanitizePreviewConfig } from '../lib/display-preview';
import type { DisplayConfig } from '../types/display';

function print(msg: string) {
  console.log('[test-display-settings] ' + msg);
}

const noop = () => {};
const html = (element: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(element);
const config = (patch: Partial<DisplayConfig> = {}): DisplayConfig => ({ ...DEFAULT_DISPLAY_CONFIG, ...patch });
const look = (patch?: Partial<DisplayConfig>) => html(createElement(LookTab, { config: config(patch), set: noop, onPreset: noop }));
const between = (patch?: Partial<DisplayConfig>) => html(createElement(BetweenSongsTab, { config: config(patch), set: noop, onPhotosSaved: noop }));

print('Test 1: Look has the quick looks, and marks the one that matches the current settings');
let markup = look();
for (const preset of DISPLAY_PRESETS) assert.ok(markup.includes(`>${preset.label}<`), preset.label);
assert.ok(markup.includes('Colors and text') && markup.includes('Text size: 100%') && markup.includes('Accent color'));
assert.ok(!/aria-pressed="true"/.test(look({ colorTheme: 'classic' })), 'no quick look matches a hand-made mix');
const winter = DISPLAY_PRESETS.find((p) => p.id === 'winter')!;
assert.ok(/<button[^>]*aria-pressed="true"[^>]*>Winter</.test(look(winter.values)), 'Winter is marked when its values are set');
assert.ok(!/<button[^>]*aria-pressed="true"[^>]*>Christmas</.test(look(winter.values)));

print('Test 2: Show info holds what appears on both screens');
markup = html(createElement(ShowInfoTab, { config: config(), set: noop }));
for (const text of ['The digital sign is on', 'Show name', 'Logo image', 'FM radio frequency', 'Show the QR code', 'Up next', 'Scrolling message', 'Sponsor line']) {
  assert.ok(markup.includes(text), text);
}
assert.ok(!markup.includes('Color theme') && !markup.includes('Falling animation'), 'looks and idle settings live on other tabs');

print('Test 3: Between songs offers three screens and marks the chosen one');
markup = between();
for (const text of ['Info screen', 'Photo slideshow', 'Google Slides']) assert.ok(markup.includes(text), text);
assert.strictEqual((markup.match(/type="radio"/g) || []).length, 3);
assert.strictEqual((markup.match(/type="radio"[^>]*checked=""/g) || []).length, 1, 'exactly one is chosen');

print('Test 4: only the chosen screen\'s settings are shown');
markup = between({ idleMode: 'info' });
assert.ok(markup.includes('Falling animation') && markup.includes('Panels that will rotate'));
assert.ok(!markup.includes('Time on each photo') && !markup.includes('publish link'));
markup = between({ idleMode: 'photos' });
assert.ok(markup.includes('Time on each photo') && markup.includes('Add at least one photo'));
assert.ok(!markup.includes('Falling animation') && !markup.includes('publish link'));
markup = between({ idleMode: 'slides' });
assert.ok(markup.includes('publish link') && markup.includes('Add the link. Until then the info screen shows.'));
assert.ok(!markup.includes('Falling animation') && !markup.includes('Time on each photo'));
assert.ok(!between({ idleMode: 'slides', slideshowUrl: 'https://docs.google.com/presentation/d/e/abc/pub' }).includes('Add the link'));
markup = between({ idleMode: 'photos', idleSlideshowImages: ['/uploads/display/slideshow-1.jpg'] });
assert.ok(markup.includes('slideshow-1.jpg') && markup.includes('Photo 1') && markup.includes('Remove photo 1') && !markup.includes('Add at least one photo'));

print('Test 5: the panel list matches what the info screen will rotate');
markup = between({ idleMode: 'info' });
assert.ok(markup.includes('1 · Welcome and request code') && markup.includes('2 · How it works'));
assert.ok(!markup.includes('Next show countdown') && !markup.includes('Tune to'));
markup = between({ idleMode: 'info', countdownEnabled: true, fmFrequency: '88.1' });
assert.ok(markup.includes('2 · Next show countdown') && markup.includes('3 · Tune to 88.1 FM') && markup.includes('4 · How it works'));
assert.ok(markup.includes('Fallback start time'), 'the fallback time is explained once the countdown is on');
assert.ok(!between({ idleMode: 'info', countdownEnabled: false }).includes('Fallback start time'));

print('Test 6: the preview frame loads the preview page and can switch screens');
markup = html(createElement(DisplayPreview, { config: config(), screen: 'idle', onScreenChange: noop }));
assert.ok(markup.includes('src="/settings/display/preview"') && markup.includes('title="Preview of the digital sign"'));
assert.ok(/<button[^>]*aria-pressed="true"[^>]*>Between songs</.test(markup) && /<button[^>]*aria-pressed="false"[^>]*>Playing</.test(markup));
assert.ok(markup.includes('Nothing is saved until you press Save'));

print('Test 7: only well-formed preview messages are accepted');
const good = { type: 'display-preview', screen: 'playing', config: config({ showName: 'Draft Name' }) };
const parsed = parsePreviewMessage(good);
assert.ok(parsed && parsed.screen === 'playing' && parsed.config.showName === 'Draft Name');
for (const bad of [null, undefined, 'display-preview', 42, [], {}, { ...good, type: 'other' }, { ...good, screen: 'both' }, { ...good, screen: undefined },
  { ...good, config: null }, { ...good, config: 'x' }, { ...good, config: [] }]) {
  assert.strictEqual(parsePreviewMessage(bad), null, JSON.stringify(bad));
}

print('Test 8: the draft settings are cleaned before the sign draws them');
const cleaned = sanitizePreviewConfig({
  showName: 'Ok', fontScale: '150', showQr: 'yes', idleSlideshowImages: ['/a.jpg', 7], queueCount: 2,
  accentColor: '#112233', evil: '<script>', __proto__: { polluted: true },
});
assert.strictEqual(cleaned.showName, 'Ok');
assert.strictEqual(cleaned.fontScale, DEFAULT_DISPLAY_CONFIG.fontScale, 'a number sent as text falls back');
assert.strictEqual(cleaned.showQr, DEFAULT_DISPLAY_CONFIG.showQr, 'a boolean sent as text falls back');
assert.deepStrictEqual(cleaned.idleSlideshowImages, [], 'a list with a non-text item falls back');
assert.strictEqual(cleaned.queueCount, 2);
assert.strictEqual(cleaned.accentColor, '#112233');
assert.ok(!('evil' in cleaned) && !('polluted' in cleaned), 'unknown keys are dropped');
assert.deepStrictEqual(Object.keys(cleaned).sort(), Object.keys(DEFAULT_DISPLAY_CONFIG).sort());
assert.deepStrictEqual(sanitizePreviewConfig(undefined), DEFAULT_DISPLAY_CONFIG);
assert.deepStrictEqual(sanitizePreviewConfig(['x']), DEFAULT_DISPLAY_CONFIG);

print('Test 9: the sample song follows the Up next count');
const sample = sampleNowPlaying(config({ queueCount: 2 }), 'https://show.example/jukebox');
assert.strictEqual(sample.upcomingQueue.length, 2);
assert.ok(sample.isPlaying && sample.songTitle && sample.albumArtUrl?.startsWith('data:image/svg+xml'));
assert.strictEqual(sampleNowPlaying(config({ queueCount: 5 }), '/jukebox').upcomingQueue.length, 3);

print('Test 10: photos mode keeps the countdown controls (the countdown is drawn over the photos)');
markup = between({ idleMode: 'photos', countdownEnabled: true });
assert.ok(markup.includes('Count down to the next show') && markup.includes('Countdown label') && markup.includes('Fallback start time'));
assert.ok(between({ idleMode: 'info' }).includes('Count down to the next show'));
assert.ok(!between({ idleMode: 'slides' }).includes('Count down to the next show'), 'Google Slides covers the whole screen');

print('Test 11: a photo can only be removed on purpose: a visible button that asks first');
markup = between({ idleMode: 'photos', idleSlideshowImages: ['/uploads/display/slideshow-1.jpg'] });
assert.ok(/<button[^>]*aria-label="Remove photo 1"/.test(markup));
assert.ok(!/opacity-0/.test(markup), 'the remove button is not hidden until hover');
const tabSource = fs.readFileSync(path.join(process.cwd(), 'components', 'admin', 'display', 'BetweenSongsTab.tsx'), 'utf-8');
assert.ok(/window\.confirm\(/.test(tabSource), 'removing a photo asks first');

print('Test 12: the form tracks unsaved edits, and photos count as saved');
const start = formFrom({ showName: 'Lights', idleSlideshowImages: ['/a.jpg'] });
assert.strictEqual(isDirty(start), false);
const edited = withEdit(start, { showName: 'Lights 2' });
assert.strictEqual(isDirty(edited), true);
assert.strictEqual(isDirty(withEdit(edited, { showName: 'Lights' })), false, 'putting the old value back is not a change');
assert.strictEqual(isDirty(discarded(edited)), false);
assert.strictEqual(discarded(edited).config.showName, 'Lights');
// Photos are written on the server at once: adding one is not an unsaved change, and Discard cannot take it back
const withPhoto = withPhotosSaved(start, ['/a.jpg', '/b.jpg']);
assert.strictEqual(isDirty(withPhoto), false);
const editedWithPhoto = withPhotosSaved(edited, ['/a.jpg', '/b.jpg']);
assert.strictEqual(isDirty(editedWithPhoto), true, 'the other edit is still unsaved');
assert.strictEqual(editedWithPhoto.config.showName, 'Lights 2', 'the other edit is kept');
assert.deepStrictEqual(discarded(editedWithPhoto).config.idleSlideshowImages, ['/a.jpg', '/b.jpg'], 'Discard keeps the new photo');
assert.strictEqual(discarded(editedWithPhoto).config.showName, 'Lights');
// A save replaces both copies with what the server returned, and the chosen idle screen is not changed behind the admin's back
const afterSave = formFrom({ ...edited.config, idleMode: 'photos', idleSlideshowImages: [] });
assert.strictEqual(isDirty(afterSave), false);
assert.strictEqual(afterSave.config.idleMode, 'photos');
assert.strictEqual(formFrom({}).config.idleMode, 'info');
assert.deepStrictEqual(Object.keys(withEdit(start, { fontScale: 120 }).config), Object.keys(start.config), 'editing never reorders the settings');

print('All tests passed');
