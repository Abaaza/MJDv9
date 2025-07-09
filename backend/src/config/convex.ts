import { ConvexHttpClient } from 'convex/browser';
import dotenv from 'dotenv';

dotenv.config();

const convexUrl = process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL;

if (!convexUrl) {
  throw new Error('CONVEX_URL or NEXT_PUBLIC_CONVEX_URL environment variable is not set');
}

// Create standard Convex client
const convexClient = new ConvexHttpClient(convexUrl);

// Export both as default and named export for compatibility
export default convexClient;
export const getConvexClient = () => convexClient;
