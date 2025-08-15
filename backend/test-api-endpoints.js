import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

// Force use production API for testing
const API_BASE = 'https://54.82.88.31/api';

async function testApiEndpoints() {
  try {
    console.log('Testing API endpoints for DeepInfra support...');
    console.log('API Base:', API_BASE);
    
    // Login to get auth token
    console.log('\n1. Logging in...');
    const loginResponse = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'abaza@mjd.com',
        password: 'abaza123'
      })
    });
    
    if (!loginResponse.ok) {
      console.error('❌ Login failed:', loginResponse.status, await loginResponse.text());
      return;
    }
    
    const loginData = await loginResponse.json();
    const token = loginData.token;
    console.log('✅ Login successful');
    
    // Test getting API keys
    console.log('\n2. Testing GET /api/settings/api-keys...');
    const getApiKeysResponse = await fetch(`${API_BASE}/settings/api-keys`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!getApiKeysResponse.ok) {
      console.error('❌ Get API keys failed:', getApiKeysResponse.status, await getApiKeysResponse.text());
      return;
    }
    
    const apiKeys = await getApiKeysResponse.json();
    console.log('✅ API keys retrieved:', apiKeys);
    
    // Check if DeepInfra is included
    const deepinfraKey = apiKeys.find(key => key.provider === 'deepinfra');
    if (deepinfraKey) {
      console.log('✅ DeepInfra API key found in response:');
      console.log('  Provider:', deepinfraKey.provider);
      console.log('  Is Set:', deepinfraKey.isSet);
      console.log('  Masked Value:', deepinfraKey.maskedValue);
    } else {
      console.log('❌ DeepInfra API key not found in response');
    }
    
    // Test updating DeepInfra API key via API
    console.log('\n3. Testing PUT /api/settings/api-keys/deepinfra...');
    const updateResponse = await fetch(`${API_BASE}/settings/api-keys/deepinfra`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        apiKey: 'rkD8a#piMHGsgT4'
      })
    });
    
    if (!updateResponse.ok) {
      console.error('❌ Update DeepInfra API key failed:', updateResponse.status, await updateResponse.text());
      return;
    }
    
    const updateData = await updateResponse.json();
    console.log('✅ DeepInfra API key update response:', updateData);
    
    console.log('\n🎉 All API endpoint tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Error testing API endpoints:', error);
  }
}

testApiEndpoints();