# Backend Logging Guide

This document describes the comprehensive logging system added to help debug and monitor the price matching process.

## Overview

Detailed logging has been added throughout the backend to track every step of the price matching process from file upload to final results. All logs use consistent prefixes to make them easy to filter and search.

## Log Prefixes

- `[Auth]` - Authentication middleware logs
- `[ExcelService]` - Excel file parsing logs  
- `[MatchingService]` - Core matching logic logs
- `[MatchingService/LOCAL]` - Local matching specific logs
- `[MatchingService/COHERE]` - Cohere AI matching logs
- `[JobProcessor]` - Job queue and batch processing logs
- `REQ_*` - Request tracking IDs for upload operations
- `MATCH_*` - Match operation tracking IDs

## Key Log Points

### 1. Server Startup
When the server starts, you'll see:
```
=================================
🚀 Backend Server Started!
=================================
📡 HTTP Server: http://localhost:5000
🔌 WebSocket: ws://localhost:5000
🌍 Environment: development
📊 Convex URL: https://your-convex-url...
=================================
```

### 2. Authentication
Every authenticated request logs:
```
[Auth] POST /api/price-matching/upload-and-match - Auth header present: true
[Auth] Verifying token for POST /api/price-matching/upload-and-match...
[Auth] Token verified successfully. User: user@example.com (ID: abc123)
```

### 3. File Upload and Processing
Each upload request gets a unique ID for tracking:
```
=== UPLOAD AND MATCH REQUEST START ===
Request ID: REQ_1234567890_abc123def
Timestamp: 2024-01-15T10:30:00.000Z
User: user@example.com (ID: abc123)
File: sample.xlsx (Size: 245760 bytes)
Client ID: client123
Project Name: Test Project
Matching Method: LOCAL
=================================
```

### 4. Excel Parsing
Detailed Excel parsing information:
```
[ExcelService] === EXCEL PARSING START ===
[ExcelService] File: sample.xlsx
[ExcelService] Buffer size: 245760 bytes (0.24 MB)
[ExcelService] Workbook loaded in 125ms
[ExcelService] Number of worksheets: 2

[ExcelService] Processing worksheet 1/2: "Sheet1"
[ExcelService] Worksheet dimensions: 500 rows x 10 columns
[ExcelService]   [Sheet: Sheet1] Found header row at row 3
[ExcelService]   [Sheet: Sheet1] Column detection:
[ExcelService]   [Sheet: Sheet1]   - Description: Column 2 ("Item Description")
[ExcelService]   [Sheet: Sheet1]   - Quantity: Column 5 ("Qty")
[ExcelService]   [Sheet: Sheet1]   - Unit: Column 6 ("Unit")
```

### 5. Job Processing
Job lifecycle tracking:
```
[JobProcessor] Job queued with 250 items using LOCAL matching method
[JobProcessor] Starting job processing for 250 items
[JobProcessor] Created 25 batches of 10 items each
[JobProcessor] Starting batch 1 with 10 items
[JobProcessor] Batch 1 completed in 523ms - 8 matches, 2 failures
```

### 6. Matching Operations
Each match operation is tracked:
```
[MatchingService] === MATCH START (MATCH_1234567890_xyz) ===
[MatchingService] Description: "Concrete grade 30 for foundation..."
[MatchingService] Method: LOCAL
[MatchingService] Context: Construction > Foundation > Concrete

[MatchingService/LOCAL] Starting local match...
[MatchingService/LOCAL] Price items available: 5000
[MatchingService/LOCAL] Fuzzy match completed in 45ms
[MatchingService/LOCAL] Found 5 potential matches
[MatchingService/LOCAL] Top 3 matches:
[MatchingService/LOCAL]   1. Score: 92.5, Item: "Concrete Grade 30 (M30)..."
[MatchingService/LOCAL]   2. Score: 85.0, Item: "Ready Mix Concrete M30..."
[MatchingService/LOCAL]   3. Score: 78.3, Item: "Concrete Grade 25 (M25)..."

[MatchingService] === MATCH COMPLETE (MATCH_1234567890_xyz) ===
[MatchingService] Method execution time: 48ms
[MatchingService] Total match time: 52ms
[MatchingService] Match found: YES
[MatchingService] Matched item:
[MatchingService]   - Description: "Concrete Grade 30 (M30) for structural work..."
[MatchingService]   - Code: CON-M30-001
[MatchingService]   - Unit: cum
[MatchingService]   - Rate: 4500
[MatchingService]   - Confidence: 92.5%
```

## Error Tracking

Errors include full context:
```
[MatchingService] === MATCH ERROR (MATCH_1234567890_xyz) ===
[MatchingService] Failed after 1523ms
[MatchingService] Method: COHERE
[MatchingService] Error: Rate limit exceeded
[MatchingService] Stack: Error: Rate limit exceeded
    at CohereClient.embed (...)
```

## Performance Monitoring

All operations include timing information:
- Request processing time
- Excel parsing time per sheet
- Batch processing time
- Individual match time
- Database query time

## Using the Logs

### Development
In development, all logs appear in the console. You can filter by prefix:
```bash
npm run dev 2>&1 | grep "\[MatchingService\]"
```

### Production
In production, consider using a log aggregation service and:
1. Add request IDs to all log entries
2. Set up alerts for errors and slow operations
3. Monitor match success rates
4. Track API rate limit warnings

### Debugging Tips

1. **Slow uploads**: Check `[ExcelService]` logs for parsing time
2. **Failed matches**: Look for `[MatchingService] Match found: NO`
3. **Auth issues**: Check `[Auth]` logs for token validation
4. **Rate limits**: Search for "Rate limit" in logs
5. **Memory issues**: Monitor batch processing logs

## Log Levels

While not using a formal logging library, the logs follow these patterns:
- Info: Standard operation logs
- Success: Operations completed successfully (often with ✅)
- Warning: Non-critical issues (often with ⚠️)
- Error: Critical failures (with ERROR prefix and ❌)

## Future Improvements

Consider adding:
1. Structured logging with winston or pino
2. Request correlation IDs across all services
3. Performance metrics collection
4. Log sampling for high-volume operations
5. Separate log files for different components