// Add DeepInfra API key to Convex application settings
import { ConvexHttpClient } from 'convex/browser';

const convexUrl = 'https://good-dolphin-454.convex.cloud';
const client = new ConvexHttpClient(convexUrl);

async function addDeepInfraKey() {
  try {
    console.log('Connecting to Convex:', convexUrl);
    
    // Use the mutation to set application setting
    const result = await client.mutation('applicationSettings:set', {
      key: 'DEEPINFRA_API_KEY',
      value: '8MSsOohjJBtIAlzstuh4inhRzgnuS68k',
      description: 'DeepInfra API key for Qwen3-Reranker-8B model',
      category: 'api_keys',
      isPublic: false,
      updatedBy: 'admin',
      updatedAt: Date.now()
    });
    
    console.log('✓ DeepInfra API key added to application settings');
    
    // Query all API keys to verify
    const settings = await client.query('applicationSettings:getByKeys', {
      keys: ['COHERE_API_KEY', 'OPENAI_API_KEY', 'DEEPINFRA_API_KEY']
    });
    
    console.log('\nAPI Keys Status:');
    if (settings && settings.length > 0) {
      settings.forEach(setting => {
        const hasValue = setting.value && setting.value.length > 0;
        const maskedValue = hasValue ? `${setting.value.substring(0, 6)}...` : 'Not set';
        console.log(`  ${setting.key}: ${maskedValue}`);
      });
    } else {
      console.log('  No API keys found. Checking all settings...');
      
      // Try to get all settings
      const allSettings = await client.query('applicationSettings:getAll');
      const apiKeySettings = allSettings.filter(s => s.key.includes('API_KEY'));
      
      if (apiKeySettings.length > 0) {
        console.log('\nFound API keys in settings:');
        apiKeySettings.forEach(setting => {
          const hasValue = setting.value && setting.value.length > 0;
          const maskedValue = hasValue ? `${setting.value.substring(0, 6)}...` : 'Not set';
          console.log(`  ${setting.key}: ${maskedValue}`);
        });
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
    console.log('\nTrying alternative approach...');
    
    // Try simpler mutation
    try {
      await client.mutation('applicationSettings:upsert', {
        key: 'DEEPINFRA_API_KEY',
        value: '8MSsOohjJBtIAlzstuh4inhRzgnuS68k'
      });
      console.log('✓ DeepInfra API key added using upsert');
    } catch (err2) {
      console.error('Alternative approach also failed:', err2);
    }
  }
  
  process.exit(0);
}

addDeepInfraKey();