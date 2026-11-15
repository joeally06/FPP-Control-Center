'use client';

import { Music } from 'lucide-react';
import type { AdminPlaylist } from '@/lib/jukebox-playlists';
import type { AdminSong, AudioStatus, PlaylistAdminSong, SongFilter } from '@/lib/jukebox-songs';
import { badge } from '@/components/admin/ui-classes';

export interface SpotifySearchResult {
  id: string;
  name: string;
  artist: string;
  album: string;
  albumArt: string;
  spotifyUri: string;
  previewUrl: string | null;
}

export interface LocalAudioFile {
  name: string;
  size: number;
  lastModified: string;
}

export type Message = { ok: boolean; text: string } | null;

export const AUDIO: Record<AudioStatus, { label: string; className: string; help: string }> = {
  ready: {
    label: 'Audio ready',
    className: badge.ok,
    help: 'Visitors can listen along on their phones.',
  },
  'needs-download': {
    label: 'Download audio',
    className: badge.warn,
    help: 'FPP has this song’s audio. Download a copy so visitors can listen on their phones.',
  },
  'needs-mapping': {
    label: 'No audio file',
    className: badge.danger,
    help: 'No matching audio file was found on this server, and FPP’s playlist doesn’t name one. Pick a file for this sequence.',
  },
};

export const FILTERS: { id: SongFilter; label: string }[] = [
  { id: 'all', label: 'All songs' },
  { id: 'titles', label: 'Needs a title' },
  { id: 'audio', label: 'Needs phone audio' },
];

export function matchesFilter(song: AdminSong, filter: SongFilter) {
  if (filter === 'titles') return !song.title;
  if (filter === 'audio') return song.audioStatus !== 'ready';
  return true;
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function SongArt({ song, large = false }: { song: AdminSong; large?: boolean }) {
  const size = large ? 'h-16 w-16 rounded-xl' : 'h-11 w-11 rounded-lg';
  return song.albumArt ? (
    // eslint-disable-next-line @next/next/no-img-element -- album art hosted by Spotify or wherever the admin pointed it
    <img src={song.albumArt} alt="" className={`${size} shrink-0 object-cover`} />
  ) : (
    <span className={`${size} grid shrink-0 place-items-center border border-dashed border-adm-control-line text-adm-faint`}>
      <Music className={large ? 'h-6 w-6' : 'h-4 w-4'} aria-hidden="true" />
    </span>
  );
}

/** A song in the list: in a playlist it also says whether that playlist has its own details */
export type ListedSong = AdminSong & Partial<Pick<PlaylistAdminSong, 'ownDetails' | 'own'>>;

export const CHIP = (active: boolean) =>
  `min-h-9 rounded-full border px-3.5 text-[13px] font-medium transition-colors ${
    active ? 'border-adm-accent bg-adm-warn-bg text-adm-warn' : 'border-adm-control-line bg-adm-control text-adm-text hover:bg-adm-line'
  }`;

/** "Dec 11" from "2026-12-11", read as a plain calendar date (no time zone shift) */
export function formatShortDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Where a playlist stands in FPP's Scheduler, when that is worth a note */
export function seasonNote(playlist: AdminPlaylist): string | null {
  if (playlist.season === 'upcoming') return playlist.startsOn ? `Starts ${formatShortDate(playlist.startsOn)}` : 'Starts later';
  if (playlist.season === 'ended') return 'Ended';
  if (playlist.season === 'not-scheduled') return 'Not scheduled';
  return null;
}

