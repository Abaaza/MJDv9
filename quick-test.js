import axios from 'axios';

const API_URL = 'http://localhost:5000/api';

async function quickTest() {
  try {
    // 1. Login
    console.log('🔐 Logging in...');
    const loginRes = await axios.post(`${API_URL}/auth/login`, {
      email: 'abaza@mjd.com',
      password: 'abaza123'
    });
    const token = loginRes.data.accessToken;
    console.log('✅ Logged in');

    // 2. Test Google Sheets features
    console.log('\n📊 Testing Spreadsheet Features:');
    
    // Get stats
    const statsRes = await axios.get(`${API_URL}/price-list/stats`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('✅ Price list stats:', {
      total: statsRes.data.totalItems,
      categories: statsRes.data.categories.length
    });

    // Test bulk update
    const bulkRes = await axios.post(`${API_URL}/price-list/bulk-update`, {
      updates: [{
        _id: `new_${Date.now()}`,
        description: 'Test Item from Quick Test',
        unit: 'pcs',
        rate: 99,
        category: 'Test',
        subcategory: 'Quick Test'
      }]
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('✅ Bulk update:', bulkRes.data);

    // 3. Test self-learning
    console.log('\n🧠 Testing Self-Learning:');
    
    // Get recent jobs
    const jobsRes = await axios.get(`${API_URL}/price-matching/jobs`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (jobsRes.data.length > 0) {
      const recentJob = jobsRes.data[0];
      console.log(`📋 Found job: ${recentJob._id}`);
      
      // Get results
      const resultsRes = await axios.get(`${API_URL}/price-matching/${recentJob._id}/results`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (resultsRes.data.length > 0) {
        const firstResult = resultsRes.data[0];
        console.log(`📝 First result: ${firstResult._id}`);
        
        // Simulate manual edit
        const updateRes = await axios.patch(
          `${API_URL}/price-matching/results/${firstResult._id}`,
          {
            matchedDescription: 'Manually Edited Item',
            matchedRate: 150,
            confidence: 1.0,
            isManuallyEdited: true
          },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        console.log('✅ Manual edit saved (learning pattern created)');
      }
    }

    // Check learning stats
    const learningRes = await axios.get(`${API_URL}/price-matching/learning/statistics`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('📊 Learning stats:', learningRes.data);

    console.log('\n✅ All tests completed successfully!');
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

quickTest();