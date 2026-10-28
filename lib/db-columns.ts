import type Database from 'better-sqlite3';

export interface ColumnSpec {
  table: string;
  column: string;
  definition: string;
}

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Adds each column that is missing from its table. Only a column that another process added
 * between our check and our ALTER ("duplicate column name") is ignored; any other failure
 * (locked database, bad definition) is thrown so a missing column is never silent.
 * A table that doesn't exist yet is skipped and reported in `skippedTables`.
 */
export function addMissingColumns(db: Database.Database, specs: ColumnSpec[]): { added: string[]; skippedTables: string[] } {
  const added: string[] = [];
  const skippedTables: string[] = [];

  for (const { table, column, definition } of specs) {
    if (!IDENTIFIER.test(table) || !IDENTIFIER.test(column)) {
      throw new Error(`Invalid table or column name: ${table}.${column}`);
    }

    const existing = db.pragma(`table_info(${table})`) as Array<{ name: string }>;
    if (existing.length === 0) {
      if (!skippedTables.includes(table)) skippedTables.push(table);
      continue;
    }
    if (existing.some((info) => info.name === column)) continue;

    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
      added.push(`${table}.${column}`);
    } catch (error) {
      if (error instanceof Error && /duplicate column name/i.test(error.message)) continue;
      throw error;
    }
  }

  return { added, skippedTables };
}
