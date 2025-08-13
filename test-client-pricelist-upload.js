/**
 * Test script for uploading client price list
 * This will create a new price list for Abaza Co. using MJD-PRICELIST.xlsx
 */

const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const { ConvexHttpClient } = require('convex/browser');

// Configuration
const API_URL = 'https://100.24.46.199/api'; // Direct EC2 backend
const CONVEX_URL = 'https://good-dolphin-454.convex.cloud';
const TEST_USER_EMAIL = 'abaza@mjd.com';
const TEST_USER_PASSWORD = 'abaza123';
const CLIENT_NAME = 'Abaza Co.';
const EXCEL_FILE_PATH = 'C:\\Users\\abaza\\Downloads\\MJD-PRICELIST.xlsx';

// Initialize Convex client
const convex = new ConvexHttpClient(CONVEX_URL);

// Disable SSL verification for self-signed certificate
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function main() {
  try {
    console.log('=== Client Price List Upload Test ===\n');

    // Step 1: Login to get access token
    console.log('[1] Logging in...');
    const loginResponse = await axios.post(`${API_URL}/auth/login`, {
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD
    }, {
      headers: { 'Content-Type': 'application/json' }
    });

    const { accessToken, user } = loginResponse.data;
    console.log(`✓ Logged in as: ${user.name} (${user.email})`);

    // Step 2: Check if Abaza Co. client exists, create if not
    console.log(`\n[2] Checking for client: ${CLIENT_NAME}...`);
    
    // First, import the Convex API
    const { api } = await import('./convex/_generated/api.js');
    
    // Get all clients
    let clients = await convex.query(api.clients.getAll);
    let abazaClient = clients.find(c => c.name === CLIENT_NAME);

    if (!abazaClient) {
      console.log(`  Client not found. Creating ${CLIENT_NAME}...`);
      
      // Create the client
      const clientId = await convex.mutation(api.clients.create, {
        name: CLIENT_NAME,
        email: 'info@abaza.co',
        phone: '+1234567890',
        address: 'Cairo, Egypt',
        contactPerson: 'Abaza',
        notes: 'Test client for price list upload',
        isActive: true,
        userId: user._id
      });

      // Fetch the created client
      abazaClient = await convex.query(api.clients.getById, { _id: clientId });
      console.log(`✓ Client created: ${abazaClient.name} (ID: ${abazaClient._id})`);
    } else {
      console.log(`✓ Client found: ${abazaClient.name} (ID: ${abazaClient._id})`);
    }

    // Step 3: Check if Excel file exists
    console.log(`\n[3] Checking Excel file...`);
    if (!fs.existsSync(EXCEL_FILE_PATH)) {
      // Try to find it in the project directory
      const alternativePath = path.join(__dirname, 'MJD-PRICELIST.xlsx');
      if (fs.existsSync(alternativePath)) {
        console.log(`  Using alternative path: ${alternativePath}`);
        EXCEL_FILE_PATH = alternativePath;
      } else {
        console.error(`✗ Excel file not found at: ${EXCEL_FILE_PATH}`);
        console.log('\nPlease ensure MJD-PRICELIST.xlsx is in one of these locations:');
        console.log(`  1. C:\\Users\\abaza\\Downloads\\MJD-PRICELIST.xlsx`);
        console.log(`  2. ${alternativePath}`);
        return;
      }
    }
    
    const fileStats = fs.statSync(EXCEL_FILE_PATH);
    console.log(`✓ File found: ${path.basename(EXCEL_FILE_PATH)} (${(fileStats.size / 1024).toFixed(2)} KB)`);

    // Step 4: Create price list details
    console.log(`\n[4] Creating new price list...`);
    const today = new Date();
    const nextYear = new Date(today);
    nextYear.setFullYear(nextYear.getFullYear() + 1);

    const priceListDetails = {
      name: `Abaza Co. Price List - ${today.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`,
      description: `Active price list for Abaza Co. imported from MJD-PRICELIST.xlsx`,
      isDefault: true, // Set as default for this client
      effectiveFrom: today.getTime(),
      effectiveTo: nextYear.getTime()
    };

    console.log(`  Name: ${priceListDetails.name}`);
    console.log(`  Effective: ${today.toLocaleDateString()} to ${nextYear.toLocaleDateString()}`);
    console.log(`  Default: Yes`);

    // Step 5: Upload and sync the Excel file
    console.log(`\n[5] Uploading Excel file and creating price list...`);
    
    // Create form data
    const formData = new FormData();
    formData.append('file', fs.createReadStream(EXCEL_FILE_PATH));
    formData.append('clientId', abazaClient._id);
    formData.append('createNew', 'true');
    formData.append('priceListName', priceListDetails.name);
    formData.append('description', priceListDetails.description);
    formData.append('isDefault', 'true');
    formData.append('effectiveFrom', priceListDetails.effectiveFrom.toString());
    formData.append('effectiveTo', priceListDetails.effectiveTo.toString());

    try {
      const uploadResponse = await axios.post(
        `${API_URL}/client-prices/price-lists/upload-sync`,
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            'Authorization': `Bearer ${accessToken}`
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity
        }
      );

      if (uploadResponse.data.success) {
        console.log('\n✓ Price list created successfully!');
        console.log(`  Price List ID: ${uploadResponse.data.priceListId}`);
        console.log(`  Mapped Items: ${uploadResponse.data.mappingResults.mappedItems}`);
        console.log(`  Verified Items: ${uploadResponse.data.mappingResults.verifiedItems}`);
        console.log(`  Manual Review Required: ${uploadResponse.data.mappingResults.manualReviewRequired}`);
        
        // Step 6: Verify the price list is active
        console.log(`\n[6] Verifying price list status...`);
        const priceLists = await convex.query(api.clientPriceLists.getByClient, {
          clientId: abazaClient._id
        });
        
        const activePriceList = priceLists.find(pl => pl.isDefault);
        if (activePriceList) {
          console.log(`✓ Active price list confirmed: ${activePriceList.name}`);
          console.log(`  Status: ${activePriceList.isActive ? 'Active' : 'Inactive'}`);
          console.log(`  Default: ${activePriceList.isDefault ? 'Yes' : 'No'}`);
        }

        console.log('\n=== Test Completed Successfully ===');
        console.log('\nNext steps:');
        console.log('1. Login to https://mjd.braunwell.io');
        console.log('2. Go to Price List → Client Prices');
        console.log('3. Select "Manage Price Lists" tab to see the uploaded list');
        console.log('4. You can now use this price list for BOQ matching for Abaza Co.');
      } else {
        console.error('\n✗ Upload failed:', uploadResponse.data.error);
      }
    } catch (uploadError) {
      if (uploadError.response?.status === 404) {
        console.error('\n✗ Client price list endpoint not found (404)');
        console.log('\nThis might mean:');
        console.log('1. The endpoint is not deployed on the EC2 server');
        console.log('2. The route path is incorrect');
        console.log('\nTrying alternative approach...');
        
        // Alternative: Direct database insertion
        console.log('\n[Alternative] Creating price list directly in database...');
        
        const priceListId = await convex.mutation(api.clientPriceLists.create, {
          clientId: abazaClient._id,
          name: priceListDetails.name,
          description: priceListDetails.description,
          isDefault: true,
          effectiveFrom: priceListDetails.effectiveFrom,
          effectiveTo: priceListDetails.effectiveTo,
          sourceFileName: 'MJD-PRICELIST.xlsx',
          userId: user._id
        });
        
        console.log(`✓ Price list created in database: ${priceListId}`);
        console.log('\nNote: Excel file processing would need to be done separately.');
      } else {
        console.error('\n✗ Upload error:', uploadError.response?.data || uploadError.message);
      }
    }

  } catch (error) {
    console.error('\n✗ Test failed:', error.response?.data || error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('\nConnection refused. Please check:');
      console.log('1. EC2 server is running');
      console.log('2. Backend process is active (PM2)');
      console.log('3. Security group allows access');
    }
  }
}

// Run the test
console.log('Starting client price list upload test...\n');
main().catch(console.error);