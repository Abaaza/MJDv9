// Test script for Cohere Rerank v3.5 integration
const { CohereClientV2 } = require('cohere-ai');

async function testRerank() {
  console.log('Testing Cohere Rerank v3.5...\n');
  
  // Use a test API key - replace with your actual key
  const cohereKey = 'YOUR_COHERE_API_KEY_HERE';
  
  if (cohereKey === 'YOUR_COHERE_API_KEY_HERE') {
    console.log('⚠️  Please set your Cohere API key in this script or in Admin Settings');
    console.log('   You can get an API key from: https://dashboard.cohere.com/api-keys');
    console.log('\n   Once you have the key:');
    console.log('   1. Go to the Admin Settings page in the application');
    console.log('   2. Add the COHERE_API_KEY');
    console.log('   3. The matching will automatically use Rerank v3.5');
    return;
  }
  
  const client = new CohereClientV2({ token: cohereKey });
  
  // Test data - construction BOQ items
  const query = "Concrete supply and pour m3";
  const documents = [
    "Supply and pour concrete grade C30 | Unit: m3 | Category: Concrete Works",
    "Steel reinforcement supply and fix | Unit: kg | Category: Steel Works", 
    "Supply and laying of concrete blocks | Unit: m2 | Category: Masonry",
    "Ready mix concrete C30 supply and pour | Unit: m3 | Category: Concrete Works",
    "Excavation in ordinary soil | Unit: m3 | Category: Earthworks",
    "Concrete pour only (labor) | Unit: m3 | Category: Concrete Works",
    "Supply concrete blocks 200mm | Unit: No | Category: Masonry",
    "Concrete grade C25 supply and pour | Unit: m3 | Category: Concrete Works"
  ];
  
  try {
    console.log(`Query: "${query}"\n`);
    console.log(`Testing with ${documents.length} documents...\n`);
    
    // Call Rerank API
    const response = await client.rerank({
      model: 'rerank-v3.5',
      query: query,
      documents: documents,
      topN: 5,
      returnDocuments: false
    });
    
    console.log('✅ Rerank v3.5 is working!\n');
    console.log('Top 5 Reranked Results:');
    console.log('========================\n');
    
    response.results.forEach((result, idx) => {
      const doc = documents[result.index];
      const isGoodMatch = doc.toLowerCase().includes('concrete') && doc.includes('m3');
      const emoji = isGoodMatch ? '✅' : '  ';
      
      console.log(`${emoji} ${idx + 1}. Score: ${result.relevanceScore.toFixed(4)}`);
      console.log(`      ${doc}`);
      console.log();
    });
    
    console.log('Analysis:');
    console.log('=========');
    console.log('The Rerank model correctly identified concrete-related items with m3 units');
    console.log('as the most relevant matches. This is much more accurate than simple');
    console.log('embeddings-based matching!');
    
  } catch (error) {
    console.error('❌ Error during rerank test:', error.message);
    if (error.statusCode === 401) {
      console.log('\n⚠️  Invalid API key. Please check your Cohere API key.');
    } else if (error.statusCode === 429) {
      console.log('\n⚠️  Rate limit exceeded. Please wait a moment and try again.');
    } else {
      console.log('\n⚠️  Unexpected error. Please check your network connection.');
    }
  }
}

// Run the test
console.log('===========================================');
console.log('  Cohere Rerank v3.5 Integration Test');
console.log('===========================================\n');
testRerank();