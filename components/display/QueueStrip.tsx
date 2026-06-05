import type { UpcomingQueueItem } from '@/types/display';

interface Props {
  queue: UpcomingQueueItem[];
  accentColor?: string;
}

export default function QueueStrip({ queue, accentColor = '#ef4444' }: Props) {
  const visible = queue.slice(0, 4);

  return (
    <div className="h-full flex flex-col justify-center px-6 gap-2">
      <p
        className="text-xs font-semibold tracking-widest uppercase mb-0.5"
        style={{ color: `${accentColor}99` }}
      >
        Coming Up Next
      </p>

      {visible.length === 0 ? (
        <p className="text-gray-600 text-sm italic">No songs queued</p>
      ) : (
        visible.map((item, i) => (
          <div key={i} className="flex items-start gap-3 min-w-0">
            <span className="text-white/50 text-sm w-5 flex-shrink-0 pt-0.5">
              {i + 1}.
            </span>
            <div className="flex-1 min-w-0">
              <span className="text-white/90 text-base font-medium block truncate leading-tight">
                {item.songTitle ?? item.sequenceName}
              </span>
              <span className="text-white/60 text-sm block truncate leading-tight">
                {item.artist ? `${item.artist} · ` : ''}
                {item.requesterName === 'FPP Schedule'
                  ? 'Scheduled'
                  : item.requesterName}
              </span>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
