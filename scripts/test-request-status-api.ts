// @ts-nocheck
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';

(async () => {
  // This test expects a running local Next.js dev server on http://localhost:3000
  // It will not start one automatically, but will attempt to call the GET endpoint.
  const url = 'http://localhost:3000/api/jukebox/request-status';

  try {
    const response = await fetch(url);
    const data = await response.json();
    console.log('[test-request-status-api] response', data);
  } catch (err) {
    console.error('[test-request-status-api] Error calling API:', err);
    process.exit(1);
  }
  process.exit(0);
})();
