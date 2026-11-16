import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import JukeboxSetup, { TABS, toTab } from '../components/admin/JukeboxSetup';

function print(msg: string) {
  console.log('[test-jukebox-tabs] ' + msg);
}

const read = (...parts: string[]) => fs.readFileSync(path.join(process.cwd(), ...parts), 'utf-8');

print('Test 1: four tabs, one job each, in the order a new operator needs them');
assert.deepStrictEqual(TABS.map((tab) => [tab.id, tab.label]), [
  ['songs', 'Playlists & songs'],
  ['season', 'Season & countdown'],
  ['rules', 'Request rules'],
  ['visitor', 'Visitor page'],
]);

print('Test 2: old links and garbage still land somewhere sensible');
for (const id of ['songs', 'season', 'rules', 'visitor']) assert.strictEqual(toTab(id), id);
assert.strictEqual(toTab('playlists'), 'songs', 'the old Playlists tab was merged into songs');
assert.strictEqual(toTab('nope'), 'songs');
assert.strictEqual(toTab(undefined), 'songs');

print('Test 3: each tab says what it is for');
const html = renderToStaticMarkup(createElement(JukeboxSetup, { initialTab: 'season' }));
const intros = [
  'Which playlists and songs visitors can request.',
  'Which season the page shows, when the next show starts, and what it says between seasons.',
  'How many requests a visitor can make, where the queue puts them, and who can request from where.',
  'The words and cards on the jukebox page: show name, radio frequency, reminders, facts and videos.',
];
for (const intro of intros) assert.ok(html.includes(intro), intro);

print('Test 4: the cards sit in the right tab');
const start = (label: string) => html.indexOf(`aria-label="${label}"`);
const [songs, season, rules, visitor] = ['Playlists and songs', 'Season and countdown', 'Request rules', 'Visitor page'].map(start);
assert.ok(songs >= 0 && season > songs && rules > season && visitor > rules, 'the four sections are in tab order');
const inSeason = html.slice(season, rules);
const inVisitor = html.slice(visitor);
for (const heading of ['Season and logo', 'Countdown to the next show', 'Off-season message']) assert.ok(inSeason.includes(heading), `season tab: ${heading}`);
assert.ok(inVisitor.includes('YouTube Video Management'), 'visitor tab: YouTube videos');
for (const heading of ['Season and logo', 'Countdown to the next show', 'Off-season message']) assert.ok(!inVisitor.includes(heading), `not on the visitor tab: ${heading}`);
for (const heading of ['YouTube Video Management']) assert.ok(!inSeason.includes(heading), `not on the season tab: ${heading}`);
assert.ok(html.slice(rules, visitor).includes('Location Restrictions'), 'location limits stay with the request rules');

print('Test 5: only the open tab loads the visitor-page preview');
assert.ok(!html.includes('/settings/jukebox/preview') || html.indexOf('/settings/jukebox/preview') > season, 'preview frame is not in the songs tab');
assert.strictEqual((html.match(/<iframe/g) || []).length, 1, 'one preview frame for the open tab only');

print('Test 6: the two forms save only their own settings, so one Save cannot overwrite the other');
const settings = read('components', 'admin', 'JukeboxSettings.tsx');
const countdownAt = settings.indexOf('export function CountdownSettings');
assert.ok(countdownAt > 0, 'CountdownSettings exists');
const visitorAt = settings.indexOf('export function VisitorPageSettings');
const visitorSource = visitorAt < countdownAt ? settings.slice(visitorAt, countdownAt) : settings.slice(visitorAt);
const countdownSource = visitorAt < countdownAt ? settings.slice(countdownAt) : settings.slice(countdownAt, visitorAt);
for (const key of ['jukebox_countdown_enabled', 'jukebox_countdown_heading', 'jukebox_countdown_start']) {
  assert.ok(countdownSource.includes(key), `countdown form saves ${key}`);
  assert.ok(!visitorSource.includes(key), `visitor form does not touch ${key}`);
}
for (const key of ['site_name', 'jukebox_fm_frequency', 'jukebox_courtesy_enabled', 'jukebox_specs_enabled', 'jukebox_audience_enabled']) {
  assert.ok(visitorSource.includes(key), `visitor form saves ${key}`);
  assert.ok(!countdownSource.includes(key), `countdown form does not touch ${key}`);
}
assert.ok(countdownSource.includes('id="jukebox-countdown-start"'), 'the Next show starts field keeps its id');
assert.ok(!/countdownEnabled\s*&&\s*\(\s*<div>\s*<AdminLabel htmlFor="jukebox-countdown-start"/.test(countdownSource), 'the typed start is shown even with the visitor countdown off');
assert.ok(countdownSource.includes('startClearedCount'), 'the countdown form drops its copy when the status box clears the typed start');

print('Test 7: links that point at a moved card go to its new tab');
assert.ok(read('components', 'admin', 'jukebox', 'LiveStatus.tsx').includes("onOpenTab('season', 'jukebox-countdown-start')"));
assert.ok(read('app', 'theme-settings', 'page.tsx').includes('tab=season'));
assert.ok(read('app', 'settings', 'videos', 'page.tsx').includes('tab=visitor'));
assert.ok(read('app', 'settings', 'location', 'page.tsx').includes('tab=rules'));

print('All tests passed');
