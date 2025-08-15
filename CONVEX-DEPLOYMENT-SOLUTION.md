# Convex Deployment Solution

## Issue Summary
The clientPriceLists functions are not deployed to Convex, causing server errors when trying to access price lists in the modal.

## Root Cause
There are TWO different Convex deployments being used:
1. **Old deployment**: good-dolphin-454 (was in production)
2. **Current deployment**: trustworthy-badger-677 (in .env.local)

The clientPriceLists functions exist in the code but haven't been deployed to either deployment.

## Configuration Updates Made

### 1. Backend (.env)
- Updated CONVEX_URL from `good-dolphin-454` to `trustworthy-badger-677`

### 2. Frontend (.env and .env.production)
- Updated VITE_CONVEX_URL from `good-dolphin-454` to `trustworthy-badger-677`

### 3. Test Scripts
- Updated test-convex-direct.js to use `trustworthy-badger-677`
- Updated create-test-pricelist.js to use `trustworthy-badger-677`

## Manual Deployment Steps

Since automated deployment fails due to authentication, you need to deploy manually:

### Option 1: Via Command Line (Interactive)

1. Open a **new terminal** (Command Prompt or PowerShell)
2. Navigate to the project:
   ```
   cd C:\Users\abaza\OneDrive\Desktop\MJDv9\boq-matching-system
   ```

3. Run Convex dev command:
   ```
   npx convex dev
   ```

4. When prompted, select:
   - "Use an existing project" 
   - Team: **Braunwell**
   - Project: **mjd-4e3ef**

5. The functions will deploy automatically

### Option 2: Via Convex Dashboard

1. Go to https://dashboard.convex.dev/
2. Log in with your account
3. Select project **mjd-4e3ef** (team Braunwell)
4. Click "Deploy" or "Sync" to deploy all functions

## Verification Steps

After deployment, verify it worked:

```bash
cd boq-matching-system
node test-convex-direct.js
```

You should see:
- ✓ Success for clientPriceLists.getAllActive
- ✓ Success for clientPriceLists.getByClient

## Test Price List Creation

Once deployed, create a test price list:

```bash
cd boq-matching-system
node create-test-pricelist.js
```

## Frontend Testing

1. Go to https://mjd.braunwell.io or your local dev server
2. Navigate to Price List section
3. Click "Client Prices" button
4. The modal should now show:
   - Client selection dropdown with real clients
   - Upload button
   - Effective dates
   - Manage Price Lists tab with existing lists

## Current Status

✅ All configuration files updated to use trustworthy-badger-677
✅ Test scripts ready to verify deployment
❌ Functions not yet deployed (requires manual action)

## Next Steps

1. Deploy the Convex functions using one of the manual methods above
2. Run verification tests
3. Create test price list if needed
4. Test in frontend

The deployment should only take a minute once you run `npx convex dev` interactively.