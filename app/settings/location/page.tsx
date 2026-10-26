import { redirect } from 'next/navigation';

// Location limits are now part of Settings → Jukebox → Request rules
export default function LocationSettingsPage() {
  redirect('/settings/jukebox?tab=rules');
}
