import { redirect } from 'next/navigation';

// The season and logo are now part of Settings → Jukebox → Season & countdown
export default function ThemeSettingsPage() {
  redirect('/settings/jukebox?tab=season');
}
