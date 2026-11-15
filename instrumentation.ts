export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Check if we are building to prevent background services from running during build
    // process.argv usually looks like: [node_path, next_path, 'build']
    const isBuild = process.argv.some(arg => arg.endsWith('bin/next') || arg.endsWith('bin\\next')) && process.argv.includes('build');
    
    if (isBuild || process.env.FPP_BUILD === '1') {
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
      const { startDependencyScheduler } = await import('./lib/dependency-scheduler');

      // Start services
      startQueueProcessor();
      startJukeboxQueueProcessor();
      
      // Delay device monitor slightly to ensure server is ready
      setTimeout(() => {
        startDeviceMonitoring();
      }, 5000);

      startMaintenanceScheduler();
      startDependencyScheduler(); // monthly dependency report email (production only)

      
    } catch (error) {
      console.error('[Instrumentation] Failed to start background services:', error);
    }
  }
}
