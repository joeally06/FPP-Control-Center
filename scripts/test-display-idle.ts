import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import IdleScreen from '../components/display/IdleScreen';
import {
  describeNextShow, formatClock, idleOverrideForRule, idlePanels, isValidTime, mergeNextShow, resolveIdleMode, secondsUntilIso, secondsUntilTime,
} from '../lib/display-idle';
import { DISPLAY_PRESETS } from '../lib/display-presets';
import type { DisplayConfig } from '../types/display';

function print(msg: string) {
  console.log('[test-display-idle] ' + msg);
}

const config: DisplayConfig = {
  showName: 'Ally Family Lights', showQr: true, queueCount: 4, enabled: true,
  colorTheme: 'christmas', accentColor: '#ef4444', backgroundStyle: 'gradient',
  fontStyle: 'modern', fontScale: 100,
  idleMessage: 'The show will begin shortly', logoUrl: '', sponsorText: '', fmFrequency: '',
  idleAnimation: 'none', showClock: true, idleBackgroundUrl: '', tickerText: '',
  idleMode: 'info', slideshowUrl: '', idleSlideshowImages: [], idleSlideshowInterval: 8,
  countdownEnabled: false, countdownTime: '20:00', countdownLabel: 'Next show starts in',
};

print('Test 1: which panels rotate');
assert.deepStrictEqual(idlePanels(config, { showActive: false, hasCountdown: true }), ['welcome', 'how']);
assert.deepStrictEqual(idlePanels({ ...config, fmFrequency: '93.5' }, { showActive: false, hasCountdown: false }), ['welcome', 'fm', 'how']);
const withCountdown = { ...config, countdownEnabled: true, fmFrequency: '93.5' };
assert.deepStrictEqual(idlePanels(withCountdown, { showActive: false, hasCountdown: true }), ['welcome', 'countdown', 'fm', 'how']);
assert.deepStrictEqual(idlePanels(withCountdown, { showActive: false, hasCountdown: false }), ['welcome', 'fm', 'how'], 'no next show, no countdown panel');
assert.deepStrictEqual(idlePanels(withCountdown, { showActive: true, hasCountdown: true }), ['welcome', 'fm', 'how'], 'a show already on has no next show to count down to');
assert.deepStrictEqual(idlePanels({ ...config, fmFrequency: '   ' }, { showActive: false, hasCountdown: false }), ['welcome', 'how'], 'a blank frequency is not a frequency');

print('Test 2: the typed fallback time');
assert.ok(isValidTime('20:00') && isValidTime('7:05') && isValidTime('00:00'));
assert.ok(!isValidTime('24:00') && !isValidTime('12:60') && !isValidTime('') && !isValidTime('noon') && !isValidTime(null));
const eight = new Date(2026, 9, 29, 20, 0, 0);
assert.strictEqual(secondsUntilTime('20:30', eight), 1800);
assert.strictEqual(secondsUntilTime('19:00', eight), 23 * 3600, 'a time that has passed counts to tomorrow');
assert.strictEqual(secondsUntilTime('nope', eight), 0);

print('Test 3: countdown from the FPP schedule, and its text');
const nowMs = eight.getTime();
assert.strictEqual(secondsUntilIso(new Date(nowMs + 90_000).toISOString(), nowMs), 90);
assert.strictEqual(secondsUntilIso(new Date(nowMs - 5_000).toISOString(), nowMs), 0, 'never negative');
assert.strictEqual(secondsUntilIso(null, nowMs), null);
assert.strictEqual(secondsUntilIso('not a date', nowMs), null);
assert.strictEqual(formatClock(4521), '1:15:21');
assert.strictEqual(formatClock(59), '0:00:59');
assert.strictEqual(formatClock(0), '0:00:00');
assert.strictEqual(formatClock(-3), '0:00:00');
assert.strictEqual(formatClock(86399), '23:59:59');
assert.strictEqual(formatClock(86400), '1d 0h 0m');
assert.strictEqual(formatClock(6 * 86400 + 4 * 3600 + 12 * 60 + 9), '6d 4h 12m', 'a show days away stays short enough to fit');
const plain = (s: string) => s.replace(/\s/g, ' '); // newer ICU puts a narrow no-break space before PM
assert.strictEqual(plain(describeNextShow(new Date(2026, 9, 29, 21, 15).toISOString(), eight)), 'Today at 9:15 PM');
assert.strictEqual(plain(describeNextShow(new Date(2026, 9, 30, 18, 45).toISOString(), eight)), 'Tomorrow at 6:45 PM');
assert.strictEqual(plain(describeNextShow(new Date(2026, 10, 2, 18, 45).toISOString(), eight)), 'Monday at 6:45 PM');
assert.strictEqual(plain(describeNextShow(new Date(2026, 10, 5, 18, 45).toISOString(), eight)), 'Thursday, Nov 5 at 6:45 PM', 'a week or more away names the date');
assert.strictEqual(plain(describeNextShow(new Date(2026, 10, 4, 18, 45).toISOString(), eight)), 'Wednesday at 6:45 PM', 'six days away is still just the weekday');
assert.strictEqual(describeNextShow(null, eight), '');
assert.strictEqual(describeNextShow('garbage', eight), '');

print('Test 3b: a slow FPP does not wipe out a known next show');
const future = new Date(nowMs + 3_600_000).toISOString();
const past = new Date(nowMs - 3_600_000).toISOString();
const known = { settled: true, isActive: false, nextShowAt: future };
assert.deepStrictEqual(mergeNextShow({ settled: false, isActive: false, nextShowAt: null }, { isActive: false, nextShowTime: future }, nowMs), known);
assert.deepStrictEqual(mergeNextShow(known, { isActive: false, nextShowTime: null }, nowMs), known, 'route answered with no show: keep the one ahead');
assert.deepStrictEqual(mergeNextShow(known, null, nowMs), known, 'request failed: keep what we had');
assert.strictEqual(mergeNextShow({ ...known, nextShowAt: past }, { isActive: false, nextShowTime: null }, nowMs).nextShowAt, null, 'a show that has passed is not kept');
const later = new Date(nowMs + 7_200_000).toISOString();
assert.strictEqual(mergeNextShow(known, { isActive: true, nextShowTime: later }, nowMs).nextShowAt, later, 'a new time wins');
assert.strictEqual(mergeNextShow(known, { isActive: true, nextShowTime: later }, nowMs).isActive, true);
assert.strictEqual(mergeNextShow({ settled: false, isActive: false, nextShowAt: null }, null, nowMs).settled, true, 'a failed first request still settles, so the typed time can be used');

print('Test 4: presets set only the look and the idle wording, with values the settings route accepts');
assert.deepStrictEqual(DISPLAY_PRESETS.map((p) => p.id), ['christmas', 'winter', 'halloween', 'thanksgiving']);
const allowedKeys = ['accentColor', 'backgroundStyle', 'colorTheme', 'countdownLabel', 'idleAnimation', 'idleMessage'];
for (const preset of DISPLAY_PRESETS) {
  assert.deepStrictEqual(Object.keys(preset.values).sort(), allowedKeys, preset.id);
  assert.ok(['christmas', 'winter', 'classic', 'custom'].includes(preset.values.colorTheme), preset.id);
  assert.ok(['solid', 'gradient', 'particles'].includes(preset.values.backgroundStyle), preset.id);
  assert.ok(['snowflakes', 'notes', 'stars', 'none'].includes(preset.values.idleAnimation), preset.id);
  assert.ok(/^#[0-9a-f]{6}$/i.test(preset.values.accentColor), preset.id);
  assert.ok(preset.values.idleMessage.length > 0 && preset.values.idleMessage.length <= 150, preset.id);
  assert.ok(preset.values.countdownLabel.length > 0 && preset.values.countdownLabel.length <= 100, preset.id);
}

print('Test 5: the first idle panel is the welcome panel');
const render = (cfg: Partial<DisplayConfig> = {}) =>
  renderToStaticMarkup(createElement(IdleScreen, { config: { ...config, ...cfg }, jukeboxUrl: 'https://show.example/jukebox' }));
let html = render();
assert.ok(html.includes('Ally Family Lights') && html.includes('The show will begin shortly'));
assert.ok(html.includes('Scan to pick the next song'));
assert.ok(!render({ showQr: false }).includes('Scan to pick'));

print('Test 5b: big text is capped by screen height, so a 150% font scale cannot push a panel off the screen');
html = render({ fontScale: 150 });
assert.ok(html.includes('min(8.40vw, 10vh)'), 'the show name has a height cap');
assert.ok(!/font-size:\s*8\.4vw/.test(html), 'no uncapped copy of the show-name size');
assert.ok(html.includes('overflow-hidden'), 'the panel area clips instead of spilling over the bars');

print('Test 5c: the screen defaults to white text, so the top-bar name and QR caption are readable on the dark background');
assert.ok(/class="[^"]*\bdisplay-sign\b[^"]*\btext-white\b/.test(render()), 'the idle screen root must set text-white and display-sign');
// globals.css colors every p, span and div black; display-sign is what lets them take the sign's white instead
const globals = fs.readFileSync(path.join(process.cwd(), 'app', 'globals.css'), 'utf-8');
const signRule = /\.display-sign p,[\s\S]*?\.display-sign span,[\s\S]*?\.display-sign div,[\s\S]*?\{\s*color:\s*inherit;\s*\}/.exec(globals);
assert.ok(signRule, 'globals.css must undo the black default inside .display-sign');
assert.ok(globals.indexOf('@apply text-black') < signRule.index, 'the display-sign rule must come after the black default (same specificity order rules)');

print('Test 6: ticker, sponsor line and logo appear only when set');
assert.ok(!html.includes('ticker-inner') && !html.includes('Brought to you by') && !html.includes('alt="Logo"'));
html = render({ tickerText: 'Merry Christmas', sponsorText: 'Brought to you by Ally Electric', logoUrl: '/uploads/display/logo.png' });
assert.ok(html.includes('ticker-inner') && html.includes('Brought to you by Ally Electric') && html.includes('alt="Logo"'));

print('Test 7: no emoji in the screen itself (the optional falling-snow animation aside)');
assert.ok(!/\p{Extended_Pictographic}/u.test(render()), 'emoji found in the idle screen');

print('Test 8: slideshow and Google Slides modes still render, with the show-wide QR strip');
const photos = ['/uploads/display/slideshow-1.jpg', '/uploads/display/slideshow-2.jpg'];
html = render({ idleMode: 'photos', idleSlideshowImages: photos, fmFrequency: '93.5' });
assert.ok(html.includes('slideshow-1.jpg') && html.includes('Tune your radio to 93.5 FM') && html.includes('Scan to pick'));
html = render({ idleMode: 'slides', slideshowUrl: 'https://docs.google.com/presentation/d/e/abc/pub?start=true' });
assert.ok(html.includes('docs.google.com/presentation/d/e/abc/embed?start=true') && !html.includes('Ally Family Lights'));

print('Test 9: the saved choice decides the idle screen; the other modes keep their data but do not show');
html = render({ idleMode: 'info', idleSlideshowImages: photos, slideshowUrl: 'https://docs.google.com/presentation/d/e/abc/pub' });
assert.ok(html.includes('Ally Family Lights') && !html.includes('slideshow-1.jpg') && !html.includes('docs.google.com'), 'info wins over saved photos and a saved Slides link');
html = render({ idleMode: 'photos', idleSlideshowImages: photos, slideshowUrl: 'https://docs.google.com/presentation/d/e/abc/pub' });
assert.ok(html.includes('slideshow-1.jpg') && !html.includes('docs.google.com'), 'photos wins over a saved Slides link');
html = render({ idleMode: 'photos', idleSlideshowImages: [] });
assert.ok(html.includes('Ally Family Lights'), 'photos with no photos falls back to the info screen');
html = render({ idleMode: 'slides', slideshowUrl: '' });
assert.ok(html.includes('Ally Family Lights'), 'slides with no link falls back to the info screen');

print('Test 10: resolveIdleMode: a saved choice wins, an unset one works out what the sign did before the choice existed');
assert.strictEqual(resolveIdleMode('info', 'https://x', 3), 'info');
assert.strictEqual(resolveIdleMode('photos', '', 3), 'photos');
assert.strictEqual(resolveIdleMode('photos', '', 0), 'photos', 'a choice with nothing to show yet is kept (the sign shows the info screen meanwhile)');
assert.strictEqual(resolveIdleMode('slides', 'https://x', 0), 'slides');
assert.strictEqual(resolveIdleMode('slides', '   ', 5), 'slides', 'kept as chosen, so saving does not change the admin\'s pick');
assert.strictEqual(resolveIdleMode(null, 'https://x', 3), 'slides', 'before: a Slides link first');
assert.strictEqual(resolveIdleMode('', '', 3), 'photos', 'before: then photos');
assert.strictEqual(resolveIdleMode(undefined, '', 0), 'info', 'before: else the info screen');
assert.strictEqual(resolveIdleMode('bogus', '', 2), 'photos', 'an unknown value counts as not chosen');

print('Test 11: timed Google Slides / Custom Display rules keep the screen the admin chose');
assert.deepStrictEqual(idleOverrideForRule('slideshow', { url: 'https://docs.google.com/x' }, 'info', 3), { slideshowUrl: 'https://docs.google.com/x', idleMode: 'slides' });
assert.deepStrictEqual(idleOverrideForRule('slideshow', { url: 'https://docs.google.com/x' }, 'photos', 0), { slideshowUrl: 'https://docs.google.com/x', idleMode: 'slides' });
assert.deepStrictEqual(idleOverrideForRule('custom_display', {}, 'info', 3), { slideshowUrl: '', idleMode: 'info' }, 'chose the info screen, has photos: the rule must not switch to the photos');
assert.deepStrictEqual(idleOverrideForRule('custom_display', {}, 'photos', 3), { slideshowUrl: '', idleMode: 'photos' });
assert.deepStrictEqual(idleOverrideForRule('custom_display', { url: 'https://ignored' }, 'info', 0), { slideshowUrl: '', idleMode: 'info' }, 'a Custom Display rule ignores any link');
assert.deepStrictEqual(idleOverrideForRule('custom_display', {}, 'slides', 3), { slideshowUrl: '', idleMode: 'photos' }, 'had chosen Slides: the rule shows the photos if there are any');
assert.deepStrictEqual(idleOverrideForRule('custom_display', {}, 'slides', 0), { slideshowUrl: '', idleMode: 'info' }, '... else the info screen');
assert.deepStrictEqual(idleOverrideForRule('slideshow', {}, 'info', 3), { slideshowUrl: '', idleMode: 'info' }, 'a Slides rule with no link clears the link');
assert.deepStrictEqual(idleOverrideForRule('slideshow', { url: 42 }, 'slides', 0), { slideshowUrl: '', idleMode: 'info' }, 'a link that is not text counts as none');
assert.strictEqual(idleOverrideForRule('theme', { url: 'https://x' }, 'info', 3), null);
assert.strictEqual(idleOverrideForRule('announcement', {}, 'photos', 3), null);

print('All tests passed');
