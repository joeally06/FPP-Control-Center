'use client';

interface Props {
  text: string | null;
  accent?: string;
}

export default function AnnouncementOverlay({ text, accent = '#ef4444' }: Props) {
  if (!text) return null;

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(6px)' }}
    >
      <div
        className="max-w-3xl w-full mx-10 rounded-3xl p-10 text-center shadow-2xl border-2"
        style={{ backgroundColor: `${accent}15`, borderColor: `${accent}55` }}
      >
        <div style={{ fontSize: '3.5rem', lineHeight: 1, marginBottom: '1.25rem' }}>📢</div>
        <p
          className="font-bold text-white leading-snug"
          style={{
            fontSize: 'clamp(1.75rem, 3.5vw, 3rem)',
            textShadow: '0 2px 12px rgba(0,0,0,0.9)',
          }}
        >
          {text}
        </p>
      </div>
    </div>
  );
}
