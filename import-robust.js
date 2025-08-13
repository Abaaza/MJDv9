import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_URL = 'http://localhost:5000/api';

// Track progress
let totalImported = 0;
let totalErrors = 0;
let currentBatch = 0;

async function getNewToken() {
  try {
    const response = await axios.post(`${API_URL}/auth/login`, {
      email: 'abaza@mjd.com',
      password: 'abaza123'
    });
    const token = response.data.accessToken;
    fs.writeFileSync(path.join(__dirname, 'token.txt'), token);
    console.log('🔑 New token obtained');
    return token;
  } catch (error) {
    console.error('❌ Failed to get token:', error.message);
    throw error;
  }
}

async function getCurrentStats(token) {
  try {
    const response = await axios.get(`${API_URL}/price-list/stats`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return response.data.totalItems || 0;
  } catch (error) {
    if (error.response?.status === 401) {
      const newToken = await getNewToken();
      return getCurrentStats(newToken);
    }
    console.error('❌ Failed to get stats:', error.message);
    return 0;
  }
}

async function importBatch(items, token, batchNum) {
  const maxRetries = 3;
  let retries = 0;
  
  while (retries < maxRetries) {
    try {
      // Prepare items for import with all required fields
      const updates = items.map((item, idx) => ({
        _id: `new_batch${batchNum}_${idx}`,
        id: item.id || `MJD-${batchNum}-${idx}`,
        code: item.code || `ITEM-${batchNum}-${idx}`,
        description: String(item.description || 'No description').substring(0, 500),
        category: String(item.category || 'General').substring(0, 50),
        subcategory: String(item.subcategory || 'General').substring(0, 50),
        unit: String(item.unit || 'item').substring(0, 20),
        rate: parseFloat(item.rate) || 0,
        // Ensure keywords is an array
        keywords: Array.isArray(item.keywords) ? item.keywords : 
                 (item.description ? item.description.toLowerCase().split(' ').filter(w => w.length > 3).slice(0, 5) : []),
        active: true
      }));

      const response = await axios.post(
        `${API_URL}/price-list/bulk-update`,
        { updates },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000 // 30 second timeout
        }
      );

      const created = response.data.created || 0;
      const updated = response.data.updated || 0;
      const errors = response.data.errors || [];
      
      totalImported += (created + updated);
      totalErrors += errors.length;
      
      console.log(`✅ Batch ${batchNum}: Created ${created}, Updated ${updated}, Errors ${errors.length}`);
      
      if (errors.length > 0 && errors.length < 5) {
        console.log(`   ⚠️ Errors:`, errors.slice(0, 3).join(', '));
      }
      
      return created + updated;
      
    } catch (error) {
      retries++;
      
      if (error.response?.status === 401) {
        console.log('🔄 Token expired, refreshing...');
        token = await getNewToken();
        continue;
      }
      
      if (error.response?.status === 429) {
        console.log(`⏳ Rate limited, waiting ${10 * retries} seconds...`);
        await new Promise(resolve => setTimeout(resolve, 10000 * retries));
        continue;
      }
      
      if (retries >= maxRetries) {
        console.error(`❌ Batch ${batchNum} failed after ${maxRetries} retries:`, error.message);
        totalErrors += items.length;
        return 0;
      }
      
      console.log(`🔄 Retry ${retries}/${maxRetries} for batch ${batchNum}`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  return 0;
}

async function importAllItems() {
  console.log('🚀 Starting comprehensive import process...\n');
  
  // Get initial token
  let token = await getNewToken();
  
  // Check current status
  const initialCount = await getCurrentStats(token);
  console.log(`📊 Current database has ${initialCount} items\n`);
  
  // Read all items
  const allItems = JSON.parse(fs.readFileSync(path.join(__dirname, 'mjd-pricelist-maximum.json'), 'utf-8'));
  console.log(`📦 Total items to import: ${allItems.length}\n`);
  
  // Process in very small batches to avoid issues
  const batchSize = 20; // Very small batches
  const totalBatches = Math.ceil(allItems.length / batchSize);
  
  console.log(`🔄 Processing in ${totalBatches} batches of ${batchSize} items each\n`);
  console.log('═'.repeat(50));
  
  for (let i = 0; i < allItems.length; i += batchSize) {
    currentBatch++;
    const batch = allItems.slice(i, i + batchSize);
    
    // Progress indicator
    const progress = Math.round((i / allItems.length) * 100);
    process.stdout.write(`\r📈 Progress: ${progress}% | Batch ${currentBatch}/${totalBatches} | Imported: ${totalImported} | Errors: ${totalErrors}`);
    
    // Import batch
    await importBatch(batch, token, currentBatch);
    
    // Delay between batches (longer delay every 10 batches)
    if (currentBatch % 10 === 0) {
      console.log('\n⏸️ Pausing for 10 seconds to avoid rate limits...');
      await new Promise(resolve => setTimeout(resolve, 10000));
    } else {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // Refresh token every 50 batches
    if (currentBatch % 50 === 0) {
      console.log('\n🔑 Refreshing token...');
      token = await getNewToken();
    }
  }
  
  console.log('\n\n' + '═'.repeat(50));
  console.log('✅ IMPORT PROCESS COMPLETE');
  console.log('═'.repeat(50));
  
  // Final statistics
  const finalCount = await getCurrentStats(token);
  const imported = finalCount - initialCount;
  
  console.log(`\n📊 FINAL STATISTICS:`);
  console.log(`   Initial items: ${initialCount}`);
  console.log(`   Final items: ${finalCount}`);
  console.log(`   New items imported: ${imported}`);
  console.log(`   Success rate: ${Math.round((totalImported / allItems.length) * 100)}%`);
  console.log(`   Errors: ${totalErrors}`);
  
  if (imported < allItems.length * 0.8) {
    console.log(`\n⚠️ Only ${Math.round((imported / allItems.length) * 100)}% imported.`);
    console.log(`   You may need to run the import again or check for issues.`);
  } else {
    console.log(`\n🎉 Successfully imported ${imported} items!`);
  }
}

// Error handler
process.on('unhandledRejection', (error) => {
  console.error('\n\n💥 Unhandled error:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n⚠️ Import interrupted by user');
  console.log(`   Imported ${totalImported} items before interruption`);
  process.exit(0);
});

// Run the import
importAllItems().catch(error => {
  console.error('\n\n💥 Fatal error:', error.message);
  process.exit(1);
});