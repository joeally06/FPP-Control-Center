import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { isAdminSession } from '@/lib/auth-helpers';
import { getDb } from '@/lib/database';

/**
 * GET /api/location-restrictions
 * Get current location restriction settings
 * PUBLIC (needed for client-side warning messages)
 */
export async function GET() {
  try {
    const db = getDb();
    
    const settings = db.prepare(`
      SELECT 
        is_active as enabled,
        max_distance_miles,
        show_latitude,
        show_longitude,
        show_location_name as location_name
      FROM location_restrictions
      WHERE id = 1
    `).get() as any;
    
    
    // Ensure enabled is a boolean (SQLite returns 0/1)
    const result = settings ? {
      enabled: Boolean(settings.enabled),
      max_distance_miles: settings.max_distance_miles,
      show_latitude: settings.show_latitude,
      show_longitude: settings.show_longitude,
      location_name: settings.location_name
    } : {
      enabled: false,
      max_distance_miles: 1,
      show_latitude: null,
      show_longitude: null,
      location_name: null
    };
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('[Location API] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/location-restrictions
 * Update location restriction settings
 * ADMIN ONLY
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session || !isAdminSession(session)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { enabled, max_distance_miles, show_latitude, show_longitude, location_name } = body;

    const db = getDb();
    
    db.prepare(`
      UPDATE location_restrictions
      SET is_active = ?,
          max_distance_miles = ?,
          show_latitude = ?,
          show_longitude = ?,
          show_location_name = ?,
          last_updated = CURRENT_TIMESTAMP,
          updated_by_admin = ?
      WHERE id = 1
    `).run(
      enabled ? 1 : 0,
      max_distance_miles,
      show_latitude,
      show_longitude,
      location_name,
      session.user.email
    );
    
    
    console.log(`[Location] Settings updated by ${session.user.email}`);
    
    return NextResponse.json({ 
      success: true,
      message: 'Location restrictions updated'
    });
  } catch (error) {
    console.error('[Location API] PUT error:', error);
    return NextResponse.json(
      { error: 'Failed to update settings' },
      { status: 500 }
    );
  }
}
