'use client';

import { useState } from 'react';
import { YouTubePlayer } from '@/components/YouTubePlayer';
import { formatDateTime } from '@/lib/time-utils';
import type { YouTubeVideo } from '@/lib/jukebox-page-types';

/** Past light show videos: a thumbnail grid and a player for the one the visitor picked. Hidden when there are none. */
export default function PastShowsSection({ videos }: { videos: YouTubeVideo[] }) {
  const [selectedVideo, setSelectedVideo] = useState<YouTubeVideo | null>(null);

  if (videos.length === 0) return null;

  return (
    <section aria-labelledby="videos-heading" className="sp-panel">
      <span className="sp-eyebrow">From past seasons</span>
      <h2 id="videos-heading" className="sp-display sp-h2">Watch past light shows</h2>

      {/* YouTube Player */}
      {selectedVideo && (
        <div className="mt-4 space-y-3">
          <div className="aspect-video overflow-hidden rounded-xl bg-black/60">
            <YouTubePlayer
              videoId={selectedVideo.videoId}
              width="100%"
              height="100%"
            />
          </div>
          <div className="sp-row p-4">
            <h3 className="font-semibold">{selectedVideo.title}</h3>
            {selectedVideo.description && (
              <p className="sp-muted mt-1 text-sm">{selectedVideo.description}</p>
            )}
            <p className="sp-muted mt-1 text-xs">
              Published {formatDateTime(selectedVideo.publishedAt, 'medium')}
            </p>
          </div>
        </div>
      )}

      {/* Video Thumbnails Grid */}
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {videos.map((video) => (
          <button
            type="button"
            key={video.id}
            onClick={() => setSelectedVideo(video)}
            aria-pressed={selectedVideo?.id === video.id}
            className={`overflow-hidden rounded-xl border-2 text-left transition ${
              selectedVideo?.id === video.id ? 'border-white shadow-lg' : 'border-white/15 hover:border-white/40'
            }`}
          >
            {video.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- remote YouTube thumbnail
              <img src={video.thumbnailUrl} alt="" className="h-24 w-full object-cover" />
            ) : (
              <div className="flex h-24 w-full items-center justify-center bg-white/10 text-2xl" aria-hidden="true">🎬</div>
            )}
            <span className="block truncate bg-black/40 p-2 text-xs font-medium text-white">{video.title}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
