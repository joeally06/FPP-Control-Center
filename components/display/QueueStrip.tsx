import type { UpcomingQueueItem } from '@/types/display';

interface Props {
  queue: UpcomingQueueItem[];
  /** Multiplier for the text (the sign's font scale / 100) */
  scale?: number;
}

function requesterLabel(name: string): string {
  return name === 'FPP Schedule' ? 'Scheduled show' : `Requested by ${name}`;
}

/** "Up next": the first song large, the rest as one smaller line. */
export default function QueueStrip({ queue, scale = 1 }: Props) {
  const [first, ...rest] = queue;

  return (
    <div className="min-w-0">
      <p className="font-bold uppercase text-white/65" style={{ fontSize: `${1.35 * scale}vw`, letterSpacing: '0.28em' }}>
        Up next
      </p>

      {!first ? (
        <p className="text-white/70 mt-1" style={{ fontSize: `${2 * scale}vw` }}>
          Nothing queued yet. Scan to pick a song!
        </p>
      ) : (
        <>
          <p className="font-bold truncate mt-1" style={{ fontSize: `${2.7 * scale}vw` }}>
            {first.songTitle ?? first.sequenceName}
          </p>
          <p className="text-white/75 truncate" style={{ fontSize: `${1.65 * scale}vw` }}>
            {first.artist ? `${first.artist} · ` : ''}{requesterLabel(first.requesterName)}
          </p>
          {rest.length > 0 && (
            <p className="text-white/65 truncate mt-2" style={{ fontSize: `${1.5 * scale}vw` }}>
              Then: {rest.map((item) => item.songTitle ?? item.sequenceName).join(' · ')}
            </p>
          )}
        </>
      )}
    </div>
  );
}
