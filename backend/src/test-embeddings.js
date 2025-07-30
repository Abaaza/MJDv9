// Test script to check if embeddings are working
require('cross-fetch/polyfill');
const { ConvexHttpClient } = require('convex/browser');
const { CohereClient } = require('cohere-ai');
const OpenAI = require('openai');
const { api } = require('./dist/lib/convex-api');

async function testEmbeddings() {
  console.log('=== Testing Embeddings Generation ===\n');
  
  const convex = new ConvexHttpClient('https://good-dolphin-454.convex.cloud');
  
  // Get API keys
  const settings = await convex.query(api.applicationSettings.getAll);
  const cohereKey = settings.find(s => s.key === 'COHERE_API_KEY')?.value;
  const openaiKey = settings.find(s => s.key === 'OPENAI_API_KEY')?.value;
  
  console.log('API Keys found:', {
    hasCohere: !!cohereKey,
    hasOpenAI: !!openaiKey,
    cohereKeyLength: cohereKey?.length || 0,
    openaiKeyLength: openaiKey?.length || 0
  });
  
  const testText = "Excavation for foundation in ordinary soil 2m depth";
  
  // Test Cohere
  if (cohereKey) {
    console.log('\n1. Testing Cohere embeddings...');
    try {
      const cohereClient = new CohereClient({ token: cohereKey });
      const response = await cohereClient.embed({
        texts: [testText],
        model: 'embed-english-v3.0',
        inputType: 'search_query',
      });
      console.log('✓ Cohere SUCCESS:', {
        embeddingLength: response.embeddings[0].length,
        firstValues: response.embeddings[0].slice(0, 5)
      });
    } catch (error) {
      console.log('✗ Cohere FAILED:', error.message);
      console.log('Full error:', error);
    }
  } else {
    console.log('\n1. Cohere: No API key found');
  }
  
  // Test OpenAI
  if (openaiKey) {
    console.log('\n2. Testing OpenAI embeddings...');
    try {
      const openaiClient = new OpenAI({ apiKey: openaiKey });
      const response = await openaiClient.embeddings.create({
        input: testText,
        model: 'text-embedding-3-small',
      });
      console.log('✓ OpenAI SUCCESS:', {
        embeddingLength: response.data[0].embedding.length,
        firstValues: response.data[0].embedding.slice(0, 5)
      });
    } catch (error) {
      console.log('✗ OpenAI FAILED:', error.message);
      console.log('Full error:', error);
    }
  } else {
    console.log('\n2. OpenAI: No API key found');
  }
  
  console.log('\n=== Test Complete ===');
  console.log('If both tests failed, check:');
  console.log('1. API keys are valid (not expired or revoked)');
  console.log('2. API keys have proper permissions');
  console.log('3. Network connectivity to AI services');
}

testEmbeddings().catch(console.error).finally(() => process.exit(0));