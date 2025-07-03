import { getConvexClient } from '../config/convex.js';

interface RetryOptions {
  maxAttempts?: number;
  delayMs?: number;
  backoffMultiplier?: number;
  maxDelayMs?: number;
  onRetry?: (error: Error, attempt: number) => void;
}

export async function withConvexRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    delayMs = 1000,
    backoffMultiplier = 2,
    maxDelayMs = 10000,
    onRetry
  } = options;

  let lastError: Error | null = null;
  let currentDelay = delayMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      // Check if error is retryable
      const errorMessage = lastError.message?.toLowerCase() || '';
      const isRetryable = 
        errorMessage.includes('network') ||
        errorMessage.includes('timeout') ||
        errorMessage.includes('connection') ||
        errorMessage.includes('econnrefused') ||
        errorMessage.includes('enotfound') ||
        errorMessage.includes('fetch failed');
      
      if (!isRetryable || attempt === maxAttempts) {
        throw lastError;
      }

      if (onRetry) {
        onRetry(lastError, attempt);
      }

      // Wait before retrying with exponential backoff
      await new Promise(resolve => setTimeout(resolve, currentDelay));
      currentDelay = Math.min(currentDelay * backoffMultiplier, maxDelayMs);
    }
  }

  throw lastError || new Error('Operation failed after retries');
}

// Wrapper for Convex queries with retry logic
export async function resilientQuery<T>(
  queryFunction: any,
  args?: any,
  retryOptions?: RetryOptions
): Promise<T> {
  const convex = getConvexClient();
  
  return withConvexRetry(
    () => convex.query(queryFunction, args),
    {
      ...retryOptions,
      onRetry: (error, attempt) => {
        console.warn(`Convex query failed (attempt ${attempt}):`, error.message);
        retryOptions?.onRetry?.(error, attempt);
      }
    }
  );
}

// Wrapper for Convex mutations with retry logic
export async function resilientMutation<T>(
  mutationFunction: any,
  args?: any,
  retryOptions?: RetryOptions
): Promise<T> {
  const convex = getConvexClient();
  
  // Be more conservative with mutation retries
  return withConvexRetry(
    () => convex.mutation(mutationFunction, args),
    {
      maxAttempts: 2, // Fewer retries for mutations
      ...retryOptions,
      onRetry: (error, attempt) => {
        console.warn(`Convex mutation failed (attempt ${attempt}):`, error.message);
        retryOptions?.onRetry?.(error, attempt);
      }
    }
  );
}

// Health check for database connection
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    const convex = getConvexClient();
    // Try a simple query to check connection
    // TODO: Use a proper health check query from the API
    // await convex.query(api.system.health);
    return true;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
}