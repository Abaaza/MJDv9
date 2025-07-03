// Test script to debug matching issues
import { getConvexClient } from './dist/config/convex.js';
import { api } from '../convex/_generated/api.js';

async function testMatching() {
  console.log('=== TESTING MATCH RESULT STORAGE ===\n');
  
  const convex = getConvexClient();
  
  try {
    // 1. Get the latest job
    console.log('1. Fetching latest jobs...');
    // Get jobs for a test user - you'll need to replace with a valid user ID
    // First, let's try to get any job
    const recentJobs = await convex.query(api.priceMatching.getUserJobs, { 
      userId: 'jh72v0vbx85afjzezjbnpkf5fs6yzktk' as any // Replace with actual user ID
    });
    
    const jobs = recentJobs; // Rename for consistency
    
    if (!jobs || jobs.length === 0) {
      console.log('No jobs found in database');
      return;
    }
    
    console.log(`Found ${jobs.length} jobs:`);
    jobs.forEach((job, index) => {
      console.log(`  ${index + 1}. Job ID: ${job._id}`);
      console.log(`     File: ${job.fileName}`);
      console.log(`     Status: ${job.status}`);
      console.log(`     Items: ${job.itemCount}`);
      console.log(`     Created: ${new Date(job.startedAt).toLocaleString()}`);
    });
    
    // 2. Check results for the most recent job
    const latestJob = jobs[0];
    console.log(`\n2. Checking results for latest job (${latestJob._id})...`);
    
    const results = await convex.query(api.priceMatching.getMatchResults, { 
      jobId: latestJob._id 
    });
    
    console.log(`Found ${results?.length || 0} results`);
    
    if (results && results.length > 0) {
      console.log('\nSample results:');
      results.slice(0, 5).forEach((result, index) => {
        console.log(`  Result ${index + 1}:`);
        console.log(`    Row: ${result.rowNumber}`);
        console.log(`    Description: ${result.originalDescription?.substring(0, 50)}...`);
        console.log(`    Has match: ${!!result.matchedDescription}`);
        console.log(`    Confidence: ${(result.confidence * 100).toFixed(1)}%`);
        if (result.matchedDescription) {
          console.log(`    Matched to: ${result.matchedDescription?.substring(0, 50)}...`);
          console.log(`    Rate: ${result.matchedRate}`);
        }
      });
      
      // Count matches
      const matchedCount = results.filter(r => r.matchedDescription).length;
      console.log(`\nMatch statistics:`);
      console.log(`  Total results: ${results.length}`);
      console.log(`  Matched: ${matchedCount}`);
      console.log(`  Unmatched: ${results.length - matchedCount}`);
      console.log(`  Match rate: ${((matchedCount / results.length) * 100).toFixed(1)}%`);
    }
    
    // 3. Test creating a dummy result
    console.log('\n3. Testing result creation...');
    try {
      const testResult = {
        jobId: latestJob._id,
        rowNumber: 999,
        originalDescription: 'TEST ITEM - DELETE ME',
        originalQuantity: 1,
        originalUnit: 'pcs',
        originalRowData: {},
        contextHeaders: [],
        matchedItemId: undefined,
        matchedDescription: 'TEST MATCH',
        matchedCode: 'TEST-001',
        matchedUnit: 'pcs',
        matchedRate: 100,
        confidence: 0.99,
        isManuallyEdited: false,
        matchMethod: 'TEST',
        totalPrice: 100,
        notes: 'Test result'
      };
      
      await convex.mutation(api.priceMatching.createMatchResult, testResult);
      console.log('✓ Successfully created test result');
      
      // Verify it was saved
      const updatedResults = await convex.query(api.priceMatching.getMatchResults, { 
        jobId: latestJob._id 
      });
      
      const testFound = updatedResults.find(r => r.rowNumber === 999);
      if (testFound) {
        console.log('✓ Test result verified in database');
      } else {
        console.log('✗ Test result not found in database');
      }
      
    } catch (error) {
      console.error('✗ Failed to create test result:', error.message);
    }
    
  } catch (error) {
    console.error('Error during testing:', error);
  }
  
  console.log('\n=== TEST COMPLETE ===');
  process.exit(0);
}

// Run the test
testMatching().catch(console.error);