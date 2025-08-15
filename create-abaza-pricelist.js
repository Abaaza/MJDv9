/**
 * Script to create a price list for Abaza Co. client
 */

import { ConvexHttpClient } from 'convex/browser';
import { api } from './convex/_generated/api.js';

const CONVEX_URL = 'https://trustworthy-badger-677.convex.cloud';

async function createAbazaPriceList() {
  try {
    console.log('Creating price list for Abaza Co...\n');
    
    const convex = new ConvexHttpClient(CONVEX_URL);
    
    // Step 1: Get user
    const users = await convex.query(api.users.getAllUsers);
    if (users.length === 0) {
      console.log('No users found.');
      return;
    }
    const user = users[0];
    console.log(`Using user: ${user.name}`);
    
    // Step 2: Find or create Abaza Co. client
    console.log('\nLooking for Abaza Co. client...');
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
        notes: 'Premium client with custom pricing',
        isActive: true,
        userId: user._id
      });
      abazaClient = await convex.query(api.clients.getById, { _id: clientId });
      console.log('Created Abaza Co. client');
    } else {
      console.log(`Found client: ${abazaClient.name}`);
    }
    
    // Step 3: Create price list
    console.log('\nCreating price list...');
    const today = new Date();
    const nextYear = new Date(today);
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    
    const priceListId = await convex.mutation(api.clientPriceLists.create, {
      clientId: abazaClient._id,
      name: `${abazaClient.name} - Premium 2025 Rates`,
      description: 'Premium pricing for Abaza Co. with special discounts',
      isDefault: true,
      effectiveFrom: today.getTime(),
      effectiveTo: nextYear.getTime(),
      sourceFileName: 'MJD-PRICELIST.xlsx',
      sourceFileUrl: 'https://mjd-boq-uploads-prod.s3.amazonaws.com/MJD-PRICELIST.xlsx',
      userId: user._id
    });
    
    console.log(`✓ Created price list with ID: ${priceListId}`);
    
    // Step 4: Verify
    console.log('\nVerifying...');
    const allPriceLists = await convex.query(api.clientPriceLists.getAllActive);
    console.log(`Total active price lists: ${allPriceLists.length}`);
    
    const abazaPriceList = allPriceLists.find(pl => pl._id === priceListId);
    if (abazaPriceList) {
      console.log('\n✓ Abaza Co. price list successfully created!');
      console.log('Details:');
      console.log(`  Name: ${abazaPriceList.name}`);
      console.log(`  Client: ${abazaPriceList.clientName}`);
      console.log(`  Default: ${abazaPriceList.isDefault ? 'Yes' : 'No'}`);
      console.log(`  Description: ${abazaPriceList.description}`);
    }
    
    console.log('\n=== Complete ===');
    console.log('Price list is now available in the Client Prices modal');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

createAbazaPriceList();