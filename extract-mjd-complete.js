import pkg from 'xlsx';
const { readFile, utils } = pkg;
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read the Excel file
const workbook = readFile('C:\\Users\\abaza\\Downloads\\MJD-PRICELIST.xlsx');

// Process ALL sheets
const ALL_SHEETS = workbook.SheetNames;

console.log('📊 COMPREHENSIVE EXTRACTION - ALL SHEETS');
console.log('=========================================');
console.log(`Processing ${ALL_SHEETS.length} sheets...\n`);

// Helper functions
function cleanValue(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string') {
    return value.trim()
      .replace(/\s+/g, ' ')
      .replace(/[""]/g, '"')
      .replace(/^\s*[-–]\s*/, '') // Remove leading dashes
      .trim();
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

function isValidDescription(desc) {
  if (!desc || typeof desc !== 'string') return false;
  const cleaned = desc.toLowerCase();
  
  // Skip if too short
  if (cleaned.length < 3) return false;
  
  // Skip headers and totals
  const skipWords = ['total', 'subtotal', 'summary', 'page', 'sheet', 'oliver connell', 
                     'client', 'site', 'schedule of works', 'description', 'quant', 
                     'unit', 'rate', 'labour', 'plant', 'material', 'ref xxxx'];
  
  for (const word of skipWords) {
    if (cleaned === word || cleaned === `${word}s`) return false;
  }
  
  // Must contain at least one letter
  if (!/[a-zA-Z]/.test(desc)) return false;
  
  return true;
}

function extractUnit(text) {
  if (!text) return 'item';
  const textLower = text.toLowerCase();
  
  // Check common units
  const unitMap = {
    'm³': ['m3', 'cubic', 'cu.m', 'cum'],
    'm²': ['m2', 'sq.m', 'sqm', 'square'],
    'm': ['lin.m', 'l.m', 'linear', 'metre', 'meter', '/m'],
    'nr': ['/nr', 'no.', 'number', 'each'],
    'kg': ['kilogram', '/kg', 'kilo'],
    'tonne': ['ton', '/tonne', 't'],
    'hour': ['hr', '/hr', 'hours'],
    'day': ['days', '/day'],
    'week': ['weeks', '/week', 'wk'],
    'month': ['months', '/month'],
    'sum': ['lump sum', 'l.sum', 'ls'],
    'ltr': ['litre', 'liter', 'l', '/ltr'],
    'bag': ['bags', '/bag'],
    'roll': ['rolls', '/roll'],
    'sheet': ['sheets', '/sheet'],
    'pcs': ['piece', 'pieces', 'pc'],
    'set': ['sets', '/set'],
    'visit': ['visits', '/visit'],
    'load': ['loads', '/load'],
    'pack': ['packs', 'packet']
  };
  
  for (const [unit, patterns] of Object.entries(unitMap)) {
    for (const pattern of patterns) {
      if (textLower.includes(pattern)) return unit;
    }
  }
  
  // Check if standalone unit in cell
  if (textLower in unitMap) return textLower;
  const cleanUnit = textLower.replace(/[^a-z0-9³²]/g, '');
  if (Object.keys(unitMap).includes(cleanUnit)) return cleanUnit;
  
  return 'item';
}

function categorizeItem(description, sheetName) {
  const desc = description.toLowerCase();
  let category = sheetName.replace(/[^a-zA-Z\s]/g, '').trim();
  let subcategory = 'General';
  
  // Major categories based on sheet names
  const sheetCategoryMap = {
    'groundworks': 'Groundworks',
    'rc works': 'RC Works',
    'drainage': 'Drainage',
    'services': 'Services',
    'external works': 'External Works',
    'underpinning': 'Underpinning',
    'bldrs wk': 'Builders Work',
    'prelims': 'Preliminaries',
    'dayworks': 'Dayworks',
    'labour': 'Labour & Plant',
    'plant': 'Labour & Plant',
    'supervision': 'Supervision',
    'crane': 'Plant & Equipment',
    'hoist': 'Plant & Equipment',
    'scaffold': 'Access Equipment',
    'temporary': 'Temporary Works',
    'slipform': 'Specialist Works',
    'tower': 'Plant & Equipment',
    'budget': 'Provisional Items'
  };
  
  // Find category from sheet name
  const sheetLower = sheetName.toLowerCase();
  for (const [key, cat] of Object.entries(sheetCategoryMap)) {
    if (sheetLower.includes(key)) {
      category = cat;
      break;
    }
  }
  
  // Detailed subcategory detection
  const subcategoryPatterns = {
    // Groundworks subcategories
    'Excavation': ['excavat', 'dig', 'cut', 'strip'],
    'Filling': ['fill', 'backfill', 'compact'],
    'Piling': ['pile', 'piling', 'bore', 'cfa', 'secant', 'contiguous'],
    'Earthwork Support': ['support', 'shore', 'prop', 'trench box'],
    'Site Clearance': ['clear', 'grub', 'remove vegetation'],
    'Disposal': ['disposal', 'cart away', 'tip', 'waste'],
    'Dewatering': ['dewater', 'pump', 'sump'],
    'Ground Treatment': ['vibro', 'stone column', 'soil improvement'],
    
    // Concrete subcategories
    'Concrete Supply': ['concrete', 'ready mix', 'site mix'],
    'Reinforcement': ['rebar', 'mesh', 'steel', 'reinforc', 'bar'],
    'Formwork': ['formwork', 'shutter', 'falsework', 'soffit'],
    'Concrete Finishes': ['power float', 'trowel', 'brush', 'exposed aggregate'],
    'Joints': ['joint', 'expansion', 'construction joint', 'movement'],
    'Waterproof Concrete': ['waterproof', 'pudlo', 'caltite', 'sika'],
    'Precast': ['precast', 'pre-cast', 'hollowcore'],
    
    // Drainage subcategories
    'Pipes & Fittings': ['pipe', 'bend', 'junction', 'coupling'],
    'Manholes & Chambers': ['manhole', 'chamber', 'inspection', 'soakaway'],
    'Gullies': ['gully', 'gulley', 'road gully', 'yard gully'],
    'Interceptors': ['interceptor', 'separator', 'petrol', 'grease trap'],
    'Pumping Stations': ['pump', 'rising main', 'wet well'],
    'Attenuation': ['attenuation', 'storage', 'tank', 'crate'],
    'Treatment': ['treatment', 'reed bed', 'package plant'],
    
    // External Works subcategories
    'Roads & Paving': ['road', 'paving', 'tarmac', 'asphalt', 'block pav'],
    'Kerbs & Edgings': ['kerb', 'edging', 'channel', 'quadrant'],
    'Fencing & Barriers': ['fence', 'barrier', 'gate', 'bollard'],
    'Landscaping': ['landscape', 'turf', 'topsoil', 'plant', 'tree'],
    'Street Furniture': ['bench', 'bin', 'cycle stand', 'shelter'],
    'Signage': ['sign', 'road marking', 'line marking'],
    'Retaining Structures': ['retaining wall', 'gabion', 'crib wall'],
    
    // Services subcategories
    'Electrical': ['cable', 'duct', 'conduit', 'wire', 'electrical'],
    'Mechanical': ['pipe', 'valve', 'pump', 'mechanical'],
    'Telecoms': ['telecom', 'data', 'fibre', 'comms'],
    'Gas': ['gas', 'gas main', 'gas pipe'],
    'Water': ['water main', 'water pipe', 'hydrant'],
    
    // Structural subcategories
    'Steelwork': ['steel', 'beam', 'column', 'rsj', 'universal'],
    'Masonry': ['brick', 'block', 'stone', 'masonry'],
    'Roofing': ['roof', 'slate', 'tile', 'felt', 'batten'],
    'Cladding': ['cladding', 'render', 'facade', 'rain screen'],
    'Windows & Doors': ['window', 'door', 'frame', 'glazing'],
    
    // Preliminaries subcategories
    'Site Setup': ['cabin', 'welfare', 'compound', 'hoarding'],
    'Management': ['manager', 'engineer', 'surveyor', 'supervisor'],
    'Plant & Equipment': ['crane', 'hoist', 'scaffold', 'tower'],
    'Temporary Services': ['temporary', 'power', 'water', 'lighting'],
    'Health & Safety': ['safety', 'ppe', 'first aid', 'security']
  };
  
  // Find best matching subcategory
  for (const [subcat, patterns] of Object.entries(subcategoryPatterns)) {
    for (const pattern of patterns) {
      if (desc.includes(pattern)) {
        subcategory = subcat;
        return { category, subcategory };
      }
    }
  }
  
  // Additional categorization based on description content
  if (desc.includes('labour') || desc.includes('gang')) {
    category = 'Labour Resources';
    subcategory = 'Labour Rates';
  } else if (desc.includes('plant hire') || desc.includes('hire rate')) {
    category = 'Plant & Equipment';
    subcategory = 'Hire Rates';
  } else if (desc.includes('material') && desc.includes('supply')) {
    category = 'Materials';
    subcategory = 'Material Supply';
  }
  
  return { category, subcategory };
}

// Main extraction
const allItems = [];
let globalId = 1;

for (const sheetName of ALL_SHEETS) {
  const worksheet = workbook.Sheets[sheetName];
  const data = utils.sheet_to_json(worksheet, { header: 1, defval: null });
  
  if (data.length === 0) continue;
  
  console.log(`📋 Processing: ${sheetName}`);
  
  let itemsInSheet = 0;
  let currentSection = 'General';
  let lastValidCategory = sheetName;
  let lastValidSubcategory = 'General';
  
  // Process every row
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (!row || row.filter(cell => cell !== null).length === 0) continue;
    
    // Try multiple extraction strategies
    
    // Strategy 1: Look for numbered items (1, 2, 3, etc.)
    const firstCell = row[0];
    if (typeof firstCell === 'number' && firstCell > 0 && firstCell < 10000) {
      // This is likely an item number
      for (let j = 1; j < row.length; j++) {
        const possibleDesc = cleanValue(row[j]);
        if (possibleDesc && isValidDescription(possibleDesc)) {
          // Found a description
          let unit = 'item';
          let rate = 0;
          
          // Look for unit and rate in subsequent cells
          for (let k = j + 1; k < Math.min(j + 10, row.length); k++) {
            const cellValue = row[k];
            if (cellValue) {
              // Check if it's a unit
              const cellStr = String(cellValue).toLowerCase();
              const possibleUnit = extractUnit(cellStr);
              if (possibleUnit !== 'item' && unit === 'item') {
                unit = possibleUnit;
              }
              // Check if it's a rate
              const possibleRate = parseRate(cellValue);
              if (possibleRate > 0 && possibleRate < 100000 && rate === 0) {
                rate = possibleRate;
              }
            }
          }
          
          const { category, subcategory } = categorizeItem(possibleDesc, sheetName);
          
          allItems.push({
            id: `mjd-${String(globalId).padStart(6, '0')}`,
            code: `${category.substring(0, 3).toUpperCase()}-${String(firstCell).padStart(4, '0')}`,
            description: possibleDesc,
            category: category,
            subcategory: subcategory,
            unit: unit,
            rate: rate,
            source_sheet: sheetName,
            source_row: i + 1,
            item_number: firstCell
          });
          
          globalId++;
          itemsInSheet++;
          lastValidCategory = category;
          lastValidSubcategory = subcategory;
          break;
        }
      }
    }
    
    // Strategy 2: Look for section headers (text in first few columns without numbers)
    for (let j = 0; j < Math.min(3, row.length); j++) {
      const cell = cleanValue(row[j]);
      if (cell && typeof cell === 'string' && cell.length > 3 && cell.length < 100) {
        // Check if this could be a section header
        if (!row[0] || typeof row[0] !== 'number') {
          const hasRate = row.some(c => typeof c === 'number' && c > 10 && c < 100000);
          if (!hasRate && !cell.toLowerCase().includes('total')) {
            // This is likely a section header
            currentSection = cell;
            const { subcategory } = categorizeItem(cell, sheetName);
            if (subcategory !== 'General') {
              lastValidSubcategory = subcategory;
            }
          }
        }
      }
    }
    
    // Strategy 3: Look for descriptions with rates (even without item numbers)
    for (let j = 0; j < row.length - 1; j++) {
      const possibleDesc = cleanValue(row[j]);
      if (possibleDesc && isValidDescription(possibleDesc) && possibleDesc.length > 10) {
        // Look for a rate in nearby cells
        for (let k = j + 1; k < Math.min(j + 5, row.length); k++) {
          const possibleRate = parseRate(row[k]);
          if (possibleRate > 0.01 && possibleRate < 100000) {
            // Found a description with a rate
            let unit = 'item';
            
            // Check for unit between description and rate
            for (let u = j + 1; u < k; u++) {
              const possibleUnit = extractUnit(String(row[u] || ''));
              if (possibleUnit !== 'item') {
                unit = possibleUnit;
                break;
              }
            }
            
            // Also check unit in description
            if (unit === 'item') {
              unit = extractUnit(possibleDesc);
            }
            
            const { category, subcategory } = categorizeItem(possibleDesc, sheetName);
            
            // Check if we already have this item (avoid duplicates)
            const isDuplicate = allItems.some(item => 
              item.description === possibleDesc && 
              item.source_row === i + 1 &&
              item.source_sheet === sheetName
            );
            
            if (!isDuplicate) {
              allItems.push({
                id: `mjd-${String(globalId).padStart(6, '0')}`,
                code: `${category.substring(0, 3).toUpperCase()}-${String(globalId).padStart(4, '0')}`,
                description: possibleDesc,
                category: category || lastValidCategory,
                subcategory: subcategory || lastValidSubcategory,
                unit: unit,
                rate: possibleRate,
                source_sheet: sheetName,
                source_row: i + 1,
                context: currentSection
              });
              
              globalId++;
              itemsInSheet++;
            }
            break;
          }
        }
      }
    }
    
    // Strategy 4: Extract labour rates, plant rates, material rates
    if (sheetName.toLowerCase().includes('labour') || 
        sheetName.toLowerCase().includes('plant') ||
        sheetName.toLowerCase().includes('rate')) {
      for (let j = 0; j < row.length - 1; j++) {
        const possibleItem = cleanValue(row[j]);
        if (possibleItem && typeof possibleItem === 'string' && possibleItem.length > 3) {
          // Look for rate in next few cells
          for (let k = j + 1; k < Math.min(j + 5, row.length); k++) {
            const rate = parseRate(row[k]);
            if (rate > 0 && rate < 10000) {
              let unit = 'hour'; // Default for labour/plant
              
              if (possibleItem.toLowerCase().includes('week')) unit = 'week';
              else if (possibleItem.toLowerCase().includes('day')) unit = 'day';
              else if (possibleItem.toLowerCase().includes('month')) unit = 'month';
              else if (possibleItem.toLowerCase().includes('m3') || possibleItem.toLowerCase().includes('cubic')) unit = 'm³';
              else if (possibleItem.toLowerCase().includes('m2') || possibleItem.toLowerCase().includes('square')) unit = 'm²';
              else if (possibleItem.toLowerCase().includes('tonne')) unit = 'tonne';
              else if (possibleItem.toLowerCase().includes('load')) unit = 'load';
              
              let category = 'Labour & Plant';
              let subcategory = 'General Rates';
              
              if (possibleItem.toLowerCase().includes('labour') || 
                  possibleItem.toLowerCase().includes('gang') ||
                  possibleItem.toLowerCase().includes('carpenter') ||
                  possibleItem.toLowerCase().includes('steel fix') ||
                  possibleItem.toLowerCase().includes('concrete')) {
                subcategory = 'Labour Rates';
              } else if (possibleItem.toLowerCase().includes('crane') ||
                        possibleItem.toLowerCase().includes('excavator') ||
                        possibleItem.toLowerCase().includes('dumper') ||
                        possibleItem.toLowerCase().includes('roller')) {
                subcategory = 'Plant Hire Rates';
              } else if (possibleItem.toLowerCase().includes('concrete') ||
                        possibleItem.toLowerCase().includes('steel') ||
                        possibleItem.toLowerCase().includes('aggregate')) {
                category = 'Materials';
                subcategory = 'Material Rates';
              }
              
              const isDuplicate = allItems.some(item => 
                item.description === possibleItem && 
                Math.abs(item.rate - rate) < 0.01
              );
              
              if (!isDuplicate && isValidDescription(possibleItem)) {
                allItems.push({
                  id: `mjd-${String(globalId).padStart(6, '0')}`,
                  code: `${category.substring(0, 3).toUpperCase()}-${String(globalId).padStart(4, '0')}`,
                  description: possibleItem,
                  category: category,
                  subcategory: subcategory,
                  unit: unit,
                  rate: rate,
                  source_sheet: sheetName,
                  source_row: i + 1
                });
                
                globalId++;
                itemsInSheet++;
              }
              break;
            }
          }
        }
      }
    }
  }
  
  if (itemsInSheet > 0) {
    console.log(`   ✅ Extracted ${itemsInSheet} items`);
  }
}

// Remove obvious duplicates
const uniqueItems = [];
const seen = new Set();

for (const item of allItems) {
  const key = `${item.description}-${item.unit}-${Math.round(item.rate)}`;
  if (!seen.has(key)) {
    seen.add(key);
    uniqueItems.push(item);
  }
}

console.log('\n=========================================');
console.log('📊 EXTRACTION COMPLETE');
console.log('=========================================');
console.log(`Total raw items extracted: ${allItems.length}`);
console.log(`Unique items after deduplication: ${uniqueItems.length}\n`);

// Category summary
const categorySummary = {};
uniqueItems.forEach(item => {
  const key = `${item.category} > ${item.subcategory}`;
  categorySummary[key] = (categorySummary[key] || 0) + 1;
});

console.log('📁 Category Distribution:');
Object.entries(categorySummary)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 30)
  .forEach(([cat, count]) => {
    console.log(`   ${cat}: ${count} items`);
  });

// Save comprehensive CSV
const csvContent = [
  'id,code,description,category,subcategory,unit,rate',
  ...uniqueItems.map(item => [
    item.id,
    item.code,
    `"${item.description.replace(/"/g, '""')}"`,
    item.category,
    item.subcategory,
    item.unit,
    item.rate
  ].join(','))
].join('\n');

const csvPath = path.join(__dirname, 'mjd-pricelist-complete.csv');
fs.writeFileSync(csvPath, csvContent);
console.log(`\n✅ Complete CSV saved to: ${csvPath}`);

// Save JSON
const jsonPath = path.join(__dirname, 'mjd-pricelist-complete.json');
fs.writeFileSync(jsonPath, JSON.stringify(uniqueItems, null, 2));
console.log(`✅ Complete JSON saved to: ${jsonPath}`);

// Show statistics
console.log('\n📊 Statistics:');
console.log(`   Items with rates > 0: ${uniqueItems.filter(i => i.rate > 0).length}`);
console.log(`   Items with specific units: ${uniqueItems.filter(i => i.unit !== 'item').length}`);
console.log(`   Average rate (excluding 0): £${(uniqueItems.filter(i => i.rate > 0).reduce((sum, i) => sum + i.rate, 0) / uniqueItems.filter(i => i.rate > 0).length).toFixed(2)}`);

// Sample output
console.log('\n📝 Sample Items (with rates):');
const samplesWithRates = uniqueItems.filter(i => i.rate > 0).slice(0, 15);
samplesWithRates.forEach(item => {
  console.log(`\n   ${item.code}: ${item.description.substring(0, 60)}${item.description.length > 60 ? '...' : ''}`);
  console.log(`   Category: ${item.category} > ${item.subcategory}`);
  console.log(`   Rate: £${item.rate}/${item.unit}`);
});