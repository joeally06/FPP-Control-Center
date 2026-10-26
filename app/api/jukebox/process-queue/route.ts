import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-helpers';
import { getCircuitBreaker } from '@/lib/circuit-breaker';
import { getFppUrl } from '@/lib/fpp-config';
import { 
  getQueue, 
  updateQueueStatus,
  updateStartTimeAndDuration,
  getProcessorState,
  updateProcessorState,
  resetProcessorState
} from '@/lib/database';
import { insertStartDeadline, queueItemProgress } from '@/lib/jukebox-queue';
import Database from 'better-sqlite3';
import path from 'path';

interface QueueItem {
  id: number;
  sequence_name: string;
  media_name?: string;
  requester_name: string;
  status: string;
  created_at: string;
  played_at?: string;
  original_playlist?: string;
  original_item_index?: number;
  was_resumed?: boolean;
  started_at?: string;
  duration_ms?: number;
  request_kind?: string | null;
}

interface FppStatus {
  status_name: string;
  current_sequence?: string;
  current_song?: string;
  current_playlist?: { 
    playlist: string;
    index: number;
  };
  current_sequence_filename?: string;
  seconds_elapsed?: number;
  seconds_remaining?: number;
}

interface ProcessorState {
  id: number;
  processing_state: 'IDLE' | 'MONITORING_SEQUENCE';
  sequence_start_time: number | null;
  current_queue_item_id: number | null;
  start_deadline: number | null;
  last_updated: string;
}

// Simplified state machine for queue processing using Insert Playlist Immediate
type ProcessingState = 'IDLE' | 'MONITORING_SEQUENCE';

// ✅ RACE CONDITION FIX: State is now stored in database instead of module-level variables
// This prevents concurrent requests from overwriting each other's state
// Old approach (race condition):
//   let processingState: ProcessingState = 'IDLE';
//   let sequenceStartTime: number | null = null;
//   let currentQueueItemId: number | null = null;

// Helper function to sleep
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Get jukebox insert mode from settings
// Returns: 'interrupt', 'after_current', or 'end_of_playlist'
// Default: 'after_current' (safest, best UX)
function getInsertMode(): string {
  try {
    const dbPath = path.join(process.cwd(), 'votes.db');
    const db = new Database(dbPath, { readonly: true });
    
    const setting = db.prepare(
      'SELECT value FROM settings WHERE key = ?'
    ).get('jukebox_insert_mode') as { value: string } | undefined;
    
    db.close();
    
    if (setting && ['interrupt', 'after_current', 'end_of_playlist'].includes(setting.value)) {
      return setting.value;
    }
  } catch (error) {
    console.error('[Queue] Error reading insert mode setting:', error);
  }
  
  // Safe default: after_current (best user experience)
  return 'after_current';
}

// Get the appropriate FPP command based on insert mode setting
function getFppCommand(insertMode: string): string {
  const commandMap: Record<string, string> = {
    'interrupt': 'Insert Playlist Immediate',        // Pause current, play request, resume
    'after_current': 'Insert Playlist After Current', // Wait for current to finish
    'end_of_playlist': 'Insert Playlist Immediate'   // Add to queue (legacy behavior)
  };
  
  return commandMap[insertMode] || commandMap['after_current'];
}

// Playlist length from the cache filled on song-cache refresh, for the playing-too-long safety cap
function getPlaylistDuration(name: string): number | null {
  const dbPath = path.join(process.cwd(), 'votes.db');
  const db = new Database(dbPath, { readonly: true });
  try {
    const row = db.prepare('SELECT duration_seconds FROM jukebox_playlists WHERE name = ?').get(name) as { duration_seconds: number | null } | undefined;
    return row?.duration_seconds ?? null;
  } finally {
    db.close();
  }
}

// Helper to make FPP API calls
async function makeFppCall(endpoint: string, method: string = 'GET', body?: any): Promise<any> {
  const fppUrl = getFppUrl();
  const url = `${fppUrl}${endpoint}`;
  
  try {
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
      }
    };
    
    if (body) {
      options.body = JSON.stringify(body);
    }
    
    const response = await fetch(url, options);
    const text = await response.text();
    
    if (!response.ok) {
      console.error(`[FPP API Error] ${endpoint}: ${text}`);
      return null;
    }
    
    if (text) {
      try {
        return JSON.parse(text);
      } catch (e) {
        return { success: true, response: text };
      }
    }
    
    return { success: true };
  } catch (error) {
    console.error(`[FPP API Exception] ${endpoint}:`, error);
    return null;
  }
}

// Insert a song based on admin settings; a visitor's playlist always waits for the current song
async function insertPlaylistImmediate(item: QueueItem): Promise<string | null> {
  const isPlaylist = item.request_kind === 'playlist';
  const sequenceName = item.sequence_name;
  const fullSequenceName = isPlaylist || sequenceName.endsWith('.fseq')
    ? sequenceName
    : `${sequenceName}.fseq`;

  // Get insert mode from settings (admin-configurable)
  const insertMode = isPlaylist ? 'after_current' : getInsertMode();
  const command = getFppCommand(insertMode);
  
  console.log(`[Queue] Inserting playlist with mode: ${insertMode} (${command})`);
  console.log(`[Queue] ${isPlaylist ? 'Playlist' : 'Sequence'}: ${fullSequenceName}`);

  // Use the command determined by settings
  // Args: [name, startItem, endItem, ifNotRunning]
  // startItem=0, endItem=0 to play just the first item
  const result = await makeFppCall('/api/command', 'POST', {
    command: command,
    args: [fullSequenceName, 0, 0, false]
  });

  if (!result) {
    console.error(`[Queue] Failed to insert playlist: ${fullSequenceName}`);
    return null;
  }

  console.log(`[Queue] Insert response: ${result.response || 'success'}`);
  return command;
}

// Simplified state machine processing with Insert Playlist Immediate
async function processQueueStateMachine(fppStatus: FppStatus): Promise<void> {
  // ✅ Get state from database instead of module-level variables
  const state = getProcessorState.get() as ProcessorState;
  const processingState = state.processing_state;
  const sequenceStartTime = state.sequence_start_time;
  const currentQueueItemId = state.current_queue_item_id;

  console.log(`[Queue] State: ${processingState}, FPP: ${fppStatus.status_name}, Current: ${fppStatus.current_sequence || 'none'}`);

  switch (processingState) {
    case 'IDLE': {
      // Check for pending queue items
      const queue = getQueue.all() as QueueItem[];
      const pendingItem = queue.length > 0 ? queue[0] : null;

      if (!pendingItem) {
        return;
      }

      console.log(`[Queue] Processing queue item: ${pendingItem.sequence_name}`);

      // FPP can't tell an inserted copy of the running playlist from the playlist itself
      if (pendingItem.request_kind === 'playlist' && fppStatus.current_playlist?.playlist === pendingItem.sequence_name) {
        console.log('[Queue] Requested playlist is already running - skipping');
        updateQueueStatus.run('skipped', pendingItem.id);
        return;
      }
      
      // Use Insert Playlist Immediate - FPP handles pause/resume automatically
      const command = await insertPlaylistImmediate(pendingItem);
      
      if (command) {
        // DON'T mark as 'playing' yet - wait until FPP confirms it's playing
        // Keep as 'pending' and transition to MONITORING_SEQUENCE
        const startTime = Date.now();
        const isPlaying = fppStatus.status_name === 'playing';
        const startDeadline = insertStartDeadline(
          startTime,
          isPlaying && command === 'Insert Playlist After Current',
          fppStatus.seconds_remaining
        );
        
        // ✅ Update state in database atomically
        updateProcessorState.run('MONITORING_SEQUENCE', startTime, pendingItem.id, startDeadline);
        
        // Record start time
        const defaultDurationMs = 5 * 60 * 1000; // 5 minutes default
        updateStartTimeAndDuration.run(defaultDurationMs, pendingItem.id);
        
        console.log('[Queue] Sequence inserted, waiting for FPP to start playing...');
      } else {
        console.error('[Queue] Failed to insert sequence');
        updateQueueStatus.run('completed', pendingItem.id);
      }
      break;
    }

    case 'MONITORING_SEQUENCE': {
      if (!currentQueueItemId) {
        resetProcessorState.run();
        return;
      }

      // Get the queue item we're monitoring (might still be 'pending' or 'playing')
      const dbPath = path.join(process.cwd(), 'votes.db');
      const db = new Database(dbPath, { readonly: true });
      const currentItem = db.prepare('SELECT * FROM jukebox_queue WHERE id = ?').get(currentQueueItemId) as QueueItem | undefined;
      db.close();

      if (!currentItem) {
        resetProcessorState.run();
        return;
      }

      // Pending: FPP holds only one pending insert, so wait for it to start before sending anything else
      const isPlaylist = currentItem.request_kind === 'playlist';
      const progress = queueItemProgress(
        {
          kind: isPlaylist ? 'playlist' : 'song',
          name: currentItem.sequence_name,
          status: currentItem.status,
          startDeadline: state.start_deadline ?? 0,
          startedAt: currentItem.status === 'playing' ? sequenceStartTime : null,
          durationSec: isPlaylist ? getPlaylistDuration(currentItem.sequence_name) : null,
        },
        { currentSequence: fppStatus.current_sequence, currentPlaylist: fppStatus.current_playlist?.playlist },
        Date.now()
      );

      if (progress === 'started') {
        console.log(`[Queue] FPP confirmed playing: ${currentItem.sequence_name}`);
        updateQueueStatus.run('playing', currentQueueItemId);
        // From here sequence_start_time is when FPP started playing it
        updateProcessorState.run('MONITORING_SEQUENCE', Date.now(), currentQueueItemId, state.start_deadline);
      } else if (progress === 'finished') {
        console.log('[Queue] Request finished, FPP will auto-resume original playlist');
        updateQueueStatus.run('completed', currentQueueItemId);
        resetProcessorState.run();
      } else if (progress === 'gave_up') {
        console.log('[Queue] Timed out waiting for FPP to play the request');
        updateQueueStatus.run('skipped', currentQueueItemId);
        resetProcessorState.run();
      } else {
        console.log(`[Queue] Monitoring... Current: ${fppStatus.current_sequence}, Status: ${currentItem.status}`);
      }
      break;
    }
  }
}

/**
 * POST /api/jukebox/process-queue
 * Process the jukebox queue (background job)
 * PUBLIC - Processes queue items automatically (anyone can request songs)
 * 
 * CIRCUIT BREAKER: Skips processing when FPP is offline to save resources
 */
export async function POST() {
  try {
    // ✅ CIRCUIT BREAKER: Check if FPP is online before processing
    const circuitBreaker = getCircuitBreaker();
    
    if (circuitBreaker.isFPPOffline()) {
      console.log('[Queue] ⚠️  Circuit breaker OPEN - FPP offline, skipping queue processing');
      return NextResponse.json({ 
        success: false, 
        message: 'FPP offline - queue processing paused',
        circuitState: circuitBreaker.getState(),
        retryAfter: circuitBreaker.getStats().nextRetryIn
      }, { status: 503 });
    }
    
    // Note: No auth required - this processes public queue requests
    // Queue items are added by anyone, this just plays them in order
    
    console.log('[Queue] Starting queue processing...');

    // Get FPP status
    const fppStatus = await makeFppCall('/api/fppd/status') as FppStatus;
    if (!fppStatus) {
      console.error('[Queue] Could not fetch FPP status');
      // Circuit breaker will handle this failure via poller
      return NextResponse.json({ error: 'Could not connect to FPP' }, { status: 500 });
    }

    // Run state machine
    await processQueueStateMachine(fppStatus);

    // ✅ Get final state from database
    const finalState = getProcessorState.get() as ProcessorState;
    return NextResponse.json({ success: true, state: finalState.processing_state });

  } catch (error: any) {
    if (error.message?.includes('Authentication required')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (error.message?.includes('Admin access required')) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    console.error('[Queue] Unexpected error:', error);
    return NextResponse.json({ error: 'Queue processing failed' }, { status: 500 });
  }
}

