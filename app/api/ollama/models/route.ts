import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-helpers';

export const dynamic = 'force-dynamic';

/**
 * Format bytes to human-readable size
 */
function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * GET /api/ollama/models
 * Fetch available models from Ollama server with metadata
 * ADMIN ONLY
 */
export async function GET() {
  try {
    await requireAdmin();

    const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
    
    console.log('[Ollama] Fetching models from:', ollamaUrl);
    
    const response = await fetch(`${ollamaUrl}/api/tags`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('[Ollama] Failed to fetch models:', response.status, response.statusText);
      return NextResponse.json(
        { error: 'Failed to fetch models from Ollama server', models: [] },
        { status: 500 }
      );
    }

    const data = await response.json();
    
    // Extract model names and metadata from response
    // Ollama /api/tags returns { models: [{ name, model, modified_at, size, digest, details }, ...] }
    const models = data.models?.map((model: any) => ({
      name: model.name,
      size: model.size,
      sizeFormatted: formatSize(model.size || 0),
      sizeGB: model.size ? (model.size / (1024 * 1024 * 1024)).toFixed(2) : '0',
      modifiedAt: model.modified_at,
      digest: model.digest,
      family: model.details?.family || 'unknown',
      format: model.details?.format || 'unknown',
      parameterSize: model.details?.parameter_size || 'unknown',
    })) || [];
    
    console.log('[Ollama] Found models:', models.length);

    return NextResponse.json({
      success: true,
      models,
      count: models.length,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Authentication required')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (error instanceof Error && error.message.includes('Admin access required')) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    console.error('[Ollama] Error fetching models:', error);
    return NextResponse.json(
      { error: 'Failed to fetch models', models: [] },
      { status: 500 }
    );
  }
}
