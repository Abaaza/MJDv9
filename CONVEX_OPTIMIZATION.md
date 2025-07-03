# Convex Optimization Guide to Prevent 429 Errors

## Current Optimizations Implemented

### 1. Frontend Query Optimizations
- **Increased stale times**: Queries stay fresh longer (5 minutes default, 1 minute for results)
- **Disabled refetch on window focus**: Prevents unnecessary refetches
- **Smart polling intervals**: Only poll when job is actively processing
- **Exponential backoff**: Automatic retry with increasing delays

### 2. Debounced Autosave
- **2-second delay**: Groups multiple changes into single API call
- **Separate autosave endpoint**: Doesn't trigger full data refetch

### 3. Backend Processing Optimizations
- **Reduced status update frequency**: From every 10 items to every 25 items
- **Increased delays between operations**:
  - 200ms delay every 3 items
  - 500ms delay every 10 items
- **Reduced activity logging**: Only logs every 50 high-confidence matches
- **Batch job status checks**: Check job status every 20 items instead of 10

### 4. API Request Management
- **Request batching system**: Groups similar requests
- **Rate limit tracking**: Monitors request frequency
- **Automatic delays**: When approaching rate limits

## Additional Recommendations

### 1. Consider Upgrading Convex Plan
If you're hitting rate limits frequently, consider:
- Upgrading to a higher Convex plan with increased rate limits
- Contact Convex support about your specific use case

### 2. Alternative Architectures
- **Background Workers**: Move heavy processing to separate worker services
- **Queue System**: Use Redis or similar for job queuing
- **Batch Processing**: Process multiple items in single Convex mutations

### 3. Caching Strategies
- **Local Storage**: Cache price items locally to reduce queries
- **Session Storage**: Store temporary data during active sessions
- **IndexedDB**: For larger datasets that don't change often

### 4. Data Structure Optimizations
- **Denormalize data**: Reduce number of queries by storing related data together
- **Aggregate updates**: Combine multiple small updates into larger ones
- **Use transactions**: Group related mutations into single transaction

## Monitoring and Debugging

1. **Track 429 errors**: Log when they occur to identify patterns
2. **Monitor request frequency**: Use browser dev tools Network tab
3. **Convex Dashboard**: Check your usage metrics regularly
4. **Implement circuit breakers**: Automatically pause operations when rate limited

## Emergency Measures

If you continue to get 429 errors:

1. **Increase all delays by 2x**: Double the current delay values
2. **Reduce batch sizes**: Process fewer items at once
3. **Implement request queuing**: Queue all Convex operations
4. **Add manual throttling**: Limit requests per minute globally

## Code Examples

### Request Throttling
```typescript
class ConvexThrottler {
  private requestCount = 0;
  private resetTime = Date.now() + 60000;
  private readonly MAX_REQUESTS_PER_MINUTE = 50;

  async throttle() {
    if (Date.now() > this.resetTime) {
      this.requestCount = 0;
      this.resetTime = Date.now() + 60000;
    }

    if (this.requestCount >= this.MAX_REQUESTS_PER_MINUTE) {
      const waitTime = this.resetTime - Date.now();
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.requestCount = 0;
      this.resetTime = Date.now() + 60000;
    }

    this.requestCount++;
  }
}
```

### Batch Updates
```typescript
// Instead of updating each item individually
const batchUpdate = async (items: any[]) => {
  const BATCH_SIZE = 10;
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    await convex.mutation(api.priceMatching.batchUpdate, { items: batch });
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
};
```