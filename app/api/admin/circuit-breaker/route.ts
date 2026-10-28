/**
 * Circuit Breaker Admin API
 * 
 * ADMIN-ONLY endpoint to monitor and control FPP circuit breaker.
 * 
 * SECURITY:
 * - Requires admin authentication
 * - GET: Read-only statistics
 * - POST: Manual reset (admin override)
 * - Input validation on all operations
 * 
 * GET /api/admin/circuit-breaker
 * - Returns current circuit state, statistics, and history
 * 
 * POST /api/admin/circuit-breaker/reset
 * - Manually reset circuit to CLOSED state
 * - Use when FPP is back online but circuit hasn't recovered
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getCircuitBreaker, CircuitState } from '@/lib/circuit-breaker';
import db from '@/lib/database';
import { isAdminSession } from '@/lib/auth-helpers';

export const dynamic = 'force-dynamic';

/**
 * GET - Get circuit breaker status and statistics
 * SECURITY: Admin-only access
 */
export async function GET(request: NextRequest) {
  try {
    // SECURITY: Verify admin authentication
    const session = await getServerSession(authOptions);
    if (!session || !isAdminSession(session)) {
      return NextResponse.json(
        { error: 'Unauthorized - Admin access required' },
        { status: 401 }
      );
    }

    const circuitBreaker = getCircuitBreaker();
    const stats = circuitBreaker.getStats();

    // Get recent poll history from database
    const recentPolls = db.prepare(`
      SELECT 
        success,
        response_time_ms,
        error_message,
        status,
        consecutive_failures,
        poll_timestamp
      FROM fpp_poll_log
      ORDER BY poll_timestamp DESC
      LIMIT 20
    `).all();

    // Get circuit breaker state history
    const stateHistory = db.prepare(`
      SELECT 
        state,
        failure_count,
        success_count,
        total_transitions,
        updated_at
      FROM fpp_circuit_breaker
      WHERE id = 1
    `).get() as any;

    // Calculate uptime percentage
    const totalPolls = db.prepare(`
      SELECT COUNT(*) as total FROM fpp_poll_log
    `).get() as any;

    const successfulPolls = db.prepare(`
      SELECT COUNT(*) as successful FROM fpp_poll_log WHERE success = 1
    `).get() as any;

    const uptimePercentage = totalPolls.total > 0
      ? ((successfulPolls.successful / totalPolls.total) * 100).toFixed(2)
      : '0';

    // Format response
    const response = {
      circuit: {
        state: stats.state,
        stateLabel: getStateLabel(stats.state),
        isFPPOnline: circuitBreaker.isFPPOnline(),
        isFPPOffline: circuitBreaker.isFPPOffline(),
        isTestingRecovery: circuitBreaker.isTestingRecovery(),
      },
      statistics: {
        currentFailureCount: stats.failureCount,
        currentSuccessCount: stats.successCount,
        totalTransitions: stats.totalTransitions,
        timeSinceLastFailure: formatDuration(stats.timeSinceLastFailure),
        timeSinceStateChange: formatDuration(stats.timeSinceStateChange),
        uptime: formatDuration(stats.uptime),
        nextRetryIn: stats.nextRetryIn ? formatDuration(stats.nextRetryIn) : null,
        nextRetrySeconds: stats.nextRetryIn ? Math.ceil(stats.nextRetryIn / 1000) : null,
      },
      health: {
        totalPolls: totalPolls.total,
        successfulPolls: successfulPolls.successful,
        failedPolls: totalPolls.total - successfulPolls.successful,
        uptimePercentage: parseFloat(uptimePercentage),
      },
      recentPolls: recentPolls.map((poll: any) => ({
        success: Boolean(poll.success),
        responseTime: poll.response_time_ms,
        error: poll.error_message,
        status: poll.status,
        consecutiveFailures: poll.consecutive_failures,
        timestamp: poll.poll_timestamp,
      })),
      recommendations: getRecommendations(stats, circuitBreaker),
    };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'no-store, must-revalidate',
      },
    });
  } catch (error: any) {
    console.error('[API] /api/admin/circuit-breaker error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch circuit breaker status', message: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST - Reset circuit breaker (admin override)
 * SECURITY: Admin-only, manual recovery action
 */
export async function POST(request: NextRequest) {
  try {
    // SECURITY: Verify admin authentication
    const session = await getServerSession(authOptions);
    if (!session || !isAdminSession(session)) {
      return NextResponse.json(
        { error: 'Unauthorized - Admin access required' },
        { status: 401 }
      );
    }

    // SECURITY: Validate request body
    const body = await request.json().catch(() => ({}));
    const action = body.action;

    if (action !== 'reset') {
      return NextResponse.json(
        { error: 'Invalid action. Use action: "reset"' },
        { status: 400 }
      );
    }

    const circuitBreaker = getCircuitBreaker();
    const previousState = circuitBreaker.getState();

    // Perform manual reset
    circuitBreaker.reset();

    console.log(`[API] Admin ${session.user.email} manually reset circuit breaker from ${previousState} to CLOSED`);

    return NextResponse.json({
      success: true,
      message: 'Circuit breaker manually reset to CLOSED',
      previousState,
      newState: circuitBreaker.getState(),
      resetBy: session.user.email,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[API] /api/admin/circuit-breaker POST error:', error);
    return NextResponse.json(
      { error: 'Failed to reset circuit breaker', message: error.message },
      { status: 500 }
    );
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function getStateLabel(state: CircuitState): string {
  switch (state) {
    case CircuitState.CLOSED:
      return 'Online - Normal Operation';
    case CircuitState.OPEN:
      return 'Offline - Paused Polling';
    case CircuitState.HALF_OPEN:
      return 'Testing Recovery';
    default:
      return 'Unknown';
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

function getRecommendations(stats: any, circuitBreaker: any): string[] {
  const recommendations: string[] = [];

  if (circuitBreaker.isFPPOffline()) {
    recommendations.push('🔴 FPP appears to be offline. Check device power and network connection.');
    recommendations.push('⚙️ You can manually reset the circuit breaker once FPP is back online.');
    if (stats.nextRetryIn) {
      recommendations.push(`⏱️ Automatic recovery will be attempted in ${formatDuration(stats.nextRetryIn)}.`);
    }
  }

  if (circuitBreaker.isTestingRecovery()) {
    recommendations.push('🔄 Testing FPP recovery. Please wait for confirmation.');
  }

  if (circuitBreaker.isFPPOnline()) {
    recommendations.push('✅ FPP is online and operating normally.');
  }

  if (stats.failureCount > 0 && stats.failureCount < 3) {
    recommendations.push(`⚠️ ${stats.failureCount} recent failure(s) detected. Monitor closely.`);
  }

  return recommendations;
}
