import { ConvexHttpClient } from 'convex/browser';
import { env } from './env.js';

let convexClient: ConvexHttpClient | null = null;

export function getConvexClient(): ConvexHttpClient {
  if (!convexClient) {
    const url = env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL || '';
    if (!url) {
      throw new Error('CONVEX_URL is not configured');
    }
    convexClient = new ConvexHttpClient(url);
  }
  return convexClient;
}