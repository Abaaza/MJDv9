import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_URL = 'http://localhost:5000/api';

async function importAllRemaining() {
  console.log('🚀 IMPORTING ALL REMAINING ITEMS - FULL SPEED\n');
  
  // Login
  console.log('🔐 Logging in...');
  const loginResponse = await axios.post(`${API_URL}/auth/login`, {
    email: 'abaza@mjd.com',
    password: 'abaza123'
  });
  let token = loginResponse.data.accessToken;
  console.log('✅ Logged in\n');
  
  // Check current count
  let startCount = 0;
  try {
    const stats = await axios.get(`${API_URL}/price-list/stats`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    startCount = stats.data.totalItems || 0;
    console.log(`📊 Current database has ${startCount} items`);
  } catch (error) {
    console.log('⚠️ Could not get current stats');
  }
  
  // Read the CSV file
  const csvPath = path.join(__dirname, 'mjd-pricelist-maximum.csv');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const lines = csvContent.split('\n');
  
  const totalLines = lines.length - 1;
  console.log(`📊 Total items in CSV: ${totalLines}`);
  console.log(`📊 Items remaining to import: ${totalLines - startCount}\n`);
  
  // Start from where we left off
  const startLine = Math.max(1, startCount - 100); // Start 100 before to catch any missed
  
  console.log(`📊 Starting from line ${startLine}\n`);
  console.log('⚡ Running at maximum speed...\n');
  
  let successCount = 0;
  let errorCount = 0;
  let skipCount = 0;
  let duplicateCount = 0;
  let tokenRefreshCount = 0;
  
  // Process ALL remaining items
  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.trim() === '') {
      skipCount++;
      continue;
    }
    
    try {
      // Parse CSV line quickly
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
      
      // Quick keyword generation
      if (item.description && item.description.length > 3) {
        const words = item.description.toLowerCase().split(/\s+/);
        item.keywords = words.filter(w => w.length > 4).slice(0, 3);
      }
      
      // Skip invalid items
      if (item.description.length < 3 || item.description === 'No description') {
        skipCount++;
        continue;
      }
      
      // Create the item with minimal delay
      try {
        const response = await axios.post(
          `${API_URL}/price-list`,
          item,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            timeout: 3000 // Shorter timeout for speed
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
          tokenRefreshCount++;
          const newLogin = await axios.post(`${API_URL}/auth/login`, {
            email: 'abaza@mjd.com',
            password: 'abaza123'
          });
          token = newLogin.data.accessToken;
          i--; // Retry this item
          continue;
        } else if (error.response?.status === 429) {
          // Rate limited - wait briefly
          await new Promise(resolve => setTimeout(resolve, 1000));
          i--; // Retry
          continue;
        } else if (error.response?.data?.error?.includes('duplicate')) {
          duplicateCount++;
        } else {
          errorCount++;
        }
      }
      
      // Minimal progress updates to save time
      if ((i - startLine) % 250 === 0 && i > startLine) {
        const progress = Math.round(((i) / totalLines) * 100);
        const rate = Math.round(successCount / ((Date.now() - startTime) / 1000));
        console.log(`📈 Overall: ${progress}% | Imported: ${startCount + successCount} / ${totalLines} | Rate: ${rate} items/sec | Errors: ${errorCount}`);
      }
      
      // Minimal delays - only when necessary
      if (i % 50 === 0) {
        await new Promise(resolve => setTimeout(resolve, 50)); // 50ms micro-pause
      }
      
      // Slightly longer pause every 500 items
      if (i % 500 === 0 && i > startLine) {
        console.log('⏸️ Quick pause...');
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
    } catch (error) {
      errorCount++;
      // Silent error - continue at full speed
    }
  }
  
  console.log('\n' + '═'.repeat(60));
  console.log('🎉 IMPORT COMPLETE!');
  console.log('═'.repeat(60));
  console.log(`\n📊 Final Results:`);
  console.log(`   ✅ Successfully imported: ${successCount}`);
  console.log(`   ⏭️ Duplicates skipped: ${duplicateCount}`);
  console.log(`   ❌ Failed imports: ${errorCount}`);
  console.log(`   ⏭️ Invalid items skipped: ${skipCount}`);
  console.log(`   🔄 Token refreshes: ${tokenRefreshCount}`);
  
  // Final count check
  try {
    const finalStats = await axios.get(`${API_URL}/price-list/stats`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    console.log(`\n📊 DATABASE FINAL STATUS:`);
    console.log(`   Total items in database: ${finalStats.data.totalItems}`);
    console.log(`   Total categories: ${finalStats.data.categories.length}`);
    console.log(`   Categories: ${finalStats.data.categories.join(', ')}`);
    
    const percentComplete = Math.round((finalStats.data.totalItems / 7857) * 100);
    console.log(`\n🎯 Import Completion: ${percentComplete}% (${finalStats.data.totalItems} / 7857 items)`);
    
    if (finalStats.data.totalItems >= 7857) {
      console.log(`\n🎊 ALL ITEMS SUCCESSFULLY IMPORTED!`);
    } else {
      const remaining = 7857 - finalStats.data.totalItems;
      console.log(`\n📌 ${remaining} items remaining. Run script again if needed.`);
    }
  } catch (error) {
    console.log('\n⚠️ Could not fetch final stats');
  }
}

const startTime = Date.now();

// Run the import
importAllRemaining().catch(error => {
  console.error('💥 Fatal error:', error.message);
  process.exit(1);
});