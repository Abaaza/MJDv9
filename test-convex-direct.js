/**
 * Direct test of Convex queries
 */

import { ConvexHttpClient } from 'convex/browser';
import { api } from './convex/_generated/api.js';

const CONVEX_URL = 'https://trustworthy-badger-677.convex.cloud';

async function testConvex() {
  try {
    const convex = new ConvexHttpClient(CONVEX_URL);
    
    console.log('Testing Convex queries...\n');
    
    // Test 1: Get all users
    console.log('[1] Testing users.getAllUsers...');
    try {
      const users = await convex.query(api.users.getAllUsers);
      console.log(`✓ Success: Found ${users.length} users`);
      if (users.length > 0) {
        console.log(`  First user: ${users[0].name} (${users[0].email})`);
      }
    } catch (e) {
      console.log(`✗ Failed: ${e.message}`);
    }
    
    // Test 2: Get all clients
    console.log('\n[2] Testing clients.getAll...');
    try {
      const clients = await convex.query(api.clients.getAll);
      console.log(`✓ Success: Found ${clients.length} clients`);
      if (clients.length > 0) {
        console.log(`  First client: ${clients[0].name}`);
      }
    } catch (e) {
      console.log(`✗ Failed: ${e.message}`);
    }
    
    // Test 3: Get active clients
    console.log('\n[3] Testing clients.getActive...');
    try {
      const activeClients = await convex.query(api.clients.getActive);
      console.log(`✓ Success: Found ${activeClients.length} active clients`);
    } catch (e) {
      console.log(`✗ Failed: ${e.message}`);
    }
    
    // Test 4: Get all active price lists
    console.log('\n[4] Testing clientPriceLists.getAllActive...');
    try {
      const priceLists = await convex.query(api.clientPriceLists.getAllActive);
      console.log(`✓ Success: Found ${priceLists.length} active price lists`);
      if (priceLists.length > 0) {
        console.log('  Price lists:');
        priceLists.forEach(pl => {
          console.log(`    - ${pl.name} (Client: ${pl.clientName}, Active: ${pl.isActive}, Default: ${pl.isDefault})`);
        });
      }
    } catch (e) {
      console.log(`✗ Failed: ${e.message}`);
    }
    
    // Test 5: Try to get price lists for a specific client
    console.log('\n[5] Testing clientPriceLists.getByClient...');
    try {
      const clients = await convex.query(api.clients.getAll);
      if (clients.length > 0) {
        const firstClient = clients[0];
        console.log(`  Testing with client: ${firstClient.name} (ID: ${firstClient._id})`);
        
        const clientPriceLists = await convex.query(api.clientPriceLists.getByClient, {
          clientId: firstClient._id
        });
        console.log(`✓ Success: Found ${clientPriceLists.length} price lists for ${firstClient.name}`);
      } else {
        console.log('  Skipped: No clients to test with');
      }
    } catch (e) {
      console.log(`✗ Failed: ${e.message}`);
    }
    
    console.log('\n=== Test Summary ===');
    console.log('Check which queries are failing above.');
    console.log('If clientPriceLists queries fail, there might be a schema issue.');
    
  } catch (error) {
    console.error('Fatal error:', error);
  }
}

// Run the test
testConvex();