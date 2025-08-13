import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_URL = 'http://localhost:5000/api';

async function continueMJDImport() {
  console.log('🚀 CONTINUING MJD IMPORT\n');
  
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
    console.log(`📊 Current database has ${startCount} items\n`);
  } catch (error) {
    console.log('⚠️ Could not get current stats\n');
  }
  
  // Read the CSV file
  const csvPath = path.join(__dirname, 'mjd-pricelist-maximum.csv');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const lines = csvContent.split('\n');
  
  // Start from where we likely left off (around line 1050)
  const startLine = Math.max(1, startCount - 50); // Start a bit before in case of duplicates
  const endLine = Math.min(lines.length, startLine + 3000); // Process 3000 items this run
  
  console.log(`📊 Processing lines ${startLine} to ${endLine} (${endLine - startLine} items)\n`);
  
  let successCount = 0;
  let errorCount = 0;
  let skipCount = 0;
  let duplicateCount = 0;
  
  // Process items
  for (let i = startLine; i < endLine; i++) {
    const line = lines[i];
    if (!line || line.trim() === '') {
      skipCount++;
      continue;
    }
    
    try {
      // Parse CSV line
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
      
      // Generate keywords from description
      if (item.description && item.description.length > 3) {
        item.keywords = item.description
          .toLowerCase()
          .split(/\s+/)
          .filter(word => word.length > 3 && !['with', 'from', 'that', 'this'].includes(word))
          .slice(0, 5);
      }
      
      // Skip invalid items
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
          console.log('🔄 Refreshing token...');
          const newLogin = await axios.post(`${API_URL}/auth/login`, {
            email: 'abaza@mjd.com',
            password: 'abaza123'
          });
          token = newLogin.data.accessToken;
          i--; // Retry this item
          continue;
        } else if (error.response?.data?.error?.includes('duplicate')) {
          duplicateCount++;
        } else {
          errorCount++;
        }
      }
      
      // Progress update
      if ((i - startLine) % 100 === 0 && i > startLine) {
        const progress = Math.round(((i - startLine) / (endLine - startLine)) * 100);
        console.log(`📈 Progress: ${progress}% | Success: ${successCount} | Errors: ${errorCount} | Duplicates: ${duplicateCount}`);
      }
      
      // Small delay to avoid overwhelming
      if (i % 20 === 0) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      // Longer delay every 200 items
      if (i % 200 === 0 && i > startLine) {
        console.log('⏸️ Pausing 2 seconds...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
    } catch (error) {
      errorCount++;
      // Silent error to avoid cluttering
    }
  }
  
  console.log('\n' + '═'.repeat(60));
  console.log('✅ IMPORT SESSION COMPLETE');
  console.log('═'.repeat(60));
  console.log(`\n📊 Session Results:`);
  console.log(`   ✅ Successful imports: ${successCount}`);
  console.log(`   ⏭️ Duplicates skipped: ${duplicateCount}`);
  console.log(`   ❌ Failed imports: ${errorCount}`);
  console.log(`   ⏭️ Invalid items skipped: ${skipCount}`);
  console.log(`   📈 Success rate: ${Math.round((successCount / (successCount + errorCount + duplicateCount)) * 100)}%`);
  
  // Check final count
  try {
    const finalStats = await axios.get(`${API_URL}/price-list/stats`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const newItems = finalStats.data.totalItems - startCount;
    console.log(`\n📊 Database Status:`);
    console.log(`   Started with: ${startCount} items`);
    console.log(`   Now contains: ${finalStats.data.totalItems} items`);
    console.log(`   New items added: ${newItems}`);
    console.log(`   Categories: ${finalStats.data.categories.length}`);
    
    // Show progress toward goal
    const percentComplete = Math.round((finalStats.data.totalItems / 7857) * 100);
    console.log(`\n📊 Overall Progress: ${percentComplete}% of 7,857 items imported`);
    
    if (finalStats.data.totalItems < 7857) {
      console.log(`\n💡 Run this script again to continue importing more items.`);
    } else {
      console.log(`\n🎉 All items have been imported!`);
    }
  } catch (error) {
    console.log('\n⚠️ Could not fetch final stats');
  }
}

// Run the import
continueMJDImport().catch(error => {
  console.error('💥 Fatal error:', error.message);
  process.exit(1);
});