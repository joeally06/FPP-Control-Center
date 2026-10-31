import { DateTime } from 'luxon';
import { getMonitoringSchedule } from './database';
import { APP_TIMEZONE } from './time-utils';

export interface MonitoringSchedule {
  id: number;
  enabled: boolean;
  start_time: string;
  end_time: string;
  timezone: string;
  updated_at: string;
}

/**
 * Check if device monitoring should be active based on the configured schedule
 */
export function isMonitoringActive(): boolean {
  try {
    const schedule = getMonitoringSchedule.get() as MonitoringSchedule | undefined;
    
    // If no schedule found, default to disabled
    if (!schedule) {
      return false;
    }
    
    // If schedule is disabled, don't monitor
    if (!schedule.enabled) {
      return false;
    }

    // Use app timezone from env or schedule timezone
    const timezone = schedule.timezone || APP_TIMEZONE;
    const now = DateTime.now().setZone(timezone);
    
    // Parse schedule times in the configured timezone
    const [startHour, startMin] = schedule.start_time.split(':').map(Number);
    const [endHour, endMin] = schedule.end_time.split(':').map(Number);
    
    const startTime = now.set({ hour: startHour, minute: startMin, second: 0 });
    const endTime = now.set({ hour: endHour, minute: endMin, second: 0 });

    // Handle overnight schedules (e.g., 22:00 - 02:00)
    if (endTime < startTime) {
      return now >= startTime || now <= endTime;
    }

    // Normal schedule (e.g., 16:00 - 22:00)
    return now >= startTime && now <= endTime;
  } catch (error) {
    console.error('[Monitoring Schedule] Error checking schedule:', error);
    // On error, default to monitoring active to avoid missing critical alerts
    return true;
  }
}

/**
 * Get the current monitoring schedule configuration
 */
export function getSchedule(): MonitoringSchedule | null {
  try {
    return getMonitoringSchedule.get() as MonitoringSchedule | null;
  } catch (error) {
    console.error('[Monitoring Schedule] Error getting schedule:', error);
    return null;
  }
}

/**
 * Format time for display (e.g., "16:00" -> "4:00 PM")
 */
export function formatTime(time24: string): string {
  try {
    const schedule = getMonitoringSchedule.get() as MonitoringSchedule | undefined;
    const timezone = schedule?.timezone || APP_TIMEZONE;
    
    const [hour, minute] = time24.split(':').map(Number);
    const dt = DateTime.now()
      .setZone(timezone)
      .set({ hour, minute });
    
    return dt.toLocaleString(DateTime.TIME_SIMPLE); // "4:00 PM"
  } catch {
    return time24;
  }
}
