"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConvexClient = void 0;
const browser_1 = require("convex/browser");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const convexUrl = process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL;
if (!convexUrl) {
    throw new Error('CONVEX_URL or NEXT_PUBLIC_CONVEX_URL environment variable is not set');
}
// Create standard Convex client
const convexClient = new browser_1.ConvexHttpClient(convexUrl);
// Export both as default and named export for compatibility
exports.default = convexClient;
const getConvexClient = () => convexClient;
exports.getConvexClient = getConvexClient;
