import assert from 'assert';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import NowPlayingView from '../components/display/NowPlayingView';
import type { DisplayConfig, DisplayState } from '../types/display';

function print(msg: string) {
  console.log('[test-display-now-playing] ' + msg);
}

const config: DisplayConfig = {
  showName: 'Ally Family Lights', showQr: true, queueCount: 4, enabled: true,
  colorTheme: 'christmas', accentColor: '#ef4444', backgroundStyle: 'gradient',
  fontStyle: 'modern', fontScale: 100,
  idleMessage: '', logoUrl: '', sponsorText: '', fmFrequency: '',
  idleAnimation: 'none', showClock: false, idleBackgroundUrl: '', tickerText: '',
  slideshowUrl: '', idleSlideshowImages: [], idleSlideshowInterval: 8,
  countdownEnabled: false, countdownTime: '20:00', countdownLabel: '',
};

const state: DisplayState = {
  isPlaying: true, sequenceName: 'carol.fseq', songTitle: 'Carol of the Bells', artist: 'Trans-Siberian Orchestra',
  albumArtUrl: 'https://example.com/art.jpg', secondsPlayed: 81, secondsRemaining: 102,
  playlistName: 'Main', trackIndex: 7, trackCount: 24, requesterName: 'Maria',
  upcomingQueue: [
    { sequenceName: 'a.fseq', songTitle: 'Sleigh Ride', artist: 'The Ronettes', requesterName: 'Daniel' },
    { sequenceName: 'b.fseq', songTitle: 'Jingle Bell Rock', artist: null, requesterName: 'FPP Schedule' },
  ],
  jukeboxUrl: 'https://show.example/jukebox', config, activeAnnouncement: null, activeScheduleRule: null,
};

const render = (patch: Partial<DisplayState> = {}, cfg: Partial<DisplayConfig> = {}) =>
  renderToStaticMarkup(createElement(NowPlayingView, { state: { ...state, ...patch, config: { ...config, ...cfg } } }));

print('Test 1: the song, artist, requester and times are shown');
let html = render();
assert.ok(html.includes('Carol of the Bells') && html.includes('Trans-Siberian Orchestra'));
assert.ok(html.includes('Requested by Maria'));
assert.ok(html.includes('1:21') && html.includes('1:42'));
assert.ok(html.includes('Song 7 of 24') && html.includes('Ally Family Lights'));

print('Test 2: a scheduled song says "Scheduled show"');
html = render({ requesterName: 'FPP Schedule' });
assert.ok(html.includes('Scheduled show') && !html.includes('Requested by FPP Schedule'));

print('Test 3: the radio bar appears only when an FM frequency is set');
assert.ok(!render().includes('Tune your radio'));
html = render({}, { fmFrequency: '93.5' });
assert.ok(html.includes('Tune your radio to 93.5 FM'));
assert.ok(!html.includes('Song 7 of 24'), 'the radio bar replaces the show-name bar');
assert.ok(render({}, { fmFrequency: '93.5', accentColor: '#ffff00', colorTheme: 'custom' }).includes('color:#000000'), 'dark text on a light accent');
assert.ok(render({}, { fmFrequency: '93.5', accentColor: '#ff0', colorTheme: 'custom' }).includes('color:#000000'), '3-digit hex works too');

print('Test 4: the blurred background is drawn only when there is album art');
assert.ok(render().includes('class="np-bg '));
assert.ok(!render({ albumArtUrl: null }).includes('class="np-bg '));

print('Test 5: Up next shows the first song large and the rest on a "Then" line');
html = render();
assert.ok(html.includes('Up next') && html.includes('Sleigh Ride') && html.includes('Requested by Daniel'));
assert.ok(html.includes('Then: Jingle Bell Rock'));
html = render({ upcomingQueue: [] });
assert.ok(html.includes('Nothing queued yet'));
html = render({}, { queueCount: 1 });
assert.ok(html.includes('Sleigh Ride') && !html.includes('Then:') && !html.includes('Jingle Bell Rock'), 'queueCount caps the list');

print('Test 6: the QR code follows the Show QR setting');
assert.ok(render().includes('Scan to pick'));
html = render({}, { showQr: false });
assert.ok(!html.includes('Scan to pick'));

print('Test 7: the ticker and sponsor line appear only when set');
html = render();
assert.ok(!html.includes('ticker-inner') && !html.includes('Brought to you by'));
html = render({}, { tickerText: 'Merry Christmas', sponsorText: 'Brought to you by Ally Electric' });
assert.ok(html.includes('ticker-inner') && html.includes('Brought to you by Ally Electric'));

print('Test 8: the entrance animation respects reduced motion');
assert.ok(render().includes('prefers-reduced-motion: no-preference'));

print('All tests passed');
