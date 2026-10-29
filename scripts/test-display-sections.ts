import assert from 'assert';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import DisplaySettings from '../components/admin/DisplaySettings';
import ImageUpload from '../components/admin/display/ImageUpload';
import DisplayProfiles, { type DisplayProfileRow } from '../components/admin/display/DisplayProfiles';
import DisplaySchedule from '../components/admin/display/DisplaySchedule';
import type { ScheduleRule } from '../types/display';

function print(msg: string) {
  console.log('[test-display-sections] ' + msg);
}

const noop = () => {};
const html = (element: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(element);

print('Test 1: the Digital Sign settings show a loading message until the saved settings arrive');
const loading = html(createElement(DisplaySettings));
assert.ok(loading.includes('Loading display settings'));

print('Test 2: image upload offers a drop area, or the current image with Replace and Remove');
const empty = html(createElement(ImageUpload, { label: 'Logo', currentUrl: '', slot: 'logo', onUploaded: noop, onClear: noop }));
assert.ok(empty.includes('Click or drag &amp; drop an image') && empty.includes('max 5 MB'));
assert.ok(empty.includes('accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"'));
assert.ok(!empty.includes('Replace'));
const filled = html(createElement(ImageUpload, { label: 'Logo', currentUrl: '/uploads/display/logo.png', slot: 'logo', onUploaded: noop, onClear: noop }));
assert.ok(filled.includes('src="/uploads/display/logo.png"') && filled.includes('alt="Logo"'));
assert.ok(filled.includes('Replace') && filled.includes('Remove'));
assert.ok(!filled.includes('Click or drag'));

print('Test 3: profiles — empty list, then an active and an inactive profile');
const profileProps = { onRefresh: noop, onMessage: noop, onProfileActivated: noop };
const noProfiles = html(createElement(DisplayProfiles, { profiles: [], ...profileProps }));
assert.ok(noProfiles.includes('Display Profiles') && noProfiles.includes('No saved profiles yet'));
assert.ok(noProfiles.includes('placeholder="Profile name (e.g. Show Night, Off Season)"'));
assert.ok(/<button[^>]*disabled[^>]*>Save Current<\/button>/.test(noProfiles), 'Save is disabled with no name');
const profiles: DisplayProfileRow[] = [
  { id: 1, name: 'Show Night', is_active: 1, created_at: '2026-10-01T00:00:00Z' },
  { id: 2, name: 'Off Season', is_active: 0, created_at: '2026-10-02T00:00:00Z' },
];
const withProfiles = html(createElement(DisplayProfiles, { profiles, ...profileProps }));
assert.ok(withProfiles.includes('● ACTIVE') && withProfiles.includes('Show Night') && withProfiles.includes('Off Season'));
assert.strictEqual((withProfiles.match(/>Activate</g) || []).length, 1, 'only the inactive profile can be activated');
assert.ok(withProfiles.includes('aria-label="Delete Off Season"') && withProfiles.includes('aria-label="Update Show Night with current settings"'));

print('Test 4: schedule — empty list, then a rule; the add/edit form starts closed');
const noRules = html(createElement(DisplaySchedule, { rules: [], onRefresh: noop }));
assert.ok(noRules.includes('Content Schedule') && noRules.includes('No schedule rules yet.') && noRules.includes('+ Add Rule'));
assert.ok(!noRules.includes('New Rule'));
const rule: ScheduleRule = {
  id: 7, name: 'Evening show', enabled: true, days: '5,6', startTime: '18:00', endTime: '22:00',
  actionType: 'custom_display', actionPayload: '{}', priority: 10, createdAt: '2026-10-01T00:00:00Z',
};
const withRule = html(createElement(DisplaySchedule, { rules: [rule], onRefresh: noop }));
assert.ok(withRule.includes('Evening show') && withRule.includes('custom display'));
assert.ok(withRule.includes('18:00–22:00 · Days 5,6 · Priority 10'));
assert.ok(withRule.includes('aria-label="Delete Evening show"') && withRule.includes('>Edit<'));
assert.ok(!withRule.includes('No schedule rules yet.'));

print('All tests passed');
