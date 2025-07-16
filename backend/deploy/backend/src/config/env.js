"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isProduction = exports.isDevelopment = exports.env = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const zod_1 = require("zod");
dotenv_1.default.config();
const envSchema = zod_1.z.object({
    NODE_ENV: zod_1.z.enum(['development', 'production', 'test']).default('development'),
    PORT: zod_1.z.string().default('5000').transform(Number),
    DATABASE_URL: zod_1.z.string().optional(),
    CONVEX_URL: zod_1.z.string().optional(),
    JWT_ACCESS_SECRET: zod_1.z.string().min(32),
    JWT_REFRESH_SECRET: zod_1.z.string().min(32),
    JWT_ACCESS_EXPIRY: zod_1.z.string().default('15m'),
    JWT_REFRESH_EXPIRY: zod_1.z.string().default('7d'),
    COHERE_API_KEY: zod_1.z.string().optional(),
    OPENAI_API_KEY: zod_1.z.string().optional(),
    MAX_FILE_SIZE: zod_1.z.string().default('50MB'),
    UPLOAD_DIR: zod_1.z.string().default('uploads'),
    FRONTEND_URL: zod_1.z.string().url().default('http://localhost:5173'),
    COOKIE_SECURE: zod_1.z.string().transform(val => val === 'true').default('false'),
    COOKIE_HTTPONLY: zod_1.z.string().transform(val => val === 'true').default('true'),
    COOKIE_SAMESITE: zod_1.z.enum(['lax', 'strict', 'none']).default('lax'),
});
exports.env = envSchema.parse(process.env);
exports.isDevelopment = exports.env.NODE_ENV === 'development';
exports.isProduction = exports.env.NODE_ENV === 'production';
