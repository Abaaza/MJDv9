# Debugging Checklist for Missing Results

## Current Issues
1. No match results showing in the view matches modal
2. Exported Excel is empty

## Debug Steps

### 1. Check Backend Server
First, ensure the backend is running:
```bash
cd backend
npm run dev
```

Look for the startup message:
```
=================================
🚀 Backend Server Started!
=================================
📡 HTTP Server: http://localhost:5000
```

### 2. Check Convex Database
Make sure Convex is running:
```bash
cd ../
npm run dev:convex
```

### 3. Test the Backend
After building the backend, run the test script:
```bash
cd backend
npm run build
node test-matching.js
```

This will show:
- How many jobs are in the database
- How many results each job has
- Whether new results can be created

### 4. Watch the Console During Matching

When you upload a file and start matching, watch for these key logs:

#### Upload Phase
```
=== UPLOAD AND MATCH REQUEST START ===
Request ID: REQ_1234567890_abc123def
[ExcelService] Found 250 items with quantities
```

#### Processing Phase
```
[JobProcessor] Starting batch 1 with 10 items
[MatchingService] === MATCH START (MATCH_123) ===
[MatchingService] Match found: YES
[JobProcessor] Prepared result for row 1: MATCHED
```

#### Saving Phase
```
[JobProcessor] Saving 10 results to database (items 1-10)
[JobProcessor] Saving result for row 1: MATCHED
[JobProcessor] Successfully saved 10/10 results to database
```

#### Completion Phase
```
[JobProcessor] Finalizing job...
[JobProcessor] Job finalized successfully
```

### 5. Check API Calls

When viewing results, watch for:
```
[API] Getting match results for job: j97av...
[API] Found 250 results for job j97av...
```

When exporting:
```
[API/Export] Starting export for job: j97av...
[API/Export] Found 250 results to export
[API/Export] Excel file created, buffer size: 123456 bytes
```

## Common Issues and Solutions

### Issue: "No results found" in modal
**Check:**
1. Are results being saved? Look for `[JobProcessor] Successfully saved X/X results`
2. Is the API returning results? Look for `[API] Found X results`
3. Check browser console for errors

### Issue: Results not saving to database
**Check:**
1. Convex mutations failing? Look for `[JobProcessor] Failed to save result`
2. Wrong data structure? Check that all required fields are present
3. Convex connection issues? Check `CONVEX_URL` in `.env`

### Issue: Empty Excel export
**Check:**
1. Results fetched from DB? Look for `[API/Export] Found X results to export`
2. Excel creation working? Look for `[ExcelService] Creating Excel with results`
3. Buffer size > 0? Look for `[API/Export] Excel file created, buffer size: X bytes`

## Quick Test Flow

1. **Login** and navigate to Price Matching
2. **Upload** a small test Excel (5-10 items)
3. **Select** LOCAL matching method (fastest)
4. **Start** the job
5. **Watch** the console for the logs above
6. **Check** if results appear when job completes
7. **Export** and check if Excel has data

## If Nothing Works

1. **Clear Convex data** (if safe to do so):
   - Delete all jobs and results in Convex dashboard
   - Start fresh

2. **Check Convex schema**: Ensure `matchResults` table has all required fields

3. **Test with minimal data**: Create Excel with just 2-3 items

4. **Check network tab**: Look for failed API calls

5. **Run test script**: Use `test-matching.js` to verify database operations

## Key Files to Check

- `/backend/src/services/jobProcessor.service.ts` - Where results are created and saved
- `/backend/src/controllers/priceMatching.controller.ts` - API endpoints
- `/frontend/src/pages/Projects.tsx` - Where results are displayed
- `/convex/priceMatching.ts` - Database queries and mutations