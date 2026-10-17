// Seasonal logos and round badges uploaded on Theme Settings, stored in the theme_assets table (migration 021).
// Uploads are decoded and re-encoded to WebP here, so whatever the admin sends, only a plain raster image is ever served.

import type Database from 'better-sqlite3';
import sharp from 'sharp';
import {
  getAllThemes,
  isThemeId,
  NO_ASSETS,
  type SeasonAssets,
  type ThemeAssetKind,
  type ThemeId,
} from '@/lib/themes/theme-config';

export const THEME_ASSET_KINDS: readonly ThemeAssetKind[] = ['logo', 'badge'];
export const MAX_THEME_ASSET_BYTES = 5 * 1024 * 1024;
const ALLOWED_FORMATS = ['jpeg', 'png', 'webp'];
const LOGO_MAX_WIDTH = 1600;
const BADGE_SIZE = 256;

/** A problem with the request or the file; the message is safe to show the admin */
export class ThemeAssetError extends Error {}

export function isThemeAssetKind(value: unknown): value is ThemeAssetKind {
  return typeof value === 'string' && (THEME_ASSET_KINDS as readonly string[]).includes(value);
}

export function parseAssetTarget(theme: unknown, kind: unknown): { theme: ThemeId; kind: ThemeAssetKind } {
  if (!isThemeId(theme)) throw new ThemeAssetError('Unknown theme.');
  if (!isThemeAssetKind(kind)) throw new ThemeAssetError('Unknown image type. Use "logo" or "badge".');
  return { theme, kind };
}

export interface ProcessedThemeAsset {
  data: Buffer;
  mimeType: 'image/webp';
  width: number;
  height: number;
}

/** Logo: up to 1600 px wide. Badge: 256 px square, cropped from the centre. Both WebP, rotated upright, metadata stripped. */
export async function processThemeAsset(input: Buffer, kind: ThemeAssetKind): Promise<ProcessedThemeAsset> {
  if (input.length === 0) throw new ThemeAssetError('The file is empty.');
  if (input.length > MAX_THEME_ASSET_BYTES) throw new ThemeAssetError('The image is larger than 5 MB.');

  let format: string | undefined;
  try {
    format = (await sharp(input).metadata()).format;
  } catch {
    throw new ThemeAssetError("That file couldn't be read as an image.");
  }
  if (!format || !ALLOWED_FORMATS.includes(format)) throw new ThemeAssetError('Use a JPEG, PNG or WebP image.');

  try {
    const image = sharp(input).rotate();
    const sized = kind === 'logo'
      ? image.resize({ width: LOGO_MAX_WIDTH, withoutEnlargement: true })
      : image.resize(BADGE_SIZE, BADGE_SIZE, { fit: 'cover' });
    const { data, info } = await sized.webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
    return { data, mimeType: 'image/webp', width: info.width, height: info.height };
  } catch {
    throw new ThemeAssetError("That file couldn't be read as an image.");
  }
}

export function saveThemeAsset(db: Database.Database, theme: ThemeId, kind: ThemeAssetKind, asset: ProcessedThemeAsset): void {
  db.prepare(`
    INSERT INTO theme_assets (theme_id, kind, mime_type, width, height, data, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(theme_id, kind) DO UPDATE SET
      mime_type = excluded.mime_type, width = excluded.width, height = excluded.height,
      data = excluded.data, updated_at = CURRENT_TIMESTAMP
  `).run(theme, kind, asset.mimeType, asset.width, asset.height, asset.data);
}

export function getThemeAsset(db: Database.Database, theme: ThemeId, kind: ThemeAssetKind): { mimeType: string; data: Buffer } | null {
  const row = db.prepare('SELECT mime_type, data FROM theme_assets WHERE theme_id = ? AND kind = ?').get(theme, kind) as
    | { mime_type: string; data: Buffer }
    | undefined;
  return row ? { mimeType: row.mime_type, data: row.data } : null;
}

export function deleteThemeAsset(db: Database.Database, theme: ThemeId, kind: ThemeAssetKind): boolean {
  return db.prepare('DELETE FROM theme_assets WHERE theme_id = ? AND kind = ?').run(theme, kind).changes > 0;
}

/** What is uploaded for every theme, without the image bytes. The version in each url changes whenever the image does. */
export function listThemeAssets(db: Database.Database): Record<ThemeId, SeasonAssets> {
  const result = Object.fromEntries(getAllThemes().map((t) => [t.id, { ...NO_ASSETS }])) as Record<ThemeId, SeasonAssets>;
  const rows = db.prepare('SELECT theme_id, kind, width, height, updated_at, length(data) AS bytes FROM theme_assets').all() as {
    theme_id: string;
    kind: string;
    width: number;
    height: number;
    updated_at: string;
    bytes: number;
  }[];
  for (const row of rows) {
    if (!isThemeId(row.theme_id) || !isThemeAssetKind(row.kind)) continue;
    const version = `${String(row.updated_at).replace(/\D/g, '')}-${row.bytes}`;
    result[row.theme_id][row.kind] = {
      url: `/api/theme/asset?theme=${row.theme_id}&kind=${row.kind}&v=${version}`,
      width: row.width,
      height: row.height,
    };
  }
  return result;
}
