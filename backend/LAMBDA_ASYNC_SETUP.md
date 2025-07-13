# Lambda Async Processing Setup

## Overview
This document explains how the system handles large Excel file processing to avoid 429 rate limit errors and Lambda timeout issues.

## Changes Made

### 1. Async Job Processing
- Added `async-handler.js` for processing jobs asynchronously with 15-minute timeout
- Jobs with >100 items are automatically sent to async processing
- Sync processing continues for small jobs (<100 items)

### 2. Convex Rate Limit Optimizations
- Increased batch size from 25 to 50 items
- Added intelligent rate limiting:
  - 5 seconds minimum between Convex updates
  - 100ms between individual mutations
  - 2 seconds delay between batches
- Created `ConvexBatchProcessor` for parallel mutations with retry logic
- Batch operations process 10 mutations in parallel with automatic retry on 429 errors

### 3. SQS Queue Integration
- Added SQS queue for reliable async job processing
- Dead Letter Queue (DLQ) for failed jobs
- Queue configuration:
  - Visibility timeout: 16 minutes
  - Max retries: 3
  - Long polling enabled

### 4. Lambda Configuration
- Main HTTP handler: 30 seconds timeout (for quick responses)
- Async job processor: 900 seconds (15 minutes) timeout
- Reserved concurrency: 5 (prevents overwhelming Convex)
- Memory: 3072MB for better performance

## How It Works

### For Small Files (<100 items)
1. File uploaded via HTTP endpoint
2. Parsed and processed synchronously
3. Results saved to Convex with rate limiting
4. Response returned immediately

### For Large Files (>100 items)
1. File uploaded via HTTP endpoint
2. Job created in Convex with "pending" status
3. Job sent to SQS queue
4. HTTP response returned immediately (job continues in background)
5. Async Lambda picks up job from SQS
6. Processes for up to 15 minutes
7. Updates Convex with batched mutations

## Deployment

1. Deploy with Serverless Framework:
```bash
npm run build
serverless deploy --stage prod
```

2. The deployment will create:
   - Lambda functions (app, processJob, processSQSJob)
   - SQS queues (job queue and DLQ)
   - IAM roles with proper permissions

## Environment Variables

New environment variables added:
- `SQS_QUEUE_URL`: Automatically set by CloudFormation
- `AWS_LAMBDA_FUNCTION_NAME`: Set by Lambda runtime

## Monitoring

- Check SQS queue metrics for job processing
- Monitor Lambda function logs for processing status
- Check DLQ for failed jobs
- Convex dashboard for database rate limits

## Testing

Test with large file:
```bash
# This will trigger async processing
curl -X POST https://your-api.execute-api.region.amazonaws.com/api/price-matching/upload-and-match \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@large-excel-file.xlsx" \
  -F "method=LOCAL"
```

## Rate Limit Prevention

The system now prevents 429 errors through:
1. Batched mutations (10 parallel with retry)
2. Exponential backoff on rate limits
3. Minimum delays between operations
4. Limited concurrent Lambda executions
5. Intelligent queue processing

## Notes

- The 900-second Lambda timeout is well within AWS limits
- Convex rate limits are respected through batching and delays
- Large files process reliably without timing out
- System gracefully handles failures with retries and DLQ