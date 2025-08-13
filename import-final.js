import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_URL = 'http://localhost:5000/api';

async function importMJDPriceList() {
  console.log('🚀 FINAL IMPORT ATTEMPT\n');
  
  // Login
  console.log('🔐 Logging in...');
  const loginResponse = await axios.post(`${API_URL}/auth/login`, {
    email: 'abaza@mjd.com',
    password: 'abaza123'
  });
  let token = loginResponse.data.accessToken;
  console.log('✅ Logged in\n');
  
  // Read the CSV file directly
  const csvPath = path.join(__dirname, 'mjd-pricelist-maximum.csv');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const lines = csvContent.split('\n');
  const headers = lines[0].split(',');
  
  console.log(`📊 Found ${lines.length - 1} items in CSV\n`);
  
  let successCount = 0;
  let errorCount = 0;
  let skipCount = 0;
  
  // Process each line
  for (let i = 1; i < lines.length && i < 5000; i++) { // Limit to 5000 for now
    const line = lines[i];
    if (!line || line.trim() === '') {
      skipCount++;
      continue;
    }
    
    try {
      // Parse CSV line (handle quoted fields)
      const matches = line.match(/(".*?"|[^,]+)(?=\s*,|\s*$)/g);
      if (!matches || matches.length < 7) {
        skipCount++;
        continue;
      }
      
      // Clean values
      const cleanValue = (val) => {
        if (!val) return '';
        return val.replace(/^"|"$/g, '').replace(/""/g, '"').trim();
      };
      
      const item = {
        id: cleanValue(matches[0]) || `MJD-${i}`,
        code: cleanValue(matches[1]) || `ITEM-${i}`,
        description: cleanValue(matches[2]) || 'No description',
        category: cleanValue(matches[3]) || 'General',
        subcategory: cleanValue(matches[4]) || 'General',
        unit: cleanValue(matches[5]) || 'item',
        rate: parseFloat(cleanValue(matches[6])) || 0,
        keywords: []
      };
      
      // Skip if description is too short or invalid
      if (item.description.length < 3 || item.description === 'No description') {
        skipCount++;
        continue;
      }
      
      // Create the item
      try {
        const response = await axios.post(
          `${API_URL}/price-list`,
          item,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            timeout: 5000
          }
        );
        
        if (response.data.id) {
          successCount++;
        } else {
          errorCount++;
        }
      } catch (error) {
        if (error.response?.status === 401) {
          // Refresh token
          const newLogin = await axios.post(`${API_URL}/auth/login`, {
            email: 'abaza@mjd.com',
            password: 'abaza123'
          });
          token = newLogin.data.accessToken;
          i--; // Retry this item
          continue;
        }
        errorCount++;
      }
      
      // Progress update
      if (i % 50 === 0) {
        const progress = Math.round((i / Math.min(5000, lines.length)) * 100);
        console.log(`📈 Progress: ${progress}% | Success: ${successCount} | Errors: ${errorCount} | Skipped: ${skipCount}`);
      }
      
      // Small delay to avoid overwhelming the server
      if (i % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // Longer delay every 100 items
      if (i % 100 === 0) {
        console.log('⏸️ Pausing 3 seconds...');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
      
    } catch (error) {
      errorCount++;
      console.error(`Error processing line ${i}:`, error.message);
    }
  }
  
  console.log('\n' + '═'.repeat(50));
  console.log('✅ IMPORT COMPLETE');
  console.log('═'.repeat(50));
  console.log(`\n📊 Final Results:`);
  console.log(`   ✅ Successful imports: ${successCount}`);
  console.log(`   ❌ Failed imports: ${errorCount}`);
  console.log(`   ⏭️ Skipped (invalid): ${skipCount}`);
  console.log(`   📈 Success rate: ${Math.round((successCount / (successCount + errorCount)) * 100)}%`);
  
  // Check final count
  try {
    const stats = await axios.get(`${API_URL}/price-list/stats`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    console.log(`\n📊 Database now contains: ${stats.data.totalItems} items`);
    console.log(`📁 Categories: ${stats.data.categories.join(', ')}`);
  } catch (error) {
    console.log('\n⚠️ Could not fetch final stats');
  }
}

// Run the import
importMJDPriceList().catch(error => {
  console.error('💥 Fatal error:', error.message);
  process.exit(1);
});