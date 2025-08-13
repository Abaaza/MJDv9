/**
 * Script to create a test price list directly in Convex
 * Run this to ensure there's at least one price list in the database
 */

import { ConvexHttpClient } from 'convex/browser';
import { api } from './convex/_generated/api.js';

const CONVEX_URL = 'https://good-dolphin-454.convex.cloud';

async function createTestPriceList() {
  try {
    console.log('Creating test price list in Convex...\n');
    
    const convex = new ConvexHttpClient(CONVEX_URL);
    
    // Step 1: Get all users
    console.log('[1] Fetching users...');
    const users = await convex.query(api.users.getAllUsers);
    console.log(`Found ${users.length} users`);
    
    if (users.length === 0) {
      console.log('No users found. Please create a user account first.');
      return;
    }
    
    const user = users[0];
    console.log(`Using user: ${user.name} (${user.email})`);
    
    // Step 2: Get or create a client
    console.log('\n[2] Fetching clients...');
    const clients = await convex.query(api.clients.getAll);
    console.log(`Found ${clients.length} clients`);
    
    let client;
    if (clients.length === 0) {
      console.log('No clients found. Creating Abaza Co...');
      const clientId = await convex.mutation(api.clients.create, {
        name: 'Abaza Co.',
        email: 'info@abaza.co',
        phone: '+20 123 456 7890',
        address: 'Cairo, Egypt',
        contactPerson: 'Mr. Abaza',
        notes: 'Test client for price lists',
        isActive: true,
        userId: user._id
      });
      client = await convex.query(api.clients.getById, { _id: clientId });
      console.log(`Created client: ${client.name}`);
    } else {
      client = clients[0];
      console.log(`Using existing client: ${client.name}`);
    }
    
    // Step 3: Check existing price lists
    console.log('\n[3] Checking existing price lists...');
    const existingPriceLists = await convex.query(api.clientPriceLists.getByClient, {
      clientId: client._id
    });
    console.log(`Found ${existingPriceLists.length} price lists for ${client.name}`);
    
    // Step 4: Create a new price list
    console.log('\n[4] Creating new price list...');
    const today = new Date();
    const nextYear = new Date(today);
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    
    const priceListId = await convex.mutation(api.clientPriceLists.create, {
      clientId: client._id,
      name: `${client.name} - Q1 2025 Rates`,
      description: 'Test price list created via script',
      isDefault: true,
      isActive: true,
      effectiveFrom: today.getTime(),
      effectiveTo: nextYear.getTime(),
      sourceFileName: 'MJD-PRICELIST.xlsx',
      userId: user._id
    });
    
    console.log(`✓ Created price list with ID: ${priceListId}`);
    
    // Step 5: Verify it was created
    console.log('\n[5] Verifying price list...');
    const allActivePriceLists = await convex.query(api.clientPriceLists.getAllActive);
    console.log(`Total active price lists in database: ${allActivePriceLists.length}`);
    
    const ourPriceList = allActivePriceLists.find(pl => pl._id === priceListId);
    if (ourPriceList) {
      console.log('\n✓ Price list successfully created and is active!');
      console.log('Details:');
      console.log(`  Name: ${ourPriceList.name}`);
      console.log(`  Client: ${ourPriceList.clientName}`);
      console.log(`  Default: ${ourPriceList.isDefault ? 'Yes' : 'No'}`);
      console.log(`  Active: ${ourPriceList.isActive ? 'Yes' : 'No'}`);
      console.log(`  Effective From: ${new Date(ourPriceList.effectiveFrom).toLocaleDateString()}`);
      console.log(`  Effective To: ${new Date(ourPriceList.effectiveTo).toLocaleDateString()}`);
    } else {
      console.log('Warning: Price list created but not found in active lists');
    }
    
    console.log('\n=== Test Complete ===');
    console.log('1. Go to https://mjd.braunwell.io');
    console.log('2. Navigate to Price List section');
    console.log('3. Click "Client Prices" button');
    console.log('4. Check the "Manage Price Lists" tab');
    console.log('5. The price list should now be visible');
    
  } catch (error) {
    console.error('Error:', error);
    if (error.message?.includes('Cannot find module')) {
      console.log('\nMake sure to run this from the project directory:');
      console.log('  cd boq-matching-system');
      console.log('  node create-test-pricelist.js');
    }
  }
}

// Run the script
createTestPriceList();