import { NextResponse } from 'next/server';
import { getCircuitBreaker } from '@/lib/circuit-breaker';
import { getDb } from '@/lib/database';

const FPP_URL = process.env.FPP_URL || 'http://fpp.local';
const HEALTH_CHECK_TIMEOUT = 5000; // 5 seconds

/**
 * GET /api/fpp/health
 * Check FPP device health
 * PUBLIC ENDPOINT - Used by FPPConnectionContext for all users
 * Uses circuit breaker to avoid timeout when FPP is offline
 */
export async function GET() {
  try {
    
    const circuitBreaker = getCircuitBreaker();
    const circuitState = circuitBreaker.getState();
    
    // If circuit is OPEN, return cached state immediately (no timeout)
    if (circuitState === 'OPEN') {
      const db = getDb();
      
      try {
        const cachedState = db.prepare(`
          SELECT status, mode, last_updated, last_error
          FROM fpp_state
          ORDER BY last_updated DESC
          LIMIT 1
        `).get() as any;
        
        
        if (cachedState) {
          return NextResponse.json({
            online: false,
            status: cachedState.status || 'offline',
            mode: cachedState.mode || 'unknown',
            lastError: cachedState.last_error,
            lastUpdate: cachedState.last_updated,
            circuitState: 'OPEN',
            cached: true,
            timestamp: Date.now()
          }, { status: 503 });
        }
      } catch (dbError: any) {
        console.error('[FPP Health Check] Database error:', dbError.message);
      }
      
      // Fallback if no cached state
      return NextResponse.json({
        online: false,
        error: 'FPP offline (circuit breaker OPEN)',
        circuitState: 'OPEN',
        timestamp: Date.now()
      }, { status: 503 });
    }
    
    // Circuit is CLOSED or HALF_OPEN - make real request
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT);

    const response = await fetch(`${FPP_URL}/api/system/status`, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' }
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      return NextResponse.json({
        online: true,
        status: data.status || 'unknown',
        mode: data.mode_name || 'unknown',
        circuitState,
        timestamp: Date.now()
      });
    }

    return NextResponse.json({
      online: false,
      error: `HTTP ${response.status}`,
      circuitState,
      timestamp: Date.now()
    }, { status: 503 });

  } catch (error: any) {
    console.error('[FPP Health Check] Error:', error.message);
    
    return NextResponse.json({
      online: false,
      error: error.name === 'AbortError' ? 'Timeout' : error.message,
      timestamp: Date.now()
    }, { status: 503 });
  }
}
