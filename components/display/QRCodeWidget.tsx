'use client';

import QRCode from 'react-qr-code';

interface Props {
  url: string;
  label?: string;
  size?: number;
}

export default function QRCodeWidget({
  url,
  label = 'Scan to Request a Song!',
  size = 120,
}: Props) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="p-2.5 bg-white rounded-xl shadow-2xl"
        style={{ lineHeight: 0 }}
      >
        <QRCode value={url} size={size} />
      </div>
      <p className="text-xs text-white/50 text-center leading-snug max-w-[160px]">
        {label}
      </p>
    </div>
  );
}
