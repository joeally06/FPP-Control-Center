import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { 
  runFullMaintenance, 
  runQuickMaintenance, 
  archiveOldData,
  getDatabaseStats,
  checkIntegrity 
} from '@/lib/db-maintenance';
import { isAdminSession } from '@/lib/auth-helpers';

/**
 * Database Maintenance API
 * Admin-only endpoint for database optimization
 */
export async function POST(request: NextRequest) {
  try {
    // Verify admin authentication
    const session = await getServerSession(authOptions);
    if (!isAdminSession(session)) {
      return NextResponse.json(
        { error: 'Unauthorized - Admin access required' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { action, options } = body;

    let result;

    switch (action) {
      case 'full':
        result = runFullMaintenance();
        break;

      case 'quick':
        result = runQuickMaintenance();
        break;

      case 'archive':
        const daysToKeep = options?.daysToKeep || 365;
        result = archiveOldData(daysToKeep);
        break;

      case 'stats':
        result = getDatabaseStats();
        break;

      case 'integrity':
        result = checkIntegrity();
        break;

      default:
        return NextResponse.json(
          { error: 'Invalid action. Use: full, quick, archive, stats, or integrity' },
          { status: 400 }
        );
    }

    return NextResponse.json({
      success: true,
      action,
      result,
    });

  } catch (error) {
    console.error('Database maintenance error:', error);
    return NextResponse.json(
      { 
        error: 'Database maintenance failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * GET database statistics (admin only)
 */
export async function GET() {
  try {
    // Verify admin authentication
    const session = await getServerSession(authOptions);
    if (!isAdminSession(session)) {
      return NextResponse.json(
        { error: 'Unauthorized - Admin access required' },
        { status: 403 }
      );
    }

    const stats = getDatabaseStats();
    
    return NextResponse.json({
      success: true,
      stats,
    });

  } catch (error) {
    console.error('Failed to get database stats:', error);
    return NextResponse.json(
      { 
        error: 'Failed to get database statistics',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
