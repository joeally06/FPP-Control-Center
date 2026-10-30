'use client';

import ImageUpload from '@/components/admin/display/ImageUpload';
import { inputClass, labelClass, sectionClass, sectionTitle, checkClass } from './styles';
import type { TabProps } from './tab-props';

/** The words, logo and request code shown on the sign, on both screens. */
export default function ShowInfoTab({ config, set }: TabProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className={sectionClass}>
        <div>
          <h3 className={sectionTitle}>Your show</h3>
          <p className="mt-0.5 text-[13px] text-adm-muted">Shown on both screens.</p>
        </div>
        <div className="flex items-center gap-3">
          <input type="checkbox" id="ds-enabled" checked={config.enabled} onChange={(e) => set('enabled', e.target.checked)} className={checkClass} />
          <label htmlFor="ds-enabled" className="text-sm text-adm-text">The digital sign is on</label>
        </div>
        <div>
          <label htmlFor="ds-name" className={labelClass}>Show name <span className="font-normal text-adm-faint">(optional)</span></label>
          <input
            id="ds-name"
            type="text"
            value={config.showName}
            onChange={(e) => set('showName', e.target.value)}
            maxLength={100}
            className={inputClass}
            placeholder="Leave blank to hide"
          />
        </div>
        <ImageUpload
          label="Logo image (optional)"
          currentUrl={config.logoUrl}
          slot="logo"
          onUploaded={(url) => set('logoUrl', url)}
          onClear={() => set('logoUrl', '')}
        />
        <div>
          <label htmlFor="ds-fm" className={labelClass}>FM radio frequency <span className="font-normal text-adm-faint">(optional)</span></label>
          <input
            id="ds-fm"
            type="text"
            value={config.fmFrequency}
            onChange={(e) => set('fmFrequency', e.target.value)}
            maxLength={20}
            className={inputClass}
            placeholder="e.g. 88.1"
          />
          <p className="mt-1 text-xs text-adm-muted">Adds a &quot;Tune your radio&quot; bar while songs play and a radio panel between songs.</p>
        </div>
      </div>

      <div className={sectionClass}>
        <div>
          <h3 className={sectionTitle}>Request code and up next</h3>
          <p className="mt-0.5 text-[13px] text-adm-muted">Lets visitors scan a code to pick the next song.</p>
        </div>
        <div className="flex items-center gap-3">
          <input type="checkbox" id="ds-showQr" checked={config.showQr} onChange={(e) => set('showQr', e.target.checked)} className={checkClass} />
          <label htmlFor="ds-showQr" className="text-sm text-adm-text">Show the QR code</label>
        </div>
        <div>
          <label htmlFor="ds-queue" className={labelClass}>Songs shown under &quot;Up next&quot; (1–5)</label>
          <input
            id="ds-queue"
            type="number"
            min={1}
            max={5}
            value={config.queueCount}
            onChange={(e) => set('queueCount', Number(e.target.value))}
            className={`${inputClass} sm:max-w-32`}
          />
        </div>
      </div>

      <div className={sectionClass}>
        <div>
          <h3 className={sectionTitle}>Messages</h3>
          <p className="mt-0.5 text-[13px] text-adm-muted">Shown along the bottom of both screens.</p>
        </div>
        <div>
          <label htmlFor="ds-ticker" className={labelClass}>Scrolling message <span className="font-normal text-adm-faint">(optional)</span></label>
          <input
            id="ds-ticker"
            type="text"
            value={config.tickerText}
            onChange={(e) => set('tickerText', e.target.value)}
            maxLength={300}
            className={inputClass}
            placeholder="Scrolls across the bottom of the sign"
          />
        </div>
        <div>
          <label htmlFor="ds-sponsor" className={labelClass}>Sponsor line <span className="font-normal text-adm-faint">(optional)</span></label>
          <input
            id="ds-sponsor"
            type="text"
            value={config.sponsorText}
            onChange={(e) => set('sponsorText', e.target.value)}
            maxLength={150}
            className={inputClass}
            placeholder="Brought to you by…"
          />
        </div>
      </div>
    </div>
  );
}
