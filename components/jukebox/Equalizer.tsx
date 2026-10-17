/** Four bouncing bars in the current text colour, shown while a song plays. Still under reduced motion (see .sp-eq). */
export default function Equalizer() {
  return (
    <span className="sp-eq" aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}
