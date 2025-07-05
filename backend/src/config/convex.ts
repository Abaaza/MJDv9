import { ConvexHttpClient } from 'convex/browser';
import { env } from './env.js';

let convexClient: ConvexHttpClient | null = null;

export function getConvexClient(): ConvexHttpClient {
  if (!convexClient) {
    const url = env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL || '';
    if (!url) {
      throw new Error('CONVEX_URL is not configured');
    }
    
    // Create client with custom options for better network handling
    convexClient = new ConvexHttpClient(url);
    
    // Log successful connection
    console.log('[Convex] Client initialized with URL:', url.substring(0, 30) + '...');
  }
  return convexClient;
}

