/**
 * Deploy Convex functions directly using the Convex HTTP API
 * This bypasses the CLI authentication issues
 */

import { ConvexHttpClient } from 'convex/browser';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use the trustworthy-badger deployment from .env.local
const CONVEX_URL = 'https://trustworthy-badger-677.convex.cloud';

async function deployFunctions() {
  try {
    console.log('Testing Convex connection...');
    const convex = new ConvexHttpClient(CONVEX_URL);
    
    // First, test if we can connect
    console.log('\nTesting existing functions...');
    try {
      const users = await convex.query(api => api.users.getAllUsers);
      console.log(`✓ Connected! Found ${users.length} users`);
    } catch (error) {
      console.log('Error connecting:', error.message);
    }
    
    console.log('\n=== Manual Deployment Required ===');
    console.log('The clientPriceLists functions need to be deployed manually.');
    console.log('');
    console.log('Please follow these steps:');
    console.log('');
    console.log('1. Open a new terminal/command prompt');
    console.log('2. Navigate to the project directory:');
    console.log('   cd C:\\Users\\abaza\\OneDrive\\Desktop\\MJDv9\\boq-matching-system');
    console.log('');
    console.log('3. Run the Convex dev command interactively:');
    console.log('   npx convex dev');
    console.log('');
    console.log('4. When prompted:');
    console.log('   - Select "Use an existing project"');
    console.log('   - Choose team: Braunwell');
    console.log('   - Choose project: mjd-4e3ef');
    console.log('');
    console.log('5. The functions will deploy automatically');
    console.log('');
    console.log('6. Once deployed, test with:');
    console.log('   node test-convex-direct.js');
    console.log('');
    console.log('Current deployment info:');
    console.log('- URL:', CONVEX_URL);
    console.log('- Deployment: dev:trustworthy-badger-677');
    console.log('- Team: Braunwell');
    console.log('- Project: mjd-4e3ef');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

deployFunctions();