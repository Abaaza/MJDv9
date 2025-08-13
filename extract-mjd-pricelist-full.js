import pkg from 'xlsx';
const { readFile, utils } = pkg;
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read the Excel file
const workbook = readFile('C:\\Users\\abaza\\Downloads\\MJD-PRICELIST.xlsx');

console.log('📊 Available sheets:', workbook.SheetNames);
console.log('=====================================\n');

// Function to clean and standardize values
function cleanValue(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string') {
    return value.trim().replace(/\s+/g, ' ');
  }
  return value;
}

// Function to extract unit from description or default
function extractUnit(description, defaultUnit = 'item') {
  const unitPatterns = {
    'm³': /\bm3\b|cubic\s*met|m³/i,
    'm²': /\bm2\b|sqm\b|square\s*met|m²/i,
    'm': /\blin\.?\s*m\b|\blm\b|\bmetre\b|\bmeter\b/i,
    'nr': /\bnr\b|\bno\b|\bnumber\b/i,
    'sum': /\bsum\b|\blump\s*sum\b/i,
    'week': /\bweek\b/i,
    'day': /\bday\b/i,
    'hour': /\bhour\b|\bhr\b/i,
    'kg': /\bkg\b|\bkilogram/i,
    'tonne': /\btonne\b|\bton\b/i,
    'ltr': /\bltr\b|\blitre\b|\bliter\b/i,
    'bag': /\bbag\b/i,
    'set': /\bset\b/i,
    'pcs': /\bpcs\b|\bpiece\b/i,
  };

  for (const [unit, pattern] of Object.entries(unitPatterns)) {
    if (pattern.test(description)) {
      return unit;
    }
  }
  return defaultUnit;
}

// Function to parse rate value
function parseRate(value) {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  
  // Remove currency symbols and commas
  const cleaned = String(value).replace(/[£$€,]/g, '').trim();
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

// Function to determine category and subcategory
function categorizeItem(description, sheetName) {
  const desc = description.toLowerCase();
  
  // Category mapping based on construction terms
  const categoryMappings = {
    'Groundworks': {
      keywords: ['excavat', 'earthwork', 'soil', 'dig', 'foundation', 'pile', 'boring', 'level'],
      subcategories: {
        'Excavation': ['excavat', 'dig', 'removal'],
        'Piling': ['pile', 'piling', 'boring'],
        'Earthwork Support': ['support', 'shoring', 'propping'],
        'Site Preparation': ['clear', 'strip', 'level', 'compact'],
      }
    },
    'Concrete Works': {
      keywords: ['concrete', 'cement', 'reinforc', 'rebar', 'formwork', 'shuttering', 'pour'],
      subcategories: {
        'Concrete Supply': ['concrete', 'ready mix', 'cement'],
        'Reinforcement': ['reinforc', 'rebar', 'mesh', 'steel bar'],
        'Formwork': ['formwork', 'shutter', 'mould'],
        'Concrete Finishing': ['finish', 'screed', 'float', 'trowel'],
      }
    },
    'Structural Steel': {
      keywords: ['steel', 'beam', 'column', 'metal', 'iron', 'welding'],
      subcategories: {
        'Steel Sections': ['beam', 'column', 'rsj', 'ub', 'uc'],
        'Steel Fabrication': ['fabricat', 'weld', 'cut'],
        'Steel Erection': ['erect', 'install', 'fix'],
      }
    },
    'Masonry': {
      keywords: ['brick', 'block', 'masonry', 'mortar', 'wall', 'stone'],
      subcategories: {
        'Brickwork': ['brick', 'facing', 'engineering brick'],
        'Blockwork': ['block', 'concrete block', 'aac'],
        'Stonework': ['stone', 'granite', 'marble'],
      }
    },
    'Roofing': {
      keywords: ['roof', 'tile', 'slate', 'felt', 'batten', 'gutter', 'fascia'],
      subcategories: {
        'Roof Covering': ['tile', 'slate', 'sheet'],
        'Roof Structure': ['truss', 'rafter', 'purlin'],
        'Roof Drainage': ['gutter', 'downpipe', 'hopper'],
      }
    },
    'External Works': {
      keywords: ['external', 'paving', 'kerb', 'drainage', 'landscap', 'fence'],
      subcategories: {
        'Paving': ['paving', 'slab', 'block pav'],
        'Drainage': ['drain', 'gully', 'manhole', 'pipe'],
        'Landscaping': ['landscap', 'turf', 'topsoil', 'plant'],
      }
    },
    'Internal Finishes': {
      keywords: ['plaster', 'paint', 'tile', 'ceiling', 'floor', 'carpet'],
      subcategories: {
        'Plastering': ['plaster', 'skim', 'render'],
        'Painting': ['paint', 'emulsion', 'gloss'],
        'Tiling': ['tile', 'ceramic', 'porcelain'],
        'Flooring': ['floor', 'carpet', 'vinyl', 'laminate'],
      }
    },
    'Services': {
      keywords: ['electric', 'plumb', 'heating', 'mechanical', 'duct', 'pipe', 'cable'],
      subcategories: {
        'Electrical': ['electric', 'cable', 'socket', 'switch'],
        'Plumbing': ['plumb', 'pipe', 'valve', 'tap'],
        'HVAC': ['heating', 'ventilat', 'air condition', 'duct'],
      }
    },
    'Preliminaries': {
      keywords: ['prelim', 'site', 'scaffold', 'hoard', 'welfare', 'supervision'],
      subcategories: {
        'Site Setup': ['site', 'compound', 'welfare', 'cabin'],
        'Access': ['scaffold', 'tower', 'platform'],
        'Management': ['supervis', 'manage', 'engineer'],
      }
    }
  };

  // Check sheet name first for category hints
  for (const [category, data] of Object.entries(categoryMappings)) {
    if (sheetName.toLowerCase().includes(category.toLowerCase())) {
      // Find subcategory
      for (const [subcat, keywords] of Object.entries(data.subcategories)) {
        if (keywords.some(kw => desc.includes(kw))) {
          return { category, subcategory: subcat };
        }
      }
      return { category, subcategory: 'General' };
    }
  }

  // Check description for category
  for (const [category, data] of Object.entries(categoryMappings)) {
    if (data.keywords.some(kw => desc.includes(kw))) {
      // Find subcategory
      for (const [subcat, keywords] of Object.entries(data.subcategories)) {
        if (keywords.some(kw => desc.includes(kw))) {
          return { category, subcategory: subcat };
        }
      }
      return { category, subcategory: 'General' };
    }
  }

  // Default based on sheet name or general
  return { 
    category: sheetName.replace(/[0-9]/g, '').trim() || 'General', 
    subcategory: 'Uncategorized' 
  };
}

// Process all sheets
const allItems = [];
let itemId = 1;

for (const sheetName of workbook.SheetNames) {
  console.log(`📋 Processing sheet: ${sheetName}`);
  console.log('-------------------------------------');
  
  const worksheet = workbook.Sheets[sheetName];
  const data = utils.sheet_to_json(worksheet, { header: 1, defval: null });
  
  if (data.length === 0) {
    console.log('   ⚠️ Empty sheet, skipping...\n');
    continue;
  }

  // Find header row (look for common headers)
  let headerRow = -1;
  const headerKeywords = ['description', 'item', 'rate', 'price', 'unit', 'cost', 'ref', 'code'];
  
  for (let i = 0; i < Math.min(10, data.length); i++) {
    const row = data[i];
    if (row && row.some(cell => {
      const cellStr = String(cell || '').toLowerCase();
      return headerKeywords.some(kw => cellStr.includes(kw));
    })) {
      headerRow = i;
      break;
    }
  }

  if (headerRow === -1) {
    console.log('   ⚠️ No header row found, using first row\n');
    headerRow = 0;
  }

  const headers = data[headerRow].map(h => String(h || '').toLowerCase().trim());
  console.log('   📝 Headers found:', headers.filter(h => h).join(', '));

  // Find column indices
  const descCol = headers.findIndex(h => h.includes('description') || h.includes('item') || h.includes('detail'));
  const rateCol = headers.findIndex(h => h.includes('rate') || h.includes('price') || h.includes('cost') || h === '£');
  const unitCol = headers.findIndex(h => h.includes('unit') || h === 'u/m');
  const codeCol = headers.findIndex(h => h.includes('code') || h.includes('ref'));
  
  if (descCol === -1) {
    console.log('   ⚠️ No description column found, skipping sheet\n');
    continue;
  }

  // Process data rows
  let itemsFound = 0;
  for (let i = headerRow + 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;

    const description = cleanValue(row[descCol]);
    if (!description) continue;

    // Skip if it looks like a header or total row
    if (description.toLowerCase().includes('total') || 
        description.toLowerCase().includes('subtotal') ||
        description.toLowerCase().includes('page') ||
        description.length < 5) {
      continue;
    }

    const rate = rateCol !== -1 ? parseRate(row[rateCol]) : 0;
    const unit = unitCol !== -1 ? cleanValue(row[unitCol]) : extractUnit(description);
    const code = codeCol !== -1 ? cleanValue(row[codeCol]) : `MJD-${String(itemId).padStart(4, '0')}`;
    
    const { category, subcategory } = categorizeItem(description, sheetName);

    const item = {
      id: `mjd-item-${itemId}`,
      code: code,
      description: description,
      category: category,
      subcategory: subcategory,
      unit: unit || 'item',
      rate: rate,
      keywords: [], // Can be enhanced with NLP
      source_sheet: sheetName,
      row_number: i + 1
    };

    allItems.push(item);
    itemsFound++;
    itemId++;
  }

  console.log(`   ✅ Extracted ${itemsFound} items from this sheet\n`);
}

// Summary statistics
console.log('=====================================');
console.log('📊 EXTRACTION SUMMARY');
console.log('=====================================');
console.log(`Total items extracted: ${allItems.length}`);

// Category breakdown
const categoryCount = {};
allItems.forEach(item => {
  const key = `${item.category} - ${item.subcategory}`;
  categoryCount[key] = (categoryCount[key] || 0) + 1;
});

console.log('\n📁 Category Distribution:');
Object.entries(categoryCount)
  .sort((a, b) => b[1] - a[1])
  .forEach(([cat, count]) => {
    console.log(`   ${cat}: ${count} items`);
  });

// Save to CSV for import
const csvContent = [
  ['code', 'description', 'category', 'subcategory', 'unit', 'rate', 'keywords'].join(','),
  ...allItems.map(item => [
    item.code,
    `"${item.description.replace(/"/g, '""')}"`,
    item.category,
    item.subcategory,
    item.unit,
    item.rate,
    item.keywords.join(';')
  ].join(','))
].join('\n');

const outputPath = path.join(__dirname, 'mjd-pricelist-extracted.csv');
fs.writeFileSync(outputPath, csvContent);
console.log(`\n✅ Saved to: ${outputPath}`);

// Also save as JSON for better structure
const jsonPath = path.join(__dirname, 'mjd-pricelist-extracted.json');
fs.writeFileSync(jsonPath, JSON.stringify(allItems, null, 2));
console.log(`✅ Saved JSON to: ${jsonPath}`);

// Sample output
console.log('\n📝 Sample items (first 5):');
allItems.slice(0, 5).forEach(item => {
  console.log(`\n   Code: ${item.code}`);
  console.log(`   Description: ${item.description}`);
  console.log(`   Category: ${item.category} > ${item.subcategory}`);
  console.log(`   Unit: ${item.unit}`);
  console.log(`   Rate: £${item.rate}`);
});