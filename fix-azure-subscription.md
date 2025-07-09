# Fix Azure Subscription Issues

## Option 1: Remove Spending Limit (Recommended)
```bash
# Check spending limit status
az account show --query "subscriptionPolicies.spendingLimit"

# Remove spending limit via Azure Portal:
# 1. Go to https://portal.azure.com
# 2. Search for "Subscriptions"
# 3. Select your subscription
# 4. Click "Remove spending limit" in the overview
# 5. Choose "Remove spending limit indefinitely"
```

## Option 2: Use Different Region
Your current regions (eastus, westeurope) might have quota issues. Try:

```bash
# Deploy to a different region with available quota
./deploy-to-existing.ps1 -Location "canadacentral"
# or
./deploy-to-existing.ps1 -Location "australiaeast"
```

## Option 3: Check Your Credits
```bash
# View your current usage and credits
az consumption usage list --output table

# Check your subscription status
az account list --output table
```

## Option 4: Use Existing Resources
You already have these apps deployed:
- mjd-boq-app (West Europe)
- mjd-boq-app-linux (North Europe)

Deploy to one of these existing apps:
```powershell
# Deploy to existing app
./deploy-to-existing.ps1 -AppName "mjd-boq-app" -ResourceGroupName "Pricing-WE-RG"
```

## Understanding Visual Studio Enterprise Subscription:
- Monthly credits: $150
- Your usage: $144.30 (96% used)
- Remaining: ~$5.70

The spending limit prevents you from:
1. Going over $150 (no unexpected charges)
2. Creating new resources when near the limit
3. Creating resources in regions with quota restrictions

## Immediate Solution:
Since you have existing web apps, use them instead of creating new ones!