interface Props {
  secondsPlayed: number;
  secondsRemaining: number;
  barFrom?: string;
  barTo?: string;
}

function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}:${String(ss).padStart(2, '0')}`;
}

export default function ProgressBar({
  secondsPlayed,
  secondsRemaining,
  barFrom = '#dc2626',
  barTo   = '#16a34a',
}: Props) {
  const total   = secondsPlayed + secondsRemaining;
  const percent = total > 0 ? Math.min(100, (secondsPlayed / total) * 100) : 0;

  return (
    <div className="w-full">
      <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-1000 ease-linear"
          style={{
            width: `${percent}%`,
            backgroundImage: `linear-gradient(to right, ${barFrom}, ${barTo})`,
          }}
        />
      </div>
      <div className="flex justify-between mt-1.5 text-sm text-gray-500">
        <span>{formatTime(secondsPlayed)}</span>
        <span>−{formatTime(secondsRemaining)}</span>
      </div>
    </div>
  );
}
