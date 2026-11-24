import { NextRequest, NextResponse } from 'next/server';
import { toErrorMessage } from '@/lib/api-errors';
import { requireAdmin } from '@/lib/auth-helpers';
import db from '@/lib/database';
import { ModelImportError, replaceFppModels, type ModelImportRow } from '@/lib/model-import';
import ExcelJS from 'exceljs';

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
  } catch {
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
    const data: ModelImportRow[] = [];
    const headers: string[] = [];
    
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        // First row is headers
        row.eachCell((cell, colNumber) => {
          headers[colNumber - 1] = String(cell.value || '');
        });
      } else {
        // Data rows
        const rowData: Record<string, unknown> = {};
        row.eachCell((cell, colNumber) => {
          const header = headers[colNumber - 1];
          if (header) {
            rowData[header] = cell.value;
          }
        });
        if (Object.keys(rowData).length > 0) {
          data.push({ rowNumber, values: rowData });
        }
      }
    });

    if (data.length === 0) {
      return NextResponse.json({ 
        error: 'Excel file is empty or has no data' 
      }, { status: 400 });
    }

    // Replace the models all at once: if any row can't be stored, the existing models are kept
    let imported: number;
    try {
      ({ imported } = replaceFppModels(db, data));
    } catch (error) {
      if (error instanceof ModelImportError) {
        return NextResponse.json({ error: error.message, problems: error.problems }, { status: 400 });
      }
      throw error;
    }

    return NextResponse.json({
      success: true,
      imported,
      total: data.length,
      message: `Successfully imported ${imported} models`
    });

  } catch (error) {
    console.error('Import error:', error);
    return NextResponse.json({ 
      error: toErrorMessage(error, 'Failed to import file')
    }, { status: 500 });
  }
}
