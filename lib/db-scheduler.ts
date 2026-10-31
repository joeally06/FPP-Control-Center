import { runQuickMaintenance, runFullMaintenance } from './db-maintenance';

/**
 * Automated Database Maintenance Scheduler
 * Runs maintenance tasks at appropriate intervals
 */

let maintenanceIntervals: NodeJS.Timeout[] = [];

export function startMaintenanceScheduler() {
  console.log('🕐 Starting database maintenance scheduler...');

  // Quick maintenance every 24 hours (daily)
  const dailyMaintenance = setInterval(() => {
    console.log('📅 Running scheduled daily maintenance...');
    runQuickMaintenance();
  }, 24 * 60 * 60 * 1000); // 24 hours

  maintenanceIntervals.push(dailyMaintenance);

  // Full maintenance every 7 days (weekly)
  const weeklyMaintenance = setInterval(() => {
    console.log('📅 Running scheduled weekly maintenance...');
    runFullMaintenance();
  }, 7 * 24 * 60 * 60 * 1000); // 7 days

  maintenanceIntervals.push(weeklyMaintenance);

  // Archive old data every 30 days (monthly)
  // DISABLED - Run manually from admin panel only to prevent accidental loops
  // const monthlyArchive = setInterval(() => {
  //   console.log('📅 Running scheduled monthly data archival...');
  //   archiveOldData(365); // Keep 1 year of data
  // }, 30 * 24 * 60 * 60 * 1000); // 30 days
  // maintenanceIntervals.push(monthlyArchive);

  // Run initial quick maintenance on startup (delayed)
  setTimeout(() => {
    console.log('🚀 Running initial database maintenance on startup...');
    runQuickMaintenance();
  }, 5000); // Wait 5 seconds after startup

  console.log('✅ Database maintenance scheduler started');
  console.log('   - Quick maintenance: Daily');
  console.log('   - Full maintenance: Weekly');
  console.log('   - Data archival: Manual only (via admin panel)');
}

export function stopMaintenanceScheduler() {
  console.log('🛑 Stopping database maintenance scheduler...');
  
  maintenanceIntervals.forEach(interval => clearInterval(interval));
  maintenanceIntervals = [];
  
  console.log('✅ Database maintenance scheduler stopped');
}

// Auto-start scheduler in server environment
// MOVED TO instrumentation.ts to prevent running during build
// if (typeof window === 'undefined') {
//   // Start scheduler on module load
//   startMaintenanceScheduler();
  
//   // Cleanup on process exit
//   process.on('SIGINT', () => {
//     stopMaintenanceScheduler();
//     process.exit(0);
//   });
  
//   process.on('SIGTERM', () => {
//     stopMaintenanceScheduler();
//     process.exit(0);
//   });
// }

export default {
  startMaintenanceScheduler,
  stopMaintenanceScheduler,
};
