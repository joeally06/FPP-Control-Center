import { redirect } from 'next/navigation';

// Song details, phone audio and the audio files are now part of Settings → Jukebox → Songs
export default function MediaPage() {
  redirect('/settings/jukebox?tab=songs');
}
