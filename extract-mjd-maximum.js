import pkg from 'xlsx';
const { readFile, utils } = pkg;
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read the Excel file
const workbook = readFile('C:\\Users\\abaza\\Downloads\\MJD-PRICELIST.xlsx');

console.log('🔥 MAXIMUM EXTRACTION - EXTRACTING EVERYTHING POSSIBLE');
console.log('======================================================\n');

// Helper functions
function cleanText(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    return value.trim()
      .replace(/\s+/g, ' ')
      .replace(/[""]/g, '"')
      .replace(/^\s*[-–•]\s*/, '')
      .trim();
  }
  return String(value);
}

function extractRate(value) {
  if (!value) return 0;
  if (typeof value === 'number') return Math.abs(value);
  const cleaned = String(value).replace(/[£$€,\s]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : Math.abs(num);
}

function detectUnit(text, rowData) {
  if (!text) return 'item';
  const t = text.toLowerCase();
  
  // Extended unit detection
  const units = {
    'm³': ['m3', 'cubic', 'cu.m', 'cum', 'cu m'],
    'm²': ['m2', 'sq.m', 'sqm', 'square', 'sq m'],
    'm': ['lin.m', 'l.m', 'linear', 'lin m', 'metre', 'meter', '/m'],
    'nr': ['/nr', 'no.', 'number', 'each', 'no'],
    'kg': ['kilogram', '/kg', 'kilo', 'kgs'],
    'tonne': ['ton', '/tonne', 't', 'tonnes'],
    'hour': ['hr', '/hr', 'hours', 'hrs'],
    'day': ['days', '/day', 'dys'],
    'week': ['weeks', '/week', 'wk', 'wks'],
    'month': ['months', '/month', 'mth'],
    'sum': ['lump sum', 'l.sum', 'ls', 'lump', 'item'],
    'ltr': ['litre', 'liter', 'l', '/ltr', 'litres'],
    'bag': ['bags', '/bag', 'bg'],
    'roll': ['rolls', '/roll'],
    'sheet': ['sheets', '/sheet', 'sht'],
    'pcs': ['piece', 'pieces', 'pc', '/pc'],
    'set': ['sets', '/set', 'st'],
    'visit': ['visits', '/visit', 'vis'],
    'load': ['loads', '/load', 'ld'],
    'pack': ['packs', 'packet', 'pk'],
    'pallet': ['pallets', '/pallet', 'pal'],
    'box': ['boxes', '/box', 'bx'],
    'can': ['cans', '/can'],
    'drum': ['drums', '/drum', 'dr'],
    'length': ['lengths', '/length', 'len'],
    'panel': ['panels', '/panel', 'pnl'],
    'section': ['sections', '/section', 'sec'],
    'shift': ['shifts', '/shift', 'shft'],
    'gang': ['gangs', '/gang', 'gng'],
    'per': ['percentage', '%', 'percent'],
    'sqft': ['sq.ft', 'square feet', 'ft2', 'ft²'],
    'cuft': ['cu.ft', 'cubic feet', 'ft3', 'ft³'],
    'yd': ['yard', 'yards', 'yd', 'yds'],
    'yd²': ['sq.yd', 'square yard', 'yd2'],
    'yd³': ['cu.yd', 'cubic yard', 'yd3']
  };
  
  // Check in row data for standalone units
  if (rowData) {
    for (const cell of rowData) {
      if (cell) {
        const cellStr = String(cell).toLowerCase().trim();
        for (const [unit, patterns] of Object.entries(units)) {
          if (patterns.includes(cellStr) || cellStr === unit) {
            return unit;
          }
        }
      }
    }
  }
  
  // Check in text
  for (const [unit, patterns] of Object.entries(units)) {
    for (const pattern of patterns) {
      if (t.includes(pattern)) return unit;
    }
  }
  
  return 'item';
}

function categorizeByContent(desc, sheet) {
  const d = desc.toLowerCase();
  let category = 'General Construction';
  let subcategory = 'Miscellaneous';
  
  // Comprehensive categorization rules
  const rules = [
    // Groundworks
    { patterns: ['excavat', 'dig out', 'strip'], category: 'Groundworks', subcategory: 'Excavation' },
    { patterns: ['pile', 'piling', 'cfa', 'bored'], category: 'Groundworks', subcategory: 'Piling' },
    { patterns: ['fill', 'backfill', 'imported'], category: 'Groundworks', subcategory: 'Filling' },
    { patterns: ['compact', 'consolidat'], category: 'Groundworks', subcategory: 'Compaction' },
    { patterns: ['dewater', 'wellpoint', 'pump out'], category: 'Groundworks', subcategory: 'Dewatering' },
    { patterns: ['disposal', 'cart away', 'tip', 'remove to tip'], category: 'Groundworks', subcategory: 'Disposal' },
    { patterns: ['contamina', 'remediat'], category: 'Groundworks', subcategory: 'Remediation' },
    { patterns: ['membrane', 'dpm', 'vapour barrier'], category: 'Groundworks', subcategory: 'Membranes & DPM' },
    
    // Concrete Works
    { patterns: ['concrete', 'ready mix', 'site batch'], category: 'Concrete Works', subcategory: 'Concrete Supply' },
    { patterns: ['reinforc', 'rebar', 'mesh', 'bar mark'], category: 'Concrete Works', subcategory: 'Reinforcement' },
    { patterns: ['formwork', 'shutter', 'soffit', 'falsework'], category: 'Concrete Works', subcategory: 'Formwork' },
    { patterns: ['power float', 'trowel', 'brush finish'], category: 'Concrete Works', subcategory: 'Concrete Finishes' },
    { patterns: ['screed', 'topping', 'granolithic'], category: 'Concrete Works', subcategory: 'Screeds' },
    { patterns: ['precast', 'hollowcore', 'prestress'], category: 'Concrete Works', subcategory: 'Precast Concrete' },
    { patterns: ['post tension', 'pt slab'], category: 'Concrete Works', subcategory: 'Post Tensioning' },
    { patterns: ['waterproof concrete', 'pudlo', 'caltite'], category: 'Concrete Works', subcategory: 'Waterproof Concrete' },
    
    // Structural
    { patterns: ['steel beam', 'rsj', 'universal', 'ub', 'uc'], category: 'Structural Steel', subcategory: 'Steel Sections' },
    { patterns: ['steel column', 'stanchion'], category: 'Structural Steel', subcategory: 'Steel Columns' },
    { patterns: ['fabricat', 'weld', 'bolt'], category: 'Structural Steel', subcategory: 'Fabrication' },
    { patterns: ['metal deck', 'composite floor'], category: 'Structural Steel', subcategory: 'Metal Decking' },
    { patterns: ['cold roll', 'purlin', 'rail'], category: 'Structural Steel', subcategory: 'Cold Formed Steel' },
    
    // Masonry
    { patterns: ['brick', 'facing', 'engineering brick'], category: 'Masonry', subcategory: 'Brickwork' },
    { patterns: ['block', 'blockwork', 'aircrete'], category: 'Masonry', subcategory: 'Blockwork' },
    { patterns: ['stone', 'ashlar', 'rubble'], category: 'Masonry', subcategory: 'Stonework' },
    { patterns: ['mortar', 'pointing', 'joint'], category: 'Masonry', subcategory: 'Mortar & Pointing' },
    { patterns: ['dpc', 'damp proof', 'cavity tray'], category: 'Masonry', subcategory: 'Damp Proofing' },
    
    // Roofing
    { patterns: ['slate', 'tile', 'shingle'], category: 'Roofing', subcategory: 'Roof Coverings' },
    { patterns: ['felt', 'membrane', 'single ply'], category: 'Roofing', subcategory: 'Flat Roofing' },
    { patterns: ['flashing', 'soaker', 'valley'], category: 'Roofing', subcategory: 'Roof Drainage' },
    { patterns: ['gutter', 'downpipe', 'hopper'], category: 'Roofing', subcategory: 'Rainwater Goods' },
    { patterns: ['fascia', 'soffit', 'bargeboard'], category: 'Roofing', subcategory: 'Roof Trim' },
    
    // External Works
    { patterns: ['paving', 'slab', 'block pav'], category: 'External Works', subcategory: 'Paving' },
    { patterns: ['tarmac', 'asphalt', 'macadam'], category: 'External Works', subcategory: 'Roads & Surfacing' },
    { patterns: ['kerb', 'edging', 'channel'], category: 'External Works', subcategory: 'Kerbs & Edgings' },
    { patterns: ['fence', 'gate', 'barrier'], category: 'External Works', subcategory: 'Fencing & Gates' },
    { patterns: ['landscape', 'turf', 'topsoil', 'plant'], category: 'External Works', subcategory: 'Landscaping' },
    { patterns: ['drain', 'pipe', 'manhole'], category: 'External Works', subcategory: 'External Drainage' },
    
    // Internal Finishes
    { patterns: ['plaster', 'skim', 'render'], category: 'Internal Finishes', subcategory: 'Plastering' },
    { patterns: ['paint', 'emulsion', 'gloss'], category: 'Internal Finishes', subcategory: 'Painting & Decorating' },
    { patterns: ['tile', 'ceramic', 'porcelain'], category: 'Internal Finishes', subcategory: 'Wall & Floor Tiling' },
    { patterns: ['carpet', 'vinyl', 'laminate'], category: 'Internal Finishes', subcategory: 'Floor Coverings' },
    { patterns: ['ceiling', 'suspended', 'grid'], category: 'Internal Finishes', subcategory: 'Ceilings' },
    { patterns: ['partition', 'stud', 'drylining'], category: 'Internal Finishes', subcategory: 'Partitions' },
    
    // Services
    { patterns: ['electrical', 'cable', 'wire', 'conduit'], category: 'Electrical', subcategory: 'Electrical Installation' },
    { patterns: ['light', 'luminaire', 'lamp'], category: 'Electrical', subcategory: 'Lighting' },
    { patterns: ['socket', 'switch', 'spur'], category: 'Electrical', subcategory: 'Small Power' },
    { patterns: ['distribution', 'consumer unit', 'mcb'], category: 'Electrical', subcategory: 'Distribution' },
    { patterns: ['plumb', 'pipe', 'valve'], category: 'Mechanical', subcategory: 'Plumbing' },
    { patterns: ['heating', 'boiler', 'radiator'], category: 'Mechanical', subcategory: 'Heating' },
    { patterns: ['ventilat', 'extract', 'duct'], category: 'Mechanical', subcategory: 'Ventilation' },
    { patterns: ['air condition', 'ac unit', 'chiller'], category: 'Mechanical', subcategory: 'Air Conditioning' },
    
    // Drainage
    { patterns: ['foul drain', 'sewer', 'waste'], category: 'Drainage', subcategory: 'Foul Drainage' },
    { patterns: ['surface water', 'storm', 'soakaway'], category: 'Drainage', subcategory: 'Surface Water' },
    { patterns: ['interceptor', 'separator', 'petrol'], category: 'Drainage', subcategory: 'Interceptors' },
    { patterns: ['pump station', 'rising main'], category: 'Drainage', subcategory: 'Pumping Stations' },
    { patterns: ['attenuation', 'storage tank'], category: 'Drainage', subcategory: 'Attenuation' },
    
    // Preliminaries
    { patterns: ['site setup', 'compound', 'cabin'], category: 'Preliminaries', subcategory: 'Site Establishment' },
    { patterns: ['scaffold', 'access tower'], category: 'Preliminaries', subcategory: 'Access Equipment' },
    { patterns: ['hoist', 'crane', 'lifting'], category: 'Preliminaries', subcategory: 'Lifting Equipment' },
    { patterns: ['temporary', 'protection', 'hoarding'], category: 'Preliminaries', subcategory: 'Temporary Works' },
    { patterns: ['welfare', 'canteen', 'toilet'], category: 'Preliminaries', subcategory: 'Welfare Facilities' },
    { patterns: ['manager', 'engineer', 'supervisor'], category: 'Preliminaries', subcategory: 'Site Management' },
    
    // Labour & Plant
    { patterns: ['labour', 'gang', 'operative'], category: 'Labour', subcategory: 'Labour Resources' },
    { patterns: ['excavator', 'digger', 'jcb'], category: 'Plant', subcategory: 'Excavation Plant' },
    { patterns: ['dumper', 'lorry', 'truck'], category: 'Plant', subcategory: 'Transport' },
    { patterns: ['compactor', 'roller', 'vibrat'], category: 'Plant', subcategory: 'Compaction Plant' },
    { patterns: ['generator', 'compressor', 'pump'], category: 'Plant', subcategory: 'Small Plant' },
    { patterns: ['tool', 'equipment', 'sundries'], category: 'Plant', subcategory: 'Tools & Equipment' }
  ];
  
  // Apply rules
  for (const rule of rules) {
    if (rule.patterns.some(p => d.includes(p))) {
      category = rule.category;
      subcategory = rule.subcategory;
      break;
    }
  }
  
  // Sheet-based fallback
  if (category === 'General Construction') {
    const sheetLower = sheet.toLowerCase();
    if (sheetLower.includes('ground')) category = 'Groundworks';
    else if (sheetLower.includes('rc') || sheetLower.includes('concrete')) category = 'Concrete Works';
    else if (sheetLower.includes('drain')) category = 'Drainage';
    else if (sheetLower.includes('external')) category = 'External Works';
    else if (sheetLower.includes('steel')) category = 'Structural Steel';
    else if (sheetLower.includes('prelim')) category = 'Preliminaries';
    else if (sheetLower.includes('labour')) category = 'Labour';
    else if (sheetLower.includes('plant')) category = 'Plant';
    else if (sheetLower.includes('service')) category = 'Services';
  }
  
  return { category, subcategory };
}

// Extract everything
const megaList = [];
let id = 1;

for (const sheetName of workbook.SheetNames) {
  const worksheet = workbook.Sheets[sheetName];
  const data = utils.sheet_to_json(worksheet, { header: 1, defval: null });
  
  if (!data || data.length === 0) continue;
  
  console.log(`📋 Processing: ${sheetName}`);
  let extracted = 0;
  
  // Track context
  let currentSection = '';
  let currentSubsection = '';
  
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (!row || row.filter(c => c !== null).length === 0) continue;
    
    // Extract EVERYTHING that looks like it could be a price item
    for (let j = 0; j < row.length; j++) {
      const cell = cleanText(row[j]);
      
      if (!cell || cell.length < 3) continue;
      
      // Skip obvious headers
      if (/^(site|client|oliver|ref\s|total|subtotal|summary)$/i.test(cell)) continue;
      
      // Check if this could be a description
      if (cell.length > 5 && /[a-zA-Z]/.test(cell)) {
        let description = cell;
        let unit = 'item';
        let rate = 0;
        let code = '';
        let quantity = 0;
        
        // Look for item number at start of row
        if (j === 1 && typeof row[0] === 'number' && row[0] > 0 && row[0] < 10000) {
          code = String(row[0]);
        }
        
        // Look for unit in the row
        unit = detectUnit(description, row);
        
        // Look for rates in the row
        for (let k = 0; k < row.length; k++) {
          if (k === j) continue;
          const val = extractRate(row[k]);
          if (val > 0.001 && val < 1000000) {
            // Check if it's likely a quantity or a rate
            if (k < j && val < 10000 && Number.isInteger(val)) {
              quantity = val;
            } else if (val > rate) {
              rate = val;
            }
          }
        }
        
        // Categorize
        const { category, subcategory } = categorizeByContent(description, sheetName);
        
        // Generate code if not found
        if (!code) {
          code = `${category.substring(0, 3).toUpperCase()}-${String(id).padStart(5, '0')}`;
        } else {
          code = `${sheetName.substring(0, 3).toUpperCase()}-${code.padStart(4, '0')}`;
        }
        
        // Add item if it seems valid
        if (description.length > 5 && !/^[\d\s\.,]+$/.test(description)) {
          megaList.push({
            id: `MJD-${String(id).padStart(6, '0')}`,
            code: code,
            description: description,
            category: category,
            subcategory: subcategory,
            unit: unit,
            rate: rate,
            quantity: quantity,
            source_sheet: sheetName,
            source_row: i + 1,
            source_col: j + 1
          });
          
          id++;
          extracted++;
        }
      }
    }
    
    // Also look for section headers to track context
    if (row[0] === null && row[1]) {
      const header = cleanText(row[1]);
      if (header && header.length > 3 && header.length < 100) {
        currentSection = header;
      }
    }
  }
  
  if (extracted > 0) {
    console.log(`   ✅ Extracted ${extracted} potential items`);
  }
}

// Advanced deduplication
const finalItems = [];
const seenKeys = new Set();
const seenDescriptions = new Map();

for (const item of megaList) {
  // Create unique key
  const key1 = `${item.description.toLowerCase()}-${item.unit}-${Math.round(item.rate * 100)}`;
  const key2 = item.description.toLowerCase();
  
  // Skip exact duplicates
  if (seenKeys.has(key1)) continue;
  
  // Check for similar descriptions
  let isDuplicate = false;
  for (const [desc, existingItem] of seenDescriptions.entries()) {
    // Calculate similarity
    const similarity = calculateSimilarity(item.description.toLowerCase(), desc);
    if (similarity > 0.95 && Math.abs(item.rate - existingItem.rate) < 1) {
      isDuplicate = true;
      break;
    }
  }
  
  if (!isDuplicate) {
    seenKeys.add(key1);
    seenDescriptions.set(key2, item);
    finalItems.push(item);
  }
}

// Simple similarity calculation
function calculateSimilarity(str1, str2) {
  const len1 = str1.length;
  const len2 = str2.length;
  const maxLen = Math.max(len1, len2);
  if (maxLen === 0) return 1;
  
  let matches = 0;
  for (let i = 0; i < Math.min(len1, len2); i++) {
    if (str1[i] === str2[i]) matches++;
  }
  
  return matches / maxLen;
}

console.log('\n======================================================');
console.log('🎯 MAXIMUM EXTRACTION COMPLETE');
console.log('======================================================');
console.log(`📊 Total potential items found: ${megaList.length}`);
console.log(`📊 After intelligent deduplication: ${finalItems.length}`);
console.log(`📊 Items with rates > 0: ${finalItems.filter(i => i.rate > 0).length}`);
console.log(`📊 Items with specific units: ${finalItems.filter(i => i.unit !== 'item').length}\n`);

// Category summary
const catSummary = {};
finalItems.forEach(item => {
  const key = `${item.category}`;
  catSummary[key] = (catSummary[key] || 0) + 1;
});

console.log('📁 Main Categories:');
Object.entries(catSummary)
  .sort((a, b) => b[1] - a[1])
  .forEach(([cat, count]) => {
    console.log(`   ${cat}: ${count} items`);
  });

// Save MAXIMUM dataset
const csvContent = [
  'id,code,description,category,subcategory,unit,rate,quantity',
  ...finalItems.map(item => [
    item.id,
    item.code,
    `"${item.description.replace(/"/g, '""')}"`,
    `"${item.category}"`,
    `"${item.subcategory}"`,
    item.unit,
    item.rate,
    item.quantity || 0
  ].join(','))
].join('\n');

const csvPath = path.join(__dirname, 'mjd-pricelist-maximum.csv');
fs.writeFileSync(csvPath, csvContent);
console.log(`\n✅ MAXIMUM dataset saved to: ${csvPath}`);

// Save JSON
const jsonPath = path.join(__dirname, 'mjd-pricelist-maximum.json');
fs.writeFileSync(jsonPath, JSON.stringify(finalItems, null, 2));
console.log(`✅ JSON saved to: ${jsonPath}`);

// Show varied samples
console.log('\n📝 Sample Items Across Categories:\n');
const categories = [...new Set(finalItems.map(i => i.category))];
categories.slice(0, 10).forEach(cat => {
  const samples = finalItems.filter(i => i.category === cat && i.rate > 0).slice(0, 2);
  if (samples.length > 0) {
    console.log(`${cat}:`);
    samples.forEach(item => {
      console.log(`   ${item.code}: ${item.description.substring(0, 50)}...`);
      console.log(`   Rate: £${item.rate}/${item.unit}\n`);
    });
  }
});

console.log(`\n🎉 Successfully extracted ${finalItems.length} unique price items!`);
console.log('📌 Ready for import into your BOQ matching system.');