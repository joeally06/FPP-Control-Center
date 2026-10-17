import { NextRequest, NextResponse } from 'next/server';
import { requireAdminWithRateLimit } from '@/lib/auth-helpers';
import { toErrorMessage } from '@/lib/api-errors';
import db from '@/lib/database';
import {
  deleteThemeAsset,
  getThemeAsset,
  parseAssetTarget,
  processThemeAsset,
  saveThemeAsset,
  ThemeAssetError,
} from '@/lib/theme-assets';

function targetFromQuery(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  return parseAssetTarget(searchParams.get('theme'), searchParams.get('kind'));
}

/** GET /api/theme/asset?theme=christmas&kind=logo[&v=…] — the uploaded image (public) */
export async function GET(request: NextRequest) {
  let target;
  try {
    target = targetFromQuery(request);
  } catch (error) {
    return NextResponse.json({ error: toErrorMessage(error, 'Invalid request') }, { status: 400 });
  }

  const asset = getThemeAsset(db, target.theme, target.kind);
  if (!asset) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // A versioned url never changes content (the version changes with the image), so it can be cached for good
  const versioned = new URL(request.url).searchParams.has('v');
  return new NextResponse(new Uint8Array(asset.data), {
    headers: {
      'Content-Type': asset.mimeType,
      'Content-Length': String(asset.data.length),
      'Cache-Control': versioned ? 'public, max-age=31536000, immutable' : 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/** POST /api/theme/asset — multipart form: theme, kind ("logo" | "badge"), file (admin only) */
export async function POST(request: NextRequest) {
  try {
    await requireAdminWithRateLimit(request);
  } catch (error) {
    return NextResponse.json({ error: toErrorMessage(error, 'Unauthorized') }, { status: 401 });
  }

  try {
    const form = await request.formData();
    const { theme, kind } = parseAssetTarget(form.get('theme'), form.get('kind'));
    const file = form.get('file');
    if (!(file instanceof File)) throw new ThemeAssetError('Choose an image to upload.');

    const asset = await processThemeAsset(Buffer.from(await file.arrayBuffer()), kind);
    saveThemeAsset(db, theme, kind, asset);
    return NextResponse.json({ success: true, theme, kind, width: asset.width, height: asset.height });
  } catch (error) {
    if (error instanceof ThemeAssetError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Error uploading theme image:', error);
    return NextResponse.json({ error: 'Failed to save the image' }, { status: 500 });
  }
}

/** DELETE /api/theme/asset?theme=christmas&kind=badge (admin only) */
export async function DELETE(request: NextRequest) {
  try {
    await requireAdminWithRateLimit(request);
  } catch (error) {
    return NextResponse.json({ error: toErrorMessage(error, 'Unauthorized') }, { status: 401 });
  }

  try {
    const { theme, kind } = targetFromQuery(request);
    return NextResponse.json({ success: true, removed: deleteThemeAsset(db, theme, kind) });
  } catch (error) {
    if (error instanceof ThemeAssetError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Error removing theme image:', error);
    return NextResponse.json({ error: 'Failed to remove the image' }, { status: 500 });
  }
}
