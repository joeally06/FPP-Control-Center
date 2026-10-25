import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-helpers';
import db from '@/lib/database';
import ExcelJS from 'exceljs';

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (error) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get the uploaded file from FormData
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ 
        error: 'No file uploaded' 
      }, { status: 400 });
    }

    // Validate file type
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      return NextResponse.json({ 
        error: 'Invalid file type. Please upload an Excel file (.xlsx or .xls)' 
      }, { status: 400 });
    }

    // Read file as ArrayBuffer and parse with exceljs
    const bytes = await file.arrayBuffer();

    // Parse Excel file using exceljs
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes);
    const worksheet = workbook.worksheets[0];
    
    if (!worksheet) {
      return NextResponse.json({ 
        error: 'Excel file has no worksheets' 
      }, { status: 400 });
    }

    // Convert worksheet to JSON array
    const data: Record<string, any>[] = [];
    const headers: string[] = [];
    
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        // First row is headers
        row.eachCell((cell, colNumber) => {
          headers[colNumber - 1] = String(cell.value || '');
        });
      } else {
        // Data rows
        const rowData: Record<string, any> = {};
        row.eachCell((cell, colNumber) => {
          const header = headers[colNumber - 1];
          if (header) {
            rowData[header] = cell.value;
          }
        });
        if (Object.keys(rowData).length > 0) {
          data.push(rowData);
        }
      }
    });

    if (data.length === 0) {
      return NextResponse.json({ 
        error: 'Excel file is empty or has no data' 
      }, { status: 400 });
    }

    // Clear existing data
    db.prepare('DELETE FROM fpp_models').run();

    // Insert models
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

    let imported = 0;
    const errors: string[] = [];

    for (const row of data as any[]) {
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
      } catch (error: any) {
        errors.push(`Row ${imported + 1}: ${error.message}`);
      }
    }

    return NextResponse.json({ 
      success: true, 
      imported,
      total: data.length,
      errors: errors.length > 0 ? errors : undefined,
      message: `Successfully imported ${imported} of ${data.length} models`
    });

  } catch (error: any) {
    console.error('Import error:', error);
    return NextResponse.json({ 
      error: error.message || 'Failed to import file'
    }, { status: 500 });
  }
}
