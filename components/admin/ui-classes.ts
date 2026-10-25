// Shared Tailwind class sets for admin page content (colours are the adm-* tokens in app/globals.css).
// Inside .admin-content unclassed text is painted white, so text elements set their colour explicitly.
// A utility appended to one of these sets can't reliably override a utility for the same property already in it
// (the stylesheet's order decides, not the class string), so sets that need resizing have a variant below.

export const card = 'rounded-2xl border border-adm-line bg-adm-surface p-5';
/** A box inside a card: stat tiles, list rows, letter text */
export const insetBox = 'rounded-xl border border-adm-line bg-adm-side p-4';
export const eyebrow = 'text-xs font-semibold uppercase tracking-[0.08em] text-adm-muted';
export const cardTitle = 'text-[15px] font-semibold text-adm-text';

const buttonBase = 'inline-flex items-center justify-center gap-2 rounded-xl transition disabled:cursor-not-allowed disabled:opacity-50';
const medium = 'min-h-11 px-4 text-sm';
const small = 'min-h-9 px-3 text-[13px]';
const neutral = 'border border-adm-control-line bg-adm-control font-medium text-adm-text hover:bg-adm-line';
const accent = 'bg-adm-accent font-semibold text-adm-accent-ink hover:brightness-110';
const danger = 'border border-adm-danger-line font-medium text-adm-danger hover:bg-adm-danger-bg';

export const button = `${buttonBase} ${medium} ${neutral}`;
export const accentButton = `${buttonBase} ${medium} ${accent}`;
export const dangerButton = `${buttonBase} ${medium} ${danger}`;
export const smallButton = `${buttonBase} ${small} ${neutral}`;
export const smallDangerButton = `${buttonBase} ${small} ${danger}`;
export const roundButton = 'grid h-11 w-11 place-items-center rounded-full border border-adm-control-line bg-adm-control text-adm-text transition-colors hover:bg-adm-line disabled:cursor-not-allowed disabled:opacity-50';

const fieldBase = 'min-h-11 rounded-xl border border-adm-control-line bg-adm-field px-3 py-2.5 text-sm text-adm-text placeholder:text-adm-faint focus:outline-2 focus:outline-offset-1 focus:outline-adm-accent disabled:opacity-50';
/** Text inputs, selects and textareas */
export const field = `${fieldBase} w-full`;
/** `field` without the full width, for controls given their own w-* class */
export const sizedField = fieldBase;
export const textLink = 'text-[13px] font-medium text-adm-accent hover:underline';

/** A <label> wrapping a radio or checkbox plus its text; highlighted while checked */
export const choiceCard = 'flex cursor-pointer items-start gap-3 rounded-xl border border-adm-control-line bg-adm-side p-3.5 transition-colors hover:bg-adm-hover has-checked:border-adm-accent has-checked:bg-adm-warn-bg';
export const checkInput = 'mt-0.5 h-4.5 w-4.5 shrink-0 accent-adm-accent';

export const notice = {
  info: 'rounded-xl border border-adm-info-line bg-adm-info-bg p-4 text-sm text-adm-info',
  ok: 'rounded-xl border border-adm-ok-line bg-adm-ok-bg p-4 text-sm text-adm-ok',
  warn: 'rounded-xl border border-adm-warn-line bg-adm-warn-bg p-4 text-sm text-adm-warn',
  danger: 'rounded-xl border border-adm-danger-line bg-adm-danger-bg p-4 text-sm text-adm-danger',
};

export const badge = {
  neutral: 'inline-flex rounded-full bg-adm-line px-2 py-0.5 text-[11px] font-semibold text-adm-soft',
  info: 'inline-flex rounded-full bg-adm-info-bg px-2 py-0.5 text-[11px] font-semibold text-adm-info',
  ok: 'inline-flex rounded-full bg-adm-ok-bg px-2 py-0.5 text-[11px] font-semibold text-adm-ok',
  warn: 'inline-flex rounded-full bg-adm-warn-bg px-2 py-0.5 text-[11px] font-semibold text-adm-warn',
  danger: 'inline-flex rounded-full bg-adm-danger-bg px-2 py-0.5 text-[11px] font-semibold text-adm-danger',
};

/** Underlined tab in a tab row (`border-b border-adm-line` on the row) */
export const tabClass = (active: boolean) =>
  `min-h-11 whitespace-nowrap border-b-2 px-3.5 text-sm font-medium transition-colors ${
    active ? 'border-adm-accent text-adm-text' : 'border-transparent text-adm-muted hover:text-adm-text'
  }`;
