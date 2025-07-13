# Enhanced Logging and Matching Limits

## Overview
This document describes the enhancements made to the matching system's logging capabilities and configurable limits.

## New Features

### 1. Performance Logging (`utils/performanceLogger.ts`)
- **Automatic timing** of operations with detailed metrics
- **Performance tracking** per job with averages and trends
- **Operation breakdown** showing duration, items processed, cache hits, API calls
- **Job summaries** with total duration, average time per item, and cache hit rates

### 2. Match Logging (`utils/matchLogger.ts`)
- **Detailed score breakdowns** for each match (base score, bonuses, confidence)
- **Low confidence detection** with automatic logging of problematic matches
- **Score distribution analysis** showing confidence ranges
- **Match statistics** including average confidence, processing time, and API usage

### 3. Adaptive Batch Sizing (`utils/adaptiveBatchSize.ts`)
- **Dynamic batch size adjustment** based on performance
- **Performance trend tracking** (improving/degrading/stable)
- **Method-specific optimization** for LOCAL, COHERE, and OPENAI
- **Automatic scaling** between min and max batch sizes

### 4. Enhanced Configuration (`config/matching.config.ts`)
New configuration sections added:
```typescript
performance: {
  maxItemsPerJob: 10000,          // Maximum items allowed per job
  maxConcurrentMatches: 10,       // Concurrent matching operations
  itemProcessingTimeout: 5000,    // Timeout per item (ms)
  batchProcessingDelay: 100,      // Delay between batches (ms)
  adaptiveBatchSize: true,        // Enable adaptive sizing
  minBatchSize: 5,                // Minimum batch size
  maxBatchSize: 20,               // Maximum batch size
  enableDetailedLogging: true     // Enable detailed performance logs
},
limits: {
  maxReturnedMatches: 5,          // Max matches returned per item
  maxContextHeaders: 10,          // Max context headers processed
  maxDescriptionLength: 500       // Max description length
}
```

### 5. Monitoring Endpoints (`routes/monitoring.routes.ts`)
New API endpoints for performance monitoring:
- `GET /api/monitoring/jobs/:jobId/performance` - Detailed job metrics
- `GET /api/monitoring/system` - System-wide metrics
- `GET /api/monitoring/methods/comparison` - Method performance comparison
- `DELETE /api/monitoring/jobs/:jobId/metrics` - Clear job metrics

## Usage Examples

### Performance Logging in Code
```typescript
// Start timing an operation
PerformanceLogger.startTimer(`${jobId}-batch-1`);

// ... perform operation ...

// End timing with metrics
PerformanceLogger.endTimer(`${jobId}-batch-1`, {
  itemCount: 10,
  successCount: 8,
  cacheHits: 5,
  cacheMisses: 5,
  apiCalls: 3
});
```

### Match Logging
```typescript
MatchLogger.logMatch(
  jobId,
  itemIndex,
  originalDescription,
  matchResult,
  {
    baseScore: 0.7,
    unitBonus: 0.1,
    confidence: 0.8,
    method: 'LOCAL'
  },
  processingTime,
  cacheHit,
  apiCalls
);
```

### Monitoring API Response Example
```json
{
  "jobId": "123",
  "status": "processing",
  "performance": {
    "totalDuration": 45000,
    "totalItems": 100,
    "avgTimePerItem": 450,
    "operations": 10,
    "apiCalls": 25,
    "cacheHitRate": 60
  },
  "matching": {
    "totalMatches": 100,
    "avgConfidence": 0.75,
    "avgProcessingTime": 450,
    "cacheHitRate": 60,
    "lowConfidenceMatches": 15,
    "scoreDistribution": {
      "0-0.2": 5,
      "0.2-0.4": 10,
      "0.4-0.6": 20,
      "0.6-0.8": 40,
      "0.8-1.0": 25
    }
  },
  "problematicMatches": [
    {
      "originalDescription": "difficult item",
      "matchedDescription": "poor match",
      "confidence": 0.15
    }
  ],
  "batchSizing": {
    "LOCAL": {
      "currentBatchSize": 15,
      "avgTimePerItem": 250,
      "performanceTrend": "improving"
    }
  }
}
```

## Environment Variables
New environment variables for configuration:
```bash
# Performance Configuration
MAX_ITEMS_PER_JOB=10000
MAX_CONCURRENT_MATCHES=10
ITEM_PROCESSING_TIMEOUT=5000
BATCH_PROCESSING_DELAY=100
ADAPTIVE_BATCH_SIZE=true
MIN_BATCH_SIZE=5
MAX_BATCH_SIZE=20
ENABLE_DETAILED_LOGGING=true

# Matching Limits
MAX_RETURNED_MATCHES=5
MAX_CONTEXT_HEADERS=10
MAX_DESCRIPTION_LENGTH=500
```

## Benefits

1. **Better Visibility**: Detailed logs show exactly what's happening during matching
2. **Performance Optimization**: Adaptive batch sizing improves throughput
3. **Problem Detection**: Automatic identification of low-confidence matches
4. **Resource Management**: Configurable limits prevent resource exhaustion
5. **Debugging**: Comprehensive metrics help identify bottlenecks
6. **Monitoring**: Real-time performance tracking via API

## Log Examples

### Performance Log
```
[PERF] job123-batch-1 | 2500ms | 10 items | 250.0ms/item | 80.0% success | 60.0% cache hit | 3 API calls
```

### Match Warning Log
```
[MatchLogger] Low confidence match for item 5:
  Original: "20mm copper pipe with insulation"
  Matched: "15mm steel pipe"
  Score breakdown: { baseScore: 0.2, confidence: 0.15, method: 'LOCAL' }
  Cache hit: false, API calls: 0, Time: 45ms
```

### Adaptive Batch Log
```
[AdaptiveBatch] Increasing batch size for OPENAI: 10 -> 12 (avg 350ms/item)
[AdaptiveBatch] Performance trend for LOCAL: improving by 15.2%
```

## Best Practices

1. **Monitor Low Confidence Matches**: Review problematic matches regularly
2. **Adjust Batch Sizes**: Start with defaults, let adaptive sizing optimize
3. **Set Appropriate Limits**: Configure based on your infrastructure capacity
4. **Use Performance Endpoints**: Monitor job performance in production
5. **Clear Old Metrics**: Use the cleanup endpoint for completed jobs

## Integration Notes

- All logging is non-blocking and has minimal performance impact
- Metrics are stored in memory with automatic cleanup
- Compatible with existing job processing workflow
- Works with both sync and async processing modes
- Lambda-aware with appropriate timeouts and limits