import * as XLSX from 'xlsx';
import fs from 'fs';

// Create test BOQ Excel file
const boqData = [
  { Item: 1, Description: 'Concrete Block 200mm thick', Quantity: 100, Unit: 'pcs' },
  { Item: 2, Description: 'Steel Reinforcement Bar 12mm', Quantity: 500, Unit: 'kg' },
  { Item: 3, Description: 'Interior Paint White Color', Quantity: 50, Unit: 'ltr' }
];

const similarBoqData = [
  { Item: 1, Description: 'Concrete Block 200 mm', Quantity: 150, Unit: 'pcs' },
  { Item: 2, Description: 'Steel Bar Reinforcement 12mm diameter', Quantity: 300, Unit: 'kg' },
  { Item: 3, Description: 'Paint Interior White', Quantity: 75, Unit: 'ltr' }
];

// Create first workbook
const wb1 = XLSX.utils.book_new();
const ws1 = XLSX.utils.json_to_sheet(boqData);
XLSX.utils.book_append_sheet(wb1, ws1, 'BOQ');
XLSX.writeFile(wb1, 'test-boq.xlsx');
console.log('✅ Created test-boq.xlsx');

// Create second workbook
const wb2 = XLSX.utils.book_new();
const ws2 = XLSX.utils.json_to_sheet(similarBoqData);
XLSX.utils.book_append_sheet(wb2, ws2, 'BOQ');
XLSX.writeFile(wb2, 'test-boq-similar.xlsx');
console.log('✅ Created test-boq-similar.xlsx');

// Create price list Excel
const priceListData = [
  { code: 'TEST001', description: 'Concrete Block 200mm', unit: 'pcs', rate: 25, category: 'Construction', subcategory: 'Masonry' },
  { code: 'TEST002', description: 'Steel Bar 12mm', unit: 'kg', rate: 45, category: 'Construction', subcategory: 'Steel' },
  { code: 'TEST003', description: 'Paint White Interior', unit: 'ltr', rate: 120, category: 'Finishing', subcategory: 'Paint' }
];

const wb3 = XLSX.utils.book_new();
const ws3 = XLSX.utils.json_to_sheet(priceListData);
XLSX.utils.book_append_sheet(wb3, ws3, 'Price List');
XLSX.writeFile(wb3, 'test-pricelist.xlsx');
console.log('✅ Created test-pricelist.xlsx');