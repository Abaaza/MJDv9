"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const compression_1 = __importDefault(require("compression"));
const morgan_1 = __importDefault(require("morgan"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const path_1 = __importDefault(require("path"));
const url_1 = require("url");
const env_1 = require("./config/env");
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const dashboard_routes_1 = __importDefault(require("./routes/dashboard.routes"));
const priceMatching_routes_1 = __importDefault(require("./routes/priceMatching.routes"));
const priceList_routes_1 = __importDefault(require("./routes/priceList.routes"));
const admin_routes_1 = __importDefault(require("./routes/admin.routes"));
const clients_routes_1 = __importDefault(require("./routes/clients.routes"));
const projects_routes_1 = __importDefault(require("./routes/projects.routes"));
const jobs_routes_1 = __importDefault(require("./routes/jobs.routes"));
const health_routes_1 = __importDefault(require("./routes/health.routes"));
const fileStorage_service_1 = require("./services/fileStorage.service");
const __filename = (0, url_1.fileURLToPath)(import.meta.url);
const __dirname = path_1.default.dirname(__filename);
const app = (0, express_1.default)();
exports.app = app;
// Security middleware with enhanced configuration
app.use((0, helmet_1.default)({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
        },
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
    },
}));
// CORS configuration with additional security
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin)
            return callback(null, true);
        // Check if the origin is allowed
        if (env_1.env.FRONTEND_URL === origin) {
            callback(null, true);
        }
        else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['X-Total-Count'],
    maxAge: 86400, // 24 hours
}));
// Body parsing middleware
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
app.use((0, cookie_parser_1.default)());
// Compression
app.use((0, compression_1.default)());
// Logging with reduced verbosity for polling endpoints
const morganMiddleware = env_1.isDevelopment ? (0, morgan_1.default)('dev') : (0, morgan_1.default)('combined');
app.use((req, res, next) => {
    // Skip logging for frequent polling endpoints
    if (req.path.includes('/status') || req.path.includes('/logs')) {
        return next();
    }
    morganMiddleware(req, res, next);
});
// Rate limiting
const limiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP',
});
// More lenient rate limit for status endpoints (polling)
const statusLimiter = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 60, // Allow 60 requests per minute (1 per second average)
    message: 'Too many status requests, please slow down polling',
    skipSuccessfulRequests: true, // Only count failed requests
});
// Very lenient rate limit for logs endpoint (high frequency polling)
const logsLimiter = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 200, // Allow 200 requests per minute (3.3 per second for 500ms polling)
    message: 'Too many log requests',
    skipSuccessfulRequests: true, // Only count failed requests
});
// Apply status limiter to specific endpoints before general limiter
if (!env_1.isDevelopment) {
    app.use('/api/price-matching/:jobId/status', statusLimiter);
    app.use('/api/price-matching/processor/status', statusLimiter);
    app.use('/api/projects/:projectId/jobs', statusLimiter);
    app.use('/api/jobs/:jobId/status', statusLimiter);
    app.use('/api/jobs/:jobId/logs', logsLimiter); // Special limiter for logs
}
// File upload rate limiter (more restrictive)
const uploadLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Limit each IP to 10 uploads per windowMs
    message: 'Too many file uploads, please try again later',
});
app.use('/api/projects/upload', uploadLimiter);
app.use('/api/projects/upload-and-match', uploadLimiter);
app.use('/api/price-matching/upload', uploadLimiter);
app.use('/api/price-matching/upload-and-match', uploadLimiter);
// Apply general rate limiting in production
if (!env_1.isDevelopment) {
    app.use('/api', limiter);
}
// Routes
app.use('/api/auth', auth_routes_1.default);
app.use('/api/dashboard', dashboard_routes_1.default);
app.use('/api/price-matching', priceMatching_routes_1.default);
app.use('/api/price-list', priceList_routes_1.default);
app.use('/api/admin', admin_routes_1.default);
app.use('/api/clients', clients_routes_1.default);
app.use('/api/projects', projects_routes_1.default);
app.use('/api/jobs', jobs_routes_1.default);
app.use('/api', health_routes_1.default);
// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
    const publicPath = path_1.default.join(__dirname, '../../public');
    app.use(express_1.default.static(publicPath));
    // Handle client-side routing - must be after API routes
    app.get('*', (req, res) => {
        if (!req.path.startsWith('/api')) {
            res.sendFile(path_1.default.join(publicPath, 'index.html'));
        }
    });
}
// Error handling middleware
app.use((err, req, res, next) => {
    console.error('[Server] An error occurred');
    res.status(500).json({ error: 'Internal server error' });
});
// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});
// Start server
const PORT = env_1.env.PORT || 5000;
// Initialize services
fileStorage_service_1.fileStorage.initialize().catch(console.error);
// For local development
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log('\\n=================================');
        console.log('🚀 Backend Server Started!');
        console.log('=================================');
        console.log(`📡 HTTP Server: http://localhost:${PORT}`);
        console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log(`📊 Convex URL: [CONFIGURED]`);
        console.log('=================================');
        console.log('📝 Key endpoints:');
        console.log('  - POST /api/auth/login');
        console.log('  - POST /api/price-matching/upload-and-match');
        console.log('  - GET  /api/price-matching/:jobId/status');
        console.log('  - GET  /api/price-matching/:jobId/results');
        console.log('  - GET  /api/price-matching/:jobId/export');
        console.log('=================================');
        console.log('🔍 Detailed logging enabled for:');
        console.log('  - Authentication (all requests)');
        console.log('  - File uploads and parsing');
        console.log('  - Job processing lifecycle');
        console.log('  - Matching operations');
        console.log('=================================\\n');
    });
}
// Graceful shutdown handling
const gracefulShutdown = async (signal) => {
    console.log(`\n${signal} signal received: closing HTTP server`);
    // No HTTP server to close for serverless
    console.log('Shutting down gracefully...');
    process.exit(0);
    // Force shutdown after 10 seconds
    setTimeout(() => {
        console.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
    }, 10000);
};
// Listen for termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    gracefulShutdown('UNCAUGHT_EXCEPTION');
});
// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    gracefulShutdown('UNHANDLED_REJECTION');
});
// Export for Vercel serverless
exports.default = app;
