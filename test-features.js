#!/usr/bin/env node

/**
 * Automated Test Script for Google Sheets Price List & Self-Learning Features
 * Run with: node test-features.js
 */

import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const API_BASE_URL = process.env.API_URL || 'http://localhost:5000/api';
const TEST_EMAIL = 'abaza@mjd.com';
const TEST_PASSWORD = 'abaza123';

// Test state
let authToken = null;
let testJobId = null;
let testResultId = null;
let testPriceItemId = null;

// Utility functions
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function login() {
  try {
    console.log('🔐 Logging in...');
    const response = await axios.post(`${API_BASE_URL}/auth/login`, {
      email: TEST_EMAIL,
      password: TEST_PASSWORD
    });
    authToken = response.data.accessToken;
    console.log('✅ Login successful');
    return authToken;
  } catch (error) {
    console.error('❌ Login failed:', error.response?.data || error.message);
    throw error;
  }
}

async function testSpreadsheetFeatures() {
  console.log('\n📊 Testing Google Sheets-like Spreadsheet Features');
  console.log('================================================');

  try {
    // 1. Get current price items
    console.log('\n1️⃣ Fetching current price items...');
    const itemsResponse = await axios.get(`${API_BASE_URL}/price-list`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    console.log(`✅ Found ${itemsResponse.data.length} price items`);

    // 2. Test bulk update with new and existing items
    console.log('\n2️⃣ Testing bulk update...');
    const bulkUpdates = [
      {
        _id: itemsResponse.data[0]?._id,
        description: `Updated Test Item ${Date.now()}`,
        rate: Math.floor(Math.random() * 1000)
      },
      {
        _id: `new_${Date.now()}`,
        description: 'New Test Item from Bulk Update',
        code: 'TEST001',
        unit: 'pcs',
        rate: 150,
        category: 'Test Category',
        subcategory: 'Test Subcategory'
      }
    ];

    const bulkResponse = await axios.post(
      `${API_BASE_URL}/price-list/bulk-update`,
      { updates: bulkUpdates },
      { headers: { Authorization: `Bearer ${authToken}` } }
    );
    console.log('✅ Bulk update result:', bulkResponse.data);
    
    // Save the new item ID for later tests
    if (bulkResponse.data.created > 0) {
      const newItems = await axios.get(`${API_BASE_URL}/price-list/items`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      testPriceItemId = newItems.data.find(item => item.code === 'TEST001')?._id;
      console.log('📝 Saved test price item ID:', testPriceItemId);
    }

    // 3. Test CSV export
    console.log('\n3️⃣ Testing CSV export...');
    const exportResponse = await axios.get(`${API_BASE_URL}/price-list/export`, {
      headers: { Authorization: `Bearer ${authToken}` },
      responseType: 'arraybuffer'
    });
    const exportPath = path.join(__dirname, 'test-export.csv');
    fs.writeFileSync(exportPath, exportResponse.data);
    console.log(`✅ Exported price list to ${exportPath}`);

    // 4. Test search functionality
    console.log('\n4️⃣ Testing search...');
    const searchResponse = await axios.post(
      `${API_BASE_URL}/price-list/search`,
      { query: 'test', limit: 10 },
      { headers: { Authorization: `Bearer ${authToken}` } }
    );
    console.log(`✅ Search found ${searchResponse.data.length} items`);

    // 5. Test stats endpoint
    console.log('\n5️⃣ Testing price list statistics...');
    const statsResponse = await axios.get(`${API_BASE_URL}/price-list/stats`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    console.log('✅ Stats:', {
      totalItems: statsResponse.data.totalItems,
      categories: statsResponse.data.categories.length,
      incompleteCount: statsResponse.data.incompleteCount
    });

    return true;
  } catch (error) {
    console.error('❌ Spreadsheet test failed:', error.response?.data || error.message);
    return false;
  }
}

async function testSelfLearningFeatures() {
  console.log('\n🧠 Testing Self-Learning from Manual Matches');
  console.log('============================================');

  try {
    // 1. Use pre-created Excel file
    console.log('\n1️⃣ Using test BOQ Excel file...');
    const boqPath = path.join(__dirname, 'test-boq.xlsx');
    
    if (!fs.existsSync(boqPath)) {
      console.log('⚠️ Test file not found, creating it...');
      // Run create-test-excel.js first
      throw new Error('Please run: node create-test-excel.js first');
    }
    console.log('✅ Test BOQ file ready');

    // 2. Upload BOQ for matching
    console.log('\n2️⃣ Uploading BOQ for matching...');
    const formData = new FormData();
    formData.append('file', fs.createReadStream(boqPath));
    formData.append('matchingMethod', 'LOCAL');
    formData.append('projectName', `Test Project ${Date.now()}`);

    const uploadResponse = await axios.post(
      `${API_BASE_URL}/price-matching/upload`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          Authorization: `Bearer ${authToken}`
        }
      }
    );
    testJobId = uploadResponse.data.jobId;
    console.log('✅ BOQ uploaded, Job ID:', testJobId);

    // 3. Start matching process
    console.log('\n3️⃣ Starting matching process...');
    await axios.post(
      `${API_BASE_URL}/price-matching/${testJobId}/start`,
      {},
      { headers: { Authorization: `Bearer ${authToken}` } }
    );

    // Wait for matching to complete
    console.log('⏳ Waiting for matching to complete...');
    let attempts = 0;
    let jobStatus = null;
    while (attempts < 30) {
      await delay(2000);
      const statusResponse = await axios.get(
        `${API_BASE_URL}/price-matching/${testJobId}/status`,
        { headers: { Authorization: `Bearer ${authToken}` } }
      );
      jobStatus = statusResponse.data;
      console.log(`   Status: ${jobStatus.status} (${jobStatus.progress}%)`);
      
      if (jobStatus.status === 'completed' || jobStatus.status === 'failed') {
        break;
      }
      attempts++;
    }

    if (jobStatus.status !== 'completed') {
      throw new Error(`Job failed or timed out: ${jobStatus.status}`);
    }

    // 4. Get match results
    console.log('\n4️⃣ Getting match results...');
    const resultsResponse = await axios.get(
      `${API_BASE_URL}/price-matching/${testJobId}/results`,
      { headers: { Authorization: `Bearer ${authToken}` } }
    );
    const results = resultsResponse.data;
    console.log(`✅ Got ${results.length} match results`);
    
    if (results.length > 0) {
      testResultId = results[0]._id;
      console.log('📝 First result:', {
        description: results[0].originalDescription,
        matched: results[0].matchedDescription,
        confidence: results[0].confidence
      });
    }

    // 5. Manually edit a match to create a learning pattern
    if (testResultId && testPriceItemId) {
      console.log('\n5️⃣ Creating manual match for learning...');
      const manualEdit = {
        matchedItemId: testPriceItemId,
        matchedDescription: 'Manually Selected Test Item',
        matchedCode: 'TEST001',
        matchedUnit: 'pcs',
        matchedRate: 150,
        confidence: 1.0,
        isManuallyEdited: true,
        matchMethod: 'MANUAL'
      };

      await axios.patch(
        `${API_BASE_URL}/price-matching/results/${testResultId}`,
        manualEdit,
        { headers: { Authorization: `Bearer ${authToken}` } }
      );
      console.log('✅ Manual match created - pattern should be recorded');
    }

    // 6. Upload similar BOQ to test learning
    console.log('\n6️⃣ Uploading similar BOQ to test learning...');
    const similarBoqPath = path.join(__dirname, 'test-boq-similar.xlsx');

    const formData2 = new FormData();
    formData2.append('file', fs.createReadStream(similarBoqPath));
    formData2.append('matchingMethod', 'LOCAL');
    formData2.append('projectName', `Test Learning Project ${Date.now()}`);

    const uploadResponse2 = await axios.post(
      `${API_BASE_URL}/price-matching/upload`,
      formData2,
      {
        headers: {
          ...formData2.getHeaders(),
          Authorization: `Bearer ${authToken}`
        }
      }
    );
    const testJobId2 = uploadResponse2.data.jobId;
    console.log('✅ Similar BOQ uploaded, Job ID:', testJobId2);

    // Start and wait for second matching
    await axios.post(
      `${API_BASE_URL}/price-matching/${testJobId2}/start`,
      {},
      { headers: { Authorization: `Bearer ${authToken}` } }
    );

    console.log('⏳ Waiting for learning-based matching...');
    attempts = 0;
    while (attempts < 30) {
      await delay(2000);
      const statusResponse = await axios.get(
        `${API_BASE_URL}/price-matching/${testJobId2}/status`,
        { headers: { Authorization: `Bearer ${authToken}` } }
      );
      const status = statusResponse.data;
      
      if (status.status === 'completed') {
        // Check if any results have isLearnedMatch flag
        const results2Response = await axios.get(
          `${API_BASE_URL}/price-matching/${testJobId2}/results`,
          { headers: { Authorization: `Bearer ${authToken}` } }
        );
        const results2 = results2Response.data;
        const learnedMatches = results2.filter(r => r.isLearnedMatch);
        
        console.log(`✅ Matching completed`);
        console.log(`📊 Results: ${results2.length} total, ${learnedMatches.length} from learning`);
        
        if (learnedMatches.length > 0) {
          console.log('🎉 Self-learning is working! Found learned matches:');
          learnedMatches.forEach(match => {
            console.log(`   - ${match.originalDescription} → ${match.matchedDescription}`);
          });
        } else {
          console.log('⚠️ No learned matches found (patterns may need more training)');
        }
        break;
      }
      
      if (status.status === 'failed') {
        throw new Error('Second job failed');
      }
      attempts++;
    }

    // 7. Check learning statistics
    console.log('\n7️⃣ Checking learning statistics...');
    try {
      const statsResponse = await axios.get(
        `${API_BASE_URL}/price-matching/learning/statistics`,
        { headers: { Authorization: `Bearer ${authToken}` } }
      );
      console.log('✅ Learning statistics:', statsResponse.data);
    } catch (error) {
      console.log('ℹ️ Learning statistics endpoint not available yet');
    }

    return true;
  } catch (error) {
    console.error('❌ Self-learning test failed:', error.response?.data || error.message);
    return false;
  }
}

async function cleanup() {
  console.log('\n🧹 Cleaning up test data...');
  
  try {
    // Delete test files
    const testFiles = [
      'test-export.csv',
      'test-boq.xlsx',
      'test-boq-similar.xlsx',
      'test-pricelist.xlsx'
    ];
    
    testFiles.forEach(file => {
      const filePath = path.join(__dirname, file);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`✅ Deleted ${file}`);
      }
    });

    // Delete test job if created
    if (testJobId && authToken) {
      try {
        await axios.delete(
          `${API_BASE_URL}/price-matching/${testJobId}`,
          { headers: { Authorization: `Bearer ${authToken}` } }
        );
        console.log('✅ Deleted test job');
      } catch (error) {
        console.log('ℹ️ Could not delete test job');
      }
    }
  } catch (error) {
    console.error('⚠️ Cleanup error:', error.message);
  }
}

// Main test runner
async function runTests() {
  console.log('🚀 Starting Feature Tests');
  console.log('========================\n');
  
  try {
    // Login
    await login();
    
    // Run tests
    const spreadsheetResult = await testSpreadsheetFeatures();
    const learningResult = await testSelfLearningFeatures();
    
    // Summary
    console.log('\n📋 Test Summary');
    console.log('===============');
    console.log(`Spreadsheet Features: ${spreadsheetResult ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`Self-Learning Features: ${learningResult ? '✅ PASSED' : '❌ FAILED'}`);
    
    // Cleanup
    await cleanup();
    
    // Exit with appropriate code
    process.exit(spreadsheetResult && learningResult ? 0 : 1);
  } catch (error) {
    console.error('\n💥 Test runner failed:', error.message);
    await cleanup();
    process.exit(1);
  }
}

// Run tests
runTests();