import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getSetting, updateSettings } from '@/lib/settings';
import type {
  DisplayConfig, ColorTheme, BackgroundStyle, FontStyle,
  LayoutVariant, QueuePosition, IdleAnimation, ZoneConfig, ZoneTemplate, ZoneWidgetType,
} from '@/types/display';

function readConfig(): DisplayConfig {
  const s = (key: string, fb: string) => getSetting(key) ?? fb;
  const b = (key: string, fb: boolean) => (getSetting(key) ?? String(fb)) === 'true';
  const n = (key: string, fb: number) => parseInt(getSetting(key) ?? String(fb), 10);

  return {
    showName:           s('display_show_name',           'Christmas Light Show'),
    showQr:             b('display_show_qr',             true),
    queueCount:         n('display_queue_count',         4),
    enabled:            b('display_enabled',             true),
    colorTheme:         s('display_color_theme',         'christmas') as ColorTheme,
    accentColor:        s('display_accent_color',        '#ef4444'),
    backgroundStyle:    s('display_background_style',    'gradient') as BackgroundStyle,
    fontStyle:          s('display_font_style',          'modern') as FontStyle,
    fontScale:          n('display_font_scale',          100),
    layoutVariant:      s('display_layout_variant',      'sidebar') as LayoutVariant,
    albumArtSize:       n('display_album_art_size',      34),
    queuePosition:      s('display_queue_position',      'bottom') as QueuePosition,
    idleMessage:        s('display_idle_message',        'The show will begin shortly'),
    logoUrl:            s('display_logo_url',            ''),
    sponsorText:        s('display_sponsor_text',        ''),
    fmFrequency:        s('display_fm_frequency',        ''),
    idleAnimation:      s('display_idle_animation',      'snowflakes') as IdleAnimation,
    showClock:          b('display_show_clock',          true),
    idleBackgroundUrl:  s('display_idle_background_url', ''),
    tickerText:         s('display_ticker_text',         ''),
    slideshowUrl:       s('display_slideshow_url',       ''),
    zoneConfig:         (() => { try { return JSON.parse(s('display_zone_config', '{}')); } catch { return undefined; } })(),
  };
}

/** GET /api/display/config — public (Pi kiosk calls without auth) */
export async function GET() {
  try {
    return NextResponse.json(readConfig());
  } catch (error) {
    console.error('Error reading display config:', error);
    return NextResponse.json({ error: 'Failed to read config' }, { status: 500 });
  }
}

/** PUT /api/display/config — admin only */
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const updates: Record<string, string> = {};

    const str = (key: string, dbKey: string, maxLen = 200) => {
      if (typeof body[key] === 'string') updates[dbKey] = body[key].trim().substring(0, maxLen);
    };
    const bool = (key: string, dbKey: string) => {
      if (typeof body[key] === 'boolean') updates[dbKey] = String(body[key]);
    };
    const clamp = (key: string, dbKey: string, min: number, max: number) => {
      if (typeof body[key] === 'number') updates[dbKey] = String(Math.max(min, Math.min(max, Math.floor(body[key]))));
    };
    const oneOf = (key: string, dbKey: string, allowed: string[]) => {
      if (typeof body[key] === 'string' && allowed.includes(body[key])) updates[dbKey] = body[key];
    };

    if (typeof body.showName === 'string') {
      updates['display_show_name'] = body.showName.trim().substring(0, 100);
    }
    bool('showQr',    'display_show_qr');
    clamp('queueCount', 'display_queue_count', 1, 5);
    bool('enabled',   'display_enabled');
    oneOf('colorTheme',      'display_color_theme',      ['christmas','winter','classic','custom']);
    str('accentColor',       'display_accent_color',     20);
    oneOf('backgroundStyle', 'display_background_style', ['solid','gradient','particles']);
    oneOf('fontStyle', 'display_font_style', ['modern','display','serif']);
    clamp('fontScale', 'display_font_scale', 75, 150);
    oneOf('layoutVariant', 'display_layout_variant', ['sidebar','centered','minimal']);
    clamp('albumArtSize',  'display_album_art_size',  20, 50);
    oneOf('queuePosition', 'display_queue_position',  ['bottom','right','hidden']);
    str('idleMessage',       'display_idle_message',       150);
    str('logoUrl',           'display_logo_url',           500);
    str('sponsorText',       'display_sponsor_text',       150);
    str('fmFrequency',       'display_fm_frequency',       20);
    oneOf('idleAnimation',  'display_idle_animation', ['snowflakes','notes','stars','none']);
    bool('showClock',       'display_show_clock');
    str('idleBackgroundUrl','display_idle_background_url', 500);
    str('tickerText', 'display_ticker_text', 300);
    str('slideshowUrl', 'display_slideshow_url', 500);

    // Zone config — stored as JSON string
    if (body.zoneConfig && typeof body.zoneConfig === 'object') {
      const zc = body.zoneConfig as ZoneConfig;
      const ALLOWED_TEMPLATES: ZoneTemplate[] = ['two-column', 'pip', 'banner-main', 'sidebar-main'];
      const ALLOWED_WIDGETS: ZoneWidgetType[] = ['now-playing', 'queue', 'clock', 'message', 'image', 'slides', 'empty'];
      if (typeof zc.enabled === 'boolean' && ALLOWED_TEMPLATES.includes(zc.template)) {
        // Sanitise each slot
        const cleanSlots: ZoneConfig['slots'] = {};
        if (zc.slots && typeof zc.slots === 'object') {
          for (const [slot, widget] of Object.entries(zc.slots)) {
            if (ALLOWED_WIDGETS.includes(widget.type)) {
              cleanSlots[slot] = {
                type: widget.type,
                text: typeof widget.text === 'string' ? widget.text.substring(0, 300) : undefined,
                imageUrl: typeof widget.imageUrl === 'string' ? widget.imageUrl.substring(0, 500) : undefined,
                slidesUrl: typeof widget.slidesUrl === 'string' ? widget.slidesUrl.substring(0, 500) : undefined,
              };
            }
          }
        }
        updates['display_zone_config'] = JSON.stringify({ enabled: zc.enabled, template: zc.template, slots: cleanSlots });
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields provided' }, { status: 400 });
    }

    updateSettings(updates);
    return NextResponse.json({ success: true, config: readConfig() });
  } catch (error) {
    console.error('Error updating display config:', error);
    return NextResponse.json({ error: 'Failed to update config' }, { status: 500 });
  }
}
