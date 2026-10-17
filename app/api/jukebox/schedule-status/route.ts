/**
 * Jukebox Schedule Status API
 * 
 * PUBLIC endpoint - Returns whether the light show is currently active
 * Determines if jukebox features should be enabled based on FPP schedule
 * 
 * SECURITY:
 * - No authentication required (public status info)
 * - Read-only operation (no user input)
 * - Uses cached FPP state (no direct FPP polling)
 * - Timeout protection on optional schedule fetch (3 seconds)
 */

import { NextResponse } from 'next/server';
import { DateTime } from 'luxon';
import { getFPPState } from '@/lib/database';
import { DAY_NAMES, dayIndex, findShowWindow, formatCountdown } from '@/lib/show-schedule';
import { APP_TIMEZONE } from '@/lib/time-utils';

export async function GET() {
  try {
    // Get cached FPP state (already being polled by fpp-poller.ts)
    const state = getFPPState.get() as any;

    if (!state) {
      return NextResponse.json({
        isActive: false,
        currentPlaylist: null,
        status: 'unknown',
        message: 'Unable to determine show status - polling service may not be running',
        nextShowTime: null,
        nextShowDate: null,
        nextShowDay: null,
        nextShowStartTime: null,
        nextShowEndTime: null,
        currentShowEndTime: null,
        countdown: null,
        lastChecked: null
      });
    }

    // Try to get schedule and determine if show is active
    let nextShowTime = null;
    let nextShowDate = null;
    let nextShowDay = null;
    let nextShowStartTime = null;
    let nextShowEndTime = null;
    let countdown = null;
    let isActiveBySchedule = false;
    let currentShowEndTime = null; // end of the scheduled show that is on right now
    
    try {
      const fppUrl = process.env.FPP_URL || process.env.NEXT_PUBLIC_FPP_URL;
      
      if (fppUrl) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout
        
        const scheduleResponse = await fetch(`${fppUrl}/api/schedule`, {
          signal: controller.signal,
          headers: { 'Accept': 'application/json' }
        });
        
        clearTimeout(timeoutId);
        
        if (scheduleResponse.ok) {
          const scheduleData = await scheduleResponse.json();

          // FPP schedule times are show-local, so compare them with the show's clock, not the server's
          const now = DateTime.now().setZone(APP_TIMEZONE);
          const window = findShowWindow(scheduleData.value || scheduleData, now);
          isActiveBySchedule = window.isActiveBySchedule;
          currentShowEndTime = window.currentShowEndTime;

          if (window.nextShow) {
            const { start, entry } = window.nextShow;
            nextShowTime = start.toUTC().toISO();
            nextShowDate = start.toISODate();
            nextShowDay = DAY_NAMES[dayIndex(start)];
            nextShowStartTime = entry.startTime ?? null;
            nextShowEndTime = entry.endTime ?? null;
            countdown = formatCountdown(start, now);
          }
        }
      }
    } catch (error) {
      // Silently fail - next show time is optional enhancement
      console.debug('[Schedule Status] Could not fetch next show time:', error);
    }

    // Determine if show is active
    // Active if: 
    // 1. Within scheduled show time (isActiveBySchedule), OR
    // 2. FPP is playing (status === 'playing'), OR  
    // 3. FPP has a current playlist loaded (fallback for manual playlists)
    const isActive = Boolean(
      isActiveBySchedule || 
      state.status === 'playing' ||
      (state.current_playlist && state.current_playlist.trim() !== '')
    );

    // Build response
    return NextResponse.json({
      isActive,
      currentPlaylist: state.current_playlist || null,
      status: state.status || 'unknown',
      message: isActive 
        ? 'Light show is currently active!' 
        : 'Light show is not currently running',
      nextShowTime,
      nextShowDate,
      nextShowDay,
      nextShowStartTime,
      nextShowEndTime,
      currentShowEndTime,
      countdown,
      lastChecked: state.last_updated || new Date().toISOString()
    });

  } catch (error) {
    console.error('[Schedule Status] Error:', error);
    
    return NextResponse.json({
      isActive: false,
      currentPlaylist: null,
      status: 'error',
      message: 'Failed to check show status',
      nextShowTime: null,
      nextShowDate: null,
      nextShowDay: null,
      nextShowStartTime: null,
      nextShowEndTime: null,
      currentShowEndTime: null,
      countdown: null,
      lastChecked: new Date().toISOString()
    }, { status: 500 });
  }
}
