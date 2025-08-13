// Test script for the new COHERE_RERANK method
const { MatchingService } = require('./dist/services/matching.service');

async function testCohereRerankMethod() {
  console.log('Testing COHERE_RERANK Method\n');
  console.log('=====================================\n');
  
  const matchingService = MatchingService.getInstance();
  
  // Test items (BOQ descriptions)
  const testItems = [
    {
      description: "Concrete supply and pour m3",
      expectedMatch: "concrete",
      context: ["Concrete Works", "Foundation"]
    },
    {
      description: "Steel reinforcement 12mm dia",
      expectedMatch: "steel",
      context: ["Steel Works", "Reinforcement"]
    },
    {
      description: "Excavation in rock cubic meter",
      expectedMatch: "excavation",
      context: ["Earthworks", "Site Preparation"]
    }
  ];
  
  console.log('Testing 4 different matching methods:\n');
  console.log('1. LOCAL - Fuzzy string matching');
  console.log('2. COHERE - Embeddings-based matching');
  console.log('3. COHERE_RERANK - Rerank v3.5 (NEW!)');
  console.log('4. OPENAI - OpenAI embeddings\n');
  
  for (const item of testItems) {
    console.log(`\nTesting: "${item.description}"`);
    console.log(`Context: ${item.context.join(' > ')}`);
    console.log('-----------------------------------');
    
    // Test each method
    const methods = ['LOCAL', 'COHERE', 'COHERE_RERANK', 'OPENAI'];
    
    for (const method of methods) {
      try {
        console.log(`\n${method}:`);
        
        const startTime = Date.now();
        const result = await matchingService.matchItem(
          item.description,
          method,
          undefined, // Use default price items
          item.context
        );
        const endTime = Date.now();
        
        console.log(`  Match: ${result.matchedDescription.substring(0, 60)}...`);
        console.log(`  Unit: ${result.matchedUnit || 'N/A'}`);
        console.log(`  Rate: ${result.matchedRate}`);
        console.log(`  Confidence: ${(result.confidence * 100).toFixed(1)}%`);
        console.log(`  Time: ${endTime - startTime}ms`);
        
        // Check if it matches expected type
        const isGoodMatch = result.matchedDescription.toLowerCase().includes(item.expectedMatch);
        console.log(`  Quality: ${isGoodMatch ? '✅ Good match' : '⚠️ Unexpected match'}`);
        
      } catch (error) {
        console.log(`  Error: ${error.message}`);
        if (error.message.includes('client not initialized')) {
          console.log('  (API key not configured in Admin Settings)');
        }
      }
    }
  }
  
  console.log('\n=====================================');
  console.log('Test Complete!\n');
  console.log('Summary:');
  console.log('- LOCAL: Fast but basic matching');
  console.log('- COHERE: Good semantic understanding with embeddings');
  console.log('- COHERE_RERANK: Best accuracy with Rerank v3.5');
  console.log('- OPENAI: Alternative AI matching\n');
  console.log('To use COHERE_RERANK in production:');
  console.log('1. Add COHERE_API_KEY in Admin Settings');
  console.log('2. Select "Cohere Rerank v3.5" when processing BOQ files');
}

// Run the test
testCohereRerankMethod().catch(console.error);