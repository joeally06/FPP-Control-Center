// Recharts colours matching the admin palette (the adm-* tokens in app/globals.css).
// Recharts takes plain colour values, so the hex codes are repeated here.

export const chartColors = {
  accent: '#f5b544',
  info: '#8fb8ff',
  ok: '#86e3a9',
  warn: '#f7c766',
  danger: '#ff9a8c',
  grid: '#232833',
  axis: '#a0a8b6',
};

export const axisTick = { fill: chartColors.axis, fontSize: 12 };
export const legendStyle = { color: '#c9cfda', fontSize: 13 };
export const tooltipStyle = {
  backgroundColor: '#161920',
  border: '1px solid #232833',
  borderRadius: '12px',
  color: '#eceef2',
};
