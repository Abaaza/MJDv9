// EC2 Production Server Configuration
// This file is specifically for EC2 deployment with proper CORS settings

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const path = require('path');

// Import compiled TypeScript server
const serverModule = require('./server');
const app = serverModule.app;

// Override CORS for EC2 production
app.use(cors({
  origin: [
    'https://main.d3j084kic0l1ff.amplifyapp.com',
    'https://d3j084kic0l1ff.cloudfront.net',
    'https://mjd.braunwell.io',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://localhost:5176',
    'http://localhost:3000'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  exposedHeaders: ['X-Total-Count'],
  maxAge: 86400
}));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Start server
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`
=================================
🚀 EC2 Production Server Started!
=================================
📡 Server: http://0.0.0.0:${PORT}
🌍 Environment: ${process.env.NODE_ENV || 'production'}
📊 CORS Origins Configured:
  - https://main.d3j084kic0l1ff.amplifyapp.com
  - https://d3j084kic0l1ff.cloudfront.net
=================================
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

module.exports = { app, server };