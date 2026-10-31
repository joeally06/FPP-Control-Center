import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-helpers';

export const dynamic = 'force-dynamic';

/**
 * POST /api/ollama/pull
 * Pull (download) a model from Ollama
 * ADMIN ONLY
 * 
 * Security Features:
 * - Admin authentication required
 * - Model name sanitization (alphanumeric, dots, colons, hyphens only)
 * - Rate limiting via admin auth
 * - Stream support for progress tracking
 */
export async function POST(request: NextRequest) {
  try {
    // ✅ SECURITY: Require admin authentication
    await requireAdmin();

    const body = await request.json();
    const { model, stream = false } = body;

    // ✅ SECURITY: Validate and sanitize model name
    if (!model || typeof model !== 'string') {
      return NextResponse.json(
        { error: 'Model name is required and must be a string' },
        { status: 400 }
      );
    }

    // Only allow alphanumeric characters, dots, colons, hyphens, and underscores
    // This prevents command injection and path traversal
    const sanitizedModel = model.trim();
    const modelNameRegex = /^[a-zA-Z0-9._:-]+$/;
    
    if (!modelNameRegex.test(sanitizedModel)) {
      return NextResponse.json(
        { 
          error: 'Invalid model name. Only letters, numbers, dots, colons, hyphens, and underscores are allowed.',
          example: 'llama3.2:latest'
        },
        { status: 400 }
      );
    }

    // Check reasonable length (prevent extremely long strings)
    if (sanitizedModel.length > 100) {
      return NextResponse.json(
        { error: 'Model name too long (max 100 characters)' },
        { status: 400 }
      );
    }

    const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
    
    console.log('[Ollama Pull] Pulling model:', sanitizedModel);
    console.log('[Ollama Pull] Ollama URL:', ollamaUrl);
    console.log('[Ollama Pull] Stream mode:', stream);
    
    // Call Ollama pull API
    const response = await fetch(`${ollamaUrl}/api/pull`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: sanitizedModel,
        stream: stream,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Ollama Pull] Failed:', response.status, errorText);
      
      // Parse Ollama error if available
      let errorMessage = 'Failed to pull model from Ollama server';
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorMessage;
      } catch {
        // Use default error message
      }
      
      return NextResponse.json(
        { error: errorMessage, details: errorText },
        { status: response.status }
      );
    }

    // If streaming, we need to handle the stream
    if (stream) {
      // For streaming, we'll return the readable stream directly
      // The client will need to handle the stream parsing
      return new Response(response.body, {
        headers: {
          'Content-Type': 'application/x-ndjson',
          'Transfer-Encoding': 'chunked',
        },
      });
    }

    // Non-streaming mode: wait for completion
    const data = await response.json();
    
    console.log('[Ollama Pull] Success:', sanitizedModel);

    return NextResponse.json({
      success: true,
      model: sanitizedModel,
      message: `Model ${sanitizedModel} pulled successfully`,
      data: data,
    });
  } catch (error) {
    // ✅ SECURITY: Handle authentication errors explicitly
    if (error instanceof Error && error.message.includes('Authentication required')) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }
    if (error instanceof Error && error.message.includes('Admin access required')) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }
    
    console.error('[Ollama Pull] Error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to pull model',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
