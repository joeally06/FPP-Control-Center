import { redirect } from 'next/navigation';

// Videos are now part of Settings → Jukebox → Visitor page
export default function VideoSettingsPage() {
  redirect('/settings/jukebox?tab=visitor');
}
