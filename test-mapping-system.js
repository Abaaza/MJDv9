import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';

// Configuration
const API_URL = 'http://localhost:5000/api';
const EXCEL_FILE_PATH = 'C:\\Users\\abaza\\Downloads\\MJD-PRICELIST.xlsx';

// Test credentials
const TEST_USER = {
  email: 'abaza@mjd.com',
  password: 'abaza123'
};

let accessToken = '';
let testClientId = '';
let testPriceListId = '';

async function login() {
  try {
    console.log('🔐 Logging in...');
    const response = await axios.post(`${API_URL}/auth/login`, TEST_USER);
    accessToken = response.data.tokens.accessToken;
    console.log('✅ Login successful');
    return accessToken;
  } catch (error) {
    console.error('❌ Login failed:', error.response?.data || error.message);
    throw error;
  }
}

async function createTestClient() {
  try {
    console.log('🏢 Creating test client...');
    const response = await axios.post(
      `${API_URL}/clients`,
      {
        name: 'Test Client for Mapping',
        code: 'TEST-MAP-001',
        contactPerson: 'Test Person',
        email: 'test@example.com',
        phone: '1234567890'
      },
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );
    testClientId = response.data.client._id;
    console.log('✅ Client created:', testClientId);
    return testClientId;
  } catch (error) {
    // If client exists, try to get it
    if (error.response?.status === 409) {
      console.log('ℹ️ Client already exists, fetching...');
      const clientsResponse = await axios.get(`${API_URL}/clients`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const existingClient = clientsResponse.data.find(c => c.code === 'TEST-MAP-001');
      if (existingClient) {
        testClientId = existingClient._id;
        console.log('✅ Found existing client:', testClientId);
        return testClientId;
      }
    }
    console.error('❌ Failed to create/get client:', error.response?.data || error.message);
    throw error;
  }
}

async function uploadPriceListWithMappings() {
  try {
    console.log('📤 Uploading MJD-PRICELIST.xlsx with mappings...');
    
    // Check if file exists
    if (!fs.existsSync(EXCEL_FILE_PATH)) {
      throw new Error(`File not found: ${EXCEL_FILE_PATH}`);
    }

    const form = new FormData();
    form.append('file', fs.createReadStream(EXCEL_FILE_PATH));
    form.append('clientId', testClientId);
    form.append('createNew', 'true');
    form.append('priceListName', 'MJD Master Price List');

    const response = await axios.post(
      `${API_URL}/client-prices/price-lists/upload-sync`,
      form,
      {
        headers: {
          ...form.getHeaders(),
          Authorization: `Bearer ${accessToken}`
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      }
    );

    testPriceListId = response.data.priceListId;
    console.log('✅ Upload successful!');
    console.log('📊 Mapping Results:', response.data.mappingResults);
    return response.data;
  } catch (error) {
    console.error('❌ Upload failed:', error.response?.data || error.message);
    throw error;
  }
}

async function getMappingStats() {
  try {
    console.log('📈 Getting mapping statistics...');
    const response = await axios.get(
      `${API_URL}/client-prices/price-lists/${testPriceListId}/mapping-stats`,
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );
    console.log('✅ Mapping Stats:', response.data);
    return response.data;
  } catch (error) {
    console.error('❌ Failed to get stats:', error.response?.data || error.message);
    throw error;
  }
}

async function validateMappings() {
  try {
    console.log('🔍 Validating mappings...');
    const response = await axios.get(
      `${API_URL}/client-prices/price-lists/${testPriceListId}/validate`,
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );
    console.log('✅ Validation Results:', response.data);
    return response.data;
  } catch (error) {
    console.error('❌ Validation failed:', error.response?.data || error.message);
    throw error;
  }
}

async function testSyncRates() {
  try {
    console.log('🔄 Testing rate synchronization...');
    const response = await axios.post(
      `${API_URL}/client-prices/price-lists/${testPriceListId}/sync-rates`,
      {},
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );
    console.log('✅ Sync Results:', response.data);
    return response.data;
  } catch (error) {
    console.error('❌ Sync failed:', error.response?.data || error.message);
    throw error;
  }
}

async function runTests() {
  console.log('🚀 Starting Price List Mapping System Tests\n');
  console.log('=' . repeat(50));
  
  try {
    // Step 1: Login
    await login();
    
    // Step 2: Create or get test client
    await createTestClient();
    
    // Step 3: Upload Excel file and create mappings
    const uploadResult = await uploadPriceListWithMappings();
    
    // Step 4: Get mapping statistics
    await getMappingStats();
    
    // Step 5: Validate mappings
    await validateMappings();
    
    // Step 6: Test rate synchronization
    await testSyncRates();
    
    console.log('\n' + '=' . repeat(50));
    console.log('✅ All tests completed successfully!');
    console.log('\n📋 Summary:');
    console.log(`- Client ID: ${testClientId}`);
    console.log(`- Price List ID: ${testPriceListId}`);
    console.log(`- Total Mapped Items: ${uploadResult.mappingResults.mappedItems}`);
    console.log(`- Unmapped Items: ${uploadResult.mappingResults.unmappedItems}`);
    
  } catch (error) {
    console.error('\n❌ Test suite failed:', error.message);
    process.exit(1);
  }
}

// Run the tests
runTests().catch(console.error);