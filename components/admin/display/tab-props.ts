import type { DisplayConfig } from '@/types/display';

/** Change one setting in the form (nothing is saved until the admin presses Save) */
export type SetDisplayConfig = <K extends keyof DisplayConfig>(key: K, value: DisplayConfig[K]) => void;

export interface TabProps {
  config: DisplayConfig;
  set: SetDisplayConfig;
}
