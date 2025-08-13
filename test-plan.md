# Testing Plan for Price List Google Sheets & Self-Learning Features

## 1. Google Sheets-like Price List Editing (PriceListSpreadsheetEnhanced)

### Features to Test:
- **Spreadsheet Interface**: Using @fortune-sheet/react library
- **CRUD Operations**: Create, Read, Update, Delete price items
- **Bulk Operations**: Bulk update via `bulkUpdatePriceItems` endpoint
- **Import/Export**: CSV and Excel file handling
- **Auto-save**: Debounced saving mechanism
- **Undo/Redo**: Change history tracking

### Test Cases:

#### 1.1 Basic Editing
```bash
# Navigate to price list spreadsheet
http://localhost:5173/price-list-spreadsheet-enhanced

# Test actions:
1. Edit a cell (description, rate, unit)
2. Verify auto-save triggers after 2 seconds
3. Check if changes persist after page refresh
```

#### 1.2 Bulk Operations
```bash
# Test bulk update endpoint
curl -X POST http://localhost:5000/api/price-list/bulk-update \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "updates": [
      {
        "_id": "ITEM_ID_1",
        "description": "Updated Item 1",
        "rate": 150
      },
      {
        "_id": "new_item_1",
        "description": "New Item",
        "rate": 200,
        "unit": "pcs"
      }
    ]
  }'
```

#### 1.3 Import/Export
```bash
# Test CSV import
curl -X POST http://localhost:5000/api/price-list/import \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@test-pricelist.csv"

# Test export
curl http://localhost:5000/api/price-list/export \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -o exported-pricelist.csv
```

## 2. Self-Learning from Manual Matches

### Features to Test:
- **Pattern Recording**: When user manually edits a match via `updateMatchResult`
- **Pattern Recognition**: Using `LearningMatcherService.findLearnedMatch()`
- **Confidence Scoring**: Blending learned patterns with regular matching
- **Pattern Usage Tracking**: Updates via `updatePatternUsage` mutation

### Test Cases:

#### 2.1 Manual Match Recording
```javascript
// Test manual match recording
// 1. Upload a BOQ file
// 2. Run matching
// 3. Manually edit a result
// 4. Verify pattern is saved

const testManualEdit = {
  resultId: "RESULT_ID",
  updates: {
    matchedItemId: "PRICE_ITEM_ID",
    matchedDescription: "Manually Selected Item",
    matchedCode: "MAN001",
    matchedUnit: "pcs",
    matchedRate: 100,
    confidence: 1.0,
    isManuallyEdited: true,
    matchMethod: "MANUAL"
  }
};

// PATCH /api/price-matching/results/{resultId}
```

#### 2.2 Pattern Recognition Test
```javascript
// Test if system learns from manual matches
// 1. Create manual match for "Concrete Block 200mm"
// 2. Upload new BOQ with similar item "Concrete Block 200 mm"
// 3. Verify system suggests the learned match

// The system should:
// - Find pattern via findLearnedMatch()
// - Return confidence > 0.85 for very similar items
// - Mark result with isLearnedMatch: true
```

#### 2.3 Learning Statistics
```bash
# Check learning statistics
curl http://localhost:5000/api/price-matching/learning/statistics \
  -H "Authorization: Bearer YOUR_TOKEN"

# Expected response:
{
  "totalPatterns": 25,
  "patternsUsedToday": 10,
  "averageConfidence": 0.92,
  "topPatterns": [...]
}
```

## 3. Integration Test Scenarios

### Scenario 1: Complete Workflow
1. **Import price list** via spreadsheet interface
2. **Edit prices** using Google Sheets-like interface
3. **Upload BOQ** for matching
4. **Run matching** with AI method
5. **Manually correct** some matches
6. **Upload similar BOQ** and verify learning
7. **Export results** with learned matches

### Scenario 2: Batch Processing with Learning
```javascript
// Test batch processing with learning
const testBatch = async () => {
  // 1. Upload initial BOQ
  const job1 = await uploadBOQ('construction-boq-1.xlsx');
  
  // 2. Manual corrections
  await updateMatchResult(job1.results[0].id, {
    matchedItemId: 'correct-item-id',
    isManuallyEdited: true
  });
  
  // 3. Upload similar BOQ
  const job2 = await uploadBOQ('construction-boq-2.xlsx');
  
  // 4. Verify learning
  const results = await getMatchResults(job2.id);
  const learnedMatches = results.filter(r => r.isLearnedMatch);
  console.assert(learnedMatches.length > 0, 'Should have learned matches');
};
```

## 4. Performance Testing

### 4.1 Spreadsheet Performance
- Load 10,000+ price items
- Test scrolling and rendering
- Measure save time for bulk updates
- Check memory usage

### 4.2 Learning Performance
- Create 1000+ manual patterns
- Test pattern matching speed
- Verify cache effectiveness (5-minute TTL)
- Check Convex rate limits

## 5. Error Handling Tests

### 5.1 Spreadsheet Errors
- Network failure during save
- Invalid data types
- Concurrent edits
- Large file imports

### 5.2 Learning Errors
- Missing price items
- Invalid pattern data
- Rate limit handling
- Database connection issues

## 6. Test Data Files

### Create test files:
```bash
# test-pricelist.csv
_id,code,description,category,subcategory,unit,rate
item-1,CON001,Concrete Block 200mm,Construction,Masonry,pcs,25
item-2,CON002,Steel Rebar 12mm,Construction,Steel,kg,45
item-3,CON003,Paint Interior White,Finishing,Paint,ltr,120

# test-boq.xlsx
# Sheet with items similar to price list for learning tests
```

## 7. Monitoring & Verification

### Check logs:
```bash
# Backend logs
pm2 logs boq-backend

# Check for:
- [LearningMatcher] Pattern recording logs
- Bulk update success/failure
- Rate limit warnings
```

### Database verification:
```javascript
// Check Convex for:
// 1. matchingPatterns table entries
// 2. priceItems updates
// 3. activityLogs for manual edits
```

## 8. Expected Outcomes

### Success Criteria:
1. ✅ Spreadsheet saves within 2 seconds
2. ✅ Bulk updates process 100+ items
3. ✅ Manual edits create learning patterns
4. ✅ Similar items match with >85% confidence
5. ✅ Pattern usage count increments
6. ✅ Export includes learned matches
7. ✅ No rate limit errors under normal use

## 9. Test Execution Commands

```bash
# Start development environment
cd boq-matching-system
npm run dev

# Run specific tests
npm run test:spreadsheet
npm run test:learning
npm run test:integration

# Monitor performance
npm run monitor
```

## 10. Bug Tracking

Document any issues found:
- [ ] Issue description
- [ ] Steps to reproduce
- [ ] Expected vs actual behavior
- [ ] Error messages/logs
- [ ] Severity level

## Notes:
- The self-learning feature records patterns when `isManuallyEdited: true`
- Learning patterns are stored in the `matchingPatterns` Convex table
- The spreadsheet uses @fortune-sheet/react for Google Sheets-like functionality
- Bulk updates are limited to 10 items per batch to avoid rate limits