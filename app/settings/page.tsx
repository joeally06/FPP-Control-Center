import { redirect } from 'next/navigation';

// Each settings section now has its own page; old /settings?section=… links and bookmarks land on it
const SECTION_PAGES: Record<string, string> = {
  jukebox: '/settings/jukebox',
  youtube: '/settings/videos',
  display: '/settings/display',
  trivia: '/settings/trivia',
  location: '/settings/location',
  database: '/settings/database',
  updates: '/settings/updates',
  santa: '/santa-letters',
  monitoring: '/device-status',
  themes: '/theme-settings',
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { section } = await searchParams;
  const known = typeof section === 'string' && Object.hasOwn(SECTION_PAGES, section);
  redirect(known ? SECTION_PAGES[section] : '/settings/jukebox');
}
