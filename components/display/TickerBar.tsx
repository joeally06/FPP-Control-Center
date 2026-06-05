'use client';

interface Props {
  text: string;
  accent?: string;
}

export default function TickerBar({ text, accent = '#ef4444' }: Props) {
  if (!text.trim()) return null;

  // Repeat content 4× so the loop is seamless regardless of text length
  const content = `${text}\u2003✦\u2003${text}\u2003✦\u2003${text}\u2003✦\u2003${text}\u2003✦\u2003`;

  return (
    <>
      <style>{`
        @keyframes ticker-scroll {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        .ticker-inner {
          animation: ticker-scroll 30s linear infinite;
          white-space: nowrap;
          display: inline-block;
        }
      `}</style>
      <div
        className="overflow-hidden flex-shrink-0 py-1.5"
        style={{ backgroundColor: `${accent}18`, borderTop: `1px solid ${accent}33` }}
      >
        <div className="ticker-inner text-sm font-medium" style={{ color: accent }}>
          {content}{content}
        </div>
      </div>
    </>
  );
}
