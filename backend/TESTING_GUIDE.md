# BOQ Matching System - Testing Guide

## Prerequisites
1. Ensure all services are running:
   - Convex: `npx convex dev` (from root or convex directory)
   - Backend: `npm run dev` (from backend directory)
   - Frontend: `npm run dev` (from frontend directory)

2. Ensure you have:
   - Admin user account (approved)
   - Price items in database
   - Excel file with BOQ items

## Step-by-Step Testing Process

### 1. Login
- Navigate to http://localhost:5173
- Login with admin credentials
- Verify you see the dashboard

### 2. Upload and Match
- Go to "Price Matching" page
- Click "New Matching Job"
- Select:
  - Client (or create new)
  - Project name
  - Matching method: LOCAL (fastest for testing)
  - Excel file with BOQ items
- Click "Start Matching"

### 3. Monitor Progress
- Watch the job status change from:
  - pending → parsing → matching → completed
- Check the logs for:
  - "Starting job processing for X items"
  - "Loaded X price items"
  - "Processing batch X"
  - "High confidence match" messages
  - "Job completed successfully"

### 4. View Results
- Once completed, click on the job row
- The results modal should show:
  - Original BOQ items
  - Matched price items
  - Confidence scores
  - Total prices
- You can:
  - Edit individual matches
  - Add notes
  - Recalculate totals

### 5. Export Results
- Click "Export Excel" button
- The exported file should contain:
  - Project summary sheet
  - Original sheets with added columns:
    - Matched Description
    - Matched Code
    - Matched Unit
    - Matched Rate
    - Total Price
    - Confidence
    - Notes
  - Color coding based on confidence

## Common Issues & Solutions

### Issue: Job stuck in "pending"
**Solution**: 
- Check backend logs for errors
- Ensure Convex is running
- Verify job processor started

### Issue: Low confidence matches
**Solution**:
- Check if price items have good descriptions
- Try HYBRID mode for better AI matching
- Ensure descriptions are detailed

### Issue: Export fails
**Solution**:
- Check if job has completed
- Verify match results exist
- Check backend logs for Excel generation errors

### Issue: No matches found
**Solution**:
- Verify price items exist in database
- Check if descriptions are similar
- Try different matching methods

## Quick Test Data

### Sample BOQ Items (Excel)
```
Description                          | Quantity | Unit
Excavation for foundation           | 100      | m3
Concrete grade 30 for columns       | 50       | m3
Steel reinforcement 12mm dia        | 2000     | kg
Blockwork 200mm thick              | 200      | m2
Plastering 15mm thick              | 400      | m2
```

### Expected Behavior
- LOCAL matching: 2-5 seconds per batch
- Confidence scores: 60-95% for good matches
- Total processing time: < 1 minute for 500 items

## Testing Different Scenarios

### 1. Test High Volume
- Upload file with 500+ items
- Monitor batch processing
- Check memory usage

### 2. Test Matching Methods
- LOCAL: Fast, fuzzy matching
- HYBRID: Best accuracy, slower
- ADVANCED: Multi-stage matching

### 3. Test Error Handling
- Upload invalid file format
- Cancel job mid-process
- Test with empty price database

### 4. Test UI Features
- Manual match editing
- Discount/markup application
- Search and filter results

## Debugging Tips

1. **Backend Logs**: Watch for:
   - WebSocket connections
   - API calls timing
   - Matching service logs

2. **Frontend Console**: Check for:
   - React Query errors
   - WebSocket events
   - Network requests

3. **Convex Dashboard**: Monitor:
   - Function calls
   - Database queries
   - Real-time subscriptions

## Performance Benchmarks

- Job creation: < 2 seconds
- Status updates: < 0.5 seconds
- Batch processing: 10 items/second
- Excel export: < 5 seconds for 1000 items
- UI responsiveness: < 100ms

Remember to test in Chrome DevTools with Network throttling to simulate slower connections.