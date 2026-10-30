'use client';

import type { BackgroundStyle, ColorTheme, FontStyle } from '@/types/display';
import { button } from '@/components/admin/ui-classes';
import { DISPLAY_PRESETS, type DisplayPresetValues } from '@/lib/display-presets';
import { inputClass, selectClass, labelClass, sectionClass, sectionTitle } from './styles';
import type { TabProps } from './tab-props';

const ACTIVE_LOOK = 'inline-flex min-h-11 items-center justify-center rounded-xl border border-adm-accent bg-adm-warn-bg px-4 text-sm font-semibold text-adm-text transition';

/** Colors, fonts and background, used on both screens. */
export default function LookTab({ config, set, onPreset }: TabProps & { onPreset: (values: DisplayPresetValues) => void }) {
  return (
    <div className="flex flex-col gap-4">
      <div className={sectionClass}>
        <div>
          <h3 className={sectionTitle}>Quick looks</h3>
          <p className="mt-0.5 text-[13px] text-adm-muted">
            One click fills in the colors, animation and wording. You can still change anything before saving.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {DISPLAY_PRESETS.map((preset) => {
            const active = (Object.keys(preset.values) as (keyof DisplayPresetValues)[]).every((key) => config[key] === preset.values[key]);
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onPreset(preset.values)}
                aria-pressed={active}
                className={active ? ACTIVE_LOOK : button}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className={sectionClass}>
        <div>
          <h3 className={sectionTitle}>Colors and text</h3>
          <p className="mt-0.5 text-[13px] text-adm-muted">Used on both screens.</p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="ds-theme" className={labelClass}>Color theme</label>
            <select id="ds-theme" value={config.colorTheme} onChange={(e) => set('colorTheme', e.target.value as ColorTheme)} className={selectClass}>
              <option value="christmas">Christmas</option>
              <option value="winter">Winter</option>
              <option value="classic">Classic</option>
              <option value="custom">Custom (uses the accent color below)</option>
            </select>
          </div>
          <div>
            <label htmlFor="ds-background" className={labelClass}>Background</label>
            <select id="ds-background" value={config.backgroundStyle} onChange={(e) => set('backgroundStyle', e.target.value as BackgroundStyle)} className={selectClass}>
              <option value="gradient">Gradient</option>
              <option value="solid">Solid color</option>
              <option value="particles">Floating dots</option>
            </select>
          </div>
          <div>
            <label htmlFor="ds-font" className={labelClass}>Font</label>
            <select id="ds-font" value={config.fontStyle} onChange={(e) => set('fontStyle', e.target.value as FontStyle)} className={selectClass}>
              <option value="modern">Modern</option>
              <option value="display">Bold (Oswald)</option>
              <option value="serif">Serif (Playfair Display)</option>
            </select>
          </div>
          <div>
            <label htmlFor="ds-scale" className={labelClass}>Text size: {config.fontScale}%</label>
            <input
              id="ds-scale"
              type="range"
              min={75}
              max={150}
              step={5}
              value={config.fontScale}
              onChange={(e) => set('fontScale', Number(e.target.value))}
              className="min-h-11 w-full accent-adm-accent"
            />
          </div>
        </div>
        <div>
          <label htmlFor="ds-accent" className={labelClass}>Accent color <span className="font-normal text-adm-faint">(used with the Custom theme)</span></label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              aria-label="Pick the accent color"
              value={config.accentColor}
              onChange={(e) => set('accentColor', e.target.value)}
              className="h-11 w-14 cursor-pointer rounded-lg border border-adm-control-line bg-transparent"
            />
            <input
              id="ds-accent"
              type="text"
              value={config.accentColor}
              onChange={(e) => set('accentColor', e.target.value)}
              maxLength={20}
              className={`${inputClass} flex-1`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
