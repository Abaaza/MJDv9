import ExcelJS from 'exceljs';
import { v4 as uuidv4 } from 'uuid';

export interface ParsedBOQItem {
  rowNumber: number;
  description: string;
  quantity?: number;
  unit?: string;
  originalData: Record<string, any>;
  contextHeaders?: string[]; // Category headers above the data row
  sheetName: string;
  rowHeight?: number;
  formatting?: Record<string, any>;
}

export interface SheetParseResult {
  items: ParsedBOQItem[];
  totalRows: number;
  headers: string[];
  sheetName: string;
  contextRows: Array<{
    row: number;
    values: string[];
  }>;
}

export interface ExcelParseResult {
  sheets: SheetParseResult[];
  fileName: string;
  totalItems: number;
}

export interface ProjectMetadata {
  name: string;
  clientName?: string;
  description?: string;
  status?: string;
  totalValue?: number;
  currency?: string;
}

export class ExcelService {
  async parseExcelFile(buffer: Buffer, fileName: string = 'unknown.xlsx'): Promise<ExcelParseResult> {
    console.log(`\n[ExcelService] === EXCEL PARSING START ===`);
    console.log(`[ExcelService] File: ${fileName}`);
    console.log(`[ExcelService] Buffer size: ${buffer?.length || 0} bytes (${((buffer?.length || 0) / 1024 / 1024).toFixed(2)} MB)`);
    
    try {
      if (!buffer || buffer.length === 0) {
        console.error(`[ExcelService] ERROR: Empty file buffer provided`);
        throw new Error('Empty file buffer provided');
      }
      
      if (buffer.length > 50 * 1024 * 1024) { // 50MB limit
        console.error(`[ExcelService] ERROR: File size exceeds 50MB limit`);
        throw new Error('File size exceeds 50MB limit');
      }
      
      const loadStartTime = Date.now();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      const loadEndTime = Date.now();
      
      console.log(`[ExcelService] Workbook loaded in ${loadEndTime - loadStartTime}ms`);
      console.log(`[ExcelService] Number of worksheets: ${workbook.worksheets.length}`);
      
      if (workbook.worksheets.length === 0) {
        console.error(`[ExcelService] ERROR: No worksheets found in Excel file`);
        throw new Error('No worksheets found in Excel file');
      }

    const sheets: SheetParseResult[] = [];
    let totalItems = 0;

    // Process all worksheets
    console.log(`[ExcelService] Processing ${workbook.worksheets.length} worksheets...`);
    
    for (let index = 0; index < workbook.worksheets.length; index++) {
      const worksheet = workbook.worksheets[index];
      console.log(`\n[ExcelService] Processing worksheet ${index + 1}/${workbook.worksheets.length}: "${worksheet.name}"`);
      console.log(`[ExcelService] Worksheet dimensions: ${worksheet.rowCount} rows x ${worksheet.columnCount} columns`);
      
      const parseStartTime = Date.now();
      const sheetResult = await this.parseWorksheet(worksheet);
      const parseEndTime = Date.now();
      
      console.log(`[ExcelService] Worksheet "${worksheet.name}" parsed in ${parseEndTime - parseStartTime}ms`);
      console.log(`[ExcelService] Found ${sheetResult.items.length} items, ${sheetResult.totalRows} total rows`);
      
      if (sheetResult.items.length > 0) {
        sheets.push(sheetResult);
        totalItems += sheetResult.items.length;
        console.log(`[ExcelService] Added ${sheetResult.items.length} items from sheet "${worksheet.name}"`);
      } else {
        console.log(`[ExcelService] Skipping sheet "${worksheet.name}" (no items found)`);
      }
    }

    if (sheets.length === 0) {
      throw new Error('No valid data found in any worksheet');
    }

    console.log(`\n[ExcelService] === EXCEL PARSING COMPLETE ===`);
    console.log(`[ExcelService] Total sheets with data: ${sheets.length}`);
    console.log(`[ExcelService] Total items found: ${totalItems}`);
    console.log(`[ExcelService] Summary by sheet:`);
    sheets.forEach((sheet, idx) => {
      console.log(`[ExcelService]   ${idx + 1}. "${sheet.sheetName}": ${sheet.items.length} items`);
    });
    console.log(`[ExcelService] ===============================\n`);

    return {
      sheets,
      fileName,
      totalItems,
    };
    } catch (error) {
      console.error(`[ExcelService] ERROR during Excel parsing:`, error);
      if (error instanceof Error) {
        throw new Error(`Failed to parse Excel file: ${error.message}`);
      }
      throw new Error('Failed to parse Excel file: Unknown error');
    }
  }

  private async parseWorksheet(worksheet: ExcelJS.Worksheet): Promise<SheetParseResult> {
    console.log(`[ExcelService]   [Sheet: ${worksheet.name}] Starting worksheet parse...`);
    
    const headers: string[] = [];
    const items: ParsedBOQItem[] = [];
    const contextRows: Array<{ row: number; values: string[] }> = [];
    
    // Find the header row (first row with multiple filled cells)
    let headerRowNumber = 1;
    let headerRow: ExcelJS.Row | null = null;
    
    console.log(`[ExcelService]   [Sheet: ${worksheet.name}] Searching for header row (checking first 20 rows)...`);
    
    for (let i = 1; i <= Math.min(worksheet.rowCount, 20); i++) {
      const row = worksheet.getRow(i);
      // Convert row.values to a proper array - it could be an array, sparse array, or object
      const rowValues = Array.isArray(row.values) 
        ? row.values 
        : Object.values(row.values || {});
      const filledCells = rowValues.filter(v => v !== null && v !== undefined && v !== '').length;
      
      if (filledCells >= 3) {
        // Check if this looks like a header row
        const cellValues = rowValues.map(v => v?.toString()?.toLowerCase() || '');
        const hasDescKeyword = cellValues.some(v => 
          v && (v.includes('description') || v.includes('item') || v.includes('particular'))
        );
        
        if (hasDescKeyword || filledCells >= 4) {
          headerRow = row;
          headerRowNumber = i;
          
          console.log(`[ExcelService]   [Sheet: ${worksheet.name}] Found header row at row ${i}`);
          console.log(`[ExcelService]   [Sheet: ${worksheet.name}] Reason: ${hasDescKeyword ? 'Contains description keyword' : `Has ${filledCells} filled cells`}`);
          console.log(`[ExcelService]   [Sheet: ${worksheet.name}] Header values: ${rowValues.filter(v => v).join(', ')}`);
          
          // Store context rows (rows above header)
          for (let j = 1; j < i; j++) {
            const contextRow = worksheet.getRow(j);
            const values = [];
            for (let col = 1; col <= worksheet.columnCount; col++) {
              values.push(contextRow.getCell(col).value?.toString() || '');
            }
            if (values.some(v => v.trim())) {
              contextRows.push({ row: j, values });
            }
          }
          
          if (contextRows.length > 0) {
            console.log(`[ExcelService]   [Sheet: ${worksheet.name}] Found ${contextRows.length} context rows above header`);
          }
          
          break;
        }
      }
    }
    
    if (!headerRow) {
      console.log(`[ExcelService]   [Sheet: ${worksheet.name}] WARNING: No header row found, skipping sheet`);
      return { items: [], totalRows: 0, headers: [], sheetName: worksheet.name, contextRows: [] };
    }
    
    // Get headers - ensure we fill all positions to avoid sparse array
    const maxCol = headerRow.cellCount;
    for (let col = 1; col <= maxCol; col++) {
      const cell = headerRow.getCell(col);
      headers[col - 1] = cell.value?.toString() || `Column ${col}`;
    }

    // Auto-detect columns
    const descriptionColIndex = this.findDescriptionColumn(headers);
    const quantityColIndex = this.findQuantityColumn(headers);
    const unitColIndex = this.findUnitColumn(headers);
    
    console.log(`[ExcelService]   [Sheet: ${worksheet.name}] Column detection:`);
    console.log(`[ExcelService]   [Sheet: ${worksheet.name}]   - Description: ${descriptionColIndex >= 0 ? `Column ${descriptionColIndex + 1} ("${headers[descriptionColIndex]}")` : 'NOT FOUND'}`);
    console.log(`[ExcelService]   [Sheet: ${worksheet.name}]   - Quantity: ${quantityColIndex >= 0 ? `Column ${quantityColIndex + 1} ("${headers[quantityColIndex]}")` : 'NOT FOUND'}`);
    console.log(`[ExcelService]   [Sheet: ${worksheet.name}]   - Unit: ${unitColIndex >= 0 ? `Column ${unitColIndex + 1} ("${headers[unitColIndex]}")` : 'NOT FOUND'}`);

    // Parse data rows
    let totalRows = 0;
    let contextHierarchy: string[] = []; // Store full hierarchy of context headers
    
    worksheet.eachRow((row, rowNumber) => {
      // Skip rows before and including header
      if (rowNumber <= headerRowNumber) return;
      
      // Debug log for every row
      if (rowNumber <= headerRowNumber + 20) { // Log first 20 rows after header
        const descCell = descriptionColIndex >= 0 ? row.getCell(descriptionColIndex + 1) : null;
        const qtyCell = quantityColIndex >= 0 ? row.getCell(quantityColIndex + 1) : null;
        const unitCell = unitColIndex >= 0 ? row.getCell(unitColIndex + 1) : null;
        
        console.log(`[ExcelService]   [Sheet: ${worksheet.name}] Row ${rowNumber} analysis:`);
        console.log(`    Description (Col ${descriptionColIndex + 1}): "${descCell?.value || 'EMPTY'}"`);
        console.log(`    Quantity (Col ${quantityColIndex + 1}): "${qtyCell?.value || 'EMPTY'}" (type: ${typeof qtyCell?.value})`);
        console.log(`    Unit (Col ${unitColIndex + 1}): "${unitCell?.value || 'EMPTY'}"`);
      }
      
      // Check if this is a context/category row
      // Convert row.values to a proper array - it could be an array, sparse array, or object
      const rowValues = Array.isArray(row.values) 
        ? row.values 
        : Object.values(row.values || {});
      const filledCells = rowValues.filter(v => v !== null && v !== undefined && v !== '').length;
      
      // Get description value
      const descValue = descriptionColIndex >= 0 ? row.getCell(descriptionColIndex + 1).value?.toString() || '' : '';
      
      // Parse quantity first to check if this row has a quantity
      const quantity = quantityColIndex >= 0 ? this.parseNumber(row.getCell(quantityColIndex + 1).value) : undefined;
      const unit = unitColIndex >= 0 ? row.getCell(unitColIndex + 1).value?.toString()?.trim() : undefined;
      
      // Check if this row is a context header (no quantity/unit or matches header patterns)
      const hasQuantity = quantity !== undefined && quantity > 0;
      const hasUnit = unit && unit.length > 0;
      const looksLikeHeader = this.isLikelyHeader(descValue);
      
      // IMPORTANT: If a row has a quantity, it's NOT a context header, regardless of description
      if (!hasQuantity && ((filledCells === 1 || filledCells <= 3) && descValue || looksLikeHeader)) {
        // This is a context header
        const headerText = descValue.trim();
        
        // Build originalData for this header row
        const headerOriginalData: Record<string, any> = {};
        const headerFormatting: Record<string, any> = {};
        
        headers.forEach((header, index) => {
          if (!header) return;
          const cell = row.getCell(index + 1);
          headerOriginalData[header] = cell.value;
          
          // Store cell formatting
          if (cell.style) {
            headerFormatting[header] = {
              font: cell.font,
              fill: cell.fill,
              border: cell.border,
              alignment: cell.alignment,
              numFmt: cell.numFmt,
            };
          }
        });
        
        // Determine the level of this header based on various clues
        const isMajorHeader = headerText.match(/^(BILL|SUB-BILL|SECTION|PART|DIVISION)/i) !== null;
        const isSubHeader = headerText.match(/^[A-Z]\d+\s/i) !== null; // Like "D20 Excavating"
        const isMinorHeader = headerText.match(/^(NOTE|Excavating|Filling|Disposal)/i) !== null;
        
        if (isMajorHeader) {
          // Major header - reset hierarchy
          contextHierarchy = [headerText];
        } else if (isSubHeader) {
          // Sub header - keep major headers, replace sub-level
          contextHierarchy = contextHierarchy.filter(h => h.match(/^(BILL|SUB-BILL|SECTION|PART|DIVISION)/i));
          contextHierarchy.push(headerText);
        } else if (isMinorHeader || looksLikeHeader) {
          // Minor header - add to existing hierarchy
          // Remove any previous minor headers at the same level
          contextHierarchy = contextHierarchy.filter(h => 
            h.match(/^(BILL|SUB-BILL|SECTION|PART|DIVISION)/i) || 
            h.match(/^[A-Z]\d+\s/i)
          );
          contextHierarchy.push(headerText);
        } else {
          // Generic header - just add it
          contextHierarchy.push(headerText);
        }
        
        // Also add this header as an item with its context
        items.push({
          rowNumber: rowNumber,
          description: headerText,
          quantity: quantity, // Preserve quantity if it exists (should be undefined for true headers)
          unit: unit, // Preserve unit if it exists
          originalData: headerOriginalData,
          contextHeaders: contextHierarchy.length > 1 ? contextHierarchy.slice(0, -1) : undefined, // Don't include itself
          sheetName: worksheet.name,
          rowHeight: row.height,
          formatting: headerFormatting,
        });
        
        return;
      }
      
      // Skip empty rows
      const hasData = rowValues.some(value => value !== null && value !== undefined && value !== '');
      if (!hasData) return;

      totalRows++;

      const originalData: Record<string, any> = {};
      const formatting: Record<string, any> = {};
      
      headers.forEach((header, index) => {
        if (!header) return;
        const cell = row.getCell(index + 1);
        originalData[header] = cell.value;
        
        // Store cell formatting
        if (cell.style) {
          formatting[header] = {
            font: cell.font,
            fill: cell.fill,
            border: cell.border,
            alignment: cell.alignment,
            numFmt: cell.numFmt,
          };
        }
      });

      // Description already parsed as descValue above
      const description = descValue;
      
      // Quantity and unit already parsed above
      
      // Only add items with valid descriptions
      if (description.trim()) {
        if (!hasQuantity && !hasUnit) {
          // This is likely a context header
          console.log(`[ExcelService]   [Sheet: ${worksheet.name}] Row ${rowNumber} identified as context header: "${description.substring(0, 50)}..."`);
        } else if (hasQuantity) {
          console.log(`[ExcelService]   [Sheet: ${worksheet.name}] Row ${rowNumber} has quantity ${quantity} ${unit || 'NO_UNIT'}: "${description.substring(0, 50)}..."`);
        }
        
        items.push({
          rowNumber: rowNumber,
          description: description.trim(),
          quantity: quantity, // Always preserve the parsed quantity
          unit: unit, // Always preserve the parsed unit
          originalData,
          contextHeaders: contextHierarchy.length > 0 ? [...contextHierarchy] : undefined,
          sheetName: worksheet.name,
          rowHeight: row.height,
          formatting,
        });
      }
    });

    return {
      items,
      totalRows,
      headers,
      sheetName: worksheet.name,
      contextRows,
    };
  }

  async createExcelWithResults(
    originalBuffer: Buffer | null,
    matchResults: any[],
    metadata?: {
      projectInfo?: ProjectMetadata;
      sheets?: string[];
      headers?: string[];
      contextHeaders?: string[];
      preserveOriginal?: boolean; // New flag to preserve original format
    }
  ): Promise<Buffer> {
    console.log(`[ExcelService] Creating Excel with results...`);
    console.log(`[ExcelService] Match results count: ${matchResults?.length || 0}`);
    console.log(`[ExcelService] Has original buffer: ${!!originalBuffer}`);
    console.log(`[ExcelService] Metadata:`, metadata);
    
    try {
      const workbook = new ExcelJS.Workbook();
      
      // Try to load original file if provided
      if (originalBuffer && originalBuffer.length > 0) {
        try {
          await workbook.xlsx.load(originalBuffer);
        } catch (error) {
          console.warn('Failed to load original Excel file, creating new one');
        }
      }
      
      // If preserveOriginal flag is set, only update rate column in original file
      if (metadata?.preserveOriginal && originalBuffer && workbook.worksheets.length > 0) {
        console.log('[ExcelService] Preserving original Excel format - only updating rate column');
        
        // Create a map of results by row number for quick lookup
        const resultsByRow = new Map();
        matchResults.forEach(result => {
          resultsByRow.set(result.rowNumber, result);
        });
        
        // Iterate through all worksheets
        workbook.worksheets.forEach(worksheet => {
          console.log(`[ExcelService] Processing worksheet: ${worksheet.name}`);
          
          // Find the rate column - look for headers containing 'rate', 'price', 'cost', etc.
          let rateColumnIndex = -1;
          const headerRow = worksheet.getRow(1); // Assume first row has headers
          
          // Search for rate column in first 20 rows (in case headers aren't in row 1)
          for (let rowNum = 1; rowNum <= Math.min(20, worksheet.rowCount); rowNum++) {
            const row = worksheet.getRow(rowNum);
            let foundRateCol = false;
            
            row.eachCell((cell, colNumber) => {
              const cellValue = cell.value?.toString()?.toLowerCase() || '';
              if (cellValue.includes('rate') || cellValue.includes('price') || cellValue.includes('cost')) {
                rateColumnIndex = colNumber;
                foundRateCol = true;
                console.log(`[ExcelService] Found rate column at column ${colNumber} (${cellValue}) in row ${rowNum}`);
              }
            });
            
            if (foundRateCol) break;
          }
          
          // If no rate column found, skip this worksheet
          if (rateColumnIndex === -1) {
            console.log(`[ExcelService] No rate column found in worksheet ${worksheet.name}, skipping`);
            return;
          }
          
          // Update rates for matched rows
          worksheet.eachRow((row, rowNumber) => {
            const result = resultsByRow.get(rowNumber);
            if (result && result.matchedRate !== undefined) {
              // Check if this is a context header (no quantity)
              const isContextHeader = result.matchMethod === 'CONTEXT' || 
                                    (!result.originalQuantity || result.originalQuantity === 0);
              
              // Skip context headers - don't update their rate cells
              if (isContextHeader) {
                console.log(`[ExcelService] Skipping rate update for context header at row ${rowNumber}`);
                return;
              }
              
              const rateCell = row.getCell(rateColumnIndex);
              
              // Preserve the original cell formatting
              const originalFormat = rateCell.numFmt;
              const originalFont = rateCell.font;
              const originalFill = rateCell.fill;
              const originalBorder = rateCell.border;
              const originalAlignment = rateCell.alignment;
              
              // Update only the value
              rateCell.value = result.matchedRate;
              
              // Restore formatting
              if (originalFormat) rateCell.numFmt = originalFormat;
              if (originalFont) rateCell.font = originalFont;
              if (originalFill) rateCell.fill = originalFill;
              if (originalBorder) rateCell.border = originalBorder;
              if (originalAlignment) rateCell.alignment = originalAlignment;
              
              console.log(`[ExcelService] Updated rate for row ${rowNumber}: ${result.matchedRate}`);
            }
          });
        });
        
        // Return the buffer without any other modifications
        const buffer = await workbook.xlsx.writeBuffer();
        const resultBuffer = Buffer.from(buffer);
        console.log(`[ExcelService] Excel file created with preserved format, size: ${resultBuffer.length} bytes`);
        return resultBuffer;
      }
      
      // If no worksheets exist, create a new one
      if (workbook.worksheets.length === 0) {
        workbook.addWorksheet('Results');
      }

      // Add project info sheet if provided
      if (metadata?.projectInfo) {
        // Add worksheet at the beginning using splice
        const projectSheet = workbook.addWorksheet('Project Summary');
        // Move the worksheet to the beginning
        const worksheetIndex = workbook.worksheets.indexOf(projectSheet);
        if (worksheetIndex > 0) {
          workbook.worksheets.splice(worksheetIndex, 1);
          workbook.worksheets.unshift(projectSheet);
        }
        
        // Add title
        projectSheet.getCell('A1').value = 'Project Summary';
        projectSheet.getCell('A1').font = { bold: true, size: 16 };
        projectSheet.mergeCells('A1:B1');
        
        // Add project details
        const projectData = [
          ['Project Name:', metadata.projectInfo.name],
          ['Client:', metadata.projectInfo.clientName || 'N/A'],
          ['Description:', metadata.projectInfo.description || 'N/A'],
          ['Status:', metadata.projectInfo.status || 'N/A'],
          ['Total Value:', `${metadata.projectInfo.currency || 'USD'} ${metadata.projectInfo.totalValue?.toLocaleString() || '0'}`],
          ['Generated Date:', new Date().toLocaleDateString()],
        ];
        
        projectData.forEach((row, index) => {
          const rowNum = index + 3;
          projectSheet.getCell(`A${rowNum}`).value = row[0];
          projectSheet.getCell(`A${rowNum}`).font = { bold: true };
          projectSheet.getCell(`B${rowNum}`).value = row[1];
        });
        
        // Style the project sheet
        projectSheet.getColumn('A').width = 20;
        projectSheet.getColumn('B').width = 50;
        
        // Add border around data
        const lastRow = projectData.length + 2;
        for (let row = 1; row <= lastRow; row++) {
          for (let col = 1; col <= 2; col++) {
            const cell = projectSheet.getCell(row, col);
            cell.border = {
              top: { style: 'thin' },
              left: { style: 'thin' },
              bottom: { style: 'thin' },
              right: { style: 'thin' }
            };
          }
        }
      }

      // Group results by sheet name
      console.log(`[ExcelService] Grouping results by sheet...`);
      const resultsBySheet = matchResults.reduce((acc, result) => {
        const sheetName = result.sheetName || workbook.worksheets[0]?.name || 'Sheet1';
        if (!acc[sheetName]) acc[sheetName] = [];
        acc[sheetName].push(result);
        return acc;
      }, {} as Record<string, any[]>);
      
      console.log(`[ExcelService] Results grouped into ${Object.keys(resultsBySheet).length} sheets:`, 
        Object.entries(resultsBySheet).map(([sheet, results]) => `${sheet}: ${(results as any[]).length} items`));

      // Process each worksheet that has results
      for (const [sheetName, sheetResults] of Object.entries(resultsBySheet) as [string, any[]][]) {
        let worksheet = workbook.getWorksheet(sheetName);
        
        // If worksheet doesn't exist, create it
        if (!worksheet) {
          worksheet = workbook.addWorksheet(sheetName);
          
          // Add headers if we have them
          if (metadata?.headers && metadata.headers.length > 0) {
            const headerRow = worksheet.getRow(1);
            metadata.headers.forEach((header, index) => {
              headerRow.getCell(index + 1).value = header;
            });
            headerRow.font = { bold: true };
            headerRow.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFE0E0E0' },
            };
          }
        }

        // Find the header row in this sheet
        let headerRowNum = 1;
        if (originalBuffer) {
          for (let i = 1; i <= Math.min(worksheet.rowCount, 20); i++) {
            const row = worksheet.getRow(i);
            const cellValues = [];
            row.eachCell((cell) => {
              cellValues.push(cell.value?.toString()?.toLowerCase() || '');
            });
            if (cellValues.some(v => v && (v.includes('description') || v.includes('item')))) {
              headerRowNum = i;
              break;
            }
          }
        }

        // Add new columns for matched data
        const lastCol = worksheet.columnCount + 1;
        worksheet.getCell(headerRowNum, lastCol).value = 'Matched Code';
        worksheet.getCell(headerRowNum, lastCol + 1).value = 'Matched Description';
        worksheet.getCell(headerRowNum, lastCol + 2).value = 'Unit Rate';
        worksheet.getCell(headerRowNum, lastCol + 3).value = 'Total Price';
        worksheet.getCell(headerRowNum, lastCol + 4).value = 'Confidence %';
        worksheet.getCell(headerRowNum, lastCol + 5).value = 'Notes';

        // Style the header row
        const headerRow = worksheet.getRow(headerRowNum);
        headerRow.font = { bold: true };
        headerRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE0E0E0' },
        };

        // Add match results for this sheet
        sheetResults.forEach((result) => {
          const row = originalBuffer 
            ? worksheet!.getRow(result.rowNumber)
            : worksheet!.addRow(result.originalRowData || {});
          
          // Preserve row height if available
          if (result.rowHeight) {
            row.height = result.rowHeight;
          }
          
          // Check if this is a context header (no quantity)
          const isContextHeader = result.matchMethod === 'CONTEXT' || 
                                (!result.originalQuantity || result.originalQuantity === 0);
          
          if (!isContextHeader) {
            // Only add match results for actual items with quantities
            row.getCell(lastCol).value = result.matchedCode || '';
            row.getCell(lastCol + 1).value = result.matchedDescription || '';
            row.getCell(lastCol + 2).value = result.matchedRate || 0;
            row.getCell(lastCol + 3).value = result.totalPrice || 0;
            row.getCell(lastCol + 4).value = result.confidence ? Math.round(result.confidence * 100) : 0;
            row.getCell(lastCol + 5).value = result.notes || '';
            
            // Apply conditional formatting based on confidence
            const confidenceCell = row.getCell(lastCol + 4);
            const confidence = result.confidence || 0;
            
            if (confidence >= 0.8) {
              confidenceCell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF90EE90' }, // Light green
              };
            } else if (confidence >= 0.6) {
              confidenceCell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFFFFFE0' }, // Light yellow
              };
            } else {
              confidenceCell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFFFB6C1' }, // Light red
              };
            }
          }
          // For context headers, we don't add any match data - the row remains as-is
          // This preserves the original formatting and doesn't add misleading data
        });

        // Auto-fit columns
        worksheet.columns.forEach((column) => {
          let maxLength = 0;
          column.eachCell({ includeEmpty: true }, (cell) => {
            const columnLength = cell.value ? cell.value.toString().length : 10;
            if (columnLength > maxLength) {
              maxLength = columnLength;
            }
          });
          column.width = Math.min(maxLength + 2, 50);
        });
      }

      // Generate buffer
      const buffer = await workbook.xlsx.writeBuffer();
      return Buffer.from(buffer);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to create Excel with results: ${error.message}`);
      }
      throw new Error('Failed to create Excel with results: Unknown error');
    }
  }

  private findDescriptionColumn(headers: string[]): number {
    const descriptionKeywords = ['description', 'desc', 'item', 'particular', 'work', 'activity'];
    
    for (let i = 0; i < headers.length; i++) {
      if (!headers[i]) continue;
      const header = headers[i].toString().toLowerCase();
      if (descriptionKeywords.some(keyword => header.includes(keyword))) {
        return i;
      }
    }
    
    // Default to first column if no description column found
    return 0;
  }

  private findQuantityColumn(headers: string[]): number {
    const quantityKeywords = ['quantity', 'qty', 'amount', 'volume'];
    
    for (let i = 0; i < headers.length; i++) {
      if (!headers[i]) continue;
      const header = headers[i].toString().toLowerCase();
      if (quantityKeywords.some(keyword => header.includes(keyword))) {
        return i;
      }
    }
    
    return -1;
  }

  private findUnitColumn(headers: string[]): number {
    const unitKeywords = ['unit', 'uom', 'measure'];
    
    for (let i = 0; i < headers.length; i++) {
      if (!headers[i]) continue;
      const header = headers[i].toString().toLowerCase();
      if (unitKeywords.some(keyword => header.includes(keyword))) {
        return i;
      }
    }
    
    return -1;
  }

  private parseNumber(value: any): number | undefined {
    const originalValue = value;
    
    if (value === null || value === undefined || value === '') {
      console.log(`[parseNumber] Rejected null/undefined/empty value: ${value}`);
      return undefined;
    }
    
    if (typeof value === 'number') {
      const result = value > 0 ? value : undefined;
      if (!result) {
        console.log(`[parseNumber] Rejected non-positive number: ${value}`);
      }
      return result;
    }
    
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed === '' || trimmed === '-' || trimmed.toLowerCase() === 'n/a') {
        console.log(`[parseNumber] Rejected string value: "${originalValue}"`);
        return undefined;
      }
      
      const parsed = parseFloat(trimmed.replace(/,/g, ''));
      if (isNaN(parsed)) {
        console.log(`[parseNumber] Failed to parse string as number: "${originalValue}"`);
        return undefined;
      }
      if (parsed <= 0) {
        console.log(`[parseNumber] Rejected non-positive parsed value: ${parsed} from "${originalValue}"`);
        return undefined;
      }
      return parsed;
    }
    
    console.log(`[parseNumber] Rejected unknown type: ${typeof value}, value: ${value}`);
    return undefined;
  }
  
  private isLikelyHeader(description: string): boolean {
    const headerPatterns = [
      /^(section|chapter|part|bill|sub-bill|category|group|division|note|description)[\s:]/i,
      /^[A-Z][0-9]+\s/,  // Like "D20 Excavating"
      /^[0-9]+\.[0-9]+\s+[A-Z]/,  // Like "2.1 GENERAL"
      /^(excavat|fill|disposal|earthwork|groundwork|substructure|superstructure|roof|external|internal|finish|service|prelim)/i,
      /(note|not measured|pricing point|risk item|provisional|refer to|see also|include|exclude)/i,
      /^(the following|all prices|rates shall|contractor shall|work includes)/i
    ];
    
    return headerPatterns.some(pattern => pattern.test(description));
  }
}

// Export singleton instance for consistency
export const excelService = new ExcelService();