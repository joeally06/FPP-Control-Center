import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DateTime } from 'luxon';
import LiveStatus, { isCardOpen } from '../components/admin/jukebox/LiveStatus';
import { buildLiveStatus, type LiveStatusInput } from '../lib/jukebox-live-status';
import type { FppScheduleEntry } from '../lib/show-schedule';

function print(msg: string) {
  console.log('[test-jukebox-live-status] ' + msg);
}

// Sunday 15 Nov 2026, 12:50 PM at the show (the day the dev database showed a countdown two hours early)
const now = DateTime.fromISO('2026-11-15T12:50:00', { zone: 'America/Chicago' });

const entry = (patch: Partial<FppScheduleEntry>): FppScheduleEntry => ({ enabled: 1, day: 7, startTime: '17:00:00', endTime: '22:30:00', ...patch });
const schedule: FppScheduleEntry[] = [
  entry({ enabled: 0, playlist: 'Halloween 2026', startDate: '2026-10-02', endDate: '2026-10-31' }),
  entry({ playlist: 'Prise and Worship', startTime: '18:30:00', startDate: '2026-11-15', endDate: '2027-01-03' }),
  entry({ playlist: 'Classic Christmas', startDate: '2026-11-28', endDate: '2027-01-03' }),
  entry({ playlist: 'Modern Chirstmas', startDate: '2026-11-28', endDate: '2027-01-03' }),
  entry({ playlist: '', startTime: '22:30:00' }), // a Run Script command, no playlist
];

const input = (patch: Partial<LiveStatusInput> = {}): LiveStatusInput => ({
  now,
  themeId: 'christmas',
  playlists: [
    { name: 'Halloween 2026', theme: 'halloween', itemCount: 6 },
    { name: 'Classic Christmas', theme: 'christmas', itemCount: 7 },
    { name: 'Modern Chirstmas', theme: 'christmas', itemCount: 0 },
    { name: 'Praise and Worship', theme: null, itemCount: 6 },
  ],
  offeredNames: [],
  schedule,
  typedStart: '2026-11-15T16:30',
  rateLimit: 3,
  locationLimited: false,
  ...patch,
});
const reasonOf = (live: ReturnType<typeof buildLiveStatus>, name: string) => live.playlists.find((p) => p.name === name)!;

print('Test 1: the problem state from the dev database, one plain reason per hidden playlist');
let live = buildLiveStatus(input());
assert.strictEqual(live.theme.name.length > 0, true);
assert.strictEqual(live.offeredCount, 0);
assert.ok(live.playlists.every((p) => !p.offered));
assert.deepStrictEqual(reasonOf(live, 'Classic Christmas').reason, "FPP's Scheduler starts it on Nov 28. It appears that day.");
assert.strictEqual(reasonOf(live, 'Classic Christmas').action, null);
assert.match(reasonOf(live, 'Modern Chirstmas').reason, /^No songs yet\./);
assert.strictEqual(reasonOf(live, 'Modern Chirstmas').action, 'sync');
assert.match(reasonOf(live, 'Praise and Worship').reason, /^Not tagged with a theme/);
assert.strictEqual(reasonOf(live, 'Praise and Worship').action, 'tag');
assert.match(reasonOf(live, 'Halloween 2026').reason, /Halloween.*Christmas is the active theme/);
assert.deepStrictEqual(live.unmatchedScheduleNames, ['Prise and Worship'], 'disabled entries, blank playlists and matching names are left out');
assert.strictEqual(live.needsAttention, true);

print('Test 2: a typed start that replaces the schedule says so, with both times');
assert.strictEqual(live.countdown.source, 'typed');
assert.strictEqual(live.countdown.label, 'Today 4:30 PM');
assert.strictEqual(live.countdown.schedule?.label, 'Today 6:30 PM');
assert.strictEqual(live.countdown.schedule?.playlist, 'Prise and Worship');
assert.strictEqual(live.countdown.overridesSchedule, true);

print('Test 3: with no typed start the countdown follows the schedule');
live = buildLiveStatus(input({ typedStart: '' }));
assert.strictEqual(live.countdown.source, 'schedule');
assert.strictEqual(live.countdown.label, 'Today 6:30 PM');
assert.strictEqual(live.countdown.overridesSchedule, false);
assert.strictEqual(buildLiveStatus(input({ typedStart: null })).countdown.source, 'schedule');

print('Test 4: a typed start that has already passed does not count');
live = buildLiveStatus(input({ typedStart: '2026-11-15T09:00' }));
assert.strictEqual(live.countdown.source, 'schedule');
assert.strictEqual(live.countdown.overridesSchedule, false);

print('Test 5: a typed start that matches the schedule is not an override; with no schedule it is the only source');
live = buildLiveStatus(input({ typedStart: '2026-11-15T18:30' }));
assert.strictEqual(live.countdown.source, 'typed');
assert.strictEqual(live.countdown.overridesSchedule, false);
live = buildLiveStatus(input({ schedule: null, typedStart: '2026-11-16T17:00' }));
assert.strictEqual(live.countdown.source, 'typed');
assert.strictEqual(live.countdown.label, 'Tomorrow 5:00 PM');
assert.strictEqual(live.countdown.schedule, null);
assert.strictEqual(live.countdown.overridesSchedule, false);
live = buildLiveStatus(input({ schedule: null, typedStart: '' }));
assert.strictEqual(live.countdown.source, 'none');
assert.strictEqual(live.countdown.at, null);

print('Test 5b: while a scheduled show is on, the box says so instead of "nothing scheduled"');
const evening = DateTime.fromISO('2026-11-15T19:37:00', { zone: 'America/Chicago' });
live = buildLiveStatus(input({ now: evening, typedStart: '' }));
assert.strictEqual(live.countdown.source, 'none');
assert.strictEqual(live.countdown.showOnNowUntil, '10:30 PM');
assert.strictEqual(buildLiveStatus(input({ now, typedStart: '' })).countdown.showOnNowUntil, null, 'no show is on at 12:50 PM');
const onNowHtml = renderToStaticMarkup(createElement(LiveStatus, { live, syncing: false, onSync: () => {}, onOpenTab: () => {}, onUseScheduleStart: () => {} }));
assert.ok(onNowHtml.includes('A show is on now') && onNowHtml.includes('Scheduled until 10:30 PM') && !onNowHtml.includes('Nothing scheduled'));

print('Test 6: offered playlists are exactly the ones the visitor list returned');
live = buildLiveStatus(input({ playlists: [{ name: 'Classic Christmas', theme: 'christmas', itemCount: 7 }, { name: 'Modern Christmas', theme: 'christmas', itemCount: 5 }], offeredNames: ['Classic Christmas', 'Modern Christmas'], schedule: [entry({ playlist: 'Classic Christmas', startDate: '2026-11-01' }), entry({ playlist: 'Modern Christmas', startDate: '2026-11-01' })], typedStart: '' }));
assert.strictEqual(live.offeredCount, 2);
assert.ok(live.playlists.every((p) => p.offered && p.reason === 'Visitors can request it.' && p.action === null));
assert.strictEqual(live.needsAttention, false);

print('Test 7: the first matching reason wins');
live = buildLiveStatus(input({ playlists: [{ name: 'Empty and untagged', theme: null, itemCount: 0 }] }));
assert.match(reasonOf(live, 'Empty and untagged').reason, /^No songs yet/);
live = buildLiveStatus(input({ playlists: [{ name: 'Old Halloween', theme: 'halloween', itemCount: 4 }], schedule: [entry({ playlist: 'Old Halloween', startDate: '2026-10-01', endDate: '2026-10-31' })] }));
assert.match(reasonOf(live, 'Old Halloween').reason, /Christmas is the active theme\. Its Scheduler dates are over\.$/);

print('Test 8: tagged for the active theme but not in the Scheduler, or its dates are over');
live = buildLiveStatus(input({ playlists: [{ name: 'Lonely', theme: 'christmas', itemCount: 3 }, { name: 'Ended', theme: 'christmas', itemCount: 3 }], schedule: [entry({ playlist: 'Ended', startDate: '2026-01-01', endDate: '2026-02-01' })] }));
assert.match(reasonOf(live, 'Lonely').reason, /no enabled entry/);
assert.match(reasonOf(live, 'Ended').reason, /dates are over/);

print('Test 9: playlists are listed with the offered ones first, then by name');
live = buildLiveStatus(input({ offeredNames: ['Praise and Worship'], playlists: [{ name: 'B', theme: 'christmas', itemCount: 1 }, { name: 'Praise and Worship', theme: 'christmas', itemCount: 6 }, { name: 'A', theme: 'christmas', itemCount: 1 }] }));
assert.deepStrictEqual(live.playlists.map((p) => p.name), ['Praise and Worship', 'A', 'B']);

print('Test 10: the card shows the problem state with a fix only where there is one');
const noop = () => {};
const card = (state: ReturnType<typeof buildLiveStatus>, extra = {}) =>
  renderToStaticMarkup(createElement(LiveStatus, { live: state, syncing: false, onSync: noop, onOpenTab: noop, onUseScheduleStart: noop, ...extra }));
live = buildLiveStatus(input());
let html = card(live);
assert.ok(html.includes('What visitors see right now'));
assert.ok(html.includes('Today 4:30 PM') && html.includes('Typed by you, not from FPP'));
assert.ok(html.includes("Use FPP&#x27;s time") && html.includes('Edit it'));
assert.ok(html.includes('0 of 4 shown to visitors'));
for (const text of ['Classic Christmas', 'Modern Chirstmas', 'Praise and Worship', 'Halloween 2026']) assert.ok(html.includes(text), text);
assert.strictEqual((html.match(/>Hidden</g) || []).length, 4, 'every row says Hidden in words, not only by color');
assert.strictEqual((html.match(/>Sync</g) || []).length, 1, 'Sync only on the playlist with no songs');
assert.strictEqual((html.match(/>Tag it</g) || []).length, 1, 'Tag it only on the untagged playlist');
assert.ok(html.includes('Prise and Worship') && html.includes('matches no playlist'));
assert.ok(html.includes('3 per visitor per hour'));
assert.ok(!/opacity-0/.test(html), 'no hover-only controls');

print('Test 11: Sync is disabled while a sync runs');
assert.ok(/<button[^>]*disabled=""[^>]*>Syncing…<\/button>/.test(card(live, { syncing: true })));

print('Test 12: when all is well the card is one line with a Details button');
live = buildLiveStatus(input({ playlists: [{ name: 'Classic Christmas', theme: 'christmas', itemCount: 7 }], offeredNames: ['Classic Christmas'], schedule: [entry({ playlist: 'Classic Christmas', startDate: '2026-11-01' })], typedStart: '' }));
html = card(live);
assert.ok(html.includes('Visitors can request 1 playlist') && html.includes('Classic Christmas'));
assert.ok(html.includes('>Details<'));
assert.ok(!html.includes('<ul'), 'the playlist list is hidden until Details is opened');
assert.ok(!html.includes('Typed by you'));

print('Test 12b: a problem that appears after the card was folded opens it again (the card is not decided only once)');
assert.strictEqual(isCardOpen(false, false), false, 'all well, not asked: one line');
assert.strictEqual(isCardOpen(true, false), true, 'a problem opens it, even if it was one line a moment ago');
assert.strictEqual(isCardOpen(false, true), true, 'Details opens it');
assert.strictEqual(isCardOpen(true, true), true);
assert.ok(!/useState\(\s*live\.needsAttention\s*\)/.test(fs.readFileSync(path.join(process.cwd(), 'components', 'admin', 'jukebox', 'LiveStatus.tsx'), 'utf-8')), 'the open state is not seeded once from the first load');

print('Test 13: a location limit is shown');
assert.ok(card(buildLiveStatus(input({ locationLimited: true }))).includes('Only near the show'));

print('All tests passed');
