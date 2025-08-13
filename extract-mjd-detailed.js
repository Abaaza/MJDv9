import pkg from 'xlsx';
const { readFile, utils } = pkg;
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read the Excel file
const workbook = readFile('C:\\Users\\abaza\\Downloads\\MJD-PRICELIST.xlsx');

// Sheets to focus on
const targetSheets = ['Groundworks', 'RC works', 'Drainage', 'External Works', 'Underpinning', 'Services', 'Bldrs Wk & Attdncs'];

// Clean and parse functions
function cleanValue(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string') {
    return value.trim().replace(/\s+/g, ' ').replace(/[""]/g, '"');
  }
  return value;
}

function parseRate(value) {
  if (!value) return 0;
  if (typeof value === 'number') return Math.round(value * 100) / 100;
  const cleaned = String(value).replace(/[£$€,]/g, '').trim();
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : Math.round(parsed * 100) / 100;
}

function extractUnit(desc, row) {
  // Check for explicit unit column
  const unitPatterns = ['m³', 'm3', 'm²', 'm2', 'm', 'nr', 'item', 'sum', 'week', 'day', 'hour', 'hr', 'kg', 'tonne', 'ltr', 'l'];
  
  for (const pattern of unitPatterns) {
    if (row && row.some(cell => String(cell).toLowerCase() === pattern)) {
      return pattern.replace('m3', 'm³').replace('m2', 'm²');
    }
  }
  
  // Extract from description
  const descLower = desc.toLowerCase();
  if (descLower.includes('m3') || descLower.includes('cubic')) return 'm³';
  if (descLower.includes('m2') || descLower.includes('sqm') || descLower.includes('square')) return 'm²';
  if (descLower.includes(' m ') || descLower.includes('linear') || descLower.includes('lin.m')) return 'm';
  if (descLower.includes('/nr') || descLower.includes('each')) return 'nr';
  if (descLower.includes('sum') || descLower.includes('lump')) return 'sum';
  if (descLower.includes('week')) return 'week';
  if (descLower.includes('day')) return 'day';
  if (descLower.includes('hour') || descLower.includes('/hr')) return 'hour';
  if (descLower.includes('kg')) return 'kg';
  if (descLower.includes('tonne') || descLower.includes('ton')) return 'tonne';
  if (descLower.includes('litre') || descLower.includes('ltr')) return 'ltr';
  
  return 'item';
}

// Process specific sheets with construction price items
const allItems = [];
let globalId = 1;

for (const sheetName of targetSheets) {
  if (!workbook.SheetNames.includes(sheetName)) continue;
  
  console.log(`\n📋 Processing: ${sheetName}`);
  console.log('=====================================');
  
  const worksheet = workbook.Sheets[sheetName];
  const data = utils.sheet_to_json(worksheet, { header: 1, defval: null });
  
  let currentCategory = sheetName;
  let currentSubcategory = 'General';
  let itemsFound = 0;
  
  // Process rows looking for patterns
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length < 2) continue;
    
    // Check if first cell is a number (item number)
    const firstCell = row[0];
    const secondCell = cleanValue(row[1]);
    
    // Look for subcategory headers (text in column 1 without item number)
    if (!firstCell && secondCell && typeof secondCell === 'string' && 
        secondCell.length > 3 && !secondCell.toLowerCase().includes('total')) {
      // This might be a subcategory
      if (!row.some(cell => typeof cell === 'number' && cell > 1000)) {
        currentSubcategory = secondCell;
        continue;
      }
    }
    
    // Look for price items (has item number)
    if (typeof firstCell === 'number' && firstCell > 0 && firstCell < 10000) {
      const description = secondCell;
      if (!description || typeof description !== 'string' || description.length < 5) continue;
      
      // Skip totals and summaries
      if (description.toLowerCase().includes('total') || 
          description.toLowerCase().includes('summary')) continue;
      
      // Find unit column (usually column 3 or 4)
      let unit = null;
      let rate = 0;
      
      // Look for unit in columns 2-4
      for (let j = 2; j <= 4 && j < row.length; j++) {
        const cellValue = String(row[j] || '').toLowerCase();
        if (['m3', 'm³', 'm2', 'm²', 'm', 'nr', 'item', 'sum', 'week', 'day', 'hour', 'kg', 'tonne', 'ltr'].includes(cellValue)) {
          unit = cellValue.replace('m3', 'm³').replace('m2', 'm²');
          // Rate is usually in the next column after unit
          if (j + 1 < row.length) {
            rate = parseRate(row[j + 1]);
          }
          break;
        }
      }
      
      // If no unit found, try to extract from description
      if (!unit) {
        unit = extractUnit(description, row);
      }
      
      // If no rate found yet, look for numeric values > 0
      if (rate === 0) {
        for (let j = 3; j < Math.min(10, row.length); j++) {
          const val = parseRate(row[j]);
          if (val > 0 && val < 50000) {
            rate = val;
            break;
          }
        }
      }
      
      // Determine category and subcategory based on description content
      let finalCategory = currentCategory;
      let finalSubcategory = currentSubcategory;
      
      const descLower = description.toLowerCase();
      
      // Refine categories based on keywords
      if (sheetName === 'Groundworks') {
        if (descLower.includes('excavat')) finalSubcategory = 'Excavation';
        else if (descLower.includes('pile') || descLower.includes('piling')) finalSubcategory = 'Piling';
        else if (descLower.includes('fill')) finalSubcategory = 'Filling';
        else if (descLower.includes('disposal') || descLower.includes('cart away')) finalSubcategory = 'Disposal';
        else if (descLower.includes('compact')) finalSubcategory = 'Compaction';
        else if (descLower.includes('support') || descLower.includes('shoring')) finalSubcategory = 'Earthwork Support';
        else if (descLower.includes('membrane') || descLower.includes('dpm')) finalSubcategory = 'Membranes';
      } else if (sheetName === 'RC works') {
        if (descLower.includes('concrete') && !descLower.includes('formwork')) finalSubcategory = 'Concrete';
        else if (descLower.includes('reinforc') || descLower.includes('rebar') || descLower.includes('mesh')) finalSubcategory = 'Reinforcement';
        else if (descLower.includes('formwork') || descLower.includes('shutter')) finalSubcategory = 'Formwork';
        else if (descLower.includes('joint')) finalSubcategory = 'Joints';
        else if (descLower.includes('finish')) finalSubcategory = 'Finishes';
      } else if (sheetName === 'Drainage') {
        if (descLower.includes('pipe')) finalSubcategory = 'Pipes';
        else if (descLower.includes('manhole') || descLower.includes('chamber')) finalSubcategory = 'Manholes';
        else if (descLower.includes('gully') || descLower.includes('gulley')) finalSubcategory = 'Gullies';
        else if (descLower.includes('tank')) finalSubcategory = 'Tanks';
        else if (descLower.includes('pump')) finalSubcategory = 'Pumping';
      } else if (sheetName === 'External Works') {
        if (descLower.includes('paving') || descLower.includes('slab')) finalSubcategory = 'Paving';
        else if (descLower.includes('kerb') || descLower.includes('edging')) finalSubcategory = 'Kerbs & Edgings';
        else if (descLower.includes('fence') || descLower.includes('barrier')) finalSubcategory = 'Fencing';
        else if (descLower.includes('road') || descLower.includes('tarmac') || descLower.includes('asphalt')) finalSubcategory = 'Roads';
        else if (descLower.includes('landscape') || descLower.includes('turf') || descLower.includes('topsoil')) finalSubcategory = 'Landscaping';
      }
      
      const item = {
        id: `mjd-${String(globalId).padStart(5, '0')}`,
        code: `${sheetName.substring(0, 3).toUpperCase()}-${String(firstCell).padStart(3, '0')}`,
        description: description,
        category: finalCategory,
        subcategory: finalSubcategory,
        unit: unit,
        rate: rate,
        source_sheet: sheetName,
        source_row: i + 1,
        item_number: firstCell
      };
      
      allItems.push(item);
      itemsFound++;
      globalId++;
    }
  }
  
  console.log(`✅ Extracted ${itemsFound} items`);
}

// Summary
console.log('\n=====================================');
console.log('📊 EXTRACTION COMPLETE');
console.log('=====================================');
console.log(`Total items extracted: ${allItems.length}\n`);

// Category breakdown
const categoryBreakdown = {};
allItems.forEach(item => {
  const key = `${item.category} > ${item.subcategory}`;
  categoryBreakdown[key] = (categoryBreakdown[key] || 0) + 1;
});

console.log('📁 Items by Category:');
Object.entries(categoryBreakdown)
  .sort((a, b) => b[1] - a[1])
  .forEach(([cat, count]) => {
    console.log(`   ${cat}: ${count} items`);
  });

// Save as CSV
const csvContent = [
  'id,code,description,category,subcategory,unit,rate',
  ...allItems.map(item => [
    item.id,
    item.code,
    `"${item.description.replace(/"/g, '""')}"`,
    item.category,
    item.subcategory,
    item.unit,
    item.rate
  ].join(','))
].join('\n');

const csvPath = path.join(__dirname, 'mjd-pricelist-final.csv');
fs.writeFileSync(csvPath, csvContent);
console.log(`\n✅ CSV saved to: ${csvPath}`);

// Save as JSON
const jsonPath = path.join(__dirname, 'mjd-pricelist-final.json');
fs.writeFileSync(jsonPath, JSON.stringify(allItems, null, 2));
console.log(`✅ JSON saved to: ${jsonPath}`);

// Show samples
console.log('\n📝 Sample Items:');
const samples = allItems.slice(0, 10);
samples.forEach(item => {
  console.log(`\n   ${item.code}: ${item.description}`);
  console.log(`   Category: ${item.category} > ${item.subcategory}`);
  console.log(`   Rate: £${item.rate}/${item.unit}`);
});