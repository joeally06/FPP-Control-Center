// Shapes of the public API answers that the visitor page (app/jukebox/page.tsx) reads.

export interface CurrentlyPlaying {
  id: number | null; // null when the song comes from the FPP schedule, not the request queue
  sequence_name: string; // Original sequence name without .fseq extension
  media_name?: string | null; // MP3/media filename for Spotify matching
  requester_name?: string | null;
  played_at?: string | null;
  cached?: boolean; // Whether data is from cache or direct FPP query
  cache_age_seconds?: number; // Age of cached data in seconds
  playlist_name?: string; // Set while a visitor-requested playlist is playing
}

export interface SequenceMetadata {
  sequence_name: string; // Now contains sequence names without .fseq extension
  song_title: string;
  artist: string;
  album: string;
  release_year: number | null;
  album_cover_url: string | null;
  spotify_id: string | null;
  spotify_url: string | null; // Spotify external URL for "Listen on Spotify" button
  cached: boolean;
}

export interface YouTubeVideo {
  id: number;
  title: string;
  videoId: string;
  description: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  publishedAt: string;
  theme?: string;
  youtubeUrl?: string;
  embedUrl?: string;
}

export interface ScheduleStatus {
  isActive: boolean;
  currentPlaylist: string | null;
  status: string;
  message: string;
  nextShowTime: string | null;
  nextShowDate: string | null;
  nextShowDay: string | null;
  nextShowStartTime: string | null;
  nextShowEndTime: string | null;
  currentShowEndTime?: string | null;
  countdown: string | null;
  lastChecked: string;
}
