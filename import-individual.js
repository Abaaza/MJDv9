import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_URL = 'http://localhost:5000/api';

let token = '';
let successCount = 0;
let errorCount = 0;

async function login() {
  try {
    const response = await axios.post(`${API_URL}/auth/login`, {
      email: 'abaza@mjd.com',
      password: 'abaza123'
    });
    token = response.data.accessToken;
    fs.writeFileSync(path.join(__dirname, 'token.txt'), token);
    console.log('✅ Logged in successfully');
    return token;
  } catch (error) {
    console.error('❌ Login failed:', error.message);
    throw error;
  }
}

async function createPriceItem(item) {
  try {
    const payload = {
      id: item.id || `MJD-${Date.now()}`,
      code: item.code || 'ITEM',
      description: String(item.description || 'No description').substring(0, 500),
      category: String(item.category || 'General').substring(0, 50),
      subcategory: String(item.subcategory || 'General').substring(0, 50),
      unit: String(item.unit || 'item').substring(0, 20),
      rate: parseFloat(item.rate) || 0,
      keywords: item.description ? item.description.toLowerCase().split(' ').filter(w => w.length > 3).slice(0, 5) : [],
      active: true
    };

    const response = await axios.post(
      `${API_URL}/price-list`,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    successCount++;
    return true;
  } catch (error) {
    if (error.response?.status === 401) {
      // Token expired, get new one
      await login();
      return createPriceItem(item); // Retry with new token
    }
    
    if (error.response?.status === 429) {
      // Rate limited, wait and retry
      await new Promise(resolve => setTimeout(resolve, 5000));
      return createPriceItem(item);
    }
    
    errorCount++;
    return false;
  }
}

async function importAll() {
  console.log('🚀 Starting individual item import...\n');
  
  // Login first
  await login();
  
  // Read items
  const items = JSON.parse(fs.readFileSync(path.join(__dirname, 'mjd-pricelist-maximum.json'), 'utf-8'));
  console.log(`📦 Total items to import: ${items.length}\n`);
  
  // Get current count
  try {
    const statsResponse = await axios.get(`${API_URL}/price-list/stats`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    console.log(`📊 Current database has ${statsResponse.data.totalItems} items\n`);
  } catch (error) {
    console.log('⚠️ Could not get current stats\n');
  }
  
  console.log('Starting import...\n');
  console.log('═'.repeat(50));
  
  // Process items one by one with progress
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    
    // Create item
    const success = await createPriceItem(item);
    
    // Progress update every 10 items
    if ((i + 1) % 10 === 0) {
      const progress = Math.round(((i + 1) / items.length) * 100);
      process.stdout.write(`\r📈 Progress: ${progress}% | Processed: ${i + 1}/${items.length} | Success: ${successCount} | Errors: ${errorCount}`);
    }
    
    // Small delay between items
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Longer pause every 100 items
    if ((i + 1) % 100 === 0) {
      console.log('\n⏸️ Pausing for 5 seconds...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    // Refresh token every 500 items
    if ((i + 1) % 500 === 0) {
      console.log('\n🔑 Refreshing token...');
      await login();
    }
  }
  
  console.log('\n\n' + '═'.repeat(50));
  console.log('✅ IMPORT COMPLETE');
  console.log('═'.repeat(50));
  
  // Final stats
  try {
    const finalStats = await axios.get(`${API_URL}/price-list/stats`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    console.log(`\n📊 Final database count: ${finalStats.data.totalItems} items`);
  } catch (error) {
    console.log('\n⚠️ Could not get final stats');
  }
  
  console.log(`\n📊 Import Summary:`);
  console.log(`   ✅ Successful: ${successCount}`);
  console.log(`   ❌ Failed: ${errorCount}`);
  console.log(`   📈 Success rate: ${Math.round((successCount / items.length) * 100)}%`);
}

// Run import
importAll().catch(error => {
  console.error('\n💥 Fatal error:', error.message);
  process.exit(1);
});