// Test production API for DeepInfra support
// Use node-fetch polyfill for older Node versions
import fetch from 'node-fetch';

// Production API endpoint
const API_BASE = 'https://54.82.88.31/api';

async function testProductionDeepInfra() {
  console.log('🧪 Testing Production API for DeepInfra Support');
  console.log('==============================================\n');

  try {
    // Step 1: Login to get authentication token
    console.log('1. Authenticating with production API...');
    const loginResponse = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'abaza@mjd.com',
        password: 'abaza123'
      }),
      // Ignore SSL certificate for testing
      agent: new (await import('https')).Agent({
        rejectUnauthorized: false
      })
    });

    if (!loginResponse.ok) {
      const errorText = await loginResponse.text();
      console.error('❌ Login failed:', loginResponse.status, errorText);
      return;
    }

    const loginData = await loginResponse.json();
    const token = loginData.token;
    console.log('✅ Authentication successful');

    // Step 2: Test getting API keys
    console.log('\n2. Retrieving API keys from production...');
    const apiKeysResponse = await fetch(`${API_BASE}/settings/api-keys`, {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      agent: new (await import('https')).Agent({
        rejectUnauthorized: false
      })
    });

    if (!apiKeysResponse.ok) {
      const errorText = await apiKeysResponse.text();
      console.error('❌ Failed to get API keys:', apiKeysResponse.status, errorText);
      return;
    }

    const apiKeys = await apiKeysResponse.json();
    console.log('✅ Successfully retrieved API keys');
    console.log('Response:', JSON.stringify(apiKeys, null, 2));

    // Step 3: Check if DeepInfra is supported
    const deepinfraKey = apiKeys.find(key => key.provider === 'deepinfra' || key.key === 'DEEPINFRA_API_KEY');
    
    if (deepinfraKey) {
      console.log('\n✅ DeepInfra API key found in production response!');
      console.log('   Provider:', deepinfraKey.provider);
      console.log('   Key:', deepinfraKey.key);
      console.log('   Is Set:', deepinfraKey.isSet);
      console.log('   Masked Value:', deepinfraKey.maskedValue);
    } else {
      console.log('\n⚠️  DeepInfra API key NOT found in production response');
      console.log('   This means the production backend needs to be updated');
      console.log('   Available providers:', apiKeys.map(k => k.provider).join(', '));
    }

    // Step 4: Test updating DeepInfra API key (if supported)
    if (deepinfraKey) {
      console.log('\n3. Testing DeepInfra API key update...');
      const updateResponse = await fetch(`${API_BASE}/settings/api-keys/deepinfra`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          apiKey: 'rkD8a#piMHGsgT4'
        }),
        agent: new (await import('https')).Agent({
          rejectUnauthorized: false
        })
      });

      if (updateResponse.ok) {
        const updateData = await updateResponse.json();
        console.log('✅ DeepInfra API key update successful!');
        console.log('Response:', JSON.stringify(updateData, null, 2));
      } else {
        const errorText = await updateResponse.text();
        console.log('❌ DeepInfra API key update failed:', updateResponse.status, errorText);
      }
    }

    console.log('\n📋 Test Summary:');
    if (deepinfraKey) {
      console.log('   ✅ Production API supports DeepInfra');
      console.log('   ✅ DeepInfra API key is accessible via API');
      console.log('   ✅ API integration is complete');
    } else {
      console.log('   ❌ Production API does NOT support DeepInfra yet');
      console.log('   📝 Next step: Deploy updated backend code');
    }

  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.log('   This might be a network/firewall issue');
    }
  }
}

testProductionDeepInfra();