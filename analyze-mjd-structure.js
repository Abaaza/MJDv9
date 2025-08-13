import pkg from 'xlsx';
const { readFile, utils } = pkg;
import fs from 'fs';

// Read the Excel file
const workbook = readFile('C:\\Users\\abaza\\Downloads\\MJD-PRICELIST.xlsx');

console.log('📊 EXCEL FILE STRUCTURE ANALYSIS');
console.log('=====================================\n');

// Analyze each sheet
for (const sheetName of workbook.SheetNames) {
  console.log(`\n📋 SHEET: ${sheetName}`);
  console.log('----------------------------------------');
  
  const worksheet = workbook.Sheets[sheetName];
  const data = utils.sheet_to_json(worksheet, { header: 1, defval: null });
  
  if (data.length === 0) {
    console.log('   ⚠️ Empty sheet');
    continue;
  }

  console.log(`   Total rows: ${data.length}`);
  console.log(`   Total columns: ${Math.max(...data.map(row => row ? row.length : 0))}`);
  
  // Show first 15 rows to understand structure
  console.log('\n   First 15 rows preview:');
  for (let i = 0; i < Math.min(15, data.length); i++) {
    const row = data[i];
    if (!row || row.filter(cell => cell !== null && cell !== '').length === 0) {
      console.log(`   Row ${i + 1}: [empty]`);
      continue;
    }
    
    // Show non-null cells
    const nonNullCells = [];
    row.forEach((cell, idx) => {
      if (cell !== null && cell !== '') {
        const cellValue = typeof cell === 'string' ? 
          cell.substring(0, 50) + (cell.length > 50 ? '...' : '') : 
          cell;
        nonNullCells.push(`Col${idx}: ${cellValue}`);
      }
    });
    
    if (nonNullCells.length > 0) {
      console.log(`   Row ${i + 1}: ${nonNullCells.slice(0, 3).join(' | ')}`);
      if (nonNullCells.length > 3) {
        console.log(`          ... and ${nonNullCells.length - 3} more columns`);
      }
    }
  }
  
  // Look for rows with specific patterns
  console.log('\n   Pattern analysis:');
  let itemRows = 0;
  let priceRows = 0;
  let descriptionRows = 0;
  
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (!row) continue;
    
    const rowStr = row.join(' ').toLowerCase();
    if (rowStr.includes('item') || rowStr.includes('ref')) itemRows++;
    if (row.some(cell => typeof cell === 'number' && cell > 0 && cell < 100000)) priceRows++;
    if (row.some(cell => typeof cell === 'string' && cell.length > 20)) descriptionRows++;
  }
  
  console.log(`   Rows with 'item/ref': ${itemRows}`);
  console.log(`   Rows with numbers (potential prices): ${priceRows}`);
  console.log(`   Rows with long text (descriptions): ${descriptionRows}`);
}