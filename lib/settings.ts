import db from './database';

export interface Setting {
  id: number;
  key: string;
  value: string;
  description: string | null;
  category: string;
  updated_at: string;
}

/**
 * Get a single setting by key
 */
export function getSetting(key: string): string | null {
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value || null;
  } catch (error) {
    console.error(`Error getting setting ${key}:`, error);
    return null;
  }
}

/**
 * Get all settings, optionally filtered by category
 */
export function getSettings(category?: string): Record<string, string> {
  try {
    const query = category
      ? 'SELECT key, value FROM settings WHERE category = ?'
      : 'SELECT key, value FROM settings';
    
    const rows = category
      ? db.prepare(query).all(category) as { key: string; value: string }[]
      : db.prepare(query).all() as { key: string; value: string }[];
    
    return rows.reduce((acc, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {} as Record<string, string>);
  } catch (error) {
    console.error('Error getting settings:', error);
    return {};
  }
}

/**
 * Get all settings with full details
 */
export function getSettingsDetailed(category?: string): Setting[] {
  try {
    const query = category
      ? 'SELECT * FROM settings WHERE category = ? ORDER BY category, key'
      : 'SELECT * FROM settings ORDER BY category, key';
    
    return category
      ? db.prepare(query).all(category) as Setting[]
      : db.prepare(query).all() as Setting[];
  } catch (error) {
    console.error('Error getting detailed settings:', error);
    return [];
  }
}

/**
 * Set a single setting
 */
export function setSetting(key: string, value: string): void {
  try {
    db.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = CURRENT_TIMESTAMP
    `).run(key, value);
  } catch (error) {
    console.error(`Error setting ${key}:`, error);
    throw error;
  }
}

/**
 * Update multiple settings at once (transactional)
 * Only updates the value and updated_at, preserving category and description
 */
export function updateSettings(settings: Record<string, string>): void {
  try {
    // Keys only: setting values can be personal or secret
    console.log('[Settings] Updating settings:', Object.keys(settings).join(', '));
    
    // Use UPDATE instead of INSERT...ON CONFLICT to preserve category and description
    const stmt = db.prepare(`
      UPDATE settings 
      SET value = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE key = ?
    `);

    const transaction = db.transaction((entries: [string, string][]) => {
      for (const [key, value] of entries) {
        console.log(`[Settings] Writing: ${key}`);
        const result = stmt.run(value, key);
        console.log(`[Settings] Changes: ${result.changes}`);
        
        // If setting doesn't exist, create it with default category 'general'
        if (result.changes === 0) {
          console.log(`[Settings] Creating new setting: ${key}`);
          db.prepare(`
            INSERT INTO settings (key, value, category, updated_at)
            VALUES (?, ?, 'general', CURRENT_TIMESTAMP)
          `).run(key, value);
        }
      }
    });

    transaction(Object.entries(settings));
    console.log('[Settings] ✅ Settings updated successfully');
  } catch (error) {
    console.error('Error updating settings:', error);
    throw error;
  }
}

/**
 * Get setting as boolean
 */
export function getSettingBoolean(key: string, defaultValue = false): boolean {
  const value = getSetting(key);
  if (value === null) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Get setting as number
 */
export function getSettingNumber(key: string, defaultValue = 0): number {
  const value = getSetting(key);
  if (value === null) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Get setting as float
 */
export function getSettingFloat(key: string, defaultValue = 0): number {
  const value = getSetting(key);
  if (value === null) return defaultValue;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Delete a setting
 */
export function deleteSetting(key: string): void {
  try {
    db.prepare('DELETE FROM settings WHERE key = ?').run(key);
  } catch (error) {
    console.error(`Error deleting setting ${key}:`, error);
    throw error;
  }
}

/**
 * Check if a setting exists
 */
export function hasSetting(key: string): boolean {
  try {
    const row = db.prepare('SELECT 1 FROM settings WHERE key = ?').get(key);
    return !!row;
  } catch (error) {
    console.error(`Error checking setting ${key}:`, error);
    return false;
  }
}
