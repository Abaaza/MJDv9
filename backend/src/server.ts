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
import jobsRoutes from './routes/jobs.routes.js';
import healthRoutes from './routes/health.routes.js';
import { fileStorage } from './services/fileStorage.service.js';

const app = express();

// Security middleware with enhanced configuration
app.use(helmet({
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
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Check if the origin is allowed
    if (env.FRONTEND_URL === origin) {
      callback(null, true);
    } else {
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

// Very lenient rate limit for logs endpoint (high frequency polling)
const logsLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 200, // Allow 200 requests per minute (3.3 per second for 500ms polling)
  message: 'Too many log requests',
  skipSuccessfulRequests: true, // Only count failed requests
});

// Apply status limiter to specific endpoints before general limiter
if (!isDevelopment) {
  app.use('/api/price-matching/:jobId/status', statusLimiter);
  app.use('/api/price-matching/processor/status', statusLimiter);
  app.use('/api/projects/:projectId/jobs', statusLimiter);
  app.use('/api/jobs/:jobId/status', statusLimiter);
  app.use('/api/jobs/:jobId/logs', logsLimiter);  // Special limiter for logs
}

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

// Apply general rate limiting in production
if (!isDevelopment) {
  app.use('/api', limiter);
}

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/price-matching', priceMatchingRoutes);
app.use('/api/price-list', priceListRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/clients', clientsRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api', healthRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[Server] An error occurred');
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