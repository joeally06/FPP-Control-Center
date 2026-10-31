import { DateTime } from 'luxon';

// Global timezone configuration
export const APP_TIMEZONE = process.env.NEXT_PUBLIC_TIMEZONE || 'America/Chicago';

/**
 * Convert database UTC timestamp to local timezone
 */
export function formatDateTime(
  utcTimestamp: string | null,
  format: 'short' | 'medium' | 'long' | 'relative' = 'medium'
): string {
  if (!utcTimestamp) return 'Never';

  try {
    const dtRaw = parseDbTimestamp(utcTimestamp);
    if (!dtRaw) return 'Invalid date';
    const dt = dtRaw.setZone(APP_TIMEZONE);

    // Check if parsing was successful
    if (!dt.isValid) {
      console.error('[Time Utils] Invalid datetime:', utcTimestamp, 'Error:', dt.invalidReason);
      return 'Invalid date';
    }

    switch (format) {
      case 'short':
        return dt.toLocaleString(DateTime.TIME_SIMPLE); // "4:30 PM"
      case 'medium':
        return dt.toLocaleString(DateTime.DATETIME_SHORT); // "10/30/2025, 4:30 PM"
      case 'long':
        return dt.toLocaleString(DateTime.DATETIME_MED); // "Oct 30, 2025, 4:30 PM"
      case 'relative':
        return dt.toRelative() || 'Unknown'; // "5 minutes ago"
      default:
        return dt.toLocaleString(DateTime.DATETIME_SHORT);
    }
  } catch (error) {
    console.error('[Time Utils] Error formatting timestamp:', error);
    return 'Invalid date';
  }
}

/**
 * Get current time in app timezone
 */
export function getCurrentTime(format: 'iso' | 'display' | 'simple' = 'display'): string {
  const now = DateTime.now().setZone(APP_TIMEZONE);
  
  if (format === 'iso') {
    return now.toISO() || '';
  }
  
  if (format === 'simple') {
    return now.toLocaleString(DateTime.DATETIME_SHORT);
  }
  
  return now.toLocaleString(DateTime.DATETIME_MED_WITH_SECONDS);
}

/**
 * Check if timestamp is within last N minutes
 */
export function isRecent(utcTimestamp: string | null, minutes: number = 5): boolean {
  if (!utcTimestamp) return false;
  
  try {
    const dt = parseDbTimestamp(utcTimestamp);
    if (!dt) return false;
    const now = DateTime.now();
    
    return now.diff(dt, 'minutes').minutes <= minutes;
  } catch {
    return false;
  }
}

/**
 * Format time range (for monitoring schedule)
 */
export function formatTimeRange(startTime: string, endTime: string): string {
  const start = formatTime(startTime);
  const end = formatTime(endTime);
  return `${start} - ${end}`;
}

/**
 * Convert 24-hour time to 12-hour display
 */
export function formatTime(time24: string): string {
  try {
    const [hour, minute] = time24.split(':').map(Number);
    const dt = DateTime.now()
      .setZone(APP_TIMEZONE)
      .set({ hour, minute });
    
    return dt.toLocaleString(DateTime.TIME_SIMPLE); // "4:00 PM"
  } catch {
    return time24;
  }
}

/**
 * Get timezone abbreviation (CST/CDT)
 */
export function getTimezoneAbbr(): string {
  return DateTime.now()
    .setZone(APP_TIMEZONE)
    .toFormat('ZZZZ'); // "CST" or "CDT"
}

/**
 * Get timezone display name
 */
export function getTimezoneName(): string {
  return APP_TIMEZONE;
}

/**
 * Format duration in seconds to readable format
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

/**
 * Get current UTC timestamp for database storage (ISO 8601 format)
 * Use this instead of new Date().toISOString()
 */
export function getUtcNow(): string {
  return DateTime.utc().toISO() || '';
}

/**
 * Get a SQL-friendly UTC timestamp like 'YYYY-MM-DD HH:mm:ss'
 */
export function getUtcSqlNow(): string {
  return DateTime.utc().toFormat('yyyy-MM-dd HH:mm:ss');
}

export function getUtcSqlTimestampOffset(amount: number, unit: 'hours' | 'minutes' | 'days' = 'hours'): string {
  return DateTime.utc().minus({ [unit]: amount }).toFormat('yyyy-MM-dd HH:mm:ss');
}

/**
 * Convert local time input to UTC for database storage
 * Used for form inputs where user enters time in their timezone
 */
export function localToUtc(localTimestamp: string): string {
  try {
    const dt = DateTime.fromISO(localTimestamp, { zone: APP_TIMEZONE });
    return dt.toUTC().toISO() || '';
  } catch (error) {
    console.error('[Time Utils] Error converting to UTC:', error);
    return localTimestamp;
  }
}

/**
 * Get timestamp N hours/minutes ago in UTC (for database queries)
 */
export function getUtcOffset(amount: number, unit: 'hours' | 'minutes' | 'days' = 'hours'): string {
  return DateTime.utc().minus({ [unit]: amount }).toISO() || '';
}

/**
 * Parse a database timestamp which may be in ISO-8601 or SQL 'YYYY-MM-DD HH:mm:ss' format
 * Returns a Luxon DateTime in UTC or null if parsing fails
 */
export function parseDbTimestamp(input: string | null | undefined): DateTime | null {
  if (!input) return null;
  try {
    let dt: DateTime;
    // If it looks like an SQL datetime (space between date and time), use fromSQL
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(input)) {
      dt = DateTime.fromSQL(input, { zone: 'utc' });
    } else {
      // Otherwise try ISO parsing (includes timezone info)
      dt = DateTime.fromISO(input, { zone: 'utc' });
    }

    if (!dt.isValid) {
      // Fallback: try replacing space with 'T' and appending Z
      if (input.includes(' ') && !input.includes('T')) {
        const isoStr = input.replace(' ', 'T') + 'Z';
        dt = DateTime.fromISO(isoStr, { zone: 'utc' });
      }
    }

    if (!dt.isValid) return null;
    return dt;
  } catch (err) {
    console.error('[Time Utils] parseDbTimestamp error:', err);
    return null;
  }
}

/**
 * Convert input (Date | DateTime | ISO string) to SQL-friendly UTC datetime string 'YYYY-MM-DD HH:mm:ss' for DB storage
 */
export function toDbSqlString(input?: Date | string | DateTime): string {
  try {
    let dt: DateTime;
    if (!input) {
      dt = DateTime.utc();
    } else if (typeof input === 'string') {
      const parsed = parseDbTimestamp(input);
      dt = parsed ?? DateTime.fromISO(input, { zone: 'utc' });
    } else if ((input as DateTime).isValid) {
      dt = (input as DateTime).setZone('utc');
    } else {
      dt = DateTime.fromJSDate(input as Date).toUTC();
    }

    return dt.toFormat('yyyy-MM-dd HH:mm:ss');
  } catch (err) {
    console.error('[Time Utils] toDbSqlString error:', err);
    return DateTime.utc().toFormat('yyyy-MM-dd HH:mm:ss');
  }
}

/**
 * Parse database timestamp and format for display
 * Handles both UTC strings and null values
 */
export function formatDbTimestamp(
  dbTimestamp: string | null | undefined,
  format: 'short' | 'medium' | 'long' | 'relative' = 'medium'
): string {
  return formatDateTime(dbTimestamp || null, format);
}
