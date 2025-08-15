# Manual Convex Deployment Instructions

Since automated deployment is failing due to authentication issues, follow these steps to manually deploy the clientPriceLists functions:

## Option 1: Via Convex Dashboard (Recommended)

1. Open your browser and go to: https://dashboard.convex.dev/
2. Log in with your Convex account
3. Select the project: **mjd-4e3ef** (team: Braunwell)
4. Go to the "Functions" tab
5. Click "Deploy" or "Sync" button
6. This will deploy all functions including clientPriceLists

## Option 2: Via Terminal (Interactive Mode)

Open a terminal/command prompt and run:

```bash
cd C:\Users\abaza\OneDrive\Desktop\MJDv9\boq-matching-system
npx convex dev
```

When prompted:
1. Select "Use an existing project"
2. Choose team: **Braunwell**
3. Choose project: **mjd-4e3ef**
4. The functions will deploy automatically

## Option 3: With Deploy Key

If you have a deploy key:

```bash
cd C:\Users\abaza\OneDrive\Desktop\MJDv9\boq-matching-system
set CONVEX_DEPLOY_KEY=your-deploy-key-here
npx convex deploy
```

## Verification

After deployment, test that it worked:

```bash
cd boq-matching-system
node test-convex-direct.js
```

You should see:
- ✓ Success for clientPriceLists.getAllActive
- ✓ Success for clientPriceLists.getByClient

## Current Deployment Info

- **Deployment URL**: https://trustworthy-badger-677.convex.cloud
- **Team**: Braunwell
- **Project**: mjd-4e3ef
- **Deployment ID**: dev:trustworthy-badger-677

## Files That Need Deployment

The following files contain the clientPriceLists functions that need to be deployed:
- `convex/clientPriceLists.ts` - Main client price list functions
- `convex/schema.ts` - Database schema including clientPriceLists table
- `convex/clients.ts` - Client management functions