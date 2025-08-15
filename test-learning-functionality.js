/**
 * Test script to validate the learning functionality of the BOQ matching system
 * This tests whether manual matches are properly stored and recalled in future matches
 */

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import ExcelJS from 'exceljs';

const API_URL = 'http://localhost:5000/api';
// const API_URL = 'https://54.82.88.31/api'; // Production URL

// Test credentials
const TEST_USER = {
  email: 'abaza@mjd.com',
  password: 'abaza123'
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  orange: '\x1b[38;5;208m', // Orange color for learned matches
};

let authToken = null;

// Helper function to delay execution
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Login function
async function login() {
  try {
    console.log(`${colors.cyan}Logging in...${colors.reset}`);
    const response = await axios.post(`${API_URL}/auth/login`, TEST_USER);
    
    // Check for different token field names
    authToken = response.data.token || response.data.accessToken;
    
    if (!authToken) {
      console.log('Login response:', response.data);
      throw new Error('No token in response');
    }
    
    console.log(`${colors.green}✓ Login successful${colors.reset}`);
    return authToken;
  } catch (error) {
    console.error(`${colors.red}✗ Login failed:${colors.reset}`, error.response?.data || error.message);
    throw error;
  }
}

// Create a test Excel file with sample BOQ items
function createTestExcelFile(filename, items) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('BOQ');

  // Add headers
  worksheet.addRow(['S.No', 'Description', 'Quantity', 'Unit']);

  // Add items
  items.forEach((item, index) => {
    worksheet.addRow([index + 1, item.description, item.quantity, item.unit]);
  });

  // Save file
  return workbook.xlsx.writeFile(filename);
}

// Upload and process BOQ file
async function uploadAndProcessFile(filename, method = 'OPENAI') {
  try {
    console.log(`${colors.cyan}Uploading file: ${filename}${colors.reset}`);
    
    const form = new FormData();
    form.append('file', fs.createReadStream(filename));
    form.append('matchingMethod', method);
    form.append('projectId', 'test-project-' + Date.now());

    const response = await axios.post(`${API_URL}/price-matching/upload`, form, {
      headers: {
        ...form.getHeaders(),
        'Authorization': `Bearer ${authToken}`
      }
    });

    console.log(`${colors.green}✓ File uploaded successfully${colors.reset}`);
    return response.data.jobId;
  } catch (error) {
    console.error(`${colors.red}✗ Upload failed:${colors.reset}`, error.response?.data || error.message);
    throw error;
  }
}

// Wait for job to complete
async function waitForJobCompletion(jobId, maxWaitTime = 60000) {
  const startTime = Date.now();
  console.log(`${colors.cyan}Waiting for job ${jobId} to complete...${colors.reset}`);

  while (Date.now() - startTime < maxWaitTime) {
    try {
      const response = await axios.get(`${API_URL}/price-matching/status/${jobId}`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      const { status, progress, progressMessage } = response.data;
      
      if (status === 'completed') {
        console.log(`${colors.green}✓ Job completed successfully${colors.reset}`);
        return true;
      } else if (status === 'failed') {
        console.log(`${colors.red}✗ Job failed: ${progressMessage}${colors.reset}`);
        return false;
      }

      console.log(`  Status: ${status}, Progress: ${progress}%, Message: ${progressMessage}`);
      await delay(3000); // Check every 3 seconds
    } catch (error) {
      console.error(`${colors.red}Error checking status:${colors.reset}`, error.message);
    }
  }

  console.log(`${colors.yellow}⚠ Job did not complete within timeout${colors.reset}`);
  return false;
}

// Get job results
async function getJobResults(jobId) {
  try {
    const response = await axios.get(`${API_URL}/price-matching/${jobId}/results`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    return response.data;
  } catch (error) {
    console.error(`${colors.red}✗ Failed to get results:${colors.reset}`, error.response?.data || error.message);
    throw error;
  }
}

// Update a match result (simulate manual edit)
async function updateMatchResult(resultId, updates) {
  try {
    const response = await axios.patch(`${API_URL}/price-matching/results/${resultId}`, updates, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    console.log(`${colors.green}✓ Match result updated${colors.reset}`);
    return response.data;
  } catch (error) {
    console.error(`${colors.red}✗ Failed to update result:${colors.reset}`, error.response?.data || error.message);
    throw error;
  }
}

// Main test function
async function runLearningTest() {
  console.log(`\n${colors.bright}${colors.magenta}=== BOQ MATCHING LEARNING FUNCTIONALITY TEST ===${colors.reset}\n`);

  try {
    // Step 1: Login
    await login();

    // Step 2: Create test file with unique items
    const testFile1 = 'test-learning-1.xlsx';
    const testItems1 = [
      { description: 'Supply and installation of ceramic floor tiles 60x60cm', quantity: 100, unit: 'sqm' },
      { description: 'Excavation in ordinary soil including disposal', quantity: 50, unit: 'cum' },
      { description: 'Reinforced concrete grade M25 for columns', quantity: 25, unit: 'cum' },
    ];

    console.log(`\n${colors.cyan}Creating first test file...${colors.reset}`);
    await createTestExcelFile(testFile1, testItems1);

    // Step 3: Upload and process first file
    console.log(`\n${colors.bright}PHASE 1: Initial Processing${colors.reset}`);
    const jobId1 = await uploadAndProcessFile(testFile1, 'LOCAL');
    
    // Wait for completion
    const completed1 = await waitForJobCompletion(jobId1);
    if (!completed1) {
      throw new Error('First job failed to complete');
    }

    // Get results
    const results1 = await getJobResults(jobId1);
    console.log(`\n${colors.cyan}Initial Results:${colors.reset}`);
    results1.forEach(result => {
      if (result.matchedDescription) {
        console.log(`  - "${result.originalDescription.substring(0, 50)}..."`);
        console.log(`    → Matched: "${result.matchedDescription.substring(0, 50)}..."`);
        console.log(`    → Confidence: ${(result.confidence * 100).toFixed(1)}%`);
        console.log(`    → Method: ${result.matchMethod}`);
      }
    });

    // Step 4: Manually edit one of the matches to create a learning pattern
    console.log(`\n${colors.bright}PHASE 2: Manual Edit (Creating Learning Pattern)${colors.reset}`);
    const itemToEdit = results1.find(r => r.originalDescription.includes('ceramic floor tiles'));
    
    if (itemToEdit) {
      console.log(`${colors.yellow}Manually editing match for:${colors.reset}`);
      console.log(`  "${itemToEdit.originalDescription}"`);
      
      // Simulate a manual edit with a specific match
      await updateMatchResult(itemToEdit._id, {
        matchedDescription: 'Premium Ceramic Floor Tiles 600x600mm Grade A',
        matchedCode: 'TILE-600-A',
        matchedUnit: 'sqm',
        matchedRate: 850,
        confidence: 1.0,
        isManuallyEdited: true,
        matchMethod: 'MANUAL'
      });
      
      console.log(`${colors.green}  → Manual match recorded${colors.reset}`);
    }

    // Wait a bit for the pattern to be stored
    await delay(2000);

    // Step 5: Create second test file with similar items
    const testFile2 = 'test-learning-2.xlsx';
    const testItems2 = [
      { description: 'Supply & install ceramic floor tiles 60x60', quantity: 75, unit: 'sqm' }, // Similar to edited item
      { description: 'Ceramic floor tile 600x600 installation', quantity: 120, unit: 'sqm' }, // Another variation
      { description: 'Earth excavation in normal soil with disposal', quantity: 30, unit: 'cum' },
    ];

    console.log(`\n${colors.cyan}Creating second test file with similar items...${colors.reset}`);
    await createTestExcelFile(testFile2, testItems2);

    // Step 6: Process second file and check if learning worked
    console.log(`\n${colors.bright}PHASE 3: Testing Learning Recognition${colors.reset}`);
    const jobId2 = await uploadAndProcessFile(testFile2, 'OPENAI'); // Using AI method to test if learning overrides
    
    // Wait for completion
    const completed2 = await waitForJobCompletion(jobId2);
    if (!completed2) {
      throw new Error('Second job failed to complete');
    }

    // Get results and check for learned matches
    const results2 = await getJobResults(jobId2);
    console.log(`\n${colors.cyan}Second Processing Results:${colors.reset}`);
    
    let learnedMatchFound = false;
    results2.forEach(result => {
      if (result.matchedDescription) {
        const isLearned = result.isLearnedMatch === true;
        const matchColor = isLearned ? colors.orange : colors.reset;
        
        console.log(`  - "${result.originalDescription.substring(0, 50)}..."`);
        console.log(`    → Matched: ${matchColor}"${result.matchedDescription.substring(0, 50)}..."${colors.reset}`);
        console.log(`    → Confidence: ${(result.confidence * 100).toFixed(1)}%`);
        console.log(`    → Method: ${result.matchMethod}`);
        
        if (isLearned) {
          console.log(`    ${colors.orange}★ LEARNED MATCH APPLIED!${colors.reset}`);
          learnedMatchFound = true;
        }
      }
    });

    // Step 7: Verify results
    console.log(`\n${colors.bright}=== TEST RESULTS ===${colors.reset}`);
    
    if (learnedMatchFound) {
      console.log(`${colors.green}✓ SUCCESS: Learning functionality is working!${colors.reset}`);
      console.log(`${colors.green}  The system successfully recalled and applied the manually edited pattern.${colors.reset}`);
      console.log(`${colors.orange}  Learned matches are highlighted in orange color in the UI.${colors.reset}`);
    } else {
      console.log(`${colors.yellow}⚠ WARNING: No learned matches detected${colors.reset}`);
      console.log(`  This could mean:`);
      console.log(`  1. The learning threshold (85% confidence) was not met`);
      console.log(`  2. The descriptions were too different`);
      console.log(`  3. The pattern storage may need debugging`);
    }

    // Clean up test files
    console.log(`\n${colors.cyan}Cleaning up test files...${colors.reset}`);
    fs.unlinkSync(testFile1);
    fs.unlinkSync(testFile2);

  } catch (error) {
    console.error(`\n${colors.red}Test failed:${colors.reset}`, error.message);
    console.error(error.stack);
  }
}

// Run the test
runLearningTest().then(() => {
  console.log(`\n${colors.cyan}Test completed${colors.reset}`);
  process.exit(0);
}).catch(error => {
  console.error(`\n${colors.red}Fatal error:${colors.reset}`, error);
  process.exit(1);
});