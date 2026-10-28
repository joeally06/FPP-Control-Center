module.exports = {
  apps: [
    {
      name: 'fpp-control',
      script: 'npm',
      args: 'start',
      cwd: './',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000,
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: './logs/pm2-fpp-control-error.log',
      out_file: './logs/pm2-fpp-control-out.log',
      log_file: './logs/pm2-fpp-control-combined.log',
      time: true,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },
    {
      name: 'fpp-poller',
      script: './lib/fpp-poller.ts',
      // TypeScript via esbuild-register, already a dependency (same as `npm run poller:start`)
      interpreter: 'node',
      node_args: ['-r', 'esbuild-register'],
      cwd: './',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000,
      env: {
        NODE_ENV: 'production',
        FPP_POLL_INTERVAL: '10000' // Poll every 10 seconds
      },
      error_file: './logs/pm2-fpp-poller-error.log',
      out_file: './logs/pm2-fpp-poller-out.log',
      log_file: './logs/pm2-fpp-poller-combined.log',
      time: true,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },
    // Update daemon removed - updates are now triggered manually via UI only
    // This improves security by preventing unauthorized automatic code execution
    // Users can trigger updates from Settings > System Updates
  ]
};
