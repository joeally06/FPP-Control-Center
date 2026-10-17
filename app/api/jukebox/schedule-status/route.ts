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
import { getFPPState } from '@/lib/database';

function parseTimeToMinutes(timeStr: string): number {
  const parts = timeStr.split(':');
  const hours = parseInt(parts[0]);
  const minutes = parseInt(parts[1]);
  return hours * 60 + minutes;
}

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
          
          // Find next enabled playlist in schedule
          const now = new Date();
          const currentDay = now.getDay(); // 0 = Sunday, 6 = Saturday
          const currentTime = now.getHours() * 60 + now.getMinutes();
          const currentDateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
          const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
          
          // Filter schedule entries to only active ones with playlists
          const activeEntries = (scheduleData.value || scheduleData).filter((entry: any) => {
            if (!entry.enabled || !entry.playlist || entry.playlist.trim() === '') return false;
            
            // Check date range if specified
            if (entry.startDate && entry.endDate) {
              // Allow checking future dates within date range
              return currentDateStr <= entry.endDate;
            }
            return true;
          });
          
          if (activeEntries.length > 0) {
            let minTimeDiff = Infinity;
            let nextEntry: any = null;
            let nextEntryDate: Date | null = null;
            
            // Search for next show within 14 days
            for (let daysAhead = 0; daysAhead < 14; daysAhead++) {
              const checkDate = new Date(now);
              checkDate.setDate(checkDate.getDate() + daysAhead);
              const checkDay = checkDate.getDay();
              const checkDateStr = checkDate.toISOString().split('T')[0];
              
              for (const entry of activeEntries) {
                // Check if entry applies to this day
                let appliesToDay = false;
                if (entry.day === 7) {
                  // Daily schedule
                  appliesToDay = true;
                } else if (entry.day === checkDay) {
                  // Specific day matches
                  appliesToDay = true;
                }
                
                if (!appliesToDay) continue;
                
                // Check if within date range
                if (entry.startDate && entry.endDate) {
                  if (checkDateStr < entry.startDate || checkDateStr > entry.endDate) {
                    continue;
                  }
                }
                
                // Parse start time
                const startMinutes = parseTimeToMinutes(entry.startTime);
                const endMinutes = parseTimeToMinutes(entry.endTime);
                
                let timeDiff: number;
                if (daysAhead === 0) {
                  // Today - check if currently active or upcoming
                  if (currentTime >= startMinutes && currentTime < endMinutes) {
                    // Currently in show time
                    isActiveBySchedule = true;
                    currentShowEndTime = entry.endTime;
                    minTimeDiff = 0;
                    nextEntry = null;
                    break;
                  } else if (startMinutes > currentTime) {
                    // Future show today
                    timeDiff = startMinutes - currentTime;
                  } else {
                    // Show already passed today
                    continue;
                  }
                } else {
                  // Future days
                  timeDiff = (daysAhead * 24 * 60) + startMinutes - currentTime;
                }
                
                // Found a closer show
                if (timeDiff > 0 && timeDiff < minTimeDiff) {
                  minTimeDiff = timeDiff;
                  nextEntry = entry;
                  
                  const showTime = new Date(checkDate);
                  const hours = Math.floor(startMinutes / 60);
                  const minutes = startMinutes % 60;
                  showTime.setHours(hours, minutes, 0, 0);
                  nextEntryDate = showTime;
                }
              }
              
              if (isActiveBySchedule) break;
            }
            
            // If we found a next show, format the details
            if (nextEntry && nextEntryDate) {
              nextShowTime = nextEntryDate.toISOString();
              nextShowDate = nextEntryDate.toISOString().split('T')[0];
              nextShowDay = dayNames[nextEntryDate.getDay()];
              nextShowStartTime = nextEntry.startTime;
              nextShowEndTime = nextEntry.endTime;
              
              // Calculate countdown
              const minutesUntil = Math.floor((nextEntryDate.getTime() - now.getTime()) / (1000 * 60));
              const days = Math.floor(minutesUntil / (24 * 60));
              const hours = Math.floor((minutesUntil % (24 * 60)) / 60);
              const mins = minutesUntil % 60;
              
              if (days > 0) {
                countdown = `${days}d ${hours}h`;
              } else if (hours > 0) {
                countdown = `${hours}h ${mins}m`;
              } else {
                countdown = `${mins}m`;
              }
            }
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
