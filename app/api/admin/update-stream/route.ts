import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { existsSync, readFileSync, statSync, watchFile, unwatchFile, writeFileSync } from 'fs';
import path from 'path';
import { isAdminSession } from '@/lib/auth-helpers';

const STATUS_FILE = path.join(process.cwd(), 'logs', 'update_status');
const LOG_FILE = path.join(process.cwd(), 'logs', 'update.log');

// Terminal statuses that indicate the update is complete
const TERMINAL_STATUSES = ['COMPLETED', 'SUCCESS', 'UP_TO_DATE', 'FAILED', 'LOCKED'];

/**
 * GET /api/admin/update-stream
 * 
 * Server-Sent Events (SSE) endpoint for real-time update log streaming.
 * Provides live terminal output during system updates.
 * 
 * Security:
 * - Requires admin authentication
 * - Read-only access to log files
 * - Auto-closes on completion or timeout
 * 
 * Events sent:
 * - 'log': New log line(s)
 * - 'status': Current update status
 * - 'complete': Update finished (success/fail)
 * - 'error': Stream error
 */
export async function GET(request: NextRequest) {
  // Verify admin authentication
  const session = await getServerSession(authOptions);
  
  if (!isAdminSession(session)) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized - Admin access required' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Create readable stream for SSE
  const encoder = new TextEncoder();
  let lastLogSize = 0;
  let lastLogContent = '';
  let streamClosed = false;
  let watchInterval: NodeJS.Timeout | null = null;
  let startingStatusTime: number | null = null;
  let lastStatus = 'IDLE';
  
  const stream = new ReadableStream({
    start(controller) {
      // Helper to send SSE event
      const sendEvent = (event: string, data: unknown) => {
        if (streamClosed) return;
        try {
          const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(message));
        } catch (error) {
          console.error('[Update Stream] Failed to send event:', error);
        }
      };

      // Send initial status
      const sendInitialStatus = () => {
        try {
          let status = 'IDLE';
          if (existsSync(STATUS_FILE)) {
            status = readFileSync(STATUS_FILE, 'utf-8').trim();
          }
          sendEvent('status', { status, timestamp: new Date().toISOString() });

          // Send existing log content
          if (existsSync(LOG_FILE)) {
            const content = readFileSync(LOG_FILE, 'utf-8');
            lastLogSize = statSync(LOG_FILE).size;
            lastLogContent = content;
            
            const lines = content.split('\n').filter(line => line.trim());
            if (lines.length > 0) {
              sendEvent('log', { lines, isInitial: true });
            }
          }
        } catch (error) {
          console.error('[Update Stream] Error reading initial state:', error);
          sendEvent('error', { message: 'Failed to read initial state' });
        }
      };

      // Check for new log content
      const checkForUpdates = () => {
        if (streamClosed) return;

        try {
          // Check status
          let status = 'IDLE';
          if (existsSync(STATUS_FILE)) {
            status = readFileSync(STATUS_FILE, 'utf-8').trim();
          }

          // Track how long status has been stuck at STARTING
          if (status === 'STARTING') {
            if (lastStatus !== 'STARTING') {
              startingStatusTime = Date.now();
            } else if (startingStatusTime && Date.now() - startingStatusTime > 30000) {
              // Stuck at STARTING for >30 seconds - daemon likely failed
              console.error('[Update Stream] Update stuck at STARTING for >30s');
              sendEvent('error', { 
                message: 'Update stuck at STARTING - daemon may have failed. Check logs/daemon-stderr.log',
                timeout: true
              });
              status = 'FAILED';
              if (existsSync(STATUS_FILE)) {
                writeFileSync(STATUS_FILE, 'FAILED');
              }
            }
          } else {
            startingStatusTime = null;
          }
          
          lastStatus = status;

          // Check for new log content
          if (existsSync(LOG_FILE)) {
            const stats = statSync(LOG_FILE);
            
            if (stats.size > lastLogSize) {
              const content = readFileSync(LOG_FILE, 'utf-8');
              const newContent = content.slice(lastLogContent.length);
              lastLogSize = stats.size;
              lastLogContent = content;

              const newLines = newContent.split('\n').filter(line => line.trim());
              if (newLines.length > 0) {
                sendEvent('log', { lines: newLines, isInitial: false });
              }
            } else if (stats.size < lastLogSize) {
              // Log file was truncated (new update started)
              const content = readFileSync(LOG_FILE, 'utf-8');
              lastLogSize = stats.size;
              lastLogContent = content;
              
              const lines = content.split('\n').filter(line => line.trim());
              sendEvent('log', { lines, isInitial: true, truncated: true });
            }
          }

          // Send status update
          sendEvent('status', { status, timestamp: new Date().toISOString() });

          // Check if update completed
          if (TERMINAL_STATUSES.includes(status)) {
            sendEvent('complete', { 
              status, 
              success: status === 'COMPLETED' || status === 'SUCCESS' || status === 'UP_TO_DATE',
              timestamp: new Date().toISOString() 
            });
            
            // Close stream after sending completion
            setTimeout(() => {
              if (!streamClosed) {
                streamClosed = true;
                if (watchInterval) {
                  clearInterval(watchInterval);
                  watchInterval = null;
                }
                controller.close();
              }
            }, 1000);
          }
        } catch (error) {
          console.error('[Update Stream] Error checking updates:', error);
        }
      };

      // Send initial state
      sendInitialStatus();

      // Poll for updates every 500ms (more responsive than file watching)
      watchInterval = setInterval(checkForUpdates, 500);

      // Timeout after 10 minutes (updates shouldn't take longer)
      const timeout = setTimeout(() => {
        if (!streamClosed) {
          streamClosed = true;
          sendEvent('error', { message: 'Stream timeout - update may still be running' });
          if (watchInterval) {
            clearInterval(watchInterval);
            watchInterval = null;
          }
          controller.close();
        }
      }, 10 * 60 * 1000);

      // Handle client disconnect
      request.signal.addEventListener('abort', () => {
        streamClosed = true;
        if (watchInterval) {
          clearInterval(watchInterval);
          watchInterval = null;
        }
        clearTimeout(timeout);
      });
    },

    cancel() {
      streamClosed = true;
      if (watchInterval) {
        clearInterval(watchInterval);
        watchInterval = null;
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  });
}
