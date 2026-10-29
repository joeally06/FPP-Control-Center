import assert from 'assert';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import RadioBarAdminSlot from '../components/jukebox/RadioBarAdminSlot';
import { NowPlayingAdminActions, QueueItemAdminActions } from '../components/jukebox/AdminQueueActions';
import { SantaCard, TriviaCard } from '../components/jukebox/ChristmasCards';
import PastShowsSection from '../components/jukebox/PastShowsSection';
import type { YouTubeVideo } from '../lib/jukebox-page-types';

function print(msg: string) {
  console.log('[test-jukebox-components] ' + msg);
}

const noop = () => {};
const html = (element: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(element);

print('Test 1: the radio bar shows sign-in, or dashboard and log-out, by who is signed in');
const signedOut = html(createElement(RadioBarAdminSlot, { signedIn: false, isAdmin: false, onSignIn: noop, onOpenDashboard: noop, onSignOut: noop }));
assert.ok(signedOut.includes('aria-label="Admin sign in"'));
assert.ok(!signedOut.includes('Log out') && !signedOut.includes('Dashboard'));

const admin = html(createElement(RadioBarAdminSlot, { signedIn: true, isAdmin: true, userName: 'Joe', onSignIn: noop, onOpenDashboard: noop, onSignOut: noop }));
assert.ok(admin.includes('aria-label="Dashboard"') && admin.includes('aria-label="Log out"'));
assert.ok(admin.includes('title="Signed in as Joe"'));
assert.ok(!admin.includes('Admin sign in'));

const signedInNotAdmin = html(createElement(RadioBarAdminSlot, { signedIn: true, isAdmin: false, onSignIn: noop, onOpenDashboard: noop, onSignOut: noop }));
assert.ok(signedInNotAdmin.includes('aria-label="Log out"'));
assert.ok(!signedInNotAdmin.includes('Dashboard'), 'a non-admin account gets no dashboard button');
assert.ok(!signedInNotAdmin.includes('title='), 'no tooltip without a name');

print('Test 2: the admin buttons on Now Playing and on a queue row');
const nowPlaying = html(createElement(NowPlayingAdminActions, { onComplete: noop, onSkip: noop }));
assert.ok(nowPlaying.includes('Mark complete') && nowPlaying.includes('Skip'));
const row = html(createElement(QueueItemAdminActions, { onPlayNow: noop, onRemove: noop }));
assert.ok(row.includes('Play now') && row.includes('Remove'));
assert.strictEqual((row.match(/<button/g) || []).length, 2);

print('Test 3: the Santa and trivia cards');
const santa = html(createElement(SantaCard, { onOpen: noop }));
assert.ok(santa.includes('aria-labelledby="santa-heading"') && santa.includes('id="santa-heading"'));
assert.ok(santa.includes('Write a letter to Santa') && santa.includes('Write to Santa'));
const trivia = html(createElement(TriviaCard, { onOpen: noop }));
assert.ok(trivia.includes('aria-labelledby="trivia-heading"') && trivia.includes('id="trivia-heading"'));
assert.ok(trivia.includes('Play Christmas trivia'));

print('Test 4: past light shows are hidden with no videos, and listed with some');
assert.strictEqual(html(createElement(PastShowsSection, { videos: [] })), '');
const video = (id: number, thumbnailUrl: string | null): YouTubeVideo => ({
  id, title: `Show ${id}`, videoId: `abc${id}`, description: null, thumbnailUrl, durationSeconds: null, publishedAt: '2025-12-01T00:00:00Z',
});
const list = html(createElement(PastShowsSection, { videos: [video(1, 'https://img.example/1.jpg'), video(2, null)] }));
assert.ok(list.includes('Watch past light shows'));
assert.ok(list.includes('Show 1') && list.includes('Show 2'));
assert.ok(list.includes('src="https://img.example/1.jpg"'), 'thumbnail');
assert.ok(list.includes('🎬'), 'a video without a thumbnail gets the placeholder');
assert.strictEqual((list.match(/aria-pressed="false"/g) || []).length, 2, 'nothing is selected at first');
assert.ok(!list.includes('aspect-video'), 'no player until a video is picked');

print('All tests passed');
