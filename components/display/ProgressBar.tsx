interface Props {
  secondsPlayed: number;
  secondsRemaining: number;
  barFrom?: string;
  barTo?: string;
  /** Multiplier for the time labels (the sign's font scale / 100) */
  scale?: number;
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
  scale   = 1,
}: Props) {
  const total   = secondsPlayed + secondsRemaining;
  const percent = total > 0 ? Math.min(100, (secondsPlayed / total) * 100) : 0;

  return (
    <div className="w-full">
      <div className="w-full rounded-full overflow-hidden bg-white/20" style={{ height: '1.7vh' }}>
        <div
          className="h-full rounded-full transition-all duration-1000 ease-linear"
          style={{
            width: `${percent}%`,
            backgroundImage: `linear-gradient(to right, ${barFrom}, ${barTo})`,
          }}
        />
      </div>
      <div
        className="flex justify-between text-white/70"
        style={{ marginTop: '0.8vh', fontSize: `${1.55 * scale}vw` }}
      >
        <span>{formatTime(secondsPlayed)}</span>
        <span>−{formatTime(secondsRemaining)}</span>
      </div>
    </div>
  );
}
