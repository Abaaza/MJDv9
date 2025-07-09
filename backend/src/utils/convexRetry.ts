import { getConvexClient } from '../config/convex';

interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffFactor?: number;
}

const defaultOptions: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffFactor: 2,
};

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...defaultOptions, ...options };
  let lastError: Error | null = null;
  let delay = opts.initialDelay;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      
      // Check if it's a network error
      const isNetworkError = error.message?.includes('fetch failed') || 
                           error.message?.includes('ETIMEDOUT') ||
                           error.message?.includes('ECONNREFUSED');
      
      if (attempt < opts.maxRetries && isNetworkError) {
        console.log(`[ConvexRetry] Attempt ${attempt + 1} failed with network error. Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay = Math.min(delay * opts.backoffFactor, opts.maxDelay);
      } else {
        throw error;
      }
    }
  }

  throw lastError || new Error('Operation failed after retries');
}

// Wrapped Convex operations
export async function convexQuery(api: any, args: any = {}) {
  return withRetry(async () => {
    const client = getConvexClient();
    return await client.query(api, args);
  });
}

export async function convexMutation(api: any, args: any = {}) {
  return withRetry(async () => {
    const client = getConvexClient();
    return await client.mutation(api, args);
  });
}
