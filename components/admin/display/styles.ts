import { insetBox, field } from '@/components/admin/ui-classes';

// Class names shared by the Digital Sign settings and the sections split out of it
export const inputClass = field;
export const selectClass = field;
export const labelClass = 'admin-label';
export const sectionClass = `${insetBox} space-y-4`;
export const sectionTitle = 'text-[15px] font-semibold text-adm-text';
export const checkClass = 'h-4.5 w-4.5 shrink-0 accent-adm-accent';
// A box nested inside a section
export const subBox = 'rounded-xl border border-adm-line bg-adm-surface p-4 space-y-3';
export const hint = 'rounded-lg border border-adm-line bg-adm-surface px-3 py-2 text-xs text-adm-muted';
