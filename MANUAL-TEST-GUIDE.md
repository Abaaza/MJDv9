# Manual Testing Guide for New Features

## Quick Start
```bash
# Terminal 1: Start backend
cd boq-matching-system/backend
npm run dev

# Terminal 2: Start frontend
cd boq-matching-system/frontend
npm run dev

# Open browser to http://localhost:5173
# Login with: abaza@mjd.com / abaza123
```

## Feature 1: Google Sheets-like Price List Editor

### Location
Navigate to: **Price List → Spreadsheet Enhanced** or directly:
```
http://localhost:5173/price-list-spreadsheet-enhanced
```

### What to Test

#### 1. Basic Spreadsheet Editing
- ✅ **Edit cells directly** - Click any cell and type
- ✅ **Auto-save** - Changes save automatically after 2 seconds
- ✅ **Undo/Redo** - Use Ctrl+Z/Ctrl+Y
- ✅ **Copy/Paste** - Standard keyboard shortcuts work
- ✅ **Bulk selection** - Click and drag to select multiple cells

#### 2. Data Operations
- ✅ **Add new rows** - Click the "+" button or right-click menu
- ✅ **Delete rows** - Select rows and press Delete
- ✅ **Sort columns** - Click column headers
- ✅ **Filter data** - Use the filter icon in headers
- ✅ **Search** - Use the search box to find items

#### 3. Import/Export
- ✅ **Import CSV/Excel** - Click Upload button, select file
- ✅ **Export to CSV** - Click Download button
- ✅ **Bulk update** - Import file with updates

### Expected Behavior
- Spreadsheet looks and feels like Google Sheets
- Changes persist after page refresh
- Multiple users can edit (with eventual consistency)
- Performance remains smooth with 1000+ items

## Feature 2: Self-Learning from Manual Matches

### Setup Test Data

#### Step 1: Ensure Price List Has Items
1. Go to Price List page
2. Import sample data or create items manually:
```csv
code,description,unit,rate,category
TEST001,Concrete Block 200mm,pcs,25,Construction
TEST002,Steel Bar 12mm,kg,45,Construction
TEST003,Paint White Interior,ltr,120,Finishing
```

#### Step 2: Upload BOQ for Matching
1. Go to **Price Matching** page
2. Create test BOQ file (`test-boq.xlsx`):
```
Item | Description | Quantity | Unit
1 | Concrete Blocks 200 mm thick | 100 | pieces
2 | Steel Reinforcement 12mm dia | 500 | kilogram
3 | Interior White Paint | 50 | liters
```
3. Upload file and select **LOCAL** matching method
4. Click "Start Matching"

#### Step 3: Create Manual Matches (Training)
1. Wait for matching to complete
2. Review results - some may have low confidence
3. **Manually edit a match**:
   - Click the edit icon on a result
   - Select different item from dropdown
   - Or type custom values
   - Click Save
4. **Important**: The system records this as a learning pattern

#### Step 4: Test Learning with Similar BOQ
1. Create similar BOQ (`test-boq-2.xlsx`):
```
Item | Description | Quantity | Unit
1 | Concrete Block 200mm size | 150 | pcs
2 | 12mm Steel Reinforcement Bar | 300 | kg
3 | White Paint for Interior | 75 | ltr
```
2. Upload and match with same method
3. **Check results**: Items similar to your manual edits should now match with higher confidence

### What to Look For

#### Success Indicators
- 🎯 **Higher confidence** on similar items after manual training
- 🧠 **"isLearnedMatch" flag** in results (check browser DevTools Network tab)
- 📈 **Pattern usage count** increases when patterns are reused
- 🔄 **Consistency** - similar descriptions match to same items

#### In Browser DevTools
Open Network tab and look for:
```javascript
// Response from /api/price-matching/{jobId}/results
{
  "_id": "...",
  "originalDescription": "Concrete Block 200mm size",
  "matchedDescription": "Concrete Block 200mm",
  "confidence": 0.95,  // Higher due to learning
  "isLearnedMatch": true,  // Indicates pattern was learned
  "matchMethod": "LOCAL"
}
```

## Testing Workflow

### Complete End-to-End Test
1. **Import price list** using spreadsheet
2. **Edit some prices** in spreadsheet view
3. **Upload BOQ** for matching
4. **Review matches** - note low confidence items
5. **Manually correct** 2-3 matches
6. **Upload similar BOQ**
7. **Verify learning** - corrected patterns should match better
8. **Export results** with matched prices

### Performance Testing
1. Import 1000+ price items
2. Test spreadsheet scrolling/editing
3. Upload BOQ with 500+ items
4. Monitor matching speed
5. Check for any lag or errors

## Troubleshooting

### If Spreadsheet Doesn't Load
- Check console for errors (F12)
- Verify backend is running on port 5000
- Clear browser cache
- Try incognito mode

### If Learning Doesn't Work
- Ensure `isManuallyEdited: true` is set when saving
- Check backend logs for `[LearningMatcher]` entries
- Verify patterns are saved in Convex dashboard
- Wait 5+ seconds between tests (cache TTL)

### Common Issues
- **Rate limits**: Wait 5 seconds between operations
- **Auth errors**: Re-login if token expired
- **Sync issues**: Refresh page if data seems stale

## Success Criteria

### Spreadsheet Feature ✅
- [ ] Can edit 100+ cells without lag
- [ ] Auto-save works within 2 seconds
- [ ] Import/Export maintains data integrity
- [ ] Bulk updates process correctly
- [ ] No data loss on refresh

### Self-Learning Feature ✅
- [ ] Manual edits create patterns
- [ ] Similar items match with >85% confidence
- [ ] Pattern reuse increases confidence
- [ ] Learning persists across sessions
- [ ] No duplicate patterns created

## Quick API Tests

### Test Bulk Update
```bash
curl -X POST http://localhost:5000/api/price-list/bulk-update \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "updates": [{
      "_id": "EXISTING_ID",
      "rate": 999
    }]
  }'
```

### Test Learning Stats
```bash
curl http://localhost:5000/api/price-matching/learning/statistics \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Notes
- Both features are integrated into the existing system
- Spreadsheet uses @fortune-sheet/react library
- Learning patterns stored in Convex `matchingPatterns` table
- Check PM2 logs on EC2 for production: `pm2 logs boq-backend`