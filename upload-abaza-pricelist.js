/**
 * Upload MJD-PRICELIST.xlsx for Abaza Co. and create new active price list
 */

import { ConvexHttpClient } from 'convex/browser';
import { api } from './convex/_generated/api.js';
import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';

const CONVEX_URL = 'https://trustworthy-badger-677.convex.cloud';
const EXCEL_FILE = 'C:\\Users\\abaza\\Downloads\\MJD-PRICELIST.xlsx';

async function uploadAbazaPriceList() {
  try {
    console.log('=== Starting Abaza Co. Price List Upload ===\n');
    
    const convex = new ConvexHttpClient(CONVEX_URL);
    
    // Step 1: Get user
    console.log('[1] Getting user...');
    const users = await convex.query(api.users.getAllUsers);
    const user = users.find(u => u.email === 'abaza@mjd.com') || users[0];
    console.log(`✓ Using user: ${user.name} (${user.email})`);
    
    // Step 2: Get Abaza Co. client
    console.log('\n[2] Finding Abaza Co. client...');
    const clients = await convex.query(api.clients.getAll);
    const abazaClient = clients.find(c => c.name === 'Abaza Co.' || c.name.toLowerCase().includes('abaza'));
    
    if (!abazaClient) {
      throw new Error('Abaza Co. client not found. Please create it first.');
    }
    console.log(`✓ Found client: ${abazaClient.name} (ID: ${abazaClient._id})`);
    
    // Step 3: Deactivate existing price lists for this client
    console.log('\n[3] Managing existing price lists...');
    const existingPriceLists = await convex.query(api.clientPriceLists.getByClient, {
      clientId: abazaClient._id
    });
    
    console.log(`Found ${existingPriceLists.length} existing price lists`);
    
    // Deactivate old lists
    for (const priceList of existingPriceLists) {
      if (priceList.isDefault) {
        await convex.mutation(api.clientPriceLists.update, {
          id: priceList._id,
          isDefault: false
        });
        console.log(`  - Deactivated: ${priceList.name}`);
      }
    }
    
    // Step 4: Read and process Excel file
    console.log('\n[4] Processing Excel file...');
    if (!fs.existsSync(EXCEL_FILE)) {
      throw new Error(`Excel file not found: ${EXCEL_FILE}`);
    }
    
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(EXCEL_FILE);
    
    let totalItems = 0;
    const priceItems = [];
    
    // Process each sheet
    workbook.eachSheet((worksheet, sheetId) => {
      console.log(`  Processing sheet: ${worksheet.name}`);
      
      let headers = [];
      let dataRows = [];
      
      worksheet.eachRow((row, rowNumber) => {
        const values = row.values.slice(1); // Excel rows are 1-indexed
        
        if (rowNumber === 1) {
          // First row is headers
          headers = values.map(v => String(v || '').trim());
        } else if (values.some(v => v !== null && v !== undefined && String(v).trim() !== '')) {
          // Data row
          const rowData = {};
          headers.forEach((header, index) => {
            if (header) {
              rowData[header] = values[index];
            }
          });
          
          // Extract price item data
          if (rowData['Item'] || rowData['Description'] || rowData['DESCRIPTION']) {
            const item = {
              code: rowData['Item'] || rowData['ITEM'] || rowData['Code'] || `ITEM-${totalItems + 1}`,
              description: rowData['Description'] || rowData['DESCRIPTION'] || rowData['Item'] || '',
              unit: rowData['Unit'] || rowData['UNIT'] || rowData['UOM'] || 'EA',
              rate: parseFloat(rowData['Rate'] || rowData['RATE'] || rowData['Price'] || rowData['PRICE'] || 0),
              category: worksheet.name,
              subCategory: rowData['Category'] || rowData['Sub-Category'] || '',
              supplier: rowData['Supplier'] || 'MJD',
              material: rowData['Material'] || '',
              labor: rowData['Labour'] || rowData['Labor'] || '',
              plant: rowData['Plant'] || '',
              keywords: []
            };
            
            // Generate keywords from description
            if (item.description) {
              item.keywords = item.description
                .toLowerCase()
                .split(/[\s,.-]+/)
                .filter(word => word.length > 2);
            }
            
            if (item.description && item.rate > 0) {
              priceItems.push(item);
              totalItems++;
            }
          }
        }
      });
    });
    
    console.log(`✓ Extracted ${totalItems} valid price items`);
    
    // Step 5: Create new price list
    console.log('\n[5] Creating new price list...');
    const today = new Date();
    const nextYear = new Date(today);
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    
    const priceListId = await convex.mutation(api.clientPriceLists.create, {
      clientId: abazaClient._id,
      name: `Abaza Co. - MJD Price List ${today.toLocaleDateString()}`,
      description: `Active price list imported from MJD-PRICELIST.xlsx with ${totalItems} items`,
      isDefault: true,
      effectiveFrom: today.getTime(),
      effectiveTo: nextYear.getTime(),
      sourceFileName: 'MJD-PRICELIST.xlsx',
      userId: user._id
    });
    
    console.log(`✓ Created price list: ${priceListId}`);
    
    // Step 6: Import price items in batches
    console.log('\n[6] Importing price items...');
    const BATCH_SIZE = 50;
    let importedCount = 0;
    
    for (let i = 0; i < priceItems.length; i += BATCH_SIZE) {
      const batch = priceItems.slice(i, i + BATCH_SIZE);
      
      // Import each item in the batch
      for (const item of batch) {
        try {
          await convex.mutation(api.clientPriceItems.upsert, {
            priceListId: priceListId,
            clientId: abazaClient._id,
            itemCode: item.code,
            description: item.description,
            unit: item.unit,
            basePrice: item.rate,
            clientPrice: item.rate, // Can be adjusted with discount
            discount: 0,
            markup: 0,
            category: item.category,
            subCategory: item.subCategory,
            supplier: item.supplier,
            material: item.material,
            labor: item.labor,
            plant: item.plant,
            keywords: item.keywords,
            isActive: true,
            userId: user._id
          });
          importedCount++;
        } catch (error) {
          console.log(`  Warning: Failed to import item ${item.code}: ${error.message}`);
        }
      }
      
      console.log(`  Imported ${importedCount}/${totalItems} items...`);
      
      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log(`✓ Successfully imported ${importedCount} price items`);
    
    // Step 7: Verify the upload
    console.log('\n[7] Verifying upload...');
    const allPriceLists = await convex.query(api.clientPriceLists.getAllActive);
    const newPriceList = allPriceLists.find(pl => pl._id === priceListId);
    
    if (newPriceList) {
      console.log('\n✅ SUCCESS! New price list created and activated:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`Name: ${newPriceList.name}`);
      console.log(`Client: ${newPriceList.clientName}`);
      console.log(`Items: ${importedCount}`);
      console.log(`Status: Active & Default`);
      console.log(`Effective: ${new Date(newPriceList.effectiveFrom).toLocaleDateString()} - ${new Date(newPriceList.effectiveTo).toLocaleDateString()}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      // Get a few sample items
      const sampleItems = await convex.query(api.clientPriceItems.getByPriceList, {
        priceListId: priceListId,
        limit: 5
      });
      
      if (sampleItems && sampleItems.length > 0) {
        console.log('\nSample items from uploaded price list:');
        sampleItems.forEach((item, index) => {
          console.log(`${index + 1}. ${item.description || item.itemCode}`);
          console.log(`   Code: ${item.itemCode} | Unit: ${item.unit} | Price: £${item.clientPrice}`);
        });
      }
    }
    
    console.log('\n=== Upload Complete ===');
    console.log('The new price list is now active for Abaza Co.');
    console.log('You can test BOQ matching with client-specific prices.');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
  }
}

// Run the upload
uploadAbazaPriceList();