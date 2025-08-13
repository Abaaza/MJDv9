import pkg from 'xlsx';
const { utils, writeFile } = pkg;
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read the maximum extraction JSON
const jsonPath = path.join(__dirname, 'mjd-pricelist-maximum.json');
const items = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

console.log(`📊 Preparing ${items.length} items for import...`);

// Prepare data for Excel with proper schema
const excelData = items.map((item, index) => ({
  // Use the ID from extraction or generate new one
  id: item.id || `MJD-${String(index + 1).padStart(6, '0')}`,
  code: item.code || `ITEM-${String(index + 1).padStart(4, '0')}`,
  description: item.description,
  category: item.category || 'General Construction',
  subcategory: item.subcategory || 'General',
  unit: item.unit || 'item',
  rate: item.rate || 0,
  // Additional fields for better matching
  keywords: generateKeywords(item.description).join(','),
  material_type: extractMaterialType(item.description),
  work_type: item.subcategory,
  remark: `Source: ${item.source_sheet || 'MJD Pricelist'}`
}));

// Generate keywords from description
function generateKeywords(desc) {
  if (!desc) return [];
  const words = desc.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3);
  
  // Get unique important words
  const stopWords = ['with', 'from', 'that', 'this', 'have', 'been', 'will', 'than', 'into', 'only'];
  return [...new Set(words.filter(w => !stopWords.includes(w)))].slice(0, 10);
}

// Extract material type from description
function extractMaterialType(desc) {
  const d = desc.toLowerCase();
  if (d.includes('concrete')) return 'Concrete';
  if (d.includes('steel') || d.includes('rebar')) return 'Steel';
  if (d.includes('brick')) return 'Brick';
  if (d.includes('block')) return 'Block';
  if (d.includes('timber') || d.includes('wood')) return 'Timber';
  if (d.includes('stone')) return 'Stone';
  if (d.includes('glass')) return 'Glass';
  if (d.includes('plastic') || d.includes('pvc')) return 'Plastic';
  if (d.includes('copper')) return 'Copper';
  if (d.includes('aluminium')) return 'Aluminium';
  return '';
}

// Create workbook
const wb = utils.book_new();
const ws = utils.json_to_sheet(excelData);

// Set column widths for better readability
const colWidths = [
  { wch: 15 }, // id
  { wch: 12 }, // code
  { wch: 60 }, // description
  { wch: 20 }, // category
  { wch: 20 }, // subcategory
  { wch: 10 }, // unit
  { wch: 10 }, // rate
  { wch: 40 }, // keywords
  { wch: 15 }, // material_type
  { wch: 20 }, // work_type
  { wch: 30 }, // remark
];
ws['!cols'] = colWidths;

utils.book_append_sheet(wb, ws, 'MJD Price List');

// Save as Excel file
const excelPath = path.join(__dirname, 'mjd-pricelist-import.xlsx');
writeFile(wb, excelPath);

console.log(`✅ Excel file created: ${excelPath}`);
console.log(`📊 Total items: ${excelData.length}`);
console.log(`📊 Items with rates > 0: ${excelData.filter(i => i.rate > 0).length}`);

// Also create smaller batches for safer import (1000 items each)
const batchSize = 1000;
const batches = Math.ceil(excelData.length / batchSize);

for (let i = 0; i < batches; i++) {
  const batchData = excelData.slice(i * batchSize, (i + 1) * batchSize);
  const batchWb = utils.book_new();
  const batchWs = utils.json_to_sheet(batchData);
  batchWs['!cols'] = colWidths;
  utils.book_append_sheet(batchWb, batchWs, `Batch ${i + 1}`);
  
  const batchPath = path.join(__dirname, `mjd-batch-${i + 1}.xlsx`);
  writeFile(batchWb, batchPath);
  console.log(`📦 Batch ${i + 1} created: ${batchPath} (${batchData.length} items)`);
}

console.log(`\n✅ Import files ready!`);
console.log(`📌 Main file: mjd-pricelist-import.xlsx`);
console.log(`📦 Batch files: ${batches} files of max ${batchSize} items each`);