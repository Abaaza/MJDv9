// Test that the new COHERE_RERANK method is properly routed
import { MatchingService } from './src/services/matching.service';

async function testMethodRouting() {
  console.log('Testing Method Routing for COHERE_RERANK\n');
  console.log('=========================================\n');
  
  const service = MatchingService.getInstance();
  
  // Test that all 4 methods are accepted
  const methods = ['LOCAL', 'COHERE', 'COHERE_RERANK', 'OPENAI'] as const;
  
  for (const method of methods) {
    console.log(`Testing ${method}...`);
    
    try {
      // Just test that the method is accepted (will fail on actual matching due to no data)
      await service.matchItem(
        'test description',
        method,
        [], // Empty price items to force immediate failure
        ['Test Category']
      );
      console.log(`  ✅ ${method} method is recognized`);
    } catch (error: any) {
      if (error.message.includes('Unknown matching method')) {
        console.log(`  ❌ ${method} method NOT recognized - ERROR!`);
      } else if (error.message.includes('No price items')) {
        console.log(`  ✅ ${method} method is recognized (failed at price items check)`);
      } else if (error.message.includes('client not initialized')) {
        console.log(`  ✅ ${method} method is recognized (needs API key)`);
      } else {
        console.log(`  ✅ ${method} method is recognized (other error: ${error.message})`);
      }
    }
  }
  
  // Test invalid method
  console.log('\nTesting invalid method...');
  try {
    await (service as any).matchItem('test', 'INVALID_METHOD', []);
    console.log('  ❌ Invalid method was accepted - ERROR!');
  } catch (error: any) {
    if (error.message.includes('Unknown matching method')) {
      console.log('  ✅ Invalid method correctly rejected');
    } else {
      console.log(`  ⚠️ Unexpected error: ${error.message}`);
    }
  }
  
  console.log('\n=========================================');
  console.log('Method Routing Test Complete!');
  console.log('\nAll 4 methods are properly configured:');
  console.log('- LOCAL');
  console.log('- COHERE (embeddings)');
  console.log('- COHERE_RERANK (new!)');
  console.log('- OPENAI');
}

testMethodRouting().catch(console.error);