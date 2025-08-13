// Test script for Cohere Rerank v3.5 integration using Convex settings
const { CohereClientV2 } = require('cohere-ai');
const { ConvexClient } = require('convex/browser');
require('dotenv').config();

async function testRerank() {
  console.log('Testing Cohere Rerank v3.5 with Convex settings...\n');
  
  // Initialize Convex client
  const convexUrl = process.env.CONVEX_URL;
  if (!convexUrl) {
    console.error('CONVEX_URL not found in environment variables');
    return;
  }
  
  const convex = new ConvexClient(convexUrl);
  
  // Get API key from Convex settings
  const settings = await convex.query(({ db }) => db.query('applicationSettings').collect());
  const cohereKeySetting = settings.find(s => s.key === 'COHERE_API_KEY');
  
  if (!cohereKeySetting || !cohereKeySetting.value) {
    console.error('COHERE_API_KEY not found in Convex application settings');
    console.log('Please set the API key in the Admin Settings page of the application');
    return;
  }
  
  console.log('Found Cohere API key in Convex settings');
  const client = new CohereClientV2({ token: cohereKeySetting.value });
  
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
    console.log(`\nQuery: "${query}"\n`);
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
    console.log('The rerank integration is working correctly.');
    
  } catch (error) {
    console.error('Error during rerank test:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
    console.log('\nPossible issues:');
    console.log('1. Invalid or expired API key');
    console.log('2. Rate limiting');
    console.log('3. Network connectivity issues');
  }
}

// Run the test
testRerank();