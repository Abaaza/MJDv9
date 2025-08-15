import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api.js';
import dotenv from 'dotenv';

dotenv.config();

const convex = new ConvexHttpClient(process.env.CONVEX_URL);

async function testDeepInfraKey() {
  try {
    console.log('Testing DeepInfra API key retrieval...');
    
    // Test direct query
    const directKey = await convex.query(api.applicationSettings.getByKey, {
      key: 'DEEPINFRA_API_KEY'
    });
    
    if (directKey) {
      console.log('✅ Direct query successful:');
      console.log('Key:', directKey.key);
      console.log('Value:', directKey.value);
      console.log('Description:', directKey.description);
      console.log('Last updated:', new Date(directKey.updatedAt).toISOString());
    } else {
      console.log('❌ Direct query failed - key not found');
    }
    
    // Test bulk query with all API keys
    const allApiKeys = await convex.query(api.applicationSettings.getByKeys, {
      keys: ['COHERE_API_KEY', 'OPENAI_API_KEY', 'DEEPINFRA_API_KEY']
    });
    
    console.log('\n✅ Bulk query results:');
    allApiKeys.forEach(key => {
      console.log(`${key.key}: ${key.value ? '***' + key.value.slice(-4) : 'NOT SET'}`);
    });
    
    // Test if it shows up in all settings
    const allSettings = await convex.query(api.applicationSettings.getAll);
    const apiKeySettings = allSettings.filter(s => s.key.includes('API_KEY'));
    
    console.log('\n✅ All API key settings:');
    apiKeySettings.forEach(setting => {
      console.log(`${setting.key}: ${setting.value ? '***' + setting.value.slice(-4) : 'NOT SET'} (${setting.description})`);
    });
    
    console.log('\n🎉 DeepInfra API key test completed successfully!');
    
  } catch (error) {
    console.error('❌ Error testing DeepInfra API key:', error);
  }
}

testDeepInfraKey();