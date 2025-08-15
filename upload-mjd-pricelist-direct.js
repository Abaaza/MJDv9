/**
 * Direct upload of MJD-PRICELIST.xlsx for Abaza Co.
 * Creates price items directly in the priceItems table with client association
 */

import { ConvexHttpClient } from 'convex/browser';
import { api } from './convex/_generated/api.js';
import ExcelJS from 'exceljs';
import fs from 'fs';

const CONVEX_URL = 'https://trustworthy-badger-677.convex.cloud';
const EXCEL_FILE = 'C:\\Users\\abaza\\Downloads\\MJD-PRICELIST.xlsx';

async function uploadMJDPriceList() {
  try {
    console.log('=== MJD Price List Upload for Abaza Co. ===\n');
    
    const convex = new ConvexHttpClient(CONVEX_URL);
    
    // Step 1: Get user
    console.log('[1] Getting user...');
    const users = await convex.query(api.users.getAllUsers);
    const user = users.find(u => u.email === 'abaza@mjd.com') || users[0];
    console.log(`✓ User: ${user.name} (${user.email})`);
    
    // Step 2: Get Abaza Co. client
    console.log('\n[2] Finding Abaza Co. client...');
    const clients = await convex.query(api.clients.getAll);
    let abazaClient = clients.find(c => c.name === 'Abaza Co.' || c.name.toLowerCase().includes('abaza'));
    
    if (!abazaClient) {
      console.log('Abaza Co. not found, creating...');
      const clientId = await convex.mutation(api.clients.create, {
        name: 'Abaza Co.',
        email: 'abaza@mjd.com',
        phone: '+20 100 123 4567',
        address: 'Cairo, Egypt',
        contactPerson: 'Mr. Abaza',
        notes: 'Premium client',
        isActive: true,
        userId: user._id
      });
      // Fetch the created client
      abazaClient = await convex.query(api.clients.getById, { _id: clientId });
      console.log('✓ Created Abaza Co. client');
    } else {
      console.log(`✓ Found: ${abazaClient.name}`);
    }
    
    // Step 3: Process Excel file
    console.log('\n[3] Reading Excel file...');
    let excelPath = EXCEL_FILE;
    if (!fs.existsSync(excelPath)) {
      // Use the local copy if Downloads doesn't exist
      const localFile = './MJD-PRICELIST.xlsx';
      if (fs.existsSync(localFile)) {
        console.log('Using local copy of MJD-PRICELIST.xlsx');
        excelPath = localFile;
      } else {
        throw new Error('Excel file not found');
      }
    }
    
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(excelPath);
    
    let totalItems = 0;
    let importedItems = 0;
    const errors = [];
    
    // Process all sheets
    for (const worksheet of workbook.worksheets) {
      console.log(`\nProcessing sheet: ${worksheet.name}`);
      
      // Find header row
      let headerRow = null;
      let headerRowNum = 0;
      
      worksheet.eachRow((row, rowNumber) => {
        if (!headerRow) {
          const values = row.values.slice(1);
          const hasHeaders = values.some(v => {
            const str = String(v || '').toLowerCase();
            return str.includes('description') || str.includes('item') || 
                   str.includes('unit') || str.includes('rate');
          });
          
          if (hasHeaders) {
            headerRow = values.map(v => String(v || '').trim());
            headerRowNum = rowNumber;
          }
        }
      });
      
      if (!headerRow) {
        console.log(`  Skipping sheet - no headers found`);
        continue;
      }
      
      // Map column indices
      const columns = {};
      headerRow.forEach((header, index) => {
        const h = header.toLowerCase();
        if (h.includes('item') || h.includes('code')) columns.code = index;
        if (h.includes('description')) columns.description = index;
        if (h.includes('unit') || h.includes('uom')) columns.unit = index;
        if (h.includes('rate') || h.includes('price')) columns.rate = index;
        if (h.includes('material')) columns.material = index;
        if (h.includes('labour') || h.includes('labor')) columns.labor = index;
        if (h.includes('plant')) columns.plant = index;
      });
      
      // Collect data rows first
      const dataRows = [];
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber <= headerRowNum) return;
        
        const values = row.values.slice(1);
        
        // Extract data
        const description = values[columns.description] || '';
        const code = values[columns.code] || `ABAZA-${totalItems + 1}`;
        const unit = values[columns.unit] || 'EA';
        const rate = parseFloat(values[columns.rate] || 0);
        
        if (description && rate > 0) {
          totalItems++;
          
          // Create price item
          const priceItem = {
            code: String(code).substring(0, 50), // Limit code length
            description: String(description).substring(0, 500), // Limit description
            unit: String(unit).substring(0, 20),
            rate: rate,
            category: worksheet.name,
            subCategory: '',
            supplier: 'MJD',
            material: values[columns.material] || '',
            labour: values[columns.labor] || '',
            plant: values[columns.plant] || '',
            // Add client association
            clientId: abazaClient._id,
            clientName: 'Abaza Co.',
            isClientSpecific: true,
            isActive: true,
            rowNumber: rowNumber
          };
          
          dataRows.push(priceItem);
        }
      });
      
      // Process data rows with async/await
      for (const priceItem of dataRows) {
        try {
          // Try to create/update the price item
          const result = await convex.mutation(api.priceItems.upsert, {
            code: priceItem.code,
            description: priceItem.description,
            unit: priceItem.unit,
            rate: priceItem.rate,
            category: priceItem.category,
            subCategory: priceItem.subCategory,
            supplier: priceItem.supplier,
            material_rate: priceItem.material ? parseFloat(priceItem.material) || 0 : undefined,
            labour_rate: priceItem.labour ? parseFloat(priceItem.labour) || 0 : undefined,
            plant_rate: priceItem.plant ? parseFloat(priceItem.plant) || 0 : undefined,
            isActive: true,
            clientId: abazaClient._id, // Associate with Abaza Co.
            userId: user._id
          });
          
          importedItems++;
          
          if (importedItems % 10 === 0) {
            console.log(`  Imported ${importedItems} items...`);
          }
        } catch (error) {
          errors.push(`Row ${priceItem.rowNumber}: ${error.message}`);
        }
      }
    }
    
    // Step 4: Create/Update price list record
    console.log('\n[4] Creating price list record...');
    const today = new Date();
    const nextYear = new Date(today);
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    
    // Deactivate old price lists
    const existingLists = await convex.query(api.clientPriceLists.getByClient, {
      clientId: abazaClient._id
    });
    
    for (const list of existingLists) {
      if (list.isDefault) {
        await convex.mutation(api.clientPriceLists.update, {
          id: list._id,
          isDefault: false
        });
      }
    }
    
    // Create new active price list
    const priceListId = await convex.mutation(api.clientPriceLists.create, {
      clientId: abazaClient._id,
      name: `Abaza Co. - MJD Active Price List`,
      description: `Imported ${importedItems} items from MJD-PRICELIST.xlsx on ${today.toLocaleDateString()}`,
      isDefault: true,
      effectiveFrom: today.getTime(),
      effectiveTo: nextYear.getTime(),
      sourceFileName: 'MJD-PRICELIST.xlsx',
      userId: user._id
    });
    
    console.log(`✓ Created price list: ${priceListId}`);
    
    // Step 5: Summary
    console.log('\n' + '='.repeat(50));
    console.log('✅ UPLOAD SUCCESSFUL!');
    console.log('='.repeat(50));
    console.log(`Client: Abaza Co.`);
    console.log(`Total items found: ${totalItems}`);
    console.log(`Successfully imported: ${importedItems}`);
    console.log(`Errors: ${errors.length}`);
    console.log(`Price List Status: Active & Default`);
    console.log('='.repeat(50));
    
    if (errors.length > 0 && errors.length <= 10) {
      console.log('\nErrors encountered:');
      errors.forEach(err => console.log(`  - ${err}`));
    }
    
    // Step 6: Test a sample query
    console.log('\n[5] Testing price retrieval...');
    const allPriceItems = await convex.query(api.priceItems.getAll);
    const abazaItems = allPriceItems.filter(item => 
      item.clientId === abazaClient._id || 
      item.code?.startsWith('ABAZA')
    );
    
    console.log(`\nFound ${abazaItems.length} Abaza Co. specific items`);
    if (abazaItems.length > 0) {
      console.log('\nSample items:');
      abazaItems.slice(0, 5).forEach((item, i) => {
        console.log(`${i + 1}. [${item.code}] ${item.description}`);
        console.log(`   Unit: ${item.unit} | Rate: £${item.rate}`);
      });
    }
    
    console.log('\n✅ Price list is now active for Abaza Co.!');
    console.log('You can now use these prices for BOQ matching.');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
  }
}

// Run the upload
uploadMJDPriceList();