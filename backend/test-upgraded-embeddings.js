// Test script to verify Cohere v4 and OpenAI large model work
require('cross-fetch/polyfill');
const { CohereClient } = require('cohere-ai');
const OpenAI = require('openai');

async function testUpgradedEmbeddings() {
  console.log('=== Testing Upgraded Embeddings ===\n');
  
  const testText = "Excavation for foundation in ordinary soil 2m depth";
  
  // Test Cohere v4 API
  console.log('1. Testing Cohere v4 API (embed-v4.0)...');
  try {
    // Replace with your actual API key for testing
    const cohereKey = process.env.COHERE_API_KEY || 'your-cohere-key-here';
    const cohereClient = new CohereClient({ token: cohereKey });
    
    const response = await cohereClient.v2.embed({
      texts: [testText],
      model: 'embed-v4.0',
      embeddingTypes: ['float'],
      inputType: 'search_query',
    });
    
    console.log('✓ Cohere v4 SUCCESS:', {
      embeddingLength: response.embeddings.float[0].length,
      firstValues: response.embeddings.float[0].slice(0, 5)
    });
  } catch (error) {
    console.log('✗ Cohere v4 FAILED:', error.message);
    console.log('Note: Make sure you have a valid Cohere API key');
  }
  
  // Test OpenAI text-embedding-3-large
  console.log('\n2. Testing OpenAI text-embedding-3-large...');
  try {
    // Replace with your actual API key for testing
    const openaiKey = process.env.OPENAI_API_KEY || 'your-openai-key-here';
    const openaiClient = new OpenAI({ apiKey: openaiKey });
    
    const response = await openaiClient.embeddings.create({
      input: testText,
      model: 'text-embedding-3-large',
    });
    
    console.log('✓ OpenAI Large SUCCESS:', {
      embeddingLength: response.data[0].embedding.length,
      firstValues: response.data[0].embedding.slice(0, 5)
    });
  } catch (error) {
    console.log('✗ OpenAI Large FAILED:', error.message);
    console.log('Note: Make sure you have a valid OpenAI API key');
  }
  
  console.log('\n=== Key Changes Made ===');
  console.log('1. Cohere (v3 → v4):');
  console.log('   - Old: cohereClient.embed() with model "embed-english-v3.0"');
  console.log('   - New: cohereClient.v2.embed() with model "embed-v4.0"');
  console.log('   - Dimensions: 1024 → 1536 (50% increase)');
  console.log('   - Max tokens: 512 → 128,000 (250x increase!)');
  console.log('   - Response: response.embeddings.float[0] instead of response.embeddings[0]');
  console.log('\n2. OpenAI (small → large):');
  console.log('   - Old: model "text-embedding-3-small" (1536 dimensions)');
  console.log('   - New: model "text-embedding-3-large" (3072 dimensions)');
  console.log('   - Dimensions: 1536 → 3072 (2x increase)');
  console.log('   - Max tokens: 8,191 (same for both models)');
  console.log('\n=== Performance Impact ===');
  console.log('- Cohere v4: 50% more dimensions + massive token limit = better long text handling');
  console.log('- OpenAI large: 2x dimensions = higher accuracy for semantic matching');
  console.log('- Both upgrades significantly improve construction term matching quality');
}

testUpgradedEmbeddings().catch(console.error);