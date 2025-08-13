import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_URL = 'http://localhost:5000/api';

async function importPriceList() {
  try {
    // Read token
    const token = fs.readFileSync(path.join(__dirname, 'token.txt'), 'utf-8').trim();
    
    // Read the price list data
    const items = JSON.parse(fs.readFileSync(path.join(__dirname, 'mjd-pricelist-maximum.json'), 'utf-8'));
    
    console.log(`📊 Starting import of ${items.length} items...`);
    console.log('⏳ This will take several minutes...\n');
    
    // Process in smaller batches to avoid rate limits
    const batchSize = 50; // Small batch size to avoid issues
    let successCount = 0;
    let errorCount = 0;
    let processedCount = 0;
    
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      
      // Prepare batch for bulk update
      const updates = batch.map(item => ({
        _id: `new_${item.id}`, // Mark as new item
        id: item.id,
        code: item.code || `ITEM-${i}`,
        description: item.description || 'No description',
        category: item.category || 'General',
        subcategory: item.subcategory || 'General',
        unit: item.unit || 'item',
        rate: parseFloat(item.rate) || 0,
        keywords: item.description ? item.description.toLowerCase().split(' ').filter(w => w.length > 3).slice(0, 5) : [],
        material_type: '',
        work_type: '',
        active: true
      }));
      
      try {
        const response = await axios.post(
          `${API_URL}/price-list/bulk-update`,
          { updates },
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        if (response.data.created) {
          successCount += response.data.created;
        }
        if (response.data.updated) {
          successCount += response.data.updated;
        }
        if (response.data.errors && response.data.errors.length > 0) {
          errorCount += response.data.errors.length;
        }
        
        processedCount += batch.length;
        
        // Progress update
        const progress = Math.round((processedCount / items.length) * 100);
        process.stdout.write(`\r📦 Progress: ${progress}% | Imported: ${successCount} | Errors: ${errorCount}`);
        
      } catch (error) {
        console.error(`\n❌ Error in batch ${Math.floor(i / batchSize) + 1}:`, error.response?.data || error.message);
        errorCount += batch.length;
        
        // If token expired, get new one
        if (error.response?.status === 401 || error.response?.data?.error === 'Invalid token') {
          console.log('\n🔄 Token expired, getting new token...');
          const loginResponse = await axios.post(`${API_URL}/auth/login`, {
            email: 'abaza@mjd.com',
            password: 'abaza123'
          });
          const newToken = loginResponse.data.accessToken;
          fs.writeFileSync(path.join(__dirname, 'token.txt'), newToken);
          console.log('✅ New token obtained, continuing...');
          i -= batchSize; // Retry this batch
          continue;
        }
      }
      
      // Delay between batches to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('\n\n=====================================');
    console.log('✅ IMPORT COMPLETE');
    console.log('=====================================');
    console.log(`📊 Total items processed: ${processedCount}`);
    console.log(`✅ Successfully imported: ${successCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log(`📈 Success rate: ${Math.round((successCount / processedCount) * 100)}%`);
    
    // Verify by checking total count
    const statsResponse = await axios.get(`${API_URL}/price-list/stats`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    console.log(`\n📊 Database now contains: ${statsResponse.data.totalItems} items`);
    console.log(`📁 Categories: ${statsResponse.data.categories.length}`);
    
  } catch (error) {
    console.error('💥 Fatal error:', error.message);
  }
}

// Run import
importPriceList();