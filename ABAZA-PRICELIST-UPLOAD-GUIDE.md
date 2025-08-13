# Abaza Co. Price List Upload Guide

## File Ready for Upload
✅ **File Found**: `C:\Users\abaza\Downloads\MJD-PRICELIST.xlsx` (4.5 MB)

## Step-by-Step Instructions

### 1. Open Website
Go to: https://mjd.braunwell.io

### 2. Login
- **Email**: abaza@mjd.com
- **Password**: abaza123

### 3. Create Client (if needed)
If "Abaza Co." doesn't exist yet:
1. Go to **Clients** section
2. Click **Add Client**
3. Enter:
   - **Name**: Abaza Co.
   - **Email**: info@abaza.co
   - **Phone**: +20 123 456 7890
   - **Contact Person**: Mr. Abaza
   - **Active**: ✅ Checked
4. Click **Save**

### 4. Upload Price List
1. Go to **Price List** section
2. Click **Client Prices** button (blue button with Users icon)
3. In the modal:

#### Upload Tab:
1. **Select Client**: Choose "Abaza Co." from dropdown
2. **Upload Mode**: Select "Create New Price List"
3. **Fill Details**:
   - **Name**: `Abaza Co. Q1 2025 Rates`
   - **Description**: `Active price list for 2025 construction projects`
   - **Effective From**: Today's date
   - **Effective To**: Dec 31, 2025
   - ✅ **Set as default price list**: Check this box
4. **Choose File**: Select `MJD-PRICELIST.xlsx` from Downloads
5. Click **Upload and Sync**

### 5. Wait for Processing
- The system will process all items in the Excel file
- You'll see a progress bar
- When complete, statistics will show:
  - Total items processed
  - Successfully mapped items
  - Items needing review

### 6. Verify Upload
1. Switch to **Manage Price Lists** tab
2. You should see "Abaza Co. Q1 2025 Rates" listed
3. It should show:
   - Status: **Active**
   - Default: **Yes**
   - Client: **Abaza Co.**

## What This Does

Once uploaded, the Abaza Co. price list will:
1. ✅ Be the default price list for Abaza Co.
2. ✅ Be used for BOQ matching when processing Abaza Co. projects
3. ✅ Override general price list rates with client-specific rates
4. ✅ Track all mappings between BOQ items and price list items

## Testing the Upload

After successful upload, test it:
1. Go to **Projects** section
2. Create a new project for "Abaza Co."
3. Upload a BOQ file
4. The system will automatically use Abaza Co.'s price list for matching

## Troubleshooting

### If upload fails:
1. Check file format (must be .xlsx, .xls, or .csv)
2. Ensure client exists and is active
3. Try refreshing the page and retry
4. Check browser console for errors (F12)

### If client dropdown is empty:
1. Create the client first (Step 3)
2. Refresh the page after creating
3. Logout and login again if needed

### If "Client Prices" button is missing:
1. Hard refresh: Ctrl+Shift+R
2. Clear browser cache
3. Check you're logged in as admin

## File Location
Your Excel file is at:
```
C:\Users\abaza\Downloads\MJD-PRICELIST.xlsx
```

## Support
If you encounter issues, the backend logs can be checked at:
- EC2 Instance: 100.24.46.199
- Process: boq-backend (PM2)
- Logs: `pm2 logs boq-backend`

---
**Created**: August 13, 2025
**System**: MJD BOQ Price Matching System