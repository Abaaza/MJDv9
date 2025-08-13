// Test script for Cohere Rerank v3.5 integration
const { CohereClientV2 } = require('cohere-ai');
require('dotenv').config();

async function testRerank() {
  console.log('Testing Cohere Rerank v3.5...\n');
  
  // Initialize client
  const cohereKey = process.env.COHERE_API_KEY;
  if (!cohereKey) {
    console.error('COHERE_API_KEY not found in environment variables');
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
    
    console.log('Top 5 Reranked Results:');
    console.log('========================\n');
    
    response.results.forEach((result, idx) => {
      console.log(`${idx + 1}. Document #${result.index + 1}`);
      console.log(`   Score: ${result.relevanceScore.toFixed(4)}`);
      console.log(`   Text: ${documents[result.index]}`);
      console.log();
    });
    
    console.log('\nRerank test completed successfully!');
    
  } catch (error) {
    console.error('Error during rerank test:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

// Run the test
testRerank();