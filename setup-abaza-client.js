/**
 * Setup Abaza Co. client and price list in Convex database
 * Run this to prepare the client for price list upload
 */

const { ConvexHttpClient } = require('convex/browser');
const path = require('path');

// Configuration
const CONVEX_URL = 'https://good-dolphin-454.convex.cloud';

async function setupAbazaClient() {
  try {
    console.log('=== Setting up Abaza Co. Client ===\n');
    
    // Initialize Convex client
    const convex = new ConvexHttpClient(CONVEX_URL);
    
    // Import the API
    const apiPath = path.join(__dirname, 'convex', '_generated', 'api.js');
    const { api } = await import(`file://${apiPath}`);
    
    // Step 1: Get or create admin user
    console.log('[1] Finding admin user...');
    const users = await convex.query(api.users.getAllUsers);
    let adminUser = users.find(u => u.email === 'abaza@mjd.com');
    
    if (!adminUser) {
      console.log('  Admin user not found. Please login first at https://mjd.braunwell.io');
      return;
    }
    console.log(`✓ Admin user found: ${adminUser.name}`);
    
    // Step 2: Check for Abaza Co. client
    console.log('\n[2] Checking for Abaza Co. client...');
    const clients = await convex.query(api.clients.getAll);
    let abazaClient = clients.find(c => c.name === 'Abaza Co.' || c.name === 'Abaza Company');
    
    if (!abazaClient) {
      console.log('  Creating Abaza Co. client...');
      
      // Create the client
      const clientId = await convex.mutation(api.clients.create, {
        name: 'Abaza Co.',
        email: 'info@abaza.co',
        phone: '+20 123 456 7890',
        address: 'Cairo, Egypt',
        contactPerson: 'Mr. Abaza',
        notes: 'Primary client for BOQ price matching',
        isActive: true,
        userId: adminUser._id
      });
      
      console.log(`✓ Client created with ID: ${clientId}`);
      
      // Fetch the created client
      abazaClient = await convex.query(api.clients.getById, { _id: clientId });
    } else {
      console.log(`✓ Client already exists: ${abazaClient.name} (ID: ${abazaClient._id})`);
      
      // Ensure it's active
      if (!abazaClient.isActive) {
        console.log('  Activating client...');
        await convex.mutation(api.clients.update, {
          _id: abazaClient._id,
          isActive: true
        });
        console.log('✓ Client activated');
      }
    }
    
    // Step 3: Check existing price lists
    console.log('\n[3] Checking existing price lists...');
    const priceLists = await convex.query(api.clientPriceLists.getByClient, {
      clientId: abazaClient._id
    });
    
    if (priceLists.length > 0) {
      console.log(`  Found ${priceLists.length} existing price list(s):`);
      priceLists.forEach(pl => {
        console.log(`    - ${pl.name} (${pl.isDefault ? 'Default' : 'Not default'}, ${pl.isActive ? 'Active' : 'Inactive'})`);
      });
    } else {
      console.log('  No existing price lists found');
    }
    
    // Step 4: Create instructions for manual upload
    console.log('\n=== Setup Complete ===\n');
    console.log('Client is ready for price list upload!\n');
    console.log('To upload MJD-PRICELIST.xlsx:');
    console.log('1. Go to https://mjd.braunwell.io');
    console.log('2. Login with abaza@mjd.com');
    console.log('3. Navigate to Price List section');
    console.log('4. Click "Client Prices" button');
    console.log('5. Select "Abaza Co." from the dropdown');
    console.log('6. Choose "Create New Price List"');
    console.log('7. Enter price list details:');
    console.log('   - Name: "Abaza Co. Q1 2025 Rates"');
    console.log('   - Description: "Active price list for 2025"');
    console.log('   - Check "Set as default"');
    console.log('   - Set effective dates');
    console.log('8. Upload MJD-PRICELIST.xlsx file');
    console.log('9. Click "Upload and Sync"');
    
    console.log('\nClient Details:');
    console.log(`  Name: ${abazaClient.name}`);
    console.log(`  ID: ${abazaClient._id}`);
    console.log(`  Email: ${abazaClient.email}`);
    console.log(`  Status: ${abazaClient.isActive ? 'Active' : 'Inactive'}`);
    
  } catch (error) {
    console.error('Setup failed:', error);
    
    if (error.message.includes('Cannot find module')) {
      console.log('\nPlease run this from the project directory:');
      console.log('  cd boq-matching-system');
      console.log('  node setup-abaza-client.js');
    }
  }
}

// Run setup
setupAbazaClient();