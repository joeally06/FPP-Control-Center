import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { writeFile, mkdir, unlink } from 'fs/promises';
import { join, resolve, sep } from 'path';
import sharp from 'sharp';
import { getSetting, updateSettings } from '@/lib/settings';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const UPLOAD_DIR = join(process.cwd(), 'public', 'uploads', 'display');

/** POST /api/display/upload
 *  Body: multipart/form-data with fields:
 *    file  — the image file
 *    slot  — "logo" | "background" | "slideshow"
 *    index — (slideshow only) position 0-based, or omit to append
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const slot = formData.get('slot') as string | null;

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }
  if (!slot || !['logo', 'background', 'slideshow'].includes(slot)) {
    return NextResponse.json({ error: 'Invalid slot' }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'File type not allowed. Use JPEG, PNG, GIF, WebP or SVG.' }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'File too large (max 5 MB)' }, { status: 400 });
  }

  await mkdir(UPLOAD_DIR, { recursive: true });
  const rawBuffer = Buffer.from(await file.arrayBuffer() as ArrayBuffer);

  // ── Slideshow: append to the images array ──────────────────────────────────
  if (slot === 'slideshow') {
    const existing: string[] = JSON.parse(getSetting('display_slideshow_images') ?? '[]');
    if (existing.length >= 20) {
      return NextResponse.json({ error: 'Maximum 20 slideshow images allowed' }, { status: 400 });
    }
    // Name by index to keep them ordered
    const idx = existing.length;
    const croppedBuffer = await sharp(rawBuffer)
      .resize(1920, 1080, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer();
    const filename = `display-slideshow-${idx}.jpg`;
    await writeFile(join(UPLOAD_DIR, filename), croppedBuffer);
    const url = `/uploads/display/${filename}`;
    const updated = [...existing, url];
    updateSettings({ display_slideshow_images: JSON.stringify(updated) });
    return NextResponse.json({ url, images: updated });
  }

  // ── Background: 16:9 crop ──────────────────────────────────────────────────
  if (slot === 'background' && file.type !== 'image/svg+xml') {
    const croppedBuffer = await sharp(rawBuffer)
      .resize(1920, 1080, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();
    const filename = `display-background.jpg`;
    await writeFile(join(UPLOAD_DIR, filename), croppedBuffer);
    return NextResponse.json({ url: `/uploads/display/${filename}` });
  }

  // ── Logo / other: save as-is ───────────────────────────────────────────────
  const ext = file.type.split('/')[1].replace('svg+xml', 'svg');
  const filename = `display-${slot}.${ext}`;
  await writeFile(join(UPLOAD_DIR, filename), rawBuffer);
  return NextResponse.json({ url: `/uploads/display/${filename}` });
}

/** DELETE /api/display/upload?slot=slideshow&index=N — remove one slideshow image */
export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const slot = searchParams.get('slot');
  const indexStr = searchParams.get('index');

  if (slot !== 'slideshow' || indexStr === null) {
    return NextResponse.json({ error: 'Only slideshow slot deletion is supported' }, { status: 400 });
  }

  const idx = parseInt(indexStr, 10);
  const existing: string[] = JSON.parse(getSetting('display_slideshow_images') ?? '[]');
  if (idx < 0 || idx >= existing.length) {
    return NextResponse.json({ error: 'Index out of range' }, { status: 400 });
  }

  // Remove file - only if the stored path really is inside the upload folder
  const filePath = resolve(process.cwd(), 'public', existing[idx].replace(/^\//, ''));
  if (filePath.startsWith(UPLOAD_DIR + sep)) {
    try {
      await unlink(filePath);
    } catch { /* file already gone */ }
  } else {
    console.warn('[Display Upload] Refusing to delete path outside upload dir:', existing[idx]);
  }

  // Rebuild remaining list (re-number files)
  const remaining = existing.filter((_, i) => i !== idx);
  updateSettings({ display_slideshow_images: JSON.stringify(remaining) });

  return NextResponse.json({ images: remaining });
}
