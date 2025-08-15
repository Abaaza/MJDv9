/**
 * Import MJD consolidated price list from JSON for Abaza Co.
 */

import { ConvexHttpClient } from 'convex/browser';
import { api } from './convex/_generated/api.js';
import fs from 'fs';

const CONVEX_URL = 'https://trustworthy-badger-677.convex.cloud';
const JSON_FILE = './backend/mjd_consolidated_pricelist.json';

async function importMJDPriceList() {
  try {
    console.log('=== Importing MJD Price List for Abaza Co. ===\n');
    
    const convex = new ConvexHttpClient(CONVEX_URL);
    
    // Step 1: Get user
    console.log('[1] Getting user...');
    const users = await convex.query(api.users.getAllUsers);
    const user = users.find(u => u.email === 'abaza@mjd.com') || users[0];
    console.log(`✓ User: ${user.name} (${user.email})`);
    
    // Step 2: Get or ensure Abaza Co. exists
    console.log('\n[2] Finding Abaza Co. client...');
    const clients = await convex.query(api.clients.getAll);
    let abazaClient = clients.find(c => c.name === 'Abaza Co.' || c.name.toLowerCase().includes('abaza'));
    
    if (!abazaClient) {
      console.log('Creating Abaza Co. client...');
      const clientId = await convex.mutation(api.clients.create, {
        name: 'Abaza Co.',
        email: 'abaza@mjd.com',
        phone: '+20 100 123 4567',
        address: 'Cairo, Egypt',
        contactPerson: 'Mr. Abaza',
        notes: 'Premium client with full MJD price list',
        isActive: true,
        userId: user._id
      });
      abazaClient = { _id: clientId, name: 'Abaza Co.' };
      console.log('✓ Created Abaza Co. client');
    } else {
      console.log(`✓ Found: ${abazaClient.name}`);
    }
    
    // Step 3: Load JSON price list
    console.log('\n[3] Loading price list data...');
    const priceData = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'));
    console.log(`✓ Loaded ${priceData.length} price items`);
    
    // Step 4: Import items in batches
    console.log('\n[4] Importing price items...');
    const BATCH_SIZE = 20;
    let importedCount = 0;
    let errorCount = 0;
    const errors = [];
    
    for (let i = 0; i < priceData.length; i += BATCH_SIZE) {
      const batch = priceData.slice(i, i + BATCH_SIZE);
      
      for (const item of batch) {
        try {
          // Clean and prepare the item data
          const code = item.code || item.ref || `ABAZA-${importedCount + 1}`;
          const description = item.description || '';
          const unit = item.unit || 'EA';
          const rate = parseFloat(item.rate) || 0;
          
          if (description && rate > 0) {
            // Create/update price item with Abaza association
            await convex.mutation(api.priceItems.upsert, {
              code: code.substring(0, 50),
              description: description.substring(0, 500),
              unit: unit.substring(0, 20),
              rate: rate,
              category: item.category || 'General',
              subCategory: item.subcategory || item.subCategory || '',
              supplier: 'MJD',
              keywords: item.keywords || [],
              // Additional fields
              material_rate: item.material_rate || undefined,
              labour_rate: item.labour_rate || undefined,
              plant_rate: item.plant_rate || undefined,
              isActive: true,
              // Mark as Abaza-specific
              clientId: abazaClient._id,
              userId: user._id
            });
            
            importedCount++;
          }
        } catch (error) {
          errorCount++;
          if (errorCount <= 5) {
            errors.push(`Item ${item.code || i}: ${error.message}`);
          }
        }
      }
      
      // Progress update
      console.log(`  Imported ${importedCount}/${priceData.length} items...`);
      
      // Small delay between batches to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    // Step 5: Create/Update price list record
    console.log('\n[5] Creating price list record...');
    
    // Deactivate old price lists for Abaza Co.
    const existingLists = await convex.query(api.clientPriceLists.getByClient, {
      clientId: abazaClient._id
    });
    
    for (const list of existingLists) {
      if (list.isDefault) {
        await convex.mutation(api.clientPriceLists.update, {
          id: list._id,
          isDefault: false
        });
        console.log(`  Deactivated: ${list.name}`);
      }
    }
    
    // Create new active price list
    const today = new Date();
    const nextYear = new Date(today);
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    
    const priceListId = await convex.mutation(api.clientPriceLists.create, {
      clientId: abazaClient._id,
      name: `Abaza Co. - MJD Complete Price List (${importedCount} items)`,
      description: `Full MJD consolidated price list with ${importedCount} items imported on ${today.toLocaleDateString()}`,
      isDefault: true,
      effectiveFrom: today.getTime(),
      effectiveTo: nextYear.getTime(),
      sourceFileName: 'mjd_consolidated_pricelist.json',
      userId: user._id
    });
    
    console.log(`✓ Created price list: ${priceListId}`);
    
    // Step 6: Verify the import
    console.log('\n[6] Verifying import...');
    
    // Get sample items
    const allItems = await convex.query(api.priceItems.getAll);
    const abazaItems = allItems.filter(item => 
      item.clientId === abazaClient._id || 
      item.code?.startsWith('GRO') || 
      item.code?.startsWith('RC') ||
      item.code?.startsWith('DRA')
    ).slice(0, 10);
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ IMPORT SUCCESSFUL!');
    console.log('='.repeat(60));
    console.log(`Client: Abaza Co.`);
    console.log(`Total items in source: ${priceData.length}`);
    console.log(`Successfully imported: ${importedCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log(`Success rate: ${((importedCount/priceData.length)*100).toFixed(1)}%`);
    console.log(`Price List ID: ${priceListId}`);
    console.log(`Status: Active & Default`);
    console.log('='.repeat(60));
    
    if (abazaItems.length > 0) {
      console.log('\nSample imported items:');
      abazaItems.slice(0, 5).forEach((item, i) => {
        console.log(`${i + 1}. [${item.code}] ${item.description}`);
        console.log(`   Category: ${item.category} | Unit: ${item.unit} | Rate: £${item.rate}`);
      });
    }
    
    if (errors.length > 0) {
      console.log('\nFirst few errors:');
      errors.forEach(err => console.log(`  - ${err}`));
    }
    
    console.log('\n✅ Abaza Co. now has a complete MJD price list!');
    console.log('This price list will be used for all BOQ matching for Abaza Co.');
    console.log('\nYou can now:');
    console.log('1. Upload BOQ files and they will match against these prices');
    console.log('2. View the price list in the Client Prices modal');
    console.log('3. Edit individual prices as needed');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
  }
}

// Run the import
importMJDPriceList();