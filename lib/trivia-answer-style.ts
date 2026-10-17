// Shared Kahoot-style color/shape coding so the TV and every phone render
// the same answer identically - visitors glance at the TV, then tap the
// matching shape on their phone.
export const ANSWER_STYLES = [
  { bg: '#e11d48', symbol: '▲' }, // red triangle
  { bg: '#2563eb', symbol: '◆' }, // blue diamond
  { bg: '#ca8a04', symbol: '●' }, // yellow circle
  { bg: '#16a34a', symbol: '■' }, // green square
  { bg: '#9333ea', symbol: '★' }, // purple star
  { bg: '#0d9488', symbol: '⬡' }, // teal hexagon
] as const;
