# Price List Mapping System Guide

## Overview
The Price List Mapping System allows you to map cells from the MJD-PRICELIST.xlsx spreadsheet to specific price list items in the database. This ensures that when rates change in the Excel file, they automatically update in the database.

## Features

### 1. Excel Cell Mapping
- **Automatic Detection**: System automatically detects columns for Code, Description, Unit, and Rate
- **Cell Reference Tracking**: Each mapped item tracks its exact cell location (e.g., Sheet1!G15)
- **Formula Support**: Preserves Excel formulas and calculates results

### 2. Mapping Methods
- **Code Matching**: Exact match by item code (100% confidence)
- **Description Matching**: Exact match by description (90% confidence)
- **Fuzzy Matching**: Intelligent string matching for similar descriptions (70% confidence)
- **Manual Mapping**: Users can manually map unmatched items

### 3. Mapping Management Modal
The modal provides four main tabs:

#### Overview Tab
- Total mappings count
- Confidence distribution (High/Medium/Low)
- Mapping methods used
- Sheet distribution

#### Mappings Tab
- View all mappings with filters
- Search by code or description
- Filter by sheet, confidence, or verification status
- Edit individual mappings
- Verify or reject mappings

#### Review Tab
- Focus on low-confidence mappings
- Side-by-side comparison of Excel vs Database values
- Quick verification actions
- Bulk mapping updates

#### Sync Tab
- Upload new Excel files
- Sync rates from Excel to Database
- Export database rates to Excel
- Validate existing mappings

## How to Use

### Step 1: Access Client Price Lists
1. Navigate to "Client Price Lists" in the main menu
2. Select a client from the dropdown

### Step 2: Upload MJD-PRICELIST.xlsx
1. Click "Upload MJD-PRICELIST.xlsx" button
2. Select your Excel file
3. System will automatically:
   - Parse the Excel file
   - Detect headers and columns
   - Create mappings for each item
   - Generate a new price list

### Step 3: Review Mappings
1. Click the mapping icon (📍) next to a price list
2. In the modal, review:
   - High confidence mappings (usually correct)
   - Medium confidence mappings (may need review)
   - Low confidence mappings (require manual verification)

### Step 4: Verify Mappings
1. Go to the "Review" tab
2. For each unverified mapping:
   - Check if the Excel item matches the database item
   - Click "Verify Current" if correct
   - Select a different item from dropdown if incorrect
   - Click "Reject" if no match exists

### Step 5: Sync Rates
1. After verifying mappings, click the sync icon (🔄)
2. System will:
   - Read current rates from Excel cells
   - Update database with new rates
   - Track sync timestamp

### Step 6: Export Updates (Optional)
1. Click the download icon (⬇️)
2. System generates an Excel file with:
   - Original structure preserved
   - Database rates updated in cells
   - Formulas maintained

## API Endpoints

### Upload and Create Mappings
```
POST /api/client-prices/price-lists/upload-sync
```
- Uploads Excel file
- Creates price list
- Generates mappings

### Sync Rates from Excel
```
POST /api/client-prices/price-lists/:priceListId/sync-rates
```
- Reads Excel file
- Updates database rates
- Returns update count

### Export to Excel
```
GET /api/client-prices/price-lists/:priceListId/export
```
- Generates Excel with current rates
- Preserves original structure

### Get Mapping Statistics
```
GET /api/client-prices/price-lists/:priceListId/mapping-stats
```
- Returns mapping overview
- Confidence distribution
- Verification status

### Verify Mapping
```
PATCH /api/client-prices/mappings/:mappingId/verify
```
- Updates mapping verification
- Changes mapped item if needed

### Validate Mappings
```
GET /api/client-prices/price-lists/:priceListId/validate
```
- Checks if Excel cells still exist
- Validates rate values
- Returns issues list

## Database Schema

### excelMappings Table
```typescript
{
  priceListId: string,      // Reference to client price list
  priceItemId: string,      // Reference to base price item
  fileName: string,         // Excel file name
  sheetName: string,        // Excel sheet name
  rowNumber: number,        // Row number in Excel
  codeColumn?: string,      // Column letter for code (e.g., "A")
  descriptionColumn?: string, // Column for description
  unitColumn?: string,      // Column for unit
  rateColumn?: string,      // Column for rate (e.g., "G")
  originalCode?: string,    // Original code from Excel
  originalDescription?: string, // Original description
  originalUnit?: string,    // Original unit
  originalRate?: any,       // Original rate or formula
  mappingConfidence: number, // 0-1 confidence score
  mappingMethod: string,    // "code", "description", "fuzzy", "manual"
  isVerified: boolean,      // User verification status
}
```

### clientPriceItems Table
```typescript
{
  priceListId: string,      // Reference to price list
  basePriceItemId: string,  // Reference to base item
  clientId: string,         // Client reference
  rate: number,             // Current rate
  excelRow?: number,        // Excel row number
  excelSheet?: string,      // Excel sheet name
  excelCellRef?: string,    // Cell reference (e.g., "G15")
  excelFormula?: string,    // Original Excel formula
  // ... other fields
}
```

## Troubleshooting

### Common Issues

1. **No mappings created**
   - Check Excel file has proper headers
   - Ensure rate column has numeric values
   - Verify sheet names don't contain special characters

2. **Low confidence mappings**
   - Review item codes in Excel
   - Ensure descriptions match database
   - Use manual mapping for unique items

3. **Sync not updating rates**
   - Verify mappings are confirmed
   - Check Excel file still exists at source path
   - Ensure rate cells contain valid numbers

4. **Export missing items**
   - Check all mappings are verified
   - Ensure price items exist in database
   - Verify client price list is active

## Best Practices

1. **Regular Syncing**
   - Sync rates weekly or when Excel is updated
   - Keep mapping verifications up to date
   - Monitor sync logs for errors

2. **Excel File Management**
   - Keep consistent sheet names
   - Maintain stable column structure
   - Avoid moving rate columns

3. **Mapping Verification**
   - Verify all mappings before first sync
   - Review low-confidence mappings regularly
   - Update mappings when items change

4. **Performance**
   - Process files under 10MB for best performance
   - Split large files into multiple sheets
   - Use batch operations for bulk updates

## Security Considerations

1. **Authentication Required**
   - All endpoints require JWT token
   - User must have appropriate permissions

2. **File Validation**
   - Only Excel files accepted (.xlsx, .xls)
   - File size limits enforced (50MB)
   - Virus scanning on uploads

3. **Data Protection**
   - Client-specific price lists isolated
   - Audit trail for all changes
   - Encrypted storage for sensitive data

## Support

For issues or questions:
1. Check the system logs in Activity page
2. Review mapping statistics for anomalies
3. Contact system administrator for database issues
4. Report bugs through the issue tracker