const ExcelJS = require('exceljs');
const path = require('path');

async function analyzePriceListStructure() {
  console.log('\n===============================================');
  console.log('   MJD PRICE LIST STRUCTURE ANALYSIS');
  console.log('===============================================\n');

  const workbook = new ExcelJS.Workbook();
  const filePath = 'C:\\Users\\abaza\\Downloads\\MJD-PRICELIST.xlsx';
  
  try {
    await workbook.xlsx.readFile(filePath);
    
    console.log(`📁 File: ${path.basename(filePath)}`);
    console.log(`📊 Total Sheets: ${workbook.worksheets.length}\n`);
    
    // Analyze each worksheet
    for (const worksheet of workbook.worksheets) {
      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`📋 Sheet: "${worksheet.name}"`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      
      // Skip empty or setup sheets
      if (worksheet.rowCount === 0) {
        console.log('   [Empty sheet - skipping]');
        continue;
      }
      
      // Find header row
      let headerRow = null;
      let headerRowNum = 0;
      let columnMap = {};
      
      for (let rowNum = 1; rowNum <= Math.min(20, worksheet.rowCount); rowNum++) {
        const row = worksheet.getRow(rowNum);
        const values = [];
        
        row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
          values.push({ col: colNumber, value: cell.value });
        });
        
        // Check if this looks like a header row
        const hasHeaders = values.some(v => {
          const val = String(v.value).toLowerCase();
          return val.includes('item') || val.includes('description') || 
                 val.includes('unit') || val.includes('rate') || val.includes('price');
        });
        
        if (hasHeaders) {
          headerRow = row;
          headerRowNum = rowNum;
          
          // Map column positions
          values.forEach(({ col, value }) => {
            const val = String(value).toLowerCase();
            if (val.includes('item') || val.includes('code') || val.includes('ref')) {
              columnMap.code = col;
            }
            if (val.includes('description') || val.includes('desc')) {
              columnMap.description = col;
            }
            if (val.includes('unit')) {
              columnMap.unit = col;
            }
            if (val.includes('rate') || val.includes('price')) {
              columnMap.rate = col;
            }
            if (val.includes('labor')) {
              columnMap.labor = col;
            }
            if (val.includes('material')) {
              columnMap.material = col;
            }
          });
          break;
        }
      }
      
      if (!headerRow) {
        console.log('   ⚠️  No header row found');
        continue;
      }
      
      console.log(`   📍 Header Row: ${headerRowNum}`);
      console.log(`   📊 Column Mapping:`);
      Object.entries(columnMap).forEach(([key, col]) => {
        const letter = getColumnLetter(col);
        console.log(`      - ${key}: Column ${letter} (${col})`);
      });
      
      // Count data rows with rates
      let dataRowCount = 0;
      let formulaCount = 0;
      let sampleRows = [];
      
      for (let rowNum = headerRowNum + 1; rowNum <= worksheet.rowCount; rowNum++) {
        const row = worksheet.getRow(rowNum);
        
        // Check if rate column has value
        if (columnMap.rate) {
          const rateCell = row.getCell(columnMap.rate);
          if (rateCell.value || rateCell.formula) {
            dataRowCount++;
            
            if (rateCell.formula) {
              formulaCount++;
            }
            
            // Collect sample rows
            if (sampleRows.length < 3) {
              const code = columnMap.code ? row.getCell(columnMap.code).value : '';
              const desc = columnMap.description ? row.getCell(columnMap.description).value : '';
              const unit = columnMap.unit ? row.getCell(columnMap.unit).value : '';
              const rate = rateCell.value || rateCell.result;
              const formula = rateCell.formula;
              
              if (desc) {
                sampleRows.push({
                  row: rowNum,
                  code: String(code || '').substring(0, 20),
                  description: String(desc).substring(0, 50),
                  unit: String(unit || ''),
                  rate: rate,
                  formula: formula,
                  cellRef: `${getColumnLetter(columnMap.rate)}${rowNum}`
                });
              }
            }
          }
        }
      }
      
      console.log(`\n   📈 Statistics:`);
      console.log(`      - Data Rows: ${dataRowCount}`);
      console.log(`      - Formulas: ${formulaCount}`);
      console.log(`      - Total Rows: ${worksheet.rowCount}`);
      
      if (sampleRows.length > 0) {
        console.log(`\n   📝 Sample Data:`);
        sampleRows.forEach(sample => {
          console.log(`      Row ${sample.row} [${sample.cellRef}]:`);
          console.log(`         Code: ${sample.code}`);
          console.log(`         Desc: ${sample.description}...`);
          console.log(`         Unit: ${sample.unit}`);
          console.log(`         Rate: ${sample.rate}`);
          if (sample.formula) {
            console.log(`         Formula: ${sample.formula}`);
          }
        });
      }
    }
    
    console.log('\n\n===============================================');
    console.log('   ANALYSIS COMPLETE');
    console.log('===============================================\n');
    
  } catch (error) {
    console.error('Error reading Excel file:', error);
  }
}

function getColumnLetter(col) {
  let letter = '';
  while (col > 0) {
    const mod = (col - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    col = Math.floor((col - mod) / 26);
  }
  return letter;
}

analyzePriceListStructure();