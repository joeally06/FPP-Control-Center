import { NextRequest } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { getFppUrl } from '@/lib/fpp-config';
import { createLazyPoller } from '@/lib/lazy-poller';

// FPP Configuration - uses fpp.local as default
const FPP_URL = getFppUrl();

interface SyncState {
  isPlaying: boolean;
  currentSequence: string | null;
  audioFile: string | null;
  position: number;
  timestamp: number;
}

// Store SSE clients
const clients = new Set<ReadableStreamDefaultController>();
let currentState: SyncState = {
  isPlaying: false,
  currentSequence: null,
  audioFile: null,
  position: 0,
  timestamp: Date.now(),
};

// Load mappings
const MAPPING_FILE = path.join(process.cwd(), 'data', 'audio-mapping.json');
let audioMappings: Record<string, string> = {};

async function loadMappings() {
  try {
    const content = await fs.readFile(MAPPING_FILE, 'utf-8');
    audioMappings = JSON.parse(content);
  } catch {
    audioMappings = {};
  }
}

// Load available audio files
let availableAudioFiles: string[] = [];
async function loadAvailableAudioFiles() {
  try {
    const audioDir = path.join(process.cwd(), 'public', 'audio');
    const files = await fs.readdir(audioDir);
    availableAudioFiles = files.filter(f => 
      f.endsWith('.mp3') || f.endsWith('.wav') || f.endsWith('.ogg') || 
      f.endsWith('.m4a') || f.endsWith('.flac') || f.endsWith('.aac')
    );
  } catch {
    availableAudioFiles = [];
  }
}

// Helper to normalize strings for comparison
const normalize = (str: string) => {
  return str
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

// Auto-match sequence to audio file
function findAudioForSequence(sequenceName: string): string | null {
  if (!sequenceName) return null;

  // 1. Check manual mappings first
  if (audioMappings[sequenceName]) {
    const mappedFile = audioMappings[sequenceName];
    // Verify file exists
    if (availableAudioFiles.includes(mappedFile)) {
      return mappedFile;
    }

    // Fallback: Try to find the mapped file by normalizing names
    // This handles cases where mapping might have underscores but file has spaces
    const normalizedMapped = normalize(mappedFile);
    for (const audioFile of availableAudioFiles) {
      if (normalize(audioFile) === normalizedMapped) {
        return audioFile;
      }
    }
  }
  
  const baseName = sequenceName.replace(/\.fseq$/i, '');
  
  const normalizedBase = normalize(baseName);
  
  // Try exact match
  for (const audioFile of availableAudioFiles) {
    const audioBase = audioFile.replace(/\.(mp3|wav|ogg|m4a|flac|aac)$/i, '');
    const normalizedAudio = normalize(audioBase);
    
    if (normalizedAudio === normalizedBase) {
      return audioFile;
    }
  }
  
  // Try partial match
  for (const audioFile of availableAudioFiles) {
    const audioBase = audioFile.replace(/\.(mp3|wav|ogg|m4a|flac|aac)$/i, '');
    const normalizedAudio = normalize(audioBase);
    
    if (normalizedBase.includes(normalizedAudio) || normalizedAudio.includes(normalizedBase)) {
      return audioFile;
    }
  }
  
  return null;
}

// Poll FPP status
let lastBroadcastTime = 0;
async function pollFPPStatus() {
  try {
    const response = await fetch(`${FPP_URL}/api/fppd/status`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new Error(`FPP status failed: ${response.status}`);
    }

    const status = await response.json();
    
    const isPlaying = status.status_name === 'playing';
    const currentSequence = status.current_sequence || null;
    const position = parseFloat(status.seconds_played || '0');
    
    // Determine audio file
    let audioFile: string | null = null;
    
    if (currentSequence) {
      // 1. Try media_filename from FPP status if available
      if (status.media_filename && availableAudioFiles.includes(status.media_filename)) {
        audioFile = status.media_filename;
      } 
      // 2. Fallback to mapping/search logic
      else {
        audioFile = findAudioForSequence(currentSequence);
      }
    }

    const pollTimestamp = Date.now();

    const newState: SyncState = {
      isPlaying,
      currentSequence,
      audioFile,
      position,
      timestamp: pollTimestamp,
    };

    const stateChanged = 
      newState.isPlaying !== currentState.isPlaying ||
      newState.currentSequence !== currentState.currentSequence ||
      newState.audioFile !== currentState.audioFile;
    
    const now = pollTimestamp;
    const timeSinceLastBroadcast = now - lastBroadcastTime;
    const shouldBroadcast = stateChanged || (isPlaying && timeSinceLastBroadcast > 2000);
    
    if (shouldBroadcast) {
      currentState = newState;
      broadcast(currentState);
      lastBroadcastTime = now;
    } else {
      currentState.position = position;
      currentState.timestamp = pollTimestamp;
    }
  } catch {
    // Silent error - don't spam console
  }
}

// Broadcast to all SSE clients
function broadcast(data: SyncState) {
  const message = `data: ${JSON.stringify(data)}\n\n`;
  const deadClients: ReadableStreamDefaultController[] = [];
  
  clients.forEach((controller) => {
    try {
      controller.enqueue(message);
    } catch {
      deadClients.push(controller);
    }
  });
  
  deadClients.forEach((client) => clients.delete(client));
}

loadAvailableAudioFiles();
loadMappings();

// Polls FPP every 2 s, but only while a listener is connected
const poller = createLazyPoller({
  intervalMs: 2000,
  hasClients: () => clients.size > 0,
  poll: pollFPPStatus,
  // Don't greet the next listener with a state from hours ago
  onStop: () => {
    currentState = { isPlaying: false, currentSequence: null, audioFile: null, position: 0, timestamp: Date.now() };
    lastBroadcastTime = 0;
  },
});

// Server-Sent Events endpoint
export async function GET(req: NextRequest) {
  // Nobody was listening, so the stored state may be old: refresh it before the first snapshot goes out
  if (!poller.isRunning()) await poller.pollNow();

  const stream = new ReadableStream({
    start(controller) {
      // The visitor may have left while the state was being refreshed; an abort that already
      // happened never fires its listener, so don't register a client that would never be removed
      if (req.signal.aborted) {
        controller.close();
        return;
      }

      clients.add(controller);
      
      const message = `data: ${JSON.stringify(currentState)}\n\n`;
      try {
        controller.enqueue(message);
      } catch {
        // Ignore
      }
      
      const keepAlive = setInterval(() => {
        try {
          controller.enqueue(': ping\n\n');
        } catch {
          clearInterval(keepAlive);
          clients.delete(controller);
        }
      }, 30000);
      
      req.signal.addEventListener('abort', () => {
        clearInterval(keepAlive);
        clients.delete(controller);
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });
    },
  });

  // The client is registered; make sure FPP keeps being polled
  poller.ensureRunning();
  void poller.pollNow();

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

// Reload audio files endpoint
export async function POST() {
  try {
    await loadAvailableAudioFiles();
    await loadMappings();
    return new Response(JSON.stringify({ 
      success: true, 
      audioFiles: availableAudioFiles.length,
      mappings: Object.keys(audioMappings).length
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ 
      success: false, 
      error: String(error) 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
