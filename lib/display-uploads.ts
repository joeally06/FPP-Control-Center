import { randomUUID } from 'crypto';
import sharp from 'sharp';

/**
 * A file name no other slideshow photo has. Photos used to be named by how many already existed, so
 * deleting one and uploading again wrote over a different photo that still had that name.
 */
export function slideshowFilename(): string {
  return `display-slideshow-${randomUUID()}.jpg`;
}

const ALLOWED_FORMATS = ['jpeg', 'png', 'gif', 'webp'];

/**
 * Is this really a JPEG, PNG, GIF or WebP picture? Judged from the bytes, not from the type the browser
 * claimed. An SVG (which can carry a script that runs when its address is opened) reports as "svg" and is refused.
 */
export async function isAllowedImage(buffer: Buffer): Promise<boolean> {
  try {
    const { format } = await sharp(buffer).metadata();
    return format !== undefined && ALLOWED_FORMATS.includes(format);
  } catch {
    return false;
  }
}
