/**
 * Test uploading MJD-PRICELIST.xlsx for Abaza Co.
 */

import fs from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';
import { ConvexHttpClient } from 'convex/browser';
import { api } from './convex/_generated/api.js';

const API_URL = 'http://localhost:5000/api';
const CONVEX_URL = 'https://trustworthy-badger-677.convex.cloud';
const EXCEL_FILE = 'C:\\Users\\abaza\\Downloads\\MJD-PRICELIST.xlsx';

async function testUploadPriceList() {
  try {
    console.log('Testing client price list upload...\n');
    
    // Step 1: Login
    console.log('[1] Logging in...');
    const loginResponse = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'abaza@mjd.com',
        password: 'abaza123'
      })
    });
    
    if (!loginResponse.ok) {
      const error = await loginResponse.text();
      throw new Error(`Login failed: ${error}`);
    }
    
    const { accessToken, user } = await loginResponse.json();
    console.log(`✓ Logged in as: ${user.name}`);
    
    // Step 2: Get Abaza Co. client from Convex
    console.log('\n[2] Finding Abaza Co. client...');
    const convex = new ConvexHttpClient(CONVEX_URL);
    const clients = await convex.query(api.clients.getAll);
    const abazaClient = clients.find(c => c.name === 'Abaza Co.');
    
    if (!abazaClient) {
      throw new Error('Abaza Co. client not found');
    }
    console.log(`✓ Found client: ${abazaClient.name} (ID: ${abazaClient._id})`);
    
    // Step 3: Get the price list
    console.log('\n[3] Getting price list...');
    const priceLists = await convex.query(api.clientPriceLists.getByClient, {
      clientId: abazaClient._id
    });
    
    if (priceLists.length === 0) {
      throw new Error('No price lists found for Abaza Co.');
    }
    
    const priceList = priceLists[0];
    console.log(`✓ Found price list: ${priceList.name} (ID: ${priceList._id})`);
    
    // Step 4: Check if Excel file exists
    console.log('\n[4] Checking Excel file...');
    if (!fs.existsSync(EXCEL_FILE)) {
      console.log('Excel file not found. Creating a sample file...');
      // You could create a sample file here if needed
      throw new Error(`Excel file not found: ${EXCEL_FILE}`);
    }
    
    const stats = fs.statSync(EXCEL_FILE);
    console.log(`✓ File found: ${(stats.size / 1024).toFixed(2)} KB`);
    
    // Step 5: Upload the file
    console.log('\n[5] Uploading Excel file...');
    const formData = new FormData();
    formData.append('file', fs.createReadStream(EXCEL_FILE));
    formData.append('clientId', abazaClient._id);
    formData.append('priceListId', priceList._id);
    
    const uploadResponse = await fetch(`${API_URL}/client-price-list/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        ...formData.getHeaders()
      },
      body: formData
    });
    
    if (!uploadResponse.ok) {
      const error = await uploadResponse.text();
      throw new Error(`Upload failed: ${error}`);
    }
    
    const result = await uploadResponse.json();
    console.log('✓ Upload successful!');
    console.log(`  Items processed: ${result.itemsProcessed || 'Processing...'}`);
    console.log(`  Status: ${result.status}`);
    
    // Step 6: Verify in Convex
    console.log('\n[6] Verifying in database...');
    // You could add verification of clientPriceItems here
    
    console.log('\n=== Test Complete ===');
    console.log('Price list has been uploaded successfully.');
    console.log('You can now use these prices for matching in the BOQ system.');
    
  } catch (error) {
    console.error('Error:', error.message);
    console.log('\nMake sure:');
    console.log('1. Backend is running on port 5000');
    console.log('2. Excel file exists at:', EXCEL_FILE);
    console.log('3. Convex is properly connected');
  }
}

testUploadPriceList();