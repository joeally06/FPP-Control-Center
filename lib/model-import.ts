import type Database from 'better-sqlite3';

/** One data row of the uploaded sheet: its real spreadsheet row number and its cells by column header */
export interface ModelImportRow {
  rowNumber: number;
  values: Record<string, unknown>;
}

/** The import was refused and nothing changed; `problems` says why, in plain words */
export class ModelImportError extends Error {
  constructor(public readonly problems: string[], message: string) {
    super(message);
    this.name = 'ModelImportError';
  }
}

const MAX_PROBLEMS_SHOWN = 5;

/**
 * Replace every model with the rows of an uploaded sheet, all or nothing: if any row can't be stored,
 * the old models stay exactly as they were.
 */
export function replaceFppModels(db: Database.Database, rows: ModelImportRow[]): { imported: number } {
  if (!rows.some((row) => 'Model Name' in row.values)) {
    throw new ModelImportError(
      ['No "Model Name" column found'],
      'Import cancelled, existing models kept. The sheet has no "Model Name" column (or it is empty); is this the model export?'
    );
  }

  const insertModel = db.prepare(`
    INSERT INTO fpp_models (
      model_name, display_as, description, string_type, string_count,
      node_count, light_count, channels_per_node, channel_count,
      start_channel, start_channel_no, end_channel_no, universe_start_channel,
      controller_name, controller_type, controller_ip, controller_ports,
      protocol, universe_id, universe_channel, controller_channel,
      connection_protocol, connection_attributes, est_current_amps,
      buffer_dimensions
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // One transaction: throwing from inside it undoes the delete and every insert
  const replaceAll = db.transaction((): number => {
    db.prepare('DELETE FROM fpp_models').run();

    const problems: string[] = [];
    let imported = 0;
    for (const { rowNumber, values: row } of rows) {
      try {
        insertModel.run(
          row['Model Name'] || 'Unknown',
          row['Display As'],
          row['Description'],
          row['String Type'],
          row['String Count'],
          row['Node Count'],
          row['Light Count'],
          row['Channels Per Node'],
          row['Channel Count'],
          row['Start Channel'],
          row['Start Channel No'],
          row['End Channel No'],
          row['#Universe(or id):Start Channel'],
          row['Controller Name'],
          row['Controller Type'],
          row['IP'],
          row['Controller Ports'],
          row['Protocol'],
          row['Universe/Id'],
          row['Universe Channel'],
          row['Controller Channel'],
          row['Connection Protocol'],
          row['Connection Attributes'],
          row['Est Current (Amps)'],
          row['Default Buffer W x H']
        );
        imported++;
      } catch (error) {
        problems.push(`Row ${rowNumber}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (problems.length > 0) {
      const shown = problems.slice(0, MAX_PROBLEMS_SHOWN);
      const more = problems.length - shown.length;
      throw new ModelImportError(
        shown,
        `Import cancelled, existing models kept. ${shown.join('; ')}${more > 0 ? `; and ${more} more` : ''}`
      );
    }
    return imported;
  });

  return { imported: replaceAll() };
}
