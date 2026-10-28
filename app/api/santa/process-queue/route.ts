import { NextResponse } from 'next/server';
import {
  getNextQueuedLetter,
  markLetterProcessing,
  markLetterCompleted,
  markLetterFailed,
  requeueLetter,
} from '@/lib/database';
import { generateSantaReply } from '@/lib/ollama-client';
import { sendSantaReply } from '@/lib/email-service';

const MAX_RETRIES = 3;

export const dynamic = 'force-dynamic';

/**
 * GET /api/santa/process-queue
 * Process the Santa letter queue
 * 
 * This endpoint is called by the background queue processor (lib/santa-queue-processor.ts)
 * Requires internal API key for security
 */
export async function GET(request: Request) {
  try {
    // Security: Verify internal API key
    const internalKey = process.env.INTERNAL_API_KEY;
    
    // Prevent usage of default/empty key
    if (!internalKey || internalKey === 'default-internal-key') {
      console.error('[Queue Processor] SECURITY: INTERNAL_API_KEY not configured or using default value');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }
    
    const providedKey = request.headers.get('x-internal-api-key');
    
    if (!providedKey || providedKey !== internalKey) {
      console.error('[Queue Processor] Unauthorized access attempt - invalid API key');
      return NextResponse.json(
        { error: 'Unauthorized - invalid API key' },
        { status: 401 }
      );
    }
    console.log('[Queue Processor] Starting queue processing...');

    // Get the next queued letter
    const letter = getNextQueuedLetter.get() as any;

    if (!letter) {
      console.log('[Queue Processor] No letters in queue');
      return NextResponse.json({
        success: true,
        message: 'Queue is empty',
        processed: false,
      });
    }

    console.log(`[Queue Processor] Processing letter ID: ${letter.id}`);

    // Mark as processing
    markLetterProcessing.run(letter.id);

    try {
      // Generate Santa's reply using Ollama LLM
      const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
      console.log(`[Queue Processor] Generating Santa reply for letter ID: ${letter.id}`);
      
      const santaReply = await generateSantaReply(
        letter.child_name,
        letter.child_age,
        letter.letter_content,
        ollamaUrl
      );

      console.log(`[Queue Processor] Generated reply (${santaReply.length} characters)`);

      // Send email to parent
      console.log(`[Queue Processor] Sending email for letter ID: ${letter.id}`);
      const emailSent = await sendSantaReply({
        parentEmail: letter.parent_email,
        childName: letter.child_name,
        santaReply,
      });

      if (!emailSent) {
        throw new Error('Failed to send email');
      }

      console.log(`[Queue Processor] Email sent successfully for letter ID: ${letter.id}`);

      // Mark as completed
      markLetterCompleted.run(santaReply, letter.id);

      console.log(`[Queue Processor] ✅ Successfully processed letter ID: ${letter.id}`);

      return NextResponse.json({
        success: true,
        message: 'Letter processed successfully',
        processed: true,
        letterId: letter.id,
        childName: letter.child_name,
      });
    } catch (error) {
      // Handle processing errors with retry logic
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const currentRetryCount = letter.retry_count || 0;
      const newRetryCount = currentRetryCount + 1;

      console.error(`[Queue Processor] ❌ Error processing letter ID ${letter.id}:`, errorMessage);
      console.log(`[Queue Processor] Retry count: ${newRetryCount}/${MAX_RETRIES}`);

      if (newRetryCount < MAX_RETRIES) {
        // Requeue for retry
        requeueLetter.run(errorMessage, newRetryCount, letter.id);
        console.log(`[Queue Processor] Letter requeued for retry (attempt ${newRetryCount + 1})`);

        return NextResponse.json({
          success: false,
          message: 'Processing failed, letter requeued for retry',
          processed: false,
          letterId: letter.id,
          retryCount: newRetryCount,
          error: errorMessage,
        }, { status: 500 });
      } else {
        // Max retries reached, mark as failed
        markLetterFailed.run(errorMessage, newRetryCount, letter.id);
        console.log(`[Queue Processor] ⚠️ Letter marked as failed after ${MAX_RETRIES} attempts`);

        return NextResponse.json({
          success: false,
          message: 'Processing failed after maximum retries',
          processed: false,
          letterId: letter.id,
          retryCount: newRetryCount,
          error: errorMessage,
          failed: true,
        }, { status: 500 });
      }
    }
  } catch (error) {
    console.error('[Queue Processor] Fatal error:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Queue processor error',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
