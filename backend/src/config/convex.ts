import { ConvexHttpClient } from 'convex/browser';
import dotenv from 'dotenv';

dotenv.config();

// Use URL from environment variable or fallback to good-dolphin
const convexUrl = process.env.CONVEX_URL || 'https://good-dolphin-454.convex.cloud';

// Create standard Convex client
const convexClient = new ConvexHttpClient(convexUrl);
console.log('[Convex] Using URL:', convexUrl);

// Export both as default and named export for compatibility
export default convexClient;
export const getConvexClient = () => convexClient;
