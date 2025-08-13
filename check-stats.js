import axios from 'axios';

const API_URL = 'http://localhost:5000/api';

async function checkStats() {
  // Login
  const loginResponse = await axios.post(`${API_URL}/auth/login`, {
    email: 'abaza@mjd.com',
    password: 'abaza123'
  });
  const token = loginResponse.data.accessToken;
  
  // Get stats
  const stats = await axios.get(`${API_URL}/price-list/stats`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  console.log('\n📊 FINAL DATABASE STATISTICS:');
  console.log('════════════════════════════════════════════════════════════');
  console.log(`Total items in database: ${stats.data.totalItems}`);
  console.log(`Total categories: ${stats.data.categories.length}`);
  console.log(`\nCategories: ${stats.data.categories.join(', ')}`);
  
  const percentComplete = Math.round((stats.data.totalItems / 7857) * 100);
  console.log(`\n🎯 Import Completion: ${percentComplete}% (${stats.data.totalItems} / 7857 items)`);
  
  if (stats.data.totalItems >= 7857) {
    console.log(`\n🎊 ALL ITEMS SUCCESSFULLY IMPORTED!`);
  } else {
    const remaining = 7857 - stats.data.totalItems;
    console.log(`\n📌 ${remaining} items remaining.`);
  }
}

checkStats().catch(error => {
  console.error('Error:', error.message);
});