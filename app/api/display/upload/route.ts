import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import sharp from 'sharp';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const UPLOAD_DIR = join(process.cwd(), 'public', 'uploads', 'display');

/** POST /api/display/upload
 *  Body: multipart/form-data with fields:
 *    file  — the image file
 *    slot  — "logo" | "background"
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
  if (!slot || !['logo', 'background'].includes(slot)) {
    return NextResponse.json({ error: 'Invalid slot' }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'File type not allowed. Use JPEG, PNG, GIF, WebP or SVG.' }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'File too large (max 5 MB)' }, { status: 400 });
  }

  // Derive a safe filename: display-logo.ext or display-background.ext
  const ext = file.type.split('/')[1].replace('svg+xml', 'svg');

  await mkdir(UPLOAD_DIR, { recursive: true });

  const rawBuffer = Buffer.from(await file.arrayBuffer() as ArrayBuffer);

  // Background images: centre-crop to 16:9 at 1920×1080 and save as JPEG
  if (slot === 'background' && file.type !== 'image/svg+xml') {
    const croppedBuffer = await sharp(rawBuffer)
      .resize(1920, 1080, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();
    const filename = `display-background.jpg`;
    await writeFile(join(UPLOAD_DIR, filename), croppedBuffer);
    return NextResponse.json({ url: `/uploads/display/${filename}` });
  }

  // All other slots: save as-is
  const filename = `display-${slot}.${ext}`;
  await writeFile(join(UPLOAD_DIR, filename), rawBuffer);

  const url = `/uploads/display/${filename}`;
  return NextResponse.json({ url });
}
