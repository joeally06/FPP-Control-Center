export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Check if we are building to prevent background services from running during build
    // process.argv usually looks like: [node_path, next_path, 'build']
    const isBuild = process.argv.some(arg => arg.endsWith('bin/next') || arg.endsWith('bin\\next')) && process.argv.includes('build');
    
    if (isBuild) {
      console.log('[Instrumentation] Skipping background services during build');
      return;
    }

    console.log('[Instrumentation] Starting background services...');

    try {
      // Import and start background services
      const { startQueueProcessor } = await import('./lib/santa-queue-processor');
      const { startDeviceMonitoring } = await import('./lib/device-monitor');
      const { startMaintenanceScheduler } = await import('./lib/db-scheduler');
      const { startJukeboxQueueProcessor } = await import('./lib/jukebox-queue-processor');

      // Start services
      startQueueProcessor();
      startJukeboxQueueProcessor();
      
      // Delay device monitor slightly to ensure server is ready
      setTimeout(() => {
        startDeviceMonitoring();
      }, 5000);

      startMaintenanceScheduler();

      // Optionally run migrations at startup if explicitly allowed
      const autoMigrate = process.env.AUTO_RUN_MIGRATIONS === 'true' || process.env.AUTO_RUN_MIGRATIONS === '1';
      const forceMigrate = process.env.AUTO_RUN_MIGRATIONS_FORCE === 'true' || process.env.AUTO_RUN_MIGRATIONS_FORCE === '1';
      const isProd = process.env.NODE_ENV === 'production';

      if (autoMigrate && (!isProd || forceMigrate)) {
        const { runMigrations } = await import('./lib/migrations-runner');
        runMigrations({ backup: true }).catch(err => {
          console.error('[Instrumentation] Migration runner failed:', err);
        });
      }
      
    } catch (error) {
      console.error('[Instrumentation] Failed to start background services:', error);
    }
  }
}
