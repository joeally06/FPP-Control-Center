import { NextRequest } from 'next/server';
import { addClient, removeClient } from '@/lib/trivia-state';

// Server-Sent Events endpoint shared by the TV display (/display) and every
// visitor phone (/trivia). No auth — publicly accessible, same shape as
// app/api/display/stream/route.ts.
export async function GET(req: NextRequest) {
  const stream = new ReadableStream({
    start(controller) {
      addClient(controller);

      const keepAlive = setInterval(() => {
        try {
          controller.enqueue(': ping\n\n');
        } catch {
          clearInterval(keepAlive);
          removeClient(controller);
        }
      }, 30_000);

      req.signal.addEventListener('abort', () => {
        clearInterval(keepAlive);
        removeClient(controller);
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
