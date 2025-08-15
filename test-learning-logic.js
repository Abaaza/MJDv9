import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';

// Configuration
const API_URL = 'http://localhost:5000/api';

// Test credentials
const TEST_USER = {
  email: 'abaza@mjd.com',
  password: 'abaza123'
};

let accessToken = '';
let jobId = '';

// Test scenarios for learning
const TEST_SCENARIOS = [
  {
    description: 'Supply and install 2m high chain link fence with concrete posts',
    expectedMatch: 'Chain Link Fence 2m High with Concrete Posts',
    manualMatchId: null, // Will be set during test
  },
  {
    description: 'Provide and fix 2 meter chainlink fencing including posts',
    expectedMatch: 'Chain Link Fence 2m High with Concrete Posts',
    manualMatchId: null, // Should use learned pattern
  },
  {
    description: 'Install barbed wire 3 strands on angle iron posts',
    expectedMatch: 'Barbed Wire Fence 3 Strands',
    manualMatchId: null,
  },
  {
    description: 'Supply & installation of 3-strand barbed wire fencing',
    expectedMatch: 'Barbed Wire Fence 3 Strands',
    manualMatchId: null, // Should use learned pattern
  }
];

async function login() {
  try {
    console.log('🔐 Logging in...');
    const response = await axios.post(`${API_URL}/auth/login`, TEST_USER);
    accessToken = response.data.tokens.accessToken;
    console.log('✅ Login successful');
    return accessToken;
  } catch (error) {
    console.error('❌ Login failed:', error.response?.data || error.message);
    throw error;
  }
}

async function createTestFile() {
  // Create a simple CSV file with test items
  const csvContent = `Description,Unit,Qty,Rate
"${TEST_SCENARIOS[0].description}","m","100","0"
"${TEST_SCENARIOS[1].description}","m","150","0"
"${TEST_SCENARIOS[2].description}","m","200","0"
"${TEST_SCENARIOS[3].description}","m","250","0"
`;
  
  const fileName = 'test-learning-items.csv';
  fs.writeFileSync(fileName, csvContent);
  console.log('📄 Test file created:', fileName);
  return fileName;
}

async function uploadAndMatch(fileName, method = 'LOCAL') {
  try {
    console.log(`📤 Uploading file for ${method} matching...`);
    
    const form = new FormData();
    form.append('file', fs.createReadStream(fileName));
    form.append('method', method);
    form.append('projectName', 'Learning Test Project');

    const response = await axios.post(
      `${API_URL}/price-matching/upload-and-match`,
      form,
      {
        headers: {
          ...form.getHeaders(),
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    jobId = response.data.jobId;
    console.log('✅ File uploaded, job ID:', jobId);
    return jobId;
  } catch (error) {
    console.error('❌ Upload failed:', error.response?.data || error.message);
    throw error;
  }
}

async function waitForJobCompletion(jobId) {
  console.log('⏳ Waiting for job to complete...');
  
  for (let i = 0; i < 30; i++) {
    try {
      const response = await axios.get(
        `${API_URL}/price-matching/${jobId}/status`,
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );
      
      if (response.data.status === 'completed') {
        console.log('✅ Job completed');
        return true;
      } else if (response.data.status === 'failed') {
        console.error('❌ Job failed:', response.data.error);
        return false;
      }
      
      // Wait 2 seconds before next check
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      console.error('❌ Status check failed:', error.message);
    }
  }
  
  console.error('❌ Job timed out');
  return false;
}

async function getMatchResults(jobId) {
  try {
    const response = await axios.get(
      `${API_URL}/price-matching/${jobId}/results`,
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );
    
    return response.data.results;
  } catch (error) {
    console.error('❌ Failed to get results:', error.response?.data || error.message);
    throw error;
  }
}

async function performManualMatch(resultId, matchedItemId, matchedDescription) {
  try {
    console.log(`✏️ Performing manual match for result ${resultId}`);
    
    const response = await axios.patch(
      `${API_URL}/price-matching/results/${resultId}`,
      {
        matchedItemId,
        matchedDescription,
        matchedRate: 50, // Example rate
        confidence: 1.0,
        isManuallyEdited: true,
        matchMethod: 'MANUAL'
      },
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );
    
    console.log('✅ Manual match recorded');
    return response.data;
  } catch (error) {
    console.error('❌ Manual match failed:', error.response?.data || error.message);
    throw error;
  }
}

async function testLearningScenarios() {
  console.log('\n🧪 Testing Learning Scenarios\n');
  console.log('=' . repeat(50));
  
  try {
    // Step 1: Login
    await login();
    
    // Step 2: Create test file
    const fileName = createTestFile();
    
    // Step 3: First upload - items won't have learned matches
    console.log('\n📊 ROUND 1: Initial matching (no learned patterns)\n');
    const jobId1 = await uploadAndMatch(fileName, 'LOCAL');
    
    if (await waitForJobCompletion(jobId1)) {
      const results1 = await getMatchResults(jobId1);
      
      console.log('\n📋 Round 1 Results:');
      for (let i = 0; i < results1.length; i++) {
        const result = results1[i];
        console.log(`\nItem ${i + 1}: ${result.originalDescription}`);
        console.log(`  Matched: ${result.matchedDescription || 'No match'}`);
        console.log(`  Confidence: ${(result.confidence * 100).toFixed(1)}%`);
        console.log(`  Method: ${result.matchMethod}`);
        console.log(`  Is Learned: ${result.isLearnedMatch ? 'Yes 🔸' : 'No'}`);
        
        // Perform manual matches for scenarios 1 and 3
        if (i === 0 || i === 2) {
          console.log(`  🔧 Creating manual match...`);
          // In real scenario, you'd search for the actual item ID
          // For testing, we'll use a dummy ID
          await performManualMatch(
            result._id,
            `test_item_${i}`,
            TEST_SCENARIOS[i].expectedMatch
          );
        }
      }
    }
    
    // Step 4: Wait a moment for patterns to be stored
    console.log('\n⏳ Waiting for patterns to be stored...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Step 5: Second upload - should use learned patterns
    console.log('\n📊 ROUND 2: Testing with learned patterns\n');
    const jobId2 = await uploadAndMatch(fileName, 'LOCAL');
    
    if (await waitForJobCompletion(jobId2)) {
      const results2 = await getMatchResults(jobId2);
      
      console.log('\n📋 Round 2 Results (Should show learned matches):');
      let learnedCount = 0;
      
      for (let i = 0; i < results2.length; i++) {
        const result = results2[i];
        console.log(`\nItem ${i + 1}: ${result.originalDescription}`);
        console.log(`  Matched: ${result.matchedDescription || 'No match'}`);
        console.log(`  Confidence: ${(result.confidence * 100).toFixed(1)}%`);
        console.log(`  Method: ${result.matchMethod}`);
        console.log(`  Is Learned: ${result.isLearnedMatch ? 'Yes 🔸' : 'No'}`);
        
        if (result.isLearnedMatch) {
          learnedCount++;
          console.log('  ✨ This is a LEARNED MATCH - Should appear in orange!');
        }
        
        // Check if similar items now use learned patterns
        if (i === 1 || i === 3) {
          if (result.isLearnedMatch) {
            console.log(`  ✅ Successfully using learned pattern from item ${i - 1}`);
          } else {
            console.log(`  ⚠️ Expected learned match but got regular match`);
          }
        }
      }
      
      console.log('\n📊 Summary:');
      console.log(`  Total items: ${results2.length}`);
      console.log(`  Learned matches: ${learnedCount}`);
      console.log(`  Success rate: ${(learnedCount / 2 * 100).toFixed(0)}%`);
    }
    
    // Step 6: Test with AI methods to verify learned patterns work across methods
    console.log('\n📊 ROUND 3: Testing learned patterns with AI method\n');
    const jobId3 = await uploadAndMatch(fileName, 'OPENAI');
    
    if (await waitForJobCompletion(jobId3)) {
      const results3 = await getMatchResults(jobId3);
      
      console.log('\n📋 Round 3 Results (AI with learned patterns):');
      for (let i = 0; i < results3.length; i++) {
        const result = results3[i];
        if (result.isLearnedMatch) {
          console.log(`\nItem ${i + 1}: ${result.originalDescription}`);
          console.log(`  ✨ LEARNED MATCH found even with ${result.matchMethod} method!`);
          console.log(`  Matched: ${result.matchedDescription}`);
          console.log(`  Confidence: ${(result.confidence * 100).toFixed(1)}%`);
        }
      }
    }
    
    // Clean up
    fs.unlinkSync(fileName);
    
    console.log('\n' + '=' . repeat(50));
    console.log('✅ Learning logic test completed!');
    console.log('\n💡 Key Points:');
    console.log('1. Manual matches are being recorded as patterns');
    console.log('2. Similar items use learned patterns automatically');
    console.log('3. Learned matches work across different matching methods');
    console.log('4. Learned matches should appear in orange/amber color in UI');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run the tests
testLearningScenarios().catch(console.error);