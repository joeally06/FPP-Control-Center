import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { writeFile, mkdir, unlink } from 'fs/promises';
import { join, resolve, sep } from 'path';
import sharp from 'sharp';
import { getSetting, updateSettings } from '@/lib/settings';
import { isAdminSession } from '@/lib/auth-helpers';
import { isAllowedImage, slideshowFilename } from '@/lib/display-uploads';

// No SVG: it can carry a script that runs when its address is opened. The real format is checked too (isAllowedImage).
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const UPLOAD_DIR = join(process.cwd(), 'public', 'uploads', 'display');

/** An SVG uploaded for this slot before SVG was refused: removed when the slot gets a new picture */
async function removeOldSvg(slot: string): Promise<void> {
  await unlink(join(UPLOAD_DIR, `display-${slot}.svg`)).catch(() => { /* none there */ });
}

/** POST /api/display/upload
 *  Body: multipart/form-data with fields:
 *    file  — the image file
 *    slot  — "logo" | "background" | "slideshow"
 *    index — (slideshow only) position 0-based, or omit to append
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isAdminSession(session)) {
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
    return NextResponse.json({ error: 'File type not allowed. Use JPEG, PNG, GIF or WebP.' }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'File too large (max 5 MB)' }, { status: 400 });
  }

  await mkdir(UPLOAD_DIR, { recursive: true });
  const rawBuffer = Buffer.from(await file.arrayBuffer() as ArrayBuffer);
  // The type above is what the browser said; this is what the file is
  if (!(await isAllowedImage(rawBuffer))) {
    return NextResponse.json({ error: 'File is not a valid JPEG, PNG, GIF or WebP image.' }, { status: 400 });
  }

  // ── Slideshow: append to the images array ──────────────────────────────────
  if (slot === 'slideshow') {
    const existing: string[] = JSON.parse(getSetting('display_slideshow_images') ?? '[]');
    if (existing.length >= 20) {
      return NextResponse.json({ error: 'Maximum 20 slideshow images allowed' }, { status: 400 });
    }
    const croppedBuffer = await sharp(rawBuffer)
      .resize(1920, 1080, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer();
    // A name of its own: the list order lives in the setting, not in the file names
    const filename = slideshowFilename();
    await writeFile(join(UPLOAD_DIR, filename), croppedBuffer);
    const url = `/uploads/display/${filename}`;
    const updated = [...existing, url];
    updateSettings({ display_slideshow_images: JSON.stringify(updated) });
    return NextResponse.json({ url, images: updated });
  }

  // ── Background: 16:9 crop ──────────────────────────────────────────────────
  if (slot === 'background') {
    const croppedBuffer = await sharp(rawBuffer)
      .resize(1920, 1080, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();
    const filename = `display-background.jpg`;
    await writeFile(join(UPLOAD_DIR, filename), croppedBuffer);
    await removeOldSvg(slot);
    return NextResponse.json({ url: `/uploads/display/${filename}` });
  }

  // ── Logo / other: save as-is ───────────────────────────────────────────────
  const ext = file.type.split('/')[1];
  const filename = `display-${slot}.${ext}`;
  await writeFile(join(UPLOAD_DIR, filename), rawBuffer);
  await removeOldSvg(slot);
  return NextResponse.json({ url: `/uploads/display/${filename}` });
}

/** DELETE /api/display/upload?slot=slideshow&index=N — remove one slideshow image */
export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isAdminSession(session)) {
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

  // The remaining photos keep their own files and names
  const remaining = existing.filter((_, i) => i !== idx);
  updateSettings({ display_slideshow_images: JSON.stringify(remaining) });

  return NextResponse.json({ images: remaining });
}
