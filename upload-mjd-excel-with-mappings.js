/**
 * Upload MJD-PRICELIST.xlsx with full Excel mapping for Abaza Co.
 * This maintains 1-to-1 mapping with formulas and cell references
 */

import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';
import { ConvexHttpClient } from 'convex/browser';
import { api } from './convex/_generated/api.js';

const API_URL = 'http://localhost:5000/api';
const CONVEX_URL = 'https://trustworthy-badger-677.convex.cloud';
const EXCEL_FILE = './MJD-PRICELIST.xlsx';

async function uploadMJDExcelWithMappings() {
  try {
    console.log('=== Uploading MJD-PRICELIST.xlsx with Full Excel Mappings ===\n');
    
    // Step 1: Login
    console.log('[1] Logging in...');
    let accessToken, user;
    
    const loginResponse = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'abaza@mjd.com',
        password: 'abaza123'
      })
    });
    
    if (!loginResponse.ok) {
      // Try default admin
      const adminLogin = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'admin@boqsystem.com',
          password: 'admin123'
        })
      });
      
      if (!adminLogin.ok) {
        throw new Error('Failed to login');
      }
      
      const adminData = await adminLogin.json();
      console.log(`✓ Logged in as: ${adminData.user.name}`);
      accessToken = adminData.accessToken;
      user = adminData.user;
    } else {
      const loginData = await loginResponse.json();
      accessToken = loginData.accessToken;
      user = loginData.user;
      console.log(`✓ Logged in as: ${user.name}`);
    }
    
    // Step 2: Get or create Abaza Co. client
    console.log('\n[2] Finding Abaza Co. client...');
    const convex = new ConvexHttpClient(CONVEX_URL);
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
        notes: 'Premium client with dynamic Excel pricing',
        isActive: true,
        userId: user.userId || user.id
      });
      
      abazaClient = await convex.query(api.clients.getById, { _id: clientId });
      console.log('✓ Created Abaza Co. client');
    } else {
      console.log(`✓ Found: ${abazaClient.name}`);
    }
    
    // Step 3: Check existing price lists
    console.log('\n[3] Checking existing price lists...');
    const existingLists = await convex.query(api.clientPriceLists.getByClient, {
      clientId: abazaClient._id
    });
    
    console.log(`Found ${existingLists.length} existing price lists`);
    
    // Step 4: Upload Excel file with mappings
    console.log('\n[4] Uploading Excel file with mappings...');
    
    if (!fs.existsSync(EXCEL_FILE)) {
      throw new Error(`Excel file not found: ${EXCEL_FILE}`);
    }
    
    const formData = new FormData();
    formData.append('file', fs.createReadStream(EXCEL_FILE));
    formData.append('clientId', abazaClient._id);
    formData.append('createNew', 'true'); // Always create new to maintain version history
    formData.append('priceListName', `Abaza Co. - MJD Master Price List ${new Date().toLocaleDateString()}`);
    
    const uploadResponse = await fetch(`${API_URL}/client-prices/price-lists/upload-sync`, {
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
    console.log(`  Price List ID: ${result.priceListId}`);
    console.log(`  Mapped Items: ${result.mappingResults?.mappedItems || 0}`);
    console.log(`  Total Rows: ${result.mappingResults?.totalRows || 0}`);
    
    // Step 5: Verify the mappings
    console.log('\n[5] Verifying Excel mappings...');
    const mappings = await convex.query(api.excelMappings.getByPriceList, {
      priceListId: result.priceListId
    });
    
    console.log(`✓ Created ${mappings.length} Excel mappings`);
    
    if (mappings.length > 0) {
      console.log('\nSample mappings (first 5):');
      mappings.slice(0, 5).forEach((mapping, i) => {
        console.log(`${i + 1}. Sheet: ${mapping.sheetName}, Row: ${mapping.rowNumber}`);
        console.log(`   Original: ${mapping.originalDescription || mapping.originalCode}`);
        console.log(`   Mapped to: ${mapping.priceItem?.description || 'New Item'}`);
        console.log(`   Rate: ${mapping.originalRate} | Confidence: ${(mapping.mappingConfidence * 100).toFixed(0)}%`);
      });
    }
    
    // Step 6: Get mapping statistics
    console.log('\n[6] Mapping Statistics...');
    const stats = await convex.query(api.excelMappings.getMappingStats, {
      priceListId: result.priceListId
    });
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ EXCEL UPLOAD WITH MAPPINGS COMPLETE!');
    console.log('='.repeat(60));
    console.log(`Client: Abaza Co.`);
    console.log(`Price List ID: ${result.priceListId}`);
    console.log(`Total Mappings: ${stats.total}`);
    console.log(`Verified: ${stats.verified}`);
    console.log(`High Confidence: ${stats.byConfidence.high}`);
    console.log(`Medium Confidence: ${stats.byConfidence.medium}`);
    console.log(`Low Confidence: ${stats.byConfidence.low}`);
    console.log('\nMappings by Sheet:');
    Object.entries(stats.bySheet).forEach(([sheet, count]) => {
      console.log(`  ${sheet}: ${count} items`);
    });
    console.log('='.repeat(60));
    
    console.log('\n✅ The Excel file is now mapped 1-to-1 with the price list!');
    console.log('\nKey features:');
    console.log('• All formulas and cell references are preserved');
    console.log('• When you upload an updated Excel file, prices will sync automatically');
    console.log('• Each item is mapped to its exact cell location in the Excel file');
    console.log('• Changes in the Excel file will be reflected in the client price list');
    console.log('\nYou can now:');
    console.log('1. Upload BOQ files - they will use these mapped prices');
    console.log('2. Re-upload the Excel file anytime to update prices');
    console.log('3. View the mappings in the Client Prices modal');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    console.log('\nMake sure:');
    console.log('1. Backend is running: cd backend && npm run dev');
    console.log('2. Excel file exists: MJD-PRICELIST.xlsx');
    console.log('3. User credentials are correct');
  }
}

// Run the upload
uploadMJDExcelWithMappings();