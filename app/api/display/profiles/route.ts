import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getDb } from '@/lib/database';
import { getSetting, updateSettings } from '@/lib/settings';
import type { DisplayConfig } from '@/types/display';

function db() { return getDb(); }

async function adminOnly() {
  const s = await getServerSession(authOptions);
  return s?.user?.role === 'admin';
}

function readCurrentConfig(): DisplayConfig {
  const s = (k: string, fb: string) => getSetting(k) ?? fb;
  const b = (k: string, fb: boolean) => (getSetting(k) ?? String(fb)) === 'true';
  const n = (k: string, fb: number) => parseInt(getSetting(k) ?? String(fb), 10);
  return {
    showName: s('display_show_name','Christmas Light Show'),
    showQr: b('display_show_qr', true),
    queueCount: n('display_queue_count', 4),
    enabled: b('display_enabled', true),
    colorTheme: s('display_color_theme','christmas') as never,
    accentColor: s('display_accent_color','#ef4444'),
    backgroundStyle: s('display_background_style','gradient') as never,
    fontStyle: s('display_font_style','modern') as never,
    fontScale: n('display_font_scale', 100),
    layoutVariant: s('display_layout_variant','sidebar') as never,
    albumArtSize: n('display_album_art_size', 34),
    queuePosition: s('display_queue_position','bottom') as never,
    idleMessage: s('display_idle_message','The show will begin shortly'),
    logoUrl: s('display_logo_url',''),
    sponsorText: s('display_sponsor_text',''),
    fmFrequency: s('display_fm_frequency',''),
    idleAnimation: s('display_idle_animation','snowflakes') as never,
    showClock: b('display_show_clock', true),
    idleBackgroundUrl: s('display_idle_background_url',''),
    tickerText: s('display_ticker_text',''),
    slideshowUrl: s('display_slideshow_url',''),
    idleSlideshowImages: JSON.parse(s('display_slideshow_images','[]')),
    idleSlideshowInterval: n('display_slideshow_interval', 8),
    countdownEnabled: b('display_countdown_enabled', false),
    countdownTime: s('display_countdown_time','20:00'),
    countdownLabel: s('display_countdown_label','Next show starts in'),
    zoneConfig: (() => { try { return JSON.parse(s('display_zone_config','{}')); } catch { return undefined; } })(),
  };
}

function applyConfig(config: DisplayConfig) {
  const updates: Record<string, string> = {
    display_show_name:           String(config.showName ?? '').substring(0,100),
    display_show_qr:             String(!!config.showQr),
    display_queue_count:         String(Math.max(1, Math.min(5, config.queueCount ?? 4))),
    display_enabled:             String(!!config.enabled),
    display_color_theme:         config.colorTheme ?? 'christmas',
    display_accent_color:        String(config.accentColor ?? '#ef4444').substring(0,20),
    display_background_style:    config.backgroundStyle ?? 'gradient',
    display_font_style:          config.fontStyle ?? 'modern',
    display_font_scale:          String(Math.max(75, Math.min(150, config.fontScale ?? 100))),
    display_layout_variant:      config.layoutVariant ?? 'sidebar',
    display_album_art_size:      String(Math.max(20, Math.min(50, config.albumArtSize ?? 34))),
    display_queue_position:      config.queuePosition ?? 'bottom',
    display_idle_message:        String(config.idleMessage ?? '').substring(0,150),
    display_logo_url:            String(config.logoUrl ?? '').substring(0,500),
    display_sponsor_text:        String(config.sponsorText ?? '').substring(0,150),
    display_fm_frequency:        String(config.fmFrequency ?? '').substring(0,20),
    display_idle_animation:      config.idleAnimation ?? 'snowflakes',
    display_show_clock:          String(!!config.showClock),
    display_idle_background_url: String(config.idleBackgroundUrl ?? '').substring(0,500),
    display_ticker_text:         String(config.tickerText ?? '').substring(0,300),
    display_slideshow_url:       String(config.slideshowUrl ?? '').substring(0,500),
    display_countdown_enabled:   String(!!config.countdownEnabled),
    display_countdown_time:      String(config.countdownTime ?? '20:00').substring(0,5),
    display_countdown_label:     String(config.countdownLabel ?? '').substring(0,100),
  };
  if (Array.isArray(config.idleSlideshowImages)) {
    updates['display_slideshow_images'] = JSON.stringify(config.idleSlideshowImages);
  }
  if (config.zoneConfig) {
    updates['display_zone_config'] = JSON.stringify(config.zoneConfig);
  }
  updateSettings(updates);
}

/** GET /api/display/profiles — admin: list all profiles */
export async function GET() {
  if (!(await adminOnly())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rows = db().prepare(`SELECT * FROM display_profiles ORDER BY created_at ASC`).all();
  return NextResponse.json({ profiles: rows });
}

/** POST /api/display/profiles — admin: create profile from current settings */
export async function POST(req: NextRequest) {
  if (!(await adminOnly())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const name = typeof body.name === 'string' ? body.name.trim().substring(0,100) : '';
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

  const config = readCurrentConfig();
  const result = db().prepare(
    `INSERT INTO display_profiles (name, is_active, config_json) VALUES (?, 0, ?)`
  ).run(name, JSON.stringify(config));

  const profile = db().prepare(`SELECT * FROM display_profiles WHERE id = ?`).get(result.lastInsertRowid);
  return NextResponse.json({ profile }, { status: 201 });
}

/** PUT /api/display/profiles — admin: activate a profile (applies its config) */
export async function PUT(req: NextRequest) {
  if (!(await adminOnly())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const { id, action, name } = body;

  if (typeof id !== 'number') return NextResponse.json({ error: 'id required' }, { status: 400 });

  if (action === 'rename' && typeof name === 'string') {
    db().prepare(`UPDATE display_profiles SET name = ? WHERE id = ?`).run(name.trim().substring(0,100), id);
    return NextResponse.json({ success: true });
  }

  if (action === 'update') {
    // Overwrite saved config with current live settings
    const config = readCurrentConfig();
    db().prepare(`UPDATE display_profiles SET config_json = ? WHERE id = ?`).run(JSON.stringify(config), id);
    return NextResponse.json({ success: true });
  }

  // Default action: activate (apply config)
  const row = db().prepare(`SELECT * FROM display_profiles WHERE id = ?`).get(id) as any;
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const config: DisplayConfig = JSON.parse(row.config_json);
  applyConfig(config);

  // Mark active
  db().prepare(`UPDATE display_profiles SET is_active = 0`).run();
  db().prepare(`UPDATE display_profiles SET is_active = 1 WHERE id = ?`).run(id);

  return NextResponse.json({ success: true, config });
}

/** DELETE /api/display/profiles?id=N — admin: delete a profile */
export async function DELETE(req: NextRequest) {
  if (!(await adminOnly())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = Number(new URL(req.url).searchParams.get('id'));
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  db().prepare(`DELETE FROM display_profiles WHERE id = ?`).run(id);
  return NextResponse.json({ success: true });
}
