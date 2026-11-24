import db from './database';

/**
 * Database Maintenance Utilities
 * Run these periodically to keep the database optimized
 */

/**
 * Run complete database maintenance
 * - Analyzes query performance
 * - Reclaims unused space
 * - Optimizes indexes
 */
export function runFullMaintenance() {
  console.log('🔧 Starting full database maintenance...');
  const startTime = Date.now();

  try {
    // Analyze tables and indexes for query optimizer
    console.log('  📊 Analyzing database statistics...');
    db.exec('ANALYZE');

    // Rebuild indexes for optimal performance
    console.log('  🔨 Rebuilding indexes...');
    db.exec('REINDEX');

    // Reclaim unused space and defragment
    console.log('  🗜️  Running VACUUM to reclaim space...');
    db.exec('VACUUM');

    const duration = Date.now() - startTime;
    console.log(`✅ Database maintenance completed in ${duration}ms`);
    
    return { success: true, duration };
  } catch (error) {
    console.error('❌ Database maintenance failed:', error);
    return { success: false, error };
  }
}

/**
 * Quick maintenance (without VACUUM which can be slow)
 * Run this more frequently (e.g., daily)
 */
export function runQuickMaintenance() {
  console.log('⚡ Running quick database maintenance...');
  const startTime = Date.now();

  try {
    // Analyze for query optimizer
    db.exec('ANALYZE');

    const duration = Date.now() - startTime;
    console.log(`✅ Quick maintenance completed in ${duration}ms`);
    
    return { success: true, duration };
  } catch (error) {
    console.error('❌ Quick maintenance failed:', error);
    return { success: false, error };
  }
}

/** How many days of data to keep: a whole number from 1 to 3650 (10 years), or null for anything else */
export function parseDaysToKeep(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 3650 ? value : null;
}

/**
 * Archive old data to keep database size manageable
 * @param daysToKeep Number of days of data to retain (whole number, 1 to 3650)
 */
export function archiveOldData(daysToKeep = 365) {
  const days = parseDaysToKeep(daysToKeep);
  if (days === null) {
    return { success: false, error: new Error('daysToKeep must be a whole number from 1 to 3650') };
  }
  console.log(`🗄️  Archiving data older than ${days} days...`);
  const startTime = Date.now();
  // Bound as a parameter, never pasted into the SQL text
  const cutoff = `-${days} days`;

  try {
    const stats = {
      pageViews: 0,
      deviceStatus: 0,
      sessions: 0,
    };

    // Archive old page views (keep last year by default)
    const deletePageViews = db.prepare(`
      DELETE FROM page_views
      WHERE view_time < datetime('now', ?)
    `);
    const pageViewResult = deletePageViews.run(cutoff);
    stats.pageViews = pageViewResult.changes;

    // Archive old device status records (keep last 90 days)
    const deleteDeviceStatus = db.prepare(`
      DELETE FROM device_status 
      WHERE last_checked < datetime('now', '-90 days')
    `);
    const deviceResult = deleteDeviceStatus.run();
    stats.deviceStatus = deviceResult.changes;

    // Archive old sessions (keep last year)
    const deleteSessions = db.prepare(`
      DELETE FROM sessions 
      WHERE session_start < datetime('now', ?)
    `);
    const sessionResult = deleteSessions.run(cutoff);
    stats.sessions = sessionResult.changes;

    // Note: We keep all song requests, votes, and santa letters for historical value

    const duration = Date.now() - startTime;
    console.log(`✅ Archived data in ${duration}ms:`, stats);
    
    return { success: true, duration, stats };
  } catch (error) {
    console.error('❌ Data archival failed:', error);
    return { success: false, error };
  }
}

/**
 * Why a maintenance run failed, or null if it did not. The helpers above report failure as
 * `{ success: false }` (and getDatabaseStats as null) instead of throwing, so the route has to look.
 */
export function maintenanceFailureMessage(result: unknown): string | null {
  if (result === null || result === undefined) return 'No result from the database';
  if (typeof result !== 'object' || (result as { success?: unknown }).success !== false) return null;
  const { error, status } = result as { error?: unknown; status?: unknown };
  if (error instanceof Error) return error.message;
  if (status === 'issues') return 'The database integrity check found problems; see the server log';
  return 'Maintenance failed; see the server log';
}

/**
 * Get database statistics
 */
export function getDatabaseStats() {
  try {
    const pageSize = db.pragma('page_size', { simple: true }) as number;
    const pageCount = db.pragma('page_count', { simple: true }) as number;
    const journalMode = db.pragma('journal_mode', { simple: true }) as string;
    const cacheSize = db.pragma('cache_size', { simple: true }) as number;
    
    const stats = {
      pageSize,
      pageCount,
      journalMode,
      cacheSize,
      
      // Table counts
      votes: db.prepare('SELECT COUNT(*) as count FROM votes').get() as { count: number },
      jukeboxQueue: db.prepare('SELECT COUNT(*) as count FROM jukebox_queue').get() as { count: number },
      santaLetters: db.prepare('SELECT COUNT(*) as count FROM santa_letters').get() as { count: number },
      pageViews: db.prepare('SELECT COUNT(*) as count FROM page_views').get() as { count: number },
      visitors: db.prepare('SELECT COUNT(*) as count FROM visitors').get() as { count: number },
      sessions: db.prepare('SELECT COUNT(*) as count FROM sessions').get() as { count: number },
      deviceStatus: db.prepare('SELECT COUNT(*) as count FROM device_status').get() as { count: number },
      devices: db.prepare('SELECT COUNT(*) as count FROM devices').get() as { count: number },
      
      // Calculate approximate database size in MB
      approximateSizeMB: (pageSize * pageCount) / (1024 * 1024),
    };

    return stats;
  } catch (error) {
    console.error('❌ Failed to get database stats:', error);
    return null;
  }
}

// Whitelist of allowed tables for optimization (SQL injection prevention)
const ALLOWED_TABLES = [
  'votes',
  'jukebox_queue',
  'santa_letters',
  'visitors',
  'sessions',
  'page_views',
  'device_status',
  'spotify_metadata',
  'settings'
] as const;

/**
 * Optimize specific table
 * @param tableName Name of the table to optimize
 */
export function optimizeTable(tableName: string) {
  try {
    // SECURITY: Validate table name against whitelist to prevent SQL injection
    if (!(ALLOWED_TABLES as readonly string[]).includes(tableName)) {
      console.error(`❌ Invalid table name: ${tableName}`);
      return { success: false, error: new Error('Invalid table name') };
    }

    console.log(`🔧 Optimizing table: ${tableName}...`);
    // Use double quotes to properly escape the identifier
    db.exec(`ANALYZE "${tableName}"`);
    console.log(`✅ Table ${tableName} optimized`);
    return { success: true };
  } catch (error) {
    console.error(`❌ Failed to optimize table ${tableName}:`, error);
    return { success: false, error };
  }
}

/**
 * Check database integrity
 */
export function checkIntegrity() {
  try {
    console.log('🔍 Checking database integrity...');
    const result: unknown = db.pragma('integrity_check');
    const resultArray = result as Array<{ integrity_check: string }>;
    
    if (resultArray.length === 1 && resultArray[0].integrity_check === 'ok') {
      console.log('✅ Database integrity check passed');
      return { success: true, status: 'ok' };
    } else {
      console.error('⚠️  Database integrity issues found:', resultArray);
      return { success: false, status: 'issues', details: resultArray };
    }
  } catch (error) {
    console.error('❌ Integrity check failed:', error);
    return { success: false, error };
  }
}

/**
 * Log slow queries for debugging
 * Wraps database prepare to track query performance
 */
export function enableSlowQueryLogging(thresholdMs = 100) {
  console.log(`📊 Enabling slow query logging (threshold: ${thresholdMs}ms)`);
  
  const originalPrepare = db.prepare.bind(db);
  
  Object.assign(db, { prepare(sql: string) {
    const stmt = originalPrepare(sql);
    const originalRun = stmt.run.bind(stmt);
    const originalGet = stmt.get.bind(stmt);
    const originalAll = stmt.all.bind(stmt);
    
    // Wrap run()
    stmt.run = function(...args: unknown[]) {
      const start = Date.now();
      const result = originalRun(...args);
      const duration = Date.now() - start;
      
      if (duration > thresholdMs) {
        console.warn(`⚠️  SLOW QUERY (${duration}ms): ${sql.substring(0, 100)}...`);
      }
      
      return result;
    };
    
    // Wrap get()
    stmt.get = function(...args: unknown[]) {
      const start = Date.now();
      const result = originalGet(...args);
      const duration = Date.now() - start;
      
      if (duration > thresholdMs) {
        console.warn(`⚠️  SLOW QUERY (${duration}ms): ${sql.substring(0, 100)}...`);
      }
      
      return result;
    };
    
    // Wrap all()
    stmt.all = function(...args: unknown[]) {
      const start = Date.now();
      const result = originalAll(...args);
      const duration = Date.now() - start;
      
      if (duration > thresholdMs) {
        console.warn(`⚠️  SLOW QUERY (${duration}ms): ${sql.substring(0, 100)}...`);
      }
      
      return result;
    };
    
    return stmt;
  } });
}

// Export default maintenance function
const maintenance = {
  runFullMaintenance,
  runQuickMaintenance,
  archiveOldData,
  getDatabaseStats,
  optimizeTable,
  checkIntegrity,
  enableSlowQueryLogging,
};

export default maintenance;
