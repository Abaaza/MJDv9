import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { env, isDevelopment } from './config/env.js';
import authRoutes from './routes/auth.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import priceMatchingRoutes from './routes/priceMatching.routes.js';
import priceListRoutes from './routes/priceList.routes.js';
import adminRoutes from './routes/admin.routes.js';
import clientsRoutes from './routes/clients.routes.js';
import projectsRoutes from './routes/projects.routes.js';
import testRoutes from './routes/test.routes.js';
import jobsRoutes from './routes/jobs.routes.js';
import { fileStorage } from './services/fileStorage.service.js';

const app = express();

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: env.FRONTEND_URL,
  credentials: true,
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Compression
app.use(compression());

// Logging
if (isDevelopment) {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP',
});

// More lenient rate limit for status endpoints (polling)
const statusLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60, // Allow 60 requests per minute (1 per second average)
  message: 'Too many status requests, please slow down polling',
  skipSuccessfulRequests: true, // Only count failed requests
});

// Apply status limiter to specific endpoints before general limiter
app.use('/api/price-matching/:jobId/status', statusLimiter);
app.use('/api/price-matching/processor/status', statusLimiter);
app.use('/api/projects/:projectId/jobs', statusLimiter);
app.use('/api/jobs/:jobId/status', statusLimiter);

// File upload rate limiter (more restrictive)
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 uploads per windowMs
  message: 'Too many file uploads, please try again later',
});

app.use('/api/projects/upload', uploadLimiter);
app.use('/api/projects/upload-and-match', uploadLimiter);
app.use('/api/price-matching/upload', uploadLimiter);
app.use('/api/price-matching/upload-and-match', uploadLimiter);

app.use('/api', limiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/price-matching', priceMatchingRoutes);
app.use('/api/price-list', priceListRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/clients', clientsRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/test', testRoutes);
app.use('/api/jobs', jobsRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
const PORT = env.PORT || 5000;

// Initialize services
fileStorage.initialize().catch(console.error);

// For local development
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log('\\n=================================');
    console.log('🚀 Backend Server Started!');
    console.log('=================================');
    console.log(`📡 HTTP Server: http://localhost:${PORT}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📊 Convex URL: ${process.env.CONVEX_URL?.substring(0, 50)}...`);
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
const gracefulShutdown = async (signal: string) => {
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
export default app;