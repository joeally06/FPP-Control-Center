'use client';

export type LocationStatus = 'granted' | 'denied' | 'checking' | 'unknown' | 'out-of-range';

interface LocationStatusBadgeProps {
  status: LocationStatus;
  distanceFromShow?: number | null;
  maxDistance?: number | null;
  onRequestPermission?: () => void;
  compact?: boolean;
}

/**
 * A small badge/indicator showing the user's location permission status.
 * Can be placed in the header to give users persistent visibility.
 */
export default function LocationStatusBadge({
  status,
  distanceFromShow,
  maxDistance,
  onRequestPermission,
  compact = false
}: LocationStatusBadgeProps) {
  const getStatusConfig = () => {
    switch (status) {
      case 'granted':
        if (distanceFromShow !== null && maxDistance !== null && distanceFromShow! > maxDistance!) {
          return {
            icon: '📍',
            label: compact ? 'Too Far' : `${distanceFromShow!.toFixed(1)} mi away`,
            color: 'bg-yellow-500/20 border-yellow-500/40 text-yellow-200',
            pulse: false
          };
        }
        return {
          icon: '✅',
          label: compact ? 'Location OK' : `${distanceFromShow?.toFixed(1) || '?'} mi`,
          color: 'bg-green-500/20 border-green-500/40 text-green-200',
          pulse: false
        };
      case 'denied':
        return {
          icon: '🚫',
          label: compact ? 'Blocked' : 'Location Blocked',
          color: 'bg-red-500/20 border-red-500/40 text-red-200',
          pulse: false
        };
      case 'checking':
        return {
          icon: '📍',
          label: compact ? 'Checking...' : 'Getting location...',
          color: 'bg-blue-500/20 border-blue-500/40 text-blue-200',
          pulse: true
        };
      case 'out-of-range':
        return {
          icon: '📍',
          label: compact ? 'Too Far' : 'Out of range',
          color: 'bg-yellow-500/20 border-yellow-500/40 text-yellow-200',
          pulse: false
        };
      default:
        return {
          icon: '📍',
          label: compact ? 'Enable' : 'Enable Location',
          color: 'bg-white/10 border-white/20 text-white/70',
          pulse: false
        };
    }
  };

  const config = getStatusConfig();
  const isClickable = (status === 'unknown' || status === 'denied') && onRequestPermission;

  return (
    <button
      onClick={isClickable ? onRequestPermission : undefined}
      disabled={!isClickable}
      className={`
        inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium
        transition-all duration-200
        ${config.color}
        ${config.pulse ? 'animate-pulse' : ''}
        ${isClickable ? 'cursor-pointer hover:opacity-80 active:scale-95' : 'cursor-default'}
      `}
      title={status === 'denied' ? 'Click to enable location access' : undefined}
    >
      <span className={config.pulse ? 'animate-bounce' : ''}>{config.icon}</span>
      <span>{config.label}</span>
    </button>
  );
}
