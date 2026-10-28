import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import Database from 'better-sqlite3';
import path from 'path';
import { isAdminSession } from '@/lib/auth-helpers';

const dbPath = path.join(process.cwd(), 'votes.db');

/**
 * GET /api/jukebox/offline-banner
 * Get offline banner configuration
 */
export async function GET() {
  try {
    const db = new Database(dbPath, { readonly: true });

    const heading = db.prepare('SELECT value FROM settings WHERE key = ?')
      .get('jukebox_offline_heading') as { value: string } | undefined;
    
    const subtitle = db.prepare('SELECT value FROM settings WHERE key = ?')
      .get('jukebox_offline_subtitle') as { value: string } | undefined;
    
    const showOffSeason = db.prepare('SELECT value FROM settings WHERE key = ?')
      .get('jukebox_show_offseason') as { value: string } | undefined;

    db.close();

    return NextResponse.json({
      heading: heading?.value || 'Show is Currently Inactive',
      subtitle: subtitle?.value || 'Song requests will be available when the show starts',
      showOffSeason: showOffSeason?.value === 'true'
    });

  } catch (error) {
    console.error('[Offline Banner] Error:', error);
    return NextResponse.json({
      heading: 'Show is Currently Inactive',
      subtitle: 'Song requests will be available when the show starts'
    }, { status: 500 });
  }
}

/**
 * POST /api/jukebox/offline-banner
 * Update offline banner configuration (Admin only)
 */
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!isAdminSession(session)) {
      return NextResponse.json({ 
        error: 'Unauthorized' 
      }, { status: 401 });
    }

    const { heading, subtitle, showOffSeason } = await request.json();

    const db = new Database(dbPath);

    // Update or insert heading
    const existingHeading = db.prepare('SELECT value FROM settings WHERE key = ?')
      .get('jukebox_offline_heading');
    
    if (existingHeading) {
      db.prepare('UPDATE settings SET value = ? WHERE key = ?')
        .run(heading, 'jukebox_offline_heading');
    } else {
      db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)')
        .run('jukebox_offline_heading', heading);
    }

    // Update or insert subtitle
    const existingSubtitle = db.prepare('SELECT value FROM settings WHERE key = ?')
      .get('jukebox_offline_subtitle');
    
    if (existingSubtitle) {
      db.prepare('UPDATE settings SET value = ? WHERE key = ?')
        .run(subtitle, 'jukebox_offline_subtitle');
    } else {
      db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)')
        .run('jukebox_offline_subtitle', subtitle);
    }

    // Update or insert show off-season toggle
    const existingToggle = db.prepare('SELECT value FROM settings WHERE key = ?')
      .get('jukebox_show_offseason');
    
    if (existingToggle) {
      db.prepare('UPDATE settings SET value = ? WHERE key = ?')
        .run(showOffSeason ? 'true' : 'false', 'jukebox_show_offseason');
    } else {
      db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)')
        .run('jukebox_show_offseason', showOffSeason ? 'true' : 'false');
    }

    db.close();

    console.log(`[Offline Banner] Updated - Heading: "${heading}", Subtitle: "${subtitle}", Show Off-Season: ${showOffSeason}`);

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('[Offline Banner] Error:', error);
    return NextResponse.json({ 
      error: 'Failed to update offline banner' 
    }, { status: 500 });
  }
}
