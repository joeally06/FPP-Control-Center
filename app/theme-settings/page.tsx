import { redirect } from 'next/navigation';

// The season and logo are now part of Settings → Jukebox → Visitor page
export default function ThemeSettingsPage() {
  redirect('/settings/jukebox?tab=visitor');
}
