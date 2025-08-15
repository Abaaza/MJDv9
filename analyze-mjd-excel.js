/**
 * Analyze MJD-PRICELIST.xlsx structure
 */

import ExcelJS from 'exceljs';
import fs from 'fs';

const EXCEL_FILE = './MJD-PRICELIST.xlsx';

async function analyzeExcel() {
  try {
    console.log('Analyzing MJD-PRICELIST.xlsx structure...\n');
    
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(EXCEL_FILE);
    
    console.log(`Total sheets: ${workbook.worksheets.length}\n`);
    
    workbook.worksheets.forEach((worksheet, index) => {
      console.log(`\n=== Sheet ${index + 1}: ${worksheet.name} ===`);
      console.log(`Rows: ${worksheet.rowCount}`);
      console.log(`Columns: ${worksheet.columnCount}`);
      
      // Check first 10 rows
      console.log('\nFirst 10 rows preview:');
      let rowsShown = 0;
      worksheet.eachRow((row, rowNumber) => {
        if (rowsShown >= 10) return;
        
        const values = row.values.slice(1); // Remove first empty element
        const nonEmpty = values.filter(v => v !== null && v !== undefined && String(v).trim() !== '');
        
        if (nonEmpty.length > 0) {
          console.log(`Row ${rowNumber}:`);
          values.forEach((value, index) => {
            if (value !== null && value !== undefined && String(value).trim() !== '') {
              console.log(`  Col ${index + 1}: ${String(value).substring(0, 50)}${String(value).length > 50 ? '...' : ''}`);
            }
          });
          rowsShown++;
        }
      });
      
      // Look for potential headers
      console.log('\nPotential headers:');
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber > 20) return; // Only check first 20 rows
        
        const values = row.values.slice(1);
        const hasHeaders = values.some(v => {
          const str = String(v || '').toLowerCase();
          return str.includes('description') || str.includes('item') || 
                 str.includes('unit') || str.includes('rate') ||
                 str.includes('price') || str.includes('code');
        });
        
        if (hasHeaders) {
          console.log(`Row ${rowNumber} might be headers:`);
          values.forEach((value, index) => {
            if (value) {
              console.log(`  ${index + 1}: ${value}`);
            }
          });
        }
      });
    });
    
    console.log('\n=== Analysis Complete ===');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

analyzeExcel();