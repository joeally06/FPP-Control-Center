// Santa Letter Queue Processor
// Runs in the background to process queued letters every 90 seconds

const PROCESSING_INTERVAL = 90000; // 90 seconds (1.5 minutes)
let processingInterval: NodeJS.Timeout | null = null;
let isProcessing = false;

async function processQueue() {
  // Prevent overlapping processing runs
  if (isProcessing) {
    console.log('[Queue Processor] Previous processing still running, skipping this interval');
    return;
  }

  isProcessing = true;
  
  try {
    // Call the process-queue API endpoint
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const internalKey = process.env.INTERNAL_API_KEY || 'default-internal-key';
    
    const response = await fetch(`${baseUrl}/api/santa/process-queue`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-api-key': internalKey,
      },
    });

    const result = await response.json();
    
    if (result.processed) {
      console.log('[Queue Processor] ✅ Processed a letter');
    } else if (result.message === 'Queue is empty') {
      console.log('[Queue Processor] Queue is empty - no letters to process');
    } else {
      console.log('[Queue Processor] Processing result:', result.message);
    }
  } catch (error) {
    console.error('[Queue Processor] Error processing queue:', error);
  } finally {
    isProcessing = false;
  }
}

export function startQueueProcessor() {
  if (processingInterval) {
    console.log('[Queue Processor] Already running');
    return;
  }

  console.log(`[Queue Processor] 🎅 Starting Santa letter queue processor (interval: ${PROCESSING_INTERVAL / 1000}s)`);
  
  // Process immediately on startup (after 5 second delay to let server fully start)
  setTimeout(() => {
    processQueue();
  }, 5000);
  
  // Then process every 90 seconds
  processingInterval = setInterval(() => {
    processQueue();
  }, PROCESSING_INTERVAL);
}

export function stopQueueProcessor() {
  if (processingInterval) {
    clearInterval(processingInterval);
    processingInterval = null;
    console.log('[Queue Processor] Stopped');
  }
}

// Auto-start in production/development (server-side only)
// MOVED TO instrumentation.ts to prevent running during build
// if (typeof window === 'undefined') {
//   startQueueProcessor();
// }
